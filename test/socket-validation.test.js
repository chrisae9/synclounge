const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { io } = require('socket.io-client');

let baseUrl;
let serverProcess;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

async function waitForServer(url, retries = 30, delay = 200) {
  for (let i = 0; i < retries; i += 1) {
    try {
      // Sequential polling is intentional: each request observes a later server state.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url);
      const healthy = response.ok;
      // eslint-disable-next-line no-await-in-loop
      await response.body?.cancel();
      if (healthy) return;
    } catch {
      // Retry until the child process starts listening.
    }
    // eslint-disable-next-line no-await-in-loop
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

function waitForEvents(socket, eventName, expectedCount, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let receivedCount = 0;
    let timeout;
    const onEvent = () => {
      receivedCount += 1;
      if (receivedCount === expectedCount) {
        clearTimeout(timeout);
        socket.off(eventName, onEvent);
        resolve();
      }
    };
    timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out after ${receivedCount} ${eventName} events`));
    }, timeoutMs);
    socket.on(eventName, onEvent);
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
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        PING_TIMEOUT: '250',
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

  it('disconnects a client that does not answer the application ping', async () => {
    const socket = connectClient();
    try {
      await waitForEvent(socket, 'slPing');
      await waitForEvent(socket, 'disconnect');
      await assertServerHealthy();
    } finally {
      socket.close();
    }
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

  it('keeps a joined client connected at the room fanout limit', async () => {
    const socket = connectClient();
    let observer;
    try {
      await respondToPing(socket);
      const roomId = `boundary-${Date.now()}`;
      const joined = waitForEvent(socket, 'joinResult');
      socket.emit('join', {
        roomId,
        desiredUsername: 'boundary-user',
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

      observer = connectClient();
      await respondToPing(observer);
      const observerJoined = waitForEvent(observer, 'joinResult');
      observer.emit('join', {
        roomId,
        desiredUsername: 'boundary-observer',
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
      assert.equal((await observerJoined).success, true);

      const allUpdatesProcessed = waitForEvents(observer, 'playerStateUpdate', 30);
      for (let event = 0; event < 30; event += 1) {
        socket.emit('playerStateUpdate', {
          state: 'playing',
          time: event,
          duration: 1000,
          playbackRate: 1,
        });
      }
      await allUpdatesProcessed;
      assert.equal(socket.connected, true);
      await assertServerHealthy();
    } finally {
      socket.close();
      observer?.close();
    }
  });

  it('disconnects a joined client that floods room fanout events', async () => {
    const socket = connectClient();
    try {
      await respondToPing(socket);
      const joined = waitForEvent(socket, 'joinResult');
      socket.emit('join', {
        roomId: `flood-${Date.now()}`,
        desiredUsername: 'flood-user',
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
      for (let event = 0; event < 31; event += 1) {
        socket.emit('playerStateUpdate', {
          state: 'playing',
          time: event,
          duration: 1000,
          playbackRate: 1,
        });
      }
      await disconnected;
      await assertServerHealthy();
    } finally {
      socket.close();
    }
  });

  it('disconnects a client that evades per-event limits by alternating events', async () => {
    const socket = connectClient();
    try {
      await respondToPing(socket);
      const joined = waitForEvent(socket, 'joinResult');
      socket.emit('join', {
        roomId: `aggregate-flood-${Date.now()}`,
        desiredUsername: 'aggregate-flood-user',
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
      for (let event = 0; event < 60; event += 1) {
        socket.emit('syncFlexibilityUpdate', event);
        socket.emit('partyPauseAck', { requestId: `request-${event}` });
      }

      await disconnected;
      await assertServerHealthy();
    } finally {
      socket.close();
    }
  });
});
