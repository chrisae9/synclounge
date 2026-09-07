const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

let serverProcess;
let baseUrl;

describe('production PWA delivery', () => {
  before(async () => {
    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: '0', PUBLIC_ORIGIN: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    baseUrl = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('PWA server did not start')), 5000);
      serverProcess.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      serverProcess.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`PWA server exited before startup (${code})`));
      });
      serverProcess.stdout.on('data', (data) => {
        output += data.toString();
        const port = output.match(/Server successfully started on port (\d+)/)?.[1];
        if (port) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${port}`);
        }
      });
      serverProcess.stderr.resume();
    });
  });

  after(async () => {
    if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => serverProcess.kill('SIGKILL'), 2000);
      serverProcess.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      serverProcess.kill('SIGTERM');
    });
  });

  it('preserves one default metadata set and install links on entry and deep routes', async () => {
    await Promise.all(['/', '/signin', '/join/pwa-test', '/room/pwa-test/player'].map(async (route) => {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const html = await response.text();
      for (const marker of ['name="theme-color"', 'property="og:title"', 'name="twitter:title"']) {
        assert.equal(html.split(marker).length - 1, 1, `${route}: expected one ${marker}`);
      }
      assert.match(html, /name="theme-color" content="#141418"/);
      assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
      assert.match(html, /rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon.png"/);
      assert.match(html, /property="og:image" content="\/social-card.png"/);
    }));
  });

  it('serves a revalidated install manifest and PNG icons with their declared dimensions', async () => {
    const response = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/manifest\+json/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const manifest = await response.json();
    assert.equal(manifest.name, 'SyncLounge');
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#141418');
    for (const size of ['192x192', '512x512']) {
      assert.ok(manifest.icons.some((icon) => icon.sizes === size && (icon.purpose || 'any') === 'any'));
    }
    assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
    const icons = [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }];
    await Promise.all(icons.map(async (icon) => {
      const image = await fetch(new URL(icon.src, `${baseUrl}/manifest.webmanifest`));
      assert.equal(image.status, 200);
      assert.match(image.headers.get('content-type'), /^image\/png/);
      const bytes = Buffer.from(await image.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
    }));
    const revalidated = await fetch(`${baseUrl}/manifest.webmanifest`, {
      cache: 'no-cache',
      headers: { 'If-None-Match': response.headers.get('etag') },
    });
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.headers.get('cache-control'), 'no-cache');
  });

  it('serves executable worker updates and a standalone offline document as static files', async () => {
    const response = await fetch(`${baseUrl}/sw.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const worker = await response.text();
    assert.ok(!worker.includes('<div id="app">'));
    assert.match(worker, /addEventListener\(['"]fetch['"]/);
    const revalidated = await fetch(`${baseUrl}/sw.js`, {
      cache: 'no-cache',
      headers: { 'If-None-Match': response.headers.get('etag') },
    });
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.headers.get('cache-control'), 'no-cache');
    const offline = await fetch(`${baseUrl}/offline.html`);
    assert.equal(offline.status, 200);
    assert.match(offline.headers.get('content-type'), /text\/html/);
    const html = await offline.text();
    assert.match(html, /SyncLounge/);
    assert.ok(!html.includes('<div id="app">'));
    const missing = await fetch(`${baseUrl}/missing.webmanifest`);
    assert.equal(missing.status, 404);
    await missing.body.cancel();
  });
});
