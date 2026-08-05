const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { io } = require('socket.io-client');

let baseUrl;
let serverProcess;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, retries = 30, delay = 200) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the child process starts listening.
    }
    await wait(delay);
  }
  throw new Error('Server did not start in time');
}

function connectClient() {
  return io(baseUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
}

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

async function respondToPing(socket) {
  const secret = await waitForEvent(socket, 'slPing');
  socket.emit('slPong', secret);
}

async function assertServerHealthy() {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(serverProcess.exitCode, null);
}

describe('socket event validation', () => {
  before(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname + '/..',
      env: {
        ...process.env,
        PORT: String(port),
        SL_METADATA_RATE_LIMIT: '0',
        SL_POSTER_RATE_LIMIT: '0',
      },
      stdio: 'pipe',
    });
    serverProcess.stderr.on('data', (data) => process.stderr.write(data));
    await waitForServer(`${baseUrl}/health`);
  });

  after(() => {
    if (serverProcess) serverProcess.kill('SIGTERM');
  });

  it('disconnects a malformed join without crashing the server', async () => {
    const socket = connectClient();
    try {
      await respondToPing(socket);
      const disconnected = waitForEvent(socket, 'disconnect');
      socket.emit('join', null);
      await disconnected;
      await assertServerHealthy();
    } finally {
      socket.close();
    }
  });

  it('accepts a valid join and isolates a malformed player update', async () => {
    const socket = connectClient();
    try {
      await respondToPing(socket);
      const joined = waitForEvent(socket, 'joinResult');
      socket.emit('join', {
        roomId: `validation-${Date.now()}`,
        desiredUsername: 'validation-user',
        desiredPartyPausingEnabled: true,
        desiredAutoHostEnabled: true,
        thumb: '',
        playerProduct: 'test',
        state: 'stopped',
        time: 0,
        duration: 0,
        playbackRate: 1,
        media: null,
        syncFlexibility: 3000,
      });
      assert.equal((await joined).success, true);

      const disconnected = waitForEvent(socket, 'disconnect');
      socket.emit('playerStateUpdate', null);
      await disconnected;
      await assertServerHealthy();
    } finally {
      socket.close();
    }
  });

  it('rejects events larger than the transport limit without crashing the server', async () => {
    const socket = connectClient();
    try {
      await respondToPing(socket);
      const disconnected = waitForEvent(socket, 'disconnect');
      socket.emit('sendMessage', 'x'.repeat(70 * 1024));
      await disconnected;
      await assertServerHealthy();
    } finally {
      socket.close();
    }
  });
});
