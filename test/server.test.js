const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');

let baseUrl;
let serverProcess;
async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => {
    server.close(resolve);
  });
  return port;
}

// Helper to make HTTP requests
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });
  return res;
}

async function waitForServer(url, retries = 30, delay = 200) {
  for (let i = 0; i < retries; i += 1) {
    try {
      // Sequential polling is intentional: each request observes a later server state.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      const healthy = response.ok;
      // eslint-disable-next-line no-await-in-loop
      await response.body?.cancel();
      if (healthy) return;
    } catch {
      // Retry connection failures and per-attempt timeouts.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  throw new Error('Server did not start in time');
}

async function stopServer(processToStop) {
  if (!processToStop
    || processToStop.exitCode !== null
    || processToStop.signalCode !== null) return;

  const exited = new Promise((resolve) => {
    processToStop.once('error', resolve);
    processToStop.once('close', resolve);
  });
  const waitForExit = async () => {
    let timeout;
    const didExit = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(false), 2000);
      }),
    ]);
    clearTimeout(timeout);
    return didExit;
  };

  if (processToStop.exitCode !== null || processToStop.signalCode !== null) return;
  processToStop.kill('SIGTERM');
  if (!await waitForExit()
    && processToStop.exitCode === null
    && processToStop.signalCode === null) {
    processToStop.kill('SIGKILL');
    assert.ok(await waitForExit(), 'server did not exit after SIGKILL');
  }
}

describe('server', () => {
  it('sets anti-framing, nosniff and referrer protections on HTML and static responses', async () => {
    const responses = await Promise.all(['/', '/signin', '/cast-receiver.html', '/cast-receiver.js']
      .map((url) => request(url)));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('x-powered-by'), null);
    }
    await Promise.all(responses.map((response) => response.body.cancel()));
  });

  before(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        PORT: String(port),
        AUTHENTICATION: JSON.stringify({ mechanism: 'plex', type: ['user'], authorized: ['test-only'] }),
      },
      stdio: 'ignore',
    });
    await waitForServer(`${baseUrl}/health`);
  });
  after(() => stopServer(serverProcess));

  it('rejects legacy metadata writes and image relays even with restricted authentication', async () => {
    const response = await request('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        machineIdentifier: 'target', ratingKey: '1', title: 'attacker', posterUrl: 'https://example.com/image.jpg',
      },
    });
    assert.equal(response.status, 410);
    assert.equal((await request('/share/poster/target/1')).status, 410);
    const html = await (await request('/room/test/browse/server/target/ratingKey/1')).text();
    assert.ok(!html.includes('attacker'));
    assert.ok(html.includes('content="SyncLounge"'));
  });
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
      const res = await request('/assets/nonexistent.js');
      // Should fall through to express.static which returns 404, not index.html
      assert.equal(res.status, 404);
    });

    it('does not intercept static assets (.css)', async () => {
      const res = await request('/assets/nonexistent.css');
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

  describe('static assets', () => {
    it('serves Vite JS files with absolute paths', async () => {
      const indexRes = await request('/');
      const html = await indexRes.text();
      const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
      assert.ok(jsMatch, 'dist/index.html should reference a Vite /assets/*.js file; run npm run build first');
      const res = await request(jsMatch[1]);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('javascript'));
    });

    it('serves Vite CSS files with absolute paths', async () => {
      const indexRes = await request('/');
      const html = await indexRes.text();
      const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
      assert.ok(cssMatch, 'dist/index.html should reference a Vite /assets/*.css file; run npm run build first');
      const res = await request(cssMatch[1]);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('css'));
    });
  });

  describe('config', () => {
    it('serves config at /config.json', async () => {
      const res = await request('/config.json');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.servers));
      assert.ok('authentication' in data);
    });
  });

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
});
