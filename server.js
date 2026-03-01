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
console.log(appConfig);

const { setMetadata, getMetadata } = createCache();

// --- SSRF prevention for poster proxy ---
function isPrivateUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { return true; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;
  const host = parsed.hostname;
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

// --- HTML escaping for XSS prevention ---
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  return html.replace('</head>', `    ${tags}\n  </head>`);
}

// --- File extension check for SPA fallback ---
const STATIC_EXT_RE = /\.\w{2,}$/;

const preStaticInjection = (router) => {
  // Add route for config
  router.get('/config.json', (req, res) => {
    res.json(appConfig);
  });

  // --- POST /api/metadata: receive metadata from client ---
  router.post('/api/metadata', express.json(), (req, res) => {
    const {
      title, year, summary, type, posterUrl, machineIdentifier, ratingKey,
      grandparentTitle, parentIndex, index,
    } = req.body;

    if (!machineIdentifier || !ratingKey) {
      return res.status(400).json({ error: 'machineIdentifier and ratingKey are required' });
    }

    const key = `${machineIdentifier}\0${ratingKey}`;
    setMetadata(key, {
      title, year, summary, type, posterUrl,
      machineIdentifier, ratingKey,
      grandparentTitle, parentIndex, index,
    });

    return res.json({ ok: true });
  });

  // --- GET /share/poster/:machineIdentifier/:ratingKey: proxy poster images ---
  router.get('/share/poster/:machineIdentifier/:ratingKey', async (req, res) => {
    const key = `${req.params.machineIdentifier}\0${req.params.ratingKey}`;
    const meta = getMetadata(key);

    if (!meta || !meta.posterUrl) {
      return res.status(404).send('Not found');
    }

    if (isPrivateUrl(meta.posterUrl)) {
      return res.status(403).send('Forbidden');
    }

    try {
      const response = await fetch(meta.posterUrl);
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

    // Check if this is a media route we can inject OG tags for
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

    // Serve plain index.html for all other SPA routes
    res.set('Content-Type', 'text/html');
    return res.send(indexHtml);
  });
};

const socketConfig = syncloungeServer.getConfig();
syncloungeServer.socketServer({
  ...socketConfig,
  static_path: path.join(__dirname, 'dist'),
  preStaticInjection,
});
