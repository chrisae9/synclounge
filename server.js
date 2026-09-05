#!/usr/bin/env node

const { randomUUID } = require('node:crypto');
const path = require('path');
const fs = require('fs');
const syncloungeServer = require('./packages/syncloungeserver/dist/lib.js'); // eslint-disable-line import/extensions
const config = require('./config');
const {
  createCache,
  roomMetadataCacheKey,
  roomPosterMetadataCacheKey,
  resolveRoomPosterMetadata,
} = require('./cache');
const { fetchPoster, PosterProxyError } = require('./poster-proxy');
const { createDisconnectController } = require('./request-abort');

const blockList = Object.keys(syncloungeServer.defaultConfig);
const appConfig = config.get(null, blockList);
const publicAppConfig = config.getPublic(appConfig);
const socketConfig = syncloungeServer.getConfig();

function parsePublicOrigin(value) {
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('PUBLIC_ORIGIN must be an absolute HTTP(S) origin');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    throw new TypeError('PUBLIC_ORIGIN must be an absolute HTTP(S) origin');
  }

  return parsed.origin;
}

const publicOrigin = parsePublicOrigin(socketConfig.public_origin);
const ROOM_POSTER_CACHE_MAX_SIZE = 1000;
const ROOM_POSTER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const roomPosterPath = (room, revision) => (
  `/share/room-poster/${encodeURIComponent(room)}/${encodeURIComponent(revision)}`
);

// Log exactly the browser-safe projection rather than deployment-only configuration.
console.log(publicAppConfig);

const { setMetadata, getMetadata, deleteMetadata } = createCache();
const {
  setMetadata: setRoomPosterMetadata,
  getMetadata: getRoomPosterMetadata,
} = createCache({
  maxSize: ROOM_POSTER_CACHE_MAX_SIZE,
  ttlMs: ROOM_POSTER_CACHE_TTL_MS,
});

// --- HTML escaping for XSS prevention ---
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  const cleaned = html.replace(
    /<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="theme-color")[^>]*\/?\s*>\s*\n?/g,
    '',
  );

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

const posterLimiter = createRateLimiter(
  POSTER_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_BUCKETS,
);

// --- File extension check for SPA fallback ---
const STATIC_EXT_RE = /\.\w{2,}$/;
const ROOM_POSTER_MAX_AGE_SECONDS = 60;
const ROOM_PREVIEW_FIELDS = [
  'title',
  'year',
  'summary',
  'type',
  'posterUrl',
  'machineIdentifier',
  'ratingKey',
  'grandparentTitle',
  'parentIndex',
  'index',
];

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function proxyPoster(meta, req, res, cacheControl = 'public, max-age=86400') {
  if (!meta?.posterUrl) {
    return res.status(404).send('Not found');
  }

  const disconnect = createDisconnectController(req, res);

  try {
    const allowedPrivateOrigin = process.env.NODE_ENV === 'test'
      ? process.env.SL_POSTER_TEST_ORIGIN
      : undefined;
    const poster = await fetchPoster(meta.posterUrl, {
      allowedPrivateOrigin,
      signal: disconnect.signal,
    });
    if (disconnect.signal.aborted) return undefined;

    res.set('Content-Type', poster.contentType);
    res.set('Cache-Control', cacheControl);
    return res.send(poster.body);
  } catch (error) {
    if (disconnect.signal.aborted) return undefined;

    console.error('Poster proxy error:', error.message);
    const statusCode = error instanceof PosterProxyError ? error.statusCode : 502;
    return res.status(statusCode).send(statusCode === 403 ? 'Forbidden' : 'Failed to fetch poster');
  } finally {
    disconnect.cleanup();
  }
}

const preStaticInjection = (router) => {
  // Add route for config
  router.get('/config.json', (req, res) => {
    res.json(publicAppConfig);
  });

  // Legacy global metadata writes had no ownership boundary. Only socket-host
  // snapshots may supply shared previews now.
  router.post('/api/metadata', (req, res) => res.status(410).json({ error: 'Use room previews' }));
  router.get('/share/poster/:machineIdentifier/:ratingKey', (req, res) => res.sendStatus(410));

  // Room poster snapshots can only be selected by the current socket host.
  router.get('/share/room-poster/:room/:revision', posterLimiter, async (req, res) => {
    const meta = resolveRoomPosterMetadata({
      room: req.params.room,
      revision: req.params.revision,
      getCurrentMetadata: getMetadata,
      getSnapshotMetadata: getRoomPosterMetadata,
    });
    return proxyPoster(
      meta,
      req,
      res,
      `public, max-age=${ROOM_POSTER_MAX_AGE_SECONDS}`,
    );
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

    // A browse link may expose only this room's current host-selected media.
    const mediaMatch = req.path.match(
      /^\/room\/([^/]+)\/browse\/server\/([^/]+)\/ratingKey\/([^/]+)\/?$/,
    );
    if (mediaMatch) {
      const [, room, machine, rating] = mediaMatch.map(decodePathSegment);
      const meta = room == null ? null : getMetadata(roomMetadataCacheKey(room));
      if (meta && String(meta.machineIdentifier) === machine && String(meta.ratingKey) === rating) {
        const posterProxyUrl = meta.posterUrl && publicOrigin
          ? `${publicOrigin}${roomPosterPath(room, meta.roomPreviewRevision)}` : null;
        res.type('html');
        return res.send(injectOgTags(indexHtml, { ...meta, posterProxyUrl }));
      }
    }

    // Check if this is a room invite link — inject OG tags for current room media
    const roomMatch = req.path.match(/^\/join\/([^/]+)/);
    if (roomMatch) {
      const roomCode = decodePathSegment(roomMatch[1]);
      const meta = roomCode != null ? getMetadata(roomMetadataCacheKey(roomCode)) : null;

      if (meta) {
        const posterProxyUrl = meta.posterUrl && publicOrigin
          ? `${publicOrigin}${roomPosterPath(roomCode, meta.roomPreviewRevision)}`
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

const onRoomMediaUpdate = ({ roomId, roomPreview }) => {
  const roomKey = roomMetadataCacheKey(roomId);
  if (!roomPreview) {
    deleteMetadata(roomKey);
    return;
  }
  const currentPreview = getMetadata(roomKey);
  const previewUnchanged = currentPreview != null
    && ROOM_PREVIEW_FIELDS.every(
      (fieldName) => Object.is(currentPreview[fieldName], roomPreview[fieldName]),
    );
  if (previewUnchanged) {
    setMetadata(roomKey, currentPreview);
    return;
  }
  const previewSnapshot = {
    ...roomPreview,
    roomPreviewRevision: randomUUID(),
  };
  setMetadata(roomKey, previewSnapshot);
  setRoomPosterMetadata(
    roomPosterMetadataCacheKey(roomId, previewSnapshot.roomPreviewRevision),
    previewSnapshot,
  );
};

syncloungeServer.socketServer({
  ...socketConfig,
  authentication: appConfig.authentication,
  static_path: path.join(__dirname, 'dist'),
  preStaticInjection,
  onRoomMediaUpdate,
});
