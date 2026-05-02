const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:18089';
let serverProcess;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function waitForSocketEvent(socket, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (data) => {
      clearTimeout(timeout);
      resolve(data);
    };
    socket.once(eventName, onEvent);
  });
}

async function waitForServer(url, retries = 30, delay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await wait(delay);
    }
  }
  throw new Error('Server did not start in time');
}

function joinClient({ roomId, username }) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`${username} did not join in time`));
    }, 5000);

    socket.once('connect_error', reject);

    socket.on('slPing', (secret) => {
      socket.emit('slPong', secret);
      socket.emit('join', {
        roomId,
        desiredUsername: username,
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
    });

    socket.once('joinResult', (joinResult) => {
      clearTimeout(timeout);
      resolve({ socket, joinResult });
    });
  });
}

describe('kick socket event', () => {
  before(async () => {
    serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname + '/..',
      env: {
        ...process.env,
        PORT: '18089',
        SL_METADATA_RATE_LIMIT: '0',
        SL_POSTER_RATE_LIMIT: '0',
      },
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

  it('server removes kicked users even if the kicked client does not disconnect itself', async () => {
    const roomId = `kick-${Date.now()}`;
    const host = await joinClient({ roomId, username: 'host' });
    const guest = await joinClient({ roomId, username: 'guest' });

    try {
      const guestId = guest.socket.id;
      const kickedPromise = waitForSocketEvent(guest.socket, 'kicked');
      const userLeftPromise = waitForSocketEvent(host.socket, 'userLeft');
      const disconnectPromise = waitForSocketEvent(guest.socket, 'disconnect');

      host.socket.emit('kick', guestId);

      // Regression coverage: old clients, broken clients, or interrupted handlers may not
      // voluntarily close. The server must still remove the user it kicked.
      await kickedPromise;
      const userLeft = await userLeftPromise;
      await disconnectPromise;

      assert.equal(userLeft.id, guestId);
      assert.equal(guest.socket.connected, false);
    } finally {
      host.socket.close();
      guest.socket.close();
    }
  });
});
