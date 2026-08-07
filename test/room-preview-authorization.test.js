const {
  describe,
  it,
  before,
  after,
} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

let baseUrl;
let serverProcess;
let posterFixtureBase;
let posterFixtureServer;

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

async function waitForServer(url, retries = 30) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      // Sequential polling is intentional: each request observes a later server state.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      // eslint-disable-next-line no-await-in-loop
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Retry while the child process starts listening.
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(100);
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

const closeServer = (server) => new Promise((resolve, reject) => {
  if (!server?.listening) {
    resolve();
    return;
  }
  server.close((error) => {
    if (error) reject(error);
    else resolve();
  });
});

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timeout;
    const onEvent = (data) => {
      clearTimeout(timeout);
      resolve(data);
    };
    timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    socket.once(eventName, onEvent);
  });
}

async function joinClient({
  roomId,
  username,
  media,
  roomPreview,
}) {
  const socket = io(baseUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  const secret = await waitForEvent(socket, 'slPing');
  socket.emit('slPong', secret);
  const joined = waitForEvent(socket, 'joinResult');
  socket.emit('join', {
    roomId,
    desiredUsername: username,
    desiredPartyPausingEnabled: true,
    desiredAutoHostEnabled: true,
    thumb: '',
    playerProduct: 'test',
    state: media ? 'paused' : 'stopped',
    time: 0,
    duration: 1000,
    playbackRate: 1,
    media,
    roomPreview,
    syncFlexibility: 3000,
  });
  assert.equal((await joined).success, true);
  return socket;
}

async function postMetadata(body) {
  const response = await fetch(`${baseUrl}/api/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
}

async function getJoinHtml(roomId) {
  const response = await fetch(`${baseUrl}/join/${encodeURIComponent(roomId)}`);
  assert.equal(response.status, 200);
  return response.text();
}

function getOgImageUrl(html) {
  return html.match(/<meta property="og:image" content="([^"]+)"/u)?.[1] ?? null;
}

async function waitForJoinHtml(roomId, predicate, retries = 30) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    // Sequential polling is intentional: each request observes a later server state.
    // eslint-disable-next-line no-await-in-loop
    const html = await getJoinHtml(roomId);
    if (predicate(html)) return html;
    // eslint-disable-next-line no-await-in-loop
    await wait(100);
  }
  throw new Error(`Room ${roomId} did not reach the expected preview state`);
}

const playerUpdate = (media, roomPreview) => ({
  state: media ? 'paused' : 'stopped',
  time: 0,
  duration: 1000,
  playbackRate: 1,
  media,
  roomPreview,
  userInitiated: false,
});

describe('room preview authorization', () => {
  before(async () => {
    posterFixtureServer = http.createServer((req, res) => {
      const posterBodies = {
        '/host.jpg': Buffer.from('host-poster'),
        '/guest.jpg': Buffer.from('guest-poster'),
      };
      const body = posterBodies[req.url];
      if (!body) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(body);
    });
    await new Promise((resolve) => {
      posterFixtureServer.listen(0, '127.0.0.1', resolve);
    });
    posterFixtureBase = `http://127.0.0.1:${posterFixtureServer.address().port}`;

    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        PUBLIC_ORIGIN: baseUrl,
        SL_METADATA_RATE_LIMIT: '0',
        SL_POSTER_RATE_LIMIT: '0',
        NODE_ENV: 'test',
        SL_POSTER_TEST_ORIGIN: posterFixtureBase,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    serverProcess.stderr.on('data', (data) => process.stderr.write(data));
    await waitForServer(`${baseUrl}/health`);
  });

  after(async () => {
    await Promise.all([
      stopServer(serverProcess),
      closeServer(posterFixtureServer),
    ]);
  });

  it('allows only the current socket host to bind cached media to a room', async () => {
    const roomId = `preview-${Date.now()}`;
    const hostMedia = {
      machineIdentifier: 'host/machine?#%',
      ratingKey: 'host/rating?#%',
    };
    const guestMedia = {
      machineIdentifier: 'guest-machine',
      ratingKey: 'guest-rating',
    };
    const hostPreview = {
      ...hostMedia,
      title: 'Host Movie',
      year: 2026,
      type: 'movie',
      posterUrl: `${posterFixtureBase}/host.jpg`,
    };
    const guestPreview = {
      ...guestMedia,
      title: 'Guest Movie',
      year: 2027,
      type: 'movie',
      posterUrl: `${posterFixtureBase}/guest.jpg`,
    };
    await postMetadata({ ...hostPreview, room: roomId });
    await postMetadata(guestPreview);

    const unboundHtml = await getJoinHtml(roomId);
    assert.ok(unboundHtml.includes('content="SyncLounge"'));
    assert.ok(!unboundHtml.includes('Host Movie'));

    const host = await joinClient({
      roomId,
      username: 'host',
      media: hostMedia,
      roomPreview: hostPreview,
    });
    const guest = await joinClient({
      roomId,
      username: 'guest',
      media: null,
      roomPreview: null,
    });

    try {
      const hostHtml = await getJoinHtml(roomId);
      assert.ok(hostHtml.includes('Host Movie (2026)'));
      assert.ok(hostHtml.includes(`/share/room-poster/${roomId}`));
      const hostPosterUrl = getOgImageUrl(hostHtml);
      assert.ok(hostPosterUrl);
      const hostPoster = await fetch(hostPosterUrl);
      assert.equal(hostPoster.status, 200);
      assert.equal(hostPoster.headers.get('cache-control'), 'public, max-age=60');
      assert.equal(Buffer.from(await hostPoster.arrayBuffer()).toString(), 'host-poster');

      const guestSawDuplicateUpdate = waitForEvent(guest, 'mediaUpdate');
      host.emit('mediaUpdate', playerUpdate(hostMedia, hostPreview));
      await guestSawDuplicateUpdate;
      const unchangedHostHtml = await getJoinHtml(roomId);
      assert.equal(getOgImageUrl(unchangedHostHtml), hostPosterUrl);

      const hostSawGuestUpdate = waitForEvent(host, 'mediaUpdate');
      guest.emit('mediaUpdate', playerUpdate(guestMedia, guestPreview));
      await hostSawGuestUpdate;
      assert.ok((await getJoinHtml(roomId)).includes('Host Movie (2026)'));

      const guestSawTransfer = waitForEvent(guest, 'newHost');
      host.emit('transferHost', guest.id);
      assert.equal(await guestSawTransfer, guest.id);
      const guestHtml = await waitForJoinHtml(
        roomId,
        (html) => html.includes('Guest Movie (2027)'),
      );
      const guestPosterUrl = getOgImageUrl(guestHtml);
      assert.ok(guestPosterUrl);
      assert.notEqual(guestPosterUrl, hostPosterUrl);
      const guestPoster = await fetch(guestPosterUrl);
      assert.equal(Buffer.from(await guestPoster.arrayBuffer()).toString(), 'guest-poster');
      const retainedHostPoster = await fetch(hostPosterUrl);
      assert.equal(retainedHostPoster.status, 200);
      assert.equal(
        Buffer.from(await retainedHostPoster.arrayBuffer()).toString(),
        'host-poster',
      );

      const guestSawOldHostUpdate = waitForEvent(guest, 'mediaUpdate');
      host.emit('mediaUpdate', playerUpdate(hostMedia, hostPreview));
      await guestSawOldHostUpdate;
      assert.ok((await getJoinHtml(roomId)).includes('Guest Movie (2027)'));

      const oldHostSawNewHostUpdate = waitForEvent(host, 'mediaUpdate');
      guest.emit('mediaUpdate', playerUpdate(hostMedia, hostPreview));
      await oldHostSawNewHostUpdate;
      assert.ok((await getJoinHtml(roomId)).includes('Host Movie (2026)'));

      await postMetadata({
        machineIdentifier: 'spoof-machine',
        ratingKey: 'spoof-rating',
        title: 'Spoofed Movie',
        room: roomId,
      });
      const afterSpoofHtml = await getJoinHtml(roomId);
      assert.ok(afterSpoofHtml.includes('Host Movie (2026)'));
      assert.ok(!afterSpoofHtml.includes('Spoofed Movie'));

      const oldHostSawStop = waitForEvent(host, 'mediaUpdate');
      guest.emit('mediaUpdate', {
        ...playerUpdate(hostMedia, hostPreview),
        state: 'stopped',
      });
      await oldHostSawStop;
      const stoppedHtml = await getJoinHtml(roomId);
      assert.ok(stoppedHtml.includes('content="SyncLounge"'));
      assert.ok(!stoppedHtml.includes('Host Movie'));
      assert.ok(!stoppedHtml.includes('Guest Movie'));
    } finally {
      host.close();
      guest.close();
    }
  });

  it('promotes previews on host disconnect and clears them after the room empties', async () => {
    const roomId = `disconnect-preview-${Date.now()}`;
    const host = await joinClient({
      roomId,
      username: 'disconnect-host',
      media: { machineIdentifier: 'disconnect-host', ratingKey: '1' },
      roomPreview: {
        machineIdentifier: 'disconnect-host',
        ratingKey: '1',
        title: 'Disconnect Host Movie',
      },
    });
    const guest = await joinClient({
      roomId,
      username: 'disconnect-guest',
      media: { machineIdentifier: 'disconnect-guest', ratingKey: '2' },
      roomPreview: {
        machineIdentifier: 'disconnect-guest',
        ratingKey: '2',
        title: 'Promoted Guest Movie',
      },
    });

    try {
      const guestSawPromotion = waitForEvent(guest, 'userLeft');
      host.close();
      assert.equal((await guestSawPromotion).newHostId, guest.id);
      await waitForJoinHtml(roomId, (html) => html.includes('Promoted Guest Movie'));

      guest.close();
      const emptyHtml = await waitForJoinHtml(
        roomId,
        (html) => html.includes('content="SyncLounge"') && !html.includes('Promoted Guest Movie'),
      );
      assert.equal(getOgImageUrl(emptyHtml), null);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('moves the preview when auto-host follows a user-initiated media change', async () => {
    const roomId = `auto-host-preview-${Date.now()}`;
    const host = await joinClient({
      roomId,
      username: 'auto-host-original',
      media: { machineIdentifier: 'auto-host-original', ratingKey: '1' },
      roomPreview: {
        machineIdentifier: 'auto-host-original',
        ratingKey: '1',
        title: 'Original Host Movie',
      },
    });
    const guest = await joinClient({
      roomId,
      username: 'auto-host-guest',
      media: null,
      roomPreview: null,
    });

    try {
      const guestSawPromotion = waitForEvent(guest, 'newHost');
      guest.emit('mediaUpdate', {
        ...playerUpdate(
          { machineIdentifier: 'auto-host-guest', ratingKey: '2' },
          {
            machineIdentifier: 'auto-host-guest',
            ratingKey: '2',
            title: 'Auto Host Movie',
          },
        ),
        userInitiated: true,
      });
      assert.equal(await guestSawPromotion, guest.id);
      await waitForJoinHtml(roomId, (html) => html.includes('Auto Host Movie'));
    } finally {
      host.close();
      guest.close();
    }
  });

  it('disconnects clients that submit unknown room preview fields', async () => {
    const socket = await joinClient({
      roomId: `invalid-preview-${Date.now()}`,
      username: 'invalid-preview',
      media: null,
      roomPreview: null,
    });

    try {
      const disconnected = waitForEvent(socket, 'disconnect');
      socket.emit('mediaUpdate', playerUpdate(
        { machineIdentifier: 'machine', ratingKey: '1' },
        {
          machineIdentifier: 'machine',
          ratingKey: '1',
          unexpected: 'not retained',
        },
      ));
      await disconnected;

      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.equal(serverProcess.exitCode, null);
    } finally {
      socket.close();
    }
  });

  it('disconnects clients whose preview identifiers are unsafe or do not match active media', async () => {
    const cases = [
      {
        media: { machineIdentifier: 'machine', ratingKey: '1' },
        roomPreview: { machineIdentifier: 'machine', ratingKey: '2' },
      },
      {
        media: { machineIdentifier: Number.MAX_SAFE_INTEGER + 1, ratingKey: '1' },
        roomPreview: { machineIdentifier: Number.MAX_SAFE_INTEGER + 1, ratingKey: '1' },
      },
      {
        media: { machineIdentifier: '\uD800', ratingKey: '1' },
        roomPreview: { machineIdentifier: '\uD800', ratingKey: '1' },
      },
    ];

    await Promise.all(cases.map(async ({ media, roomPreview }, index) => {
      const socket = await joinClient({
        roomId: `invalid-preview-identity-${index}-${Date.now()}`,
        username: `invalid-preview-identity-${index}`,
        media: null,
        roomPreview: null,
      });

      try {
        const disconnected = waitForEvent(socket, 'disconnect');
        socket.emit('mediaUpdate', playerUpdate(media, roomPreview));
        await disconnected;
      } finally {
        socket.close();
      }
    }));

    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(serverProcess.exitCode, null);
  });

  it('disconnects clients whose preview numbers exceed protocol bounds', async () => {
    const invalidFields = [
      { year: -1 },
      { year: 10000 },
      { parentIndex: 1_000_000_000_000 },
      { index: -1 },
    ];

    await Promise.all(invalidFields.map(async (invalidField, index) => {
      const socket = await joinClient({
        roomId: `invalid-preview-number-${index}-${Date.now()}`,
        username: `invalid-preview-number-${index}`,
        media: null,
        roomPreview: null,
      });

      try {
        const disconnected = waitForEvent(socket, 'disconnect');
        socket.emit('mediaUpdate', playerUpdate(
          { machineIdentifier: 'machine', ratingKey: '1' },
          {
            machineIdentifier: 'machine',
            ratingKey: '1',
            ...invalidField,
          },
        ));
        await disconnected;
      } finally {
        socket.close();
      }
    }));

    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(serverProcess.exitCode, null);
  });

  it('disconnects a client whose room ID cannot be represented in an invite URL', async () => {
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    try {
      const secret = await waitForEvent(socket, 'slPing');
      socket.emit('slPong', secret);
      const disconnected = waitForEvent(socket, 'disconnect');
      socket.emit('join', {
        roomId: '\uD800',
        desiredUsername: 'invalid-room-id',
        desiredPartyPausingEnabled: true,
        desiredAutoHostEnabled: true,
        thumb: '',
        playerProduct: 'test',
        state: 'stopped',
        time: 0,
        duration: 1000,
        playbackRate: 1,
        media: null,
        roomPreview: null,
        syncFlexibility: 3000,
      });
      await disconnected;

      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.equal(serverProcess.exitCode, null);
    } finally {
      socket.close();
    }
  });
});
