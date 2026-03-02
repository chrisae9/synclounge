const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const BASE = 'http://localhost:18088';
let serverProcess;

// Helper to make HTTP requests
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });
  return res;
}

async function waitForServer(url, retries = 30, delay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Server did not start in time');
}

describe('server', () => {
  before(async () => {
    const { spawn } = require('node:child_process');
    serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname + '/..',
      env: { ...process.env, PORT: '18088' },
      stdio: 'pipe',
    });
    serverProcess.stderr.on('data', (d) => process.stderr.write(d));
    await waitForServer(`${BASE}/health`);
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  // --- SPA fallback ---

  describe('SPA fallback', () => {
    it('serves index.html for the root path', async () => {
      const res = await request('/');
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>'));
    });

    it('serves index.html for a deep SPA route', async () => {
      const res = await request('/room/test/browse/server/abc/ratingKey/123');
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>'));
    });

    it('serves index.html for /signin', async () => {
      const res = await request('/signin');
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>'));
    });

    it('does not intercept static assets (.js)', async () => {
      const res = await request('/js/nonexistent.js');
      // Should fall through to express.static which returns 404, not index.html
      assert.equal(res.status, 404);
    });

    it('does not intercept static assets (.css)', async () => {
      const res = await request('/css/nonexistent.css');
      assert.equal(res.status, 404);
    });

    it('does not intercept /health', async () => {
      const res = await request('/health');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok('load' in data);
    });

    it('does not intercept /config.json', async () => {
      const res = await request('/config.json');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok('servers' in data);
    });
  });

  // --- Static assets ---

  describe('static assets', () => {
    it('serves JS files with absolute paths', async () => {
      // Find an actual JS file in dist
      const indexRes = await request('/');
      const html = await indexRes.text();
      const jsMatch = html.match(/src="(\/js\/[^"]+)"/);
      if (!jsMatch) return; // skip if no JS found
      const res = await request(jsMatch[1]);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('javascript'));
    });

    it('serves CSS files with absolute paths', async () => {
      const indexRes = await request('/');
      const html = await indexRes.text();
      const cssMatch = html.match(/href="(\/css\/[^"]+)"/);
      if (!cssMatch) return;
      const res = await request(cssMatch[1]);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('css'));
    });
  });

  // --- Metadata API ---

  describe('POST /api/metadata', () => {
    it('accepts valid metadata', async () => {
      const res = await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Inception',
          year: 2010,
          summary: 'A thief who steals corporate secrets.',
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          machineIdentifier: 'testmachine',
          ratingKey: '100',
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data, { ok: true });
    });

    it('rejects metadata without machineIdentifier', async () => {
      const res = await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { title: 'Bad', ratingKey: '1' },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('machineIdentifier'));
    });

    it('rejects metadata without ratingKey', async () => {
      const res = await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { title: 'Bad', machineIdentifier: 'abc' },
      });
      assert.equal(res.status, 400);
    });
  });

  // --- OG tag injection ---

  describe('OG tag injection', () => {
    before(async () => {
      // Seed a movie
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Inception',
          year: 2010,
          summary: 'A thief who steals corporate secrets.',
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          machineIdentifier: 'og-machine',
          ratingKey: '200',
        },
      });

      // Seed an episode
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'The One Where Everybody Finds Out',
          type: 'episode',
          grandparentTitle: 'Friends',
          parentIndex: 5,
          index: 14,
          summary: 'Phoebe discovers the secret.',
          posterUrl: 'https://example.com/episode.jpg',
          machineIdentifier: 'og-machine',
          ratingKey: '201',
        },
      });
    });

    it('injects OG tags for a cached movie', async () => {
      const res = await request('/room/test/browse/server/og-machine/ratingKey/200');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('og:title'));
      assert.ok(html.includes('Inception (2010)'));
      assert.ok(html.includes('og:description'));
      assert.ok(html.includes('og:image'));
      assert.ok(html.includes('og:type'));
      assert.ok(html.includes('video.movie'));
      assert.ok(html.includes('og:site_name'));
      assert.ok(html.includes('SyncLounge'));
      assert.ok(html.includes('theme-color'));
      assert.ok(html.includes('#E5A00D'));
    });

    it('formats episode titles as "Show - S05E14 Title"', async () => {
      const res = await request('/room/test/browse/server/og-machine/ratingKey/201');
      const html = await res.text();
      assert.ok(html.includes('Friends - S05E14 The One Where Everybody Finds Out'));
    });

    it('uses video.other for non-movie types', async () => {
      const res = await request('/room/test/browse/server/og-machine/ratingKey/201');
      const html = await res.text();
      assert.ok(html.includes('video.other'));
    });

    it('falls back to default OG tags for uncached media', async () => {
      const res = await request('/room/test/browse/server/unknown/ratingKey/999');
      assert.equal(res.status, 200);
      const html = await res.text();
      // Should have default SyncLounge OG tags, not media-specific ones
      assert.ok(html.includes('content="SyncLounge"'));
      assert.ok(!html.includes('content="unknown"'));
    });

    it('uses poster proxy URL in og:image, not the raw Plex URL', async () => {
      const res = await request('/room/test/browse/server/og-machine/ratingKey/200');
      const html = await res.text();
      assert.ok(html.includes('/share/poster/og-machine/200'));
      assert.ok(!html.includes('example.com/poster.jpg'));
    });

    it('still includes the SPA shell (index.html) with OG tags', async () => {
      const res = await request('/room/test/browse/server/og-machine/ratingKey/200');
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
      assert.ok(html.includes('og:title'));
    });
  });

  // --- Room-based OG injection (invite links) ---

  describe('room-based OG injection', () => {
    before(async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Room Movie',
          year: 2024,
          summary: 'Currently playing in the room.',
          type: 'movie',
          posterUrl: 'https://example.com/room-poster.jpg',
          machineIdentifier: 'room-machine',
          ratingKey: '1000',
          room: 'abc123',
        },
      });
    });

    it('injects OG tags for /join/:room when room has cached metadata', async () => {
      const res = await request('/join/abc123');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('og:title'));
      assert.ok(html.includes('Room Movie (2024)'));
      assert.ok(html.includes('og:description'));
      assert.ok(html.includes('Currently playing in the room.'));
      assert.ok(html.includes('og:image'));
      assert.ok(html.includes('/share/poster/room-machine/1000'));
    });

    it('falls back to default OG tags for /join/:room with no cached metadata', async () => {
      const res = await request('/join/unknown-room');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('content="SyncLounge"'));
      assert.ok(!html.includes('Room Movie'));
    });

    it('updates room metadata when new media is browsed', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'New Movie',
          year: 2025,
          type: 'movie',
          machineIdentifier: 'room-machine',
          ratingKey: '1001',
          room: 'abc123',
        },
      });

      const res = await request('/join/abc123');
      const html = await res.text();
      assert.ok(html.includes('New Movie (2025)'));
      assert.ok(!html.includes('Room Movie'));
    });

    it('injects episode OG tags for room invite links', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'The Rains of Castamere',
          type: 'episode',
          grandparentTitle: 'Game of Thrones',
          parentIndex: 3,
          index: 9,
          machineIdentifier: 'room-machine',
          ratingKey: '1002',
          room: 'got-room',
        },
      });

      const res = await request('/join/got-room');
      const html = await res.text();
      assert.ok(html.includes('Game of Thrones - S03E09 The Rains of Castamere'));
    });
  });

  // --- XSS prevention ---

  describe('XSS prevention', () => {
    before(async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '<script>alert("xss")</script>',
          year: 2024,
          summary: 'A "movie" with <b>HTML</b> & entities',
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          machineIdentifier: 'xss-machine',
          ratingKey: '300',
        },
      });
    });

    it('escapes HTML in title', async () => {
      const res = await request('/room/test/browse/server/xss-machine/ratingKey/300');
      const html = await res.text();
      assert.ok(!html.includes('<script>alert'));
      assert.ok(html.includes('&lt;script&gt;'));
    });

    it('escapes quotes and ampersands in summary', async () => {
      const res = await request('/room/test/browse/server/xss-machine/ratingKey/300');
      const html = await res.text();
      assert.ok(!html.includes('A "movie"'));
      assert.ok(html.includes('&amp;'));
      assert.ok(html.includes('&quot;'));
    });
  });

  // --- Poster proxy ---

  describe('GET /share/poster/:machineIdentifier/:ratingKey', () => {
    before(async () => {
      // Seed metadata with a real image URL for proxy test
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Proxy Test',
          type: 'movie',
          posterUrl: 'https://httpbin.org/image/jpeg',
          machineIdentifier: 'proxy-machine',
          ratingKey: '400',
        },
      });
    });

    it('proxies the poster image', async () => {
      const res = await request('/share/poster/proxy-machine/400');
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('image'));
      assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
    });

    it('returns 404 for uncached poster', async () => {
      const res = await request('/share/poster/unknown/999');
      assert.equal(res.status, 404);
    });
  });

  // --- Config ---

  describe('config', () => {
    it('serves config at /config.json', async () => {
      const res = await request('/config.json');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.servers));
      assert.ok('authentication' in data);
    });
  });

  // --- POST /api/metadata input edge cases ---

  describe('POST /api/metadata input edge cases', () => {
    it('does not crash when Content-Type header is missing', async () => {
      const res = await fetch(`${BASE}/api/metadata`, {
        method: 'POST',
        body: JSON.stringify({ machineIdentifier: 'x', ratingKey: '1' }),
        // No Content-Type header
      });
      // Should not be 500 (crash) — either 400 or 4xx
      assert.notEqual(res.status, 500);
    });

    it('does not crash when Content-Type is text/plain', async () => {
      const res = await fetch(`${BASE}/api/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ machineIdentifier: 'x', ratingKey: '1' }),
      });
      assert.notEqual(res.status, 500);
    });

    it('handles ratingKey sent as integer (not string)', async () => {
      const postRes = await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Integer Key Movie',
          year: 2020,
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          machineIdentifier: 'intkey-machine',
          ratingKey: 888, // integer, not string
        },
      });
      assert.equal(postRes.status, 200);

      // URL params are always strings — verify cache lookup still matches
      const res = await request('/room/r/browse/server/intkey-machine/ratingKey/888');
      const html = await res.text();
      assert.ok(html.includes('Integer Key Movie'));
    });

    it('does not collide cache keys when machineIdentifier contains a colon', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'First Entry',
          type: 'movie',
          machineIdentifier: 'a:b',
          ratingKey: 'c',
        },
      });
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Second Entry',
          type: 'movie',
          machineIdentifier: 'a',
          ratingKey: 'b:c',
        },
      });

      const res1 = await request('/room/r/browse/server/a:b/ratingKey/c');
      const html1 = await res1.text();
      const res2 = await request('/room/r/browse/server/a/ratingKey/b:c');
      const html2 = await res2.text();

      // These should have different titles (not collide)
      assert.ok(html1.includes('First Entry'));
      assert.ok(html2.includes('Second Entry'));
    });
  });

  // --- SPA fallback edge cases ---

  describe('SPA fallback edge cases', () => {
    it('does not intercept POST requests', async () => {
      const res = await request('/room/test', { method: 'POST' });
      // Should not serve index.html for non-GET
      assert.notEqual(res.status, 200);
    });

    it('does not intercept PUT requests', async () => {
      const res = await request('/room/test', { method: 'PUT' });
      assert.notEqual(res.status, 200);
    });

    it('does not intercept .png files', async () => {
      const res = await request('/images/nonexistent.png');
      assert.equal(res.status, 404);
    });

    it('does not intercept .map files', async () => {
      const res = await request('/js/app.12345.js.map');
      assert.equal(res.status, 404);
    });

    it('does not intercept .woff font files', async () => {
      const res = await request('/fonts/something.woff');
      assert.equal(res.status, 404);
    });

    it('does not intercept .ico files', async () => {
      const res = await request('/nonexistent.ico');
      assert.equal(res.status, 404);
    });

    it('serves index.html for /join/:room', async () => {
      const res = await request('/join/my-room');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for /clientselect', async () => {
      const res = await request('/clientselect');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for /joinroom', async () => {
      const res = await request('/joinroom');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for /room/:room/player', async () => {
      const res = await request('/room/test/player');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for /room/:room/search/:query', async () => {
      const res = await request('/room/test/search/batman');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('sets Content-Type to text/html on SPA responses', async () => {
      const res = await request('/room/test');
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));
    });

    it('serves index.html for /signout', async () => {
      const res = await request('/signout');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for library route', async () => {
      const res = await request('/room/test/browse/server/abc/library/1');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('serves index.html for PlexServer route', async () => {
      const res = await request('/room/test/browse/server/abc');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<div id="app">'));
    });

    it('does not intercept .webmanifest files', async () => {
      const res = await request('/manifest.webmanifest');
      const html = await res.text();
      // Should not serve index.html for manifest files
      assert.ok(!html.includes('<div id="app">'));
    });

    it('does not intercept .woff2 files', async () => {
      const res = await request('/fonts/something.woff2');
      assert.equal(res.status, 404);
    });

    it('does not intercept .svg files', async () => {
      const res = await request('/img/nonexistent.svg');
      assert.equal(res.status, 404);
    });

    it('does not intercept DELETE requests', async () => {
      const res = await request('/room/test', { method: 'DELETE' });
      assert.notEqual(res.status, 200);
    });
  });

  // --- Metadata overwrite and optional fields ---

  describe('metadata updates and optional fields', () => {
    it('overwrites metadata for the same key', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Original Title',
          year: 2020,
          type: 'movie',
          machineIdentifier: 'overwrite-test',
          ratingKey: '500',
        },
      });

      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Updated Title',
          year: 2021,
          type: 'movie',
          machineIdentifier: 'overwrite-test',
          ratingKey: '500',
        },
      });

      const res = await request('/room/r/browse/server/overwrite-test/ratingKey/500');
      const html = await res.text();
      assert.ok(html.includes('Updated Title (2021)'));
      assert.ok(!html.includes('Original Title'));
    });

    it('omits og:description when summary is missing', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'No Summary Movie',
          year: 2023,
          type: 'movie',
          machineIdentifier: 'optional-test',
          ratingKey: '501',
        },
      });

      const res = await request('/room/r/browse/server/optional-test/ratingKey/501');
      const html = await res.text();
      assert.ok(html.includes('og:title'));
      assert.ok(!html.includes('og:description'));
    });

    it('omits og:image when posterUrl is missing', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'No Poster Movie',
          year: 2023,
          type: 'movie',
          machineIdentifier: 'optional-test',
          ratingKey: '502',
        },
      });

      const res = await request('/room/r/browse/server/optional-test/ratingKey/502');
      const html = await res.text();
      assert.ok(html.includes('og:title'));
      assert.ok(!html.includes('og:image'));
    });
  });

  // --- OG title formatting edge cases ---

  describe('OG title formatting edge cases', () => {
    it('renders movie without year as just the title', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Untitled Movie',
          type: 'movie',
          machineIdentifier: 'fmt-test',
          ratingKey: '600',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/600');
      const html = await res.text();
      assert.ok(html.includes('content="Untitled Movie"'));
    });

    it('renders show type with year like a movie', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Breaking Bad',
          year: 2008,
          type: 'show',
          machineIdentifier: 'fmt-test',
          ratingKey: '601',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/601');
      const html = await res.text();
      assert.ok(html.includes('Breaking Bad (2008)'));
      assert.ok(html.includes('video.other'));
    });

    it('renders episode with only season number', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Pilot',
          type: 'episode',
          grandparentTitle: 'Lost',
          parentIndex: 1,
          machineIdentifier: 'fmt-test',
          ratingKey: '602',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/602');
      const html = await res.text();
      assert.ok(html.includes('Lost - S01 Pilot'));
    });

    it('renders episode with only episode number', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Special',
          type: 'episode',
          grandparentTitle: 'Some Show',
          index: 3,
          machineIdentifier: 'fmt-test',
          ratingKey: '603',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/603');
      const html = await res.text();
      assert.ok(html.includes('Some Show - E03 Special'));
    });

    it('renders episode without show name gracefully', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Orphan Episode',
          type: 'episode',
          parentIndex: 2,
          index: 5,
          machineIdentifier: 'fmt-test',
          ratingKey: '604',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/604');
      const html = await res.text();
      assert.ok(html.includes('S02E05 Orphan Episode'));
    });

    it('zero-pads single-digit season and episode numbers', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Test',
          type: 'episode',
          grandparentTitle: 'Show',
          parentIndex: 1,
          index: 1,
          machineIdentifier: 'fmt-test',
          ratingKey: '605',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/605');
      const html = await res.text();
      assert.ok(html.includes('S01E01'));
    });

    it('handles double-digit season and episode numbers', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Finale',
          type: 'episode',
          grandparentTitle: 'Long Show',
          parentIndex: 15,
          index: 24,
          machineIdentifier: 'fmt-test',
          ratingKey: '606',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/606');
      const html = await res.text();
      assert.ok(html.includes('S15E24'));
    });

    it('handles season 0 (specials) without treating it as missing', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Behind the Scenes',
          type: 'episode',
          grandparentTitle: 'Breaking Bad',
          parentIndex: 0,
          index: 3,
          machineIdentifier: 'fmt-test',
          ratingKey: '607',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/607');
      const html = await res.text();
      // Season 0 is a real Plex pattern for specials — should show S00E03
      assert.ok(html.includes('S00E03'));
      assert.ok(html.includes('Breaking Bad'));
    });

    it('handles episode index 0', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Prelude',
          type: 'episode',
          grandparentTitle: 'Show',
          parentIndex: 1,
          index: 0,
          machineIdentifier: 'fmt-test',
          ratingKey: '608',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/608');
      const html = await res.text();
      assert.ok(html.includes('S01E00'));
    });

    it('handles bare episode with no show name and no indexes gracefully', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Orphan',
          type: 'episode',
          machineIdentifier: 'fmt-test',
          ratingKey: '609',
        },
      });

      const res = await request('/room/r/browse/server/fmt-test/ratingKey/609');
      const html = await res.text();
      // Should not have a leading dash or look broken
      assert.ok(html.includes('og:title'));
      // Extract the title content
      const match = html.match(/og:title" content="([^"]*)"/);
      assert.ok(match, 'og:title meta tag should exist');
      // Should not start with "- " or " -"
      assert.ok(!match[1].startsWith('-'), `Title should not start with dash: "${match[1]}"`);
    });
  });

  // --- Poster proxy edge cases ---

  describe('poster proxy edge cases', () => {
    it('returns 404 when cached metadata has no posterUrl', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'No Poster',
          type: 'movie',
          machineIdentifier: 'noposter',
          ratingKey: '700',
        },
      });

      const res = await request('/share/poster/noposter/700');
      assert.equal(res.status, 404);
    });

    it('returns 502 when upstream poster URL is unreachable', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Bad Upstream',
          type: 'movie',
          posterUrl: 'http://192.0.2.1:1/nonexistent',
          machineIdentifier: 'badupstream',
          ratingKey: '701',
        },
      });

      const res = await request('/share/poster/badupstream/701');
      assert.equal(res.status, 502);
    });

    it('returns 502 when upstream returns a 4xx error', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '404 Upstream',
          type: 'movie',
          posterUrl: 'https://httpbin.org/status/404',
          machineIdentifier: 'upstream4xx',
          ratingKey: '702',
        },
      });

      const res = await request('/share/poster/upstream4xx/702');
      assert.equal(res.status, 502);
    });
  });

  // --- SSRF prevention ---

  describe('SSRF prevention in poster proxy', () => {
    const ssrfCases = [
      ['localhost', 'http://localhost:32400/photo'],
      ['127.x loopback', 'http://127.0.0.1:32400/photo'],
      ['10.x private', 'http://10.0.0.1/photo'],
      ['172.16-31.x private', 'http://172.16.0.1/photo'],
      ['192.168.x private', 'http://192.168.1.1/photo'],
      ['169.254.x link-local', 'http://169.254.169.254/latest/meta-data/'],
    ];

    for (const [label, url] of ssrfCases) {
      it(`blocks ${label} (${url})`, async () => {
        await request('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            title: `SSRF ${label}`,
            type: 'movie',
            posterUrl: url,
            machineIdentifier: `ssrf-${label.replace(/\s/g, '')}`,
            ratingKey: '1',
          },
        });

        const res = await request(`/share/poster/ssrf-${label.replace(/\s/g, '')}/1`);
        assert.equal(res.status, 403);
      });
    }

    it('allows legitimate external URLs', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Legit',
          type: 'movie',
          posterUrl: 'https://httpbin.org/image/jpeg',
          machineIdentifier: 'ssrf-legit',
          ratingKey: '1',
        },
      });

      const res = await request('/share/poster/ssrf-legit/1');
      assert.equal(res.status, 200);
    });
  });

  // --- OG injection with optional :server? URL suffix ---

  describe('OG injection URL variants', () => {
    before(async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'URL Variant Movie',
          year: 2025,
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          machineIdentifier: 'urlvar-machine',
          ratingKey: '800',
        },
      });
    });

    it('injects OG tags when optional :server? suffix is present', async () => {
      const res = await request(
        '/room/test/browse/server/urlvar-machine/ratingKey/800/myserver',
      );
      const html = await res.text();
      assert.ok(html.includes('og:title'));
      assert.ok(html.includes('URL Variant Movie (2025)'));
    });

    it('injects OG tags with different room names', async () => {
      const res = await request(
        '/room/another-room/browse/server/urlvar-machine/ratingKey/800',
      );
      const html = await res.text();
      assert.ok(html.includes('URL Variant Movie'));
    });
  });

  // --- XSS edge cases ---

  describe('XSS edge cases', () => {
    it('escapes HTML in grandparentTitle for episode type', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Episode',
          type: 'episode',
          grandparentTitle: '<img src=x onerror=alert(1)>',
          parentIndex: 1,
          index: 1,
          machineIdentifier: 'xss2-machine',
          ratingKey: '900',
        },
      });

      const res = await request('/room/r/browse/server/xss2-machine/ratingKey/900');
      const html = await res.text();
      assert.ok(!html.includes('<img src=x'));
      assert.ok(html.includes('&lt;img'));
    });

    it('handles null/undefined summary without crashing', async () => {
      await request('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: 'Null Summary',
          type: 'movie',
          summary: null,
          machineIdentifier: 'xss2-machine',
          ratingKey: '901',
        },
      });

      const res = await request('/room/r/browse/server/xss2-machine/ratingKey/901');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(!html.includes('og:description'));
    });
  });
});
