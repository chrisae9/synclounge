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

    it('does not inject OG tags for uncached media', async () => {
      const res = await request('/room/test/browse/server/unknown/ratingKey/999');
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(!html.includes('og:title'));
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
  });
});
