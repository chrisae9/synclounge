#!/usr/bin/env node

const syncloungeServer = require('syncloungeserver');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Readable } = require('node:stream');
const config = require('./config');
const { createCache } = require('./cache');

const blockList = Object.keys(syncloungeServer.defaultConfig);
const appConfig = config.get(null, blockList);

// Log config with sensitive values redacted
const SENSITIVE_RE = /secret|password|token|key/i;
const safeConfig = Object.fromEntries(
  Object.entries(appConfig).map(([k, v]) => [k, SENSITIVE_RE.test(k) ? '[REDACTED]' : v]),
);
console.log(safeConfig);

const { setMetadata, getMetadata } = createCache();

// --- SSRF prevention for poster proxy ---
function isPrivateUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { return true; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;
  // Strip IPv6 brackets for hostname comparison
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0') return true;
  // IPv6 loopback and IPv4-mapped loopback
  if (host === '::1' || host === '::ffff:127.0.0.1') return true;
  if (/^0+:0+:0+:0+:0+:0+:0+:0*1$/.test(host)) return true; // expanded ::1
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

// --- HTML escaping for XSS prevention ---
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Read index.html once at startup ---
const distPath = path.join(__dirname, 'dist');
let indexHtml = '';
try {
  indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
} catch (e) {
  console.warn('Could not read dist/index.html at startup:', e.message);
}

function injectOgTags(html, meta) {
  let title;
  if (meta.type === 'episode') {
    const season = meta.parentIndex != null ? `S${String(meta.parentIndex).padStart(2, '0')}` : '';
    const episode = meta.index != null ? `E${String(meta.index).padStart(2, '0')}` : '';
    const epNum = season || episode ? `${season}${episode} ` : '';
    const parts = [meta.grandparentTitle, `${epNum}${meta.title || ''}`].filter(Boolean);
    title = parts.join(' - ').trim();
  } else {
    title = meta.year ? `${meta.title} (${meta.year})` : (meta.title || '');
  }

  const ogType = meta.type === 'movie' ? 'video.movie' : 'video.other';

  const tags = [
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    meta.summary ? `<meta property="og:description" content="${escapeHtml(meta.summary)}" />` : '',
    meta.posterProxyUrl ? `<meta property="og:image" content="${escapeHtml(meta.posterProxyUrl)}" />` : '',
    `<meta property="og:type" content="${ogType}" />`,
    '<meta property="og:site_name" content="SyncLounge" />',
    '<meta name="theme-color" content="#E5A00D" />',
  ].filter(Boolean).join('\n    ');

  // Remove existing OG/Twitter meta tags from the static HTML so we replace rather than duplicate
  let cleaned = html.replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="theme-color")[^>]*\/?\s*>\s*\n?/g, '');

  return cleaned.replace('</head>', `    ${tags}\n  </head>`);
}

// --- In-memory rate limiter (sliding window, no external deps) ---
// Limits configurable via env vars; set to 0 to disable (e.g. in tests)
const METADATA_RATE_LIMIT = parseInt(process.env.SL_METADATA_RATE_LIMIT || '30', 10);
const POSTER_RATE_LIMIT = parseInt(process.env.SL_POSTER_RATE_LIMIT || '60', 10);

function createRateLimiter(maxRequests, windowMs) {
  if (maxRequests <= 0) return (req, res, next) => next();
  const hits = new Map(); // ip -> [timestamp, ...]
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const cutoff = now - windowMs;
    let timestamps = hits.get(ip);
    if (timestamps) {
      timestamps = timestamps.filter((t) => t > cutoff);
    } else {
      timestamps = [];
    }
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    return next();
  };
}

const metadataLimiter = createRateLimiter(METADATA_RATE_LIMIT, 60 * 1000);
const posterLimiter = createRateLimiter(POSTER_RATE_LIMIT, 60 * 1000);

// --- File extension check for SPA fallback ---
const STATIC_EXT_RE = /\.\w{2,}$/;

const preStaticInjection = (router) => {
  // Add route for config
  router.get('/config.json', (req, res) => {
    res.json(appConfig);
  });

  // --- POST /api/metadata: receive metadata from client ---
  router.post('/api/metadata', express.json(), metadataLimiter, (req, res) => {
    const {
      title, year, summary, type, posterUrl, machineIdentifier, ratingKey,
      grandparentTitle, parentIndex, index, room,
    } = req.body;

    if (!machineIdentifier || !ratingKey) {
      return res.status(400).json({ error: 'machineIdentifier and ratingKey are required' });
    }

    // Validate string fields have correct types and reasonable lengths
    const MAX_LEN = 500;
    const stringFields = { title, summary, type, posterUrl, grandparentTitle };
    for (const [name, val] of Object.entries(stringFields)) {
      if (val != null && (typeof val !== 'string' || val.length > MAX_LEN)) {
        return res.status(400).json({ error: `${name} must be a string of at most ${MAX_LEN} characters` });
      }
    }
    // machineIdentifier and ratingKey can be string or number (coerced via template literals)
    for (const [name, val] of Object.entries({ machineIdentifier, ratingKey })) {
      if (val != null && typeof val !== 'string' && typeof val !== 'number') {
        return res.status(400).json({ error: `${name} must be a string or number` });
      }
      if (typeof val === 'string' && val.length > MAX_LEN) {
        return res.status(400).json({ error: `${name} must be at most ${MAX_LEN} characters` });
      }
    }
    if (year != null && (typeof year !== 'string' && typeof year !== 'number')) {
      return res.status(400).json({ error: 'year must be a string or number' });
    }
    if (room != null && (typeof room !== 'string' || room.length > MAX_LEN)) {
      return res.status(400).json({ error: 'room must be a string of at most 500 characters' });
    }

    const key = `${machineIdentifier}\0${ratingKey}`;
    const meta = {
      title, year, summary, type, posterUrl,
      machineIdentifier, ratingKey,
      grandparentTitle, parentIndex, index,
    };
    setMetadata(key, meta);

    // Also index by room code so /join/:room gets OG tags
    if (room) {
      setMetadata(`room\0${room}`, meta);
    }

    return res.json({ ok: true });
  });

  // --- GET /share/poster/:machineIdentifier/:ratingKey: proxy poster images ---
  router.get('/share/poster/:machineIdentifier/:ratingKey', posterLimiter, async (req, res) => {
    const key = `${req.params.machineIdentifier}\0${req.params.ratingKey}`;
    const meta = getMetadata(key);

    if (!meta || !meta.posterUrl) {
      return res.status(404).send('Not found');
    }

    if (isPrivateUrl(meta.posterUrl)) {
      return res.status(403).send('Forbidden');
    }

    try {
      const response = await fetch(meta.posterUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return res.status(502).send('Failed to fetch poster');
      }

      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');

      Readable.fromWeb(response.body).pipe(res);
    } catch (e) {
      console.error('Poster proxy error:', e.message);
      return res.status(502).send('Failed to fetch poster');
    }
  });

  // --- SPA fallback middleware ---
  router.use((req, res, next) => {
    // Only handle GET requests
    if (req.method !== 'GET') return next();

    // Skip file extensions (static assets)
    if (STATIC_EXT_RE.test(req.path)) return next();

    // Skip API, socket.io, and share routes (already handled above)
    if (req.path.startsWith('/socket.io')
      || req.path.startsWith('/api/')
      || req.path.startsWith('/share/')
      || req.path === '/health'
      || req.path === '/config.json') {
      return next();
    }

    if (!indexHtml) {
      return res.status(500).send('index.html not available');
    }

    // Check if this is a media browse route we can inject OG tags for
    const mediaMatch = req.path.match(
      /^\/room\/[^/]+\/browse\/server\/([^/]+)\/ratingKey\/([^/]+)/,
    );

    if (mediaMatch) {
      const [, machineIdentifier, ratingKey] = mediaMatch;
      const key = `${machineIdentifier}\0${ratingKey}`;
      const meta = getMetadata(key);

      if (meta) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        const posterProxyUrl = meta.posterUrl
          ? `${baseUrl}/share/poster/${machineIdentifier}/${ratingKey}`
          : null;

        const html = injectOgTags(indexHtml, { ...meta, posterProxyUrl });
        res.set('Content-Type', 'text/html');
        return res.send(html);
      }
    }

    // Check if this is a room invite link — inject OG tags for current room media
    const roomMatch = req.path.match(/^\/join\/([^/]+)/);
    if (roomMatch) {
      const [, roomCode] = roomMatch;
      const meta = getMetadata(`room\0${roomCode}`);

      if (meta) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        const posterProxyUrl = meta.posterUrl
          ? `${baseUrl}/share/poster/${meta.machineIdentifier}/${meta.ratingKey}`
          : null;

        const html = injectOgTags(indexHtml, { ...meta, posterProxyUrl });
        res.set('Content-Type', 'text/html');
        return res.send(html);
      }
    }

    // Serve index.html with default OG tags for all other SPA routes
    const defaultOg = [
      '<meta property="og:title" content="SyncLounge" />',
      '<meta property="og:description" content="Watch Plex together with your friends" />',
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="SyncLounge" />',
      '<meta name="theme-color" content="#E5A00D" />',
    ].join('\n    ');
    const html = indexHtml.replace('</head>', `    ${defaultOg}\n  </head>`);
    res.set('Content-Type', 'text/html');
    return res.send(html);
  });
};

const socketConfig = syncloungeServer.getConfig();
syncloungeServer.socketServer({
  ...socketConfig,
  static_path: path.join(__dirname, 'dist'),
  preStaticInjection,
});
