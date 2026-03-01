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
});
