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
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => {
    server.close(resolve);
  });
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      // Sequential polling is intentional: each request observes a later server state.
      // eslint-disable-next-line no-await-in-loop
      await fetch(url);
      return;
    } catch {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }
  }
  throw new Error('Server did not start in time');
}

const postMetadata = (forwardedFor) => fetch(`${baseUrl}/api/metadata`, {
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

describe('reverse proxy rate limiting', () => {
  before(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn('node', ['server.js'], {
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        PORT: String(port),
        TRUST_PROXY: 'loopback',
        SL_METADATA_RATE_LIMIT: '2',
        SL_POSTER_RATE_LIMIT: '0',
      },
      stdio: 'pipe',
    });
    serverProcess.stderr.on('data', (data) => process.stderr.write(data));
    await waitForServer(`${baseUrl}/health`);
  });

  after(async () => {
    if (!serverProcess || serverProcess.exitCode !== null) return;

    const exited = new Promise((resolve) => {
      serverProcess.once('exit', resolve);
    });
    serverProcess.kill('SIGTERM');
    const forceKill = setTimeout(() => {
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }, 2000);
    await exited;
    clearTimeout(forceKill);
  });

  it('uses a trusted forwarded client address instead of the proxy address', async () => {
    assert.equal((await postMetadata('198.51.100.10')).status, 200);
    assert.equal((await postMetadata('198.51.100.10')).status, 200);
    assert.equal((await postMetadata('198.51.100.20')).status, 200);
    assert.equal((await postMetadata('198.51.100.10')).status, 429);
  });

  it('rejects invalid rate-limit configuration at startup', () => {
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        SL_METADATA_RATE_LIMIT: 'not-a-number',
      },
      encoding: 'utf8',
      timeout: 2000,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SL_METADATA_RATE_LIMIT must be a non-negative integer/);
  });
});
