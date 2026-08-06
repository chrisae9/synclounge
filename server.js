#!/usr/bin/env node

const syncloungeServer = require('syncloungeserver');
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./config');
const { createCache } = require('./cache');
const { fetchPoster, PosterProxyError } = require('./poster-proxy');

const blockList = Object.keys(syncloungeServer.defaultConfig);
const appConfig = config.get(null, blockList);
const publicAppConfig = config.getPublic(appConfig);

// Log exactly the browser-safe projection rather than deployment-only configuration.
console.log(publicAppConfig);

const { setMetadata, getMetadata } = createCache();

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
function parseRateLimit(name, defaultValue) {
  const rawValue = process.env[name] ?? String(defaultValue);
  if (!/^\d+$/.test(rawValue)) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  const parsedValue = Number(rawValue);
  if (!Number.isSafeInteger(parsedValue)) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return parsedValue;
}

const METADATA_RATE_LIMIT = parseRateLimit('SL_METADATA_RATE_LIMIT', 30);
const POSTER_RATE_LIMIT = parseRateLimit('SL_POSTER_RATE_LIMIT', 60);
const RATE_LIMIT_MAX_BUCKETS = parseRateLimit('SL_RATE_LIMIT_MAX_BUCKETS', 10000);
const RATE_LIMIT_WINDOW_MS = parseRateLimit('SL_RATE_LIMIT_WINDOW_MS', 60 * 1000);
if (RATE_LIMIT_MAX_BUCKETS === 0 || RATE_LIMIT_WINDOW_MS === 0) {
  throw new TypeError('Rate-limit bucket count and window must be positive integers');
}

function createRateLimiter(maxRequests, windowMs, maxBuckets) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0) {
    throw new TypeError('Rate limit must be a non-negative integer');
  }
  if (maxRequests === 0) return (req, res, next) => next();
  const hits = new Map(); // ip -> [timestamp, ...]
  let nextPruneAt = Date.now() + windowMs;

  const pruneExpiredBuckets = (cutoff) => {
    for (const [ip, timestamps] of hits) {
      const activeTimestamps = timestamps.filter((timestamp) => timestamp > cutoff);
      if (activeTimestamps.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, activeTimestamps);
      }
    }
  };

  return (req, res, next) => {
    const { ip } = req;
    const now = Date.now();
    const cutoff = now - windowMs;

    if (now >= nextPruneAt) {
      pruneExpiredBuckets(cutoff);
      nextPruneAt = now + windowMs;
    }

    if (!hits.has(ip) && hits.size >= maxBuckets) {
      return res.status(429).json({ error: 'Too many clients' });
    }

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

const metadataLimiter = createRateLimiter(
  METADATA_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_BUCKETS,
);
const posterLimiter = createRateLimiter(
  POSTER_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_BUCKETS,
);

// --- File extension check for SPA fallback ---
const STATIC_EXT_RE = /\.\w{2,}$/;

const preStaticInjection = (router) => {
  // Add route for config
  router.get('/config.json', (req, res) => {
    res.json(publicAppConfig);
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

    const controller = new AbortController();
    const abortUpstream = () => controller.abort();
    req.once('aborted', abortUpstream);
    res.once('close', abortUpstream);

    try {
      const allowedPrivateOrigin = process.env.NODE_ENV === 'test'
        ? process.env.SL_POSTER_TEST_ORIGIN
        : undefined;
      const poster = await fetchPoster(meta.posterUrl, {
        allowedPrivateOrigin,
        signal: controller.signal,
      });
      res.set('Content-Type', poster.contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(poster.body);
    } catch (e) {
      console.error('Poster proxy error:', e.message);
      const statusCode = e instanceof PosterProxyError ? e.statusCode : 502;
      return res.status(statusCode).send(statusCode === 403 ? 'Forbidden' : 'Failed to fetch poster');
    } finally {
      req.removeListener('aborted', abortUpstream);
      res.removeListener('close', abortUpstream);
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
