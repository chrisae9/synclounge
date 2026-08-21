const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

let baseUrl;
let serverProcess;

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return port;
}

async function waitForServer(url, processToWatch = serverProcess) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (processToWatch?.exitCode != null) {
      throw new Error(`Server exited before becoming ready (${processToWatch.exitCode})`);
    }
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
      setTimeout(resolve, 200);
    });
  }
  throw new Error('Server did not start in time');
}

async function stopServer(processToStop) {
  if (!processToStop || processToStop.exitCode !== null) return;

  const exited = new Promise((resolve) => {
    processToStop.once('exit', resolve);
  });
  processToStop.kill('SIGTERM');
  const forceKill = setTimeout(() => {
    if (processToStop.exitCode === null) processToStop.kill('SIGKILL');
  }, 2000);
  await exited;
  clearTimeout(forceKill);
}

async function startRateLimitServer(envOverrides = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // A child process cannot atomically inherit this TCP reservation, so retry EADDRINUSE races.
    // eslint-disable-next-line no-await-in-loop
    const port = await getFreePort();
    const url = `http://127.0.0.1:${port}`;
    let stderr = '';
    const child = spawn('node', ['server.js'], {
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        PORT: String(port),
        TRUST_PROXY: 'loopback',
        SL_METADATA_RATE_LIMIT: '2',
        SL_POSTER_RATE_LIMIT: '0',
        SL_RATE_LIMIT_MAX_BUCKETS: '4',
        SL_RATE_LIMIT_WINDOW_MS: '500',
        ...envOverrides,
      },
      stdio: 'pipe',
    });
    child.stderr.on('data', (data) => {
      stderr += data;
      process.stderr.write(data);
    });

    try {
      // eslint-disable-next-line no-await-in-loop
      await waitForServer(`${url}/health`, child);
      return { child, url };
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await stopServer(child);
      lastError = error;
      if (!stderr.includes('EADDRINUSE')) throw error;
    }
  }
  throw lastError;
}

const postMetadataTo = (url, forwardedFor) => fetch(`${url}/api/metadata`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Forwarded-For': forwardedFor,
  },
  body: JSON.stringify({
    machineIdentifier: 'machine',
    ratingKey: 'rating',
  }),
});
const postMetadata = (forwardedFor) => postMetadataTo(baseUrl, forwardedFor);

describe('reverse proxy rate limiting', () => {
  before(async () => {
    const started = await startRateLimitServer();
    baseUrl = started.url;
    serverProcess = started.child;
  });

  after(async () => {
    await stopServer(serverProcess);
  });

  it('uses a trusted forwarded client address instead of the proxy address', async () => {
    assert.equal((await postMetadata('198.51.100.10')).status, 200);
    assert.equal((await postMetadata('198.51.100.10')).status, 200);
    assert.equal((await postMetadata('198.51.100.20')).status, 200);
    assert.equal((await postMetadata('198.51.100.10')).status, 429);
  });

  it('bounds client buckets and reuses capacity after the window expires', async () => {
    const isolated = await startRateLimitServer({ SL_RATE_LIMIT_MAX_BUCKETS: '2' });
    try {
      assert.equal((await postMetadataTo(isolated.url, '198.51.100.30')).status, 200);
      assert.equal((await postMetadataTo(isolated.url, '198.51.100.40')).status, 200);
      const atCapacity = await postMetadataTo(isolated.url, '198.51.100.50');
      assert.equal(atCapacity.status, 429);
      assert.deepEqual(await atCapacity.json(), { error: 'Too many clients' });

      await new Promise((resolve) => {
        setTimeout(resolve, 550);
      });
      assert.equal((await postMetadataTo(isolated.url, '198.51.100.50')).status, 200);
    } finally {
      await stopServer(isolated.child);
    }
  });

  it('rejects invalid rate-limit configuration at startup', async (t) => {
    for (const value of ['not-a-number', '-1', '1.5', '9007199254740992']) {
      // Subtests are intentionally serialized because spawnSync is itself synchronous.
      // eslint-disable-next-line no-await-in-loop
      await t.test(value, () => {
        const result = spawnSync(process.execPath, ['server.js'], {
          cwd: `${__dirname}/..`,
          env: {
            ...process.env,
            SL_METADATA_RATE_LIMIT: value,
          },
          encoding: 'utf8',
          timeout: 2000,
        });

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /SL_METADATA_RATE_LIMIT must be a non-negative integer/);
      });
    }
  });

  it('rejects an unsafe blanket trust-proxy setting at startup', () => {
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        TRUST_PROXY: 'true',
      },
      encoding: 'utf8',
      timeout: 2000,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trust_proxy=true is unsafe/);
  });
});
