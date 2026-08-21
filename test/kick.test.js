const {
  describe, it, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:18089';
let serverProcess;
let serverOutput = '';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function waitForSocketEvent(socket, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let onEvent;
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    onEvent = (data) => {
      clearTimeout(timeout);
      resolve(data);
    };
    socket.once(eventName, onEvent);
  });
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
    await wait(delay);
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

async function waitForOutput(text, retries = 30, delay = 50) {
  for (let i = 0; i < retries; i += 1) {
    if (serverOutput.includes(text)) return;
    // Sequential polling is intentional: each check observes later process output.
    // eslint-disable-next-line no-await-in-loop
    await wait(delay);
  }
  throw new Error(`Server output did not contain: ${text}`);
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
      cwd: `${__dirname}/..`,
      env: {
        ...process.env,
        PORT: '18089',
        SL_METADATA_RATE_LIMIT: '0',
        SL_POSTER_RATE_LIMIT: '0',
      },
      stdio: 'pipe',
    });
    serverProcess.stdout.on('data', (data) => { serverOutput += data.toString(); });
    serverProcess.stderr.on('data', (d) => process.stderr.write(d));
    await waitForServer(`${BASE}/health`);
  });

  after(async () => {
    await stopServer(serverProcess);
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

  it('assigns party-pause request IDs and broadcasts host acknowledgments', async () => {
    const roomId = `party-pause-${Date.now()}`;
    const host = await joinClient({ roomId, username: 'host' });
    const guest = await joinClient({ roomId, username: 'guest' });

    try {
      const commandPromise = waitForSocketEvent(host.socket, 'partyPause');
      guest.socket.emit('partyPause', false);
      const command = await commandPromise;

      assert.equal(command.senderId, guest.socket.id);
      assert.equal(command.isPause, false);
      assert.equal(typeof command.requestId, 'string');

      const ackPromise = waitForSocketEvent(guest.socket, 'partyPauseAck');
      host.socket.emit('partyPauseAck', { requestId: command.requestId });
      assert.deepEqual(await ackPromise, { requestId: command.requestId });

      const newHostPromise = waitForSocketEvent(host.socket, 'newHost');
      host.socket.emit('transferHost', guest.socket.id);
      await newHostPromise;

      let lateAckBroadcast = false;
      guest.socket.once('partyPauseAck', () => { lateAckBroadcast = true; });
      host.socket.emit('partyPauseAck', { requestId: command.requestId });
      await wait(100);
      assert.equal(host.socket.connected, true);
      assert.equal(lateAckBroadcast, false);
    } finally {
      host.socket.close();
      guest.socket.close();
    }
  });

  it('writes sanitized client playback diagnostics to the server log', async () => {
    const roomId = `diagnostics-${Date.now()}`;
    const client = await joinClient({ roomId, username: 'diagnostic-user' });

    try {
      client.socket.emit('playbackDiagnostic', {
        event: 'buffering-start',
        browser: { name: 'firefox', os: 'Linux' },
        playback: { bufferAhead: 0.125, readyState: 2 },
        accessToken: 'do-not-log-this',
      });
      await waitForOutput('playback-diagnostic');

      const line = serverOutput.split('\n')
        .find((entry) => entry.includes('diagnostic-user') && entry.includes('playback-diagnostic'));
      assert.ok(line);
      assert.ok(line.includes('"event":"buffering-start"'));
      assert.ok(line.includes('"bufferAhead":0.125'));
      assert.ok(line.includes(`"room":"${roomId}"`));
      assert.equal(line.includes('do-not-log-this'), false);
    } finally {
      client.socket.close();
    }
  });
});
