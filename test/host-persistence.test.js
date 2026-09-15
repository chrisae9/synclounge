const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} = require('node:fs');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
// eslint-disable-next-line import/extensions
const { socketServer } = require('../packages/syncloungeserver/dist/lib.js');
// eslint-disable-next-line import/extensions
const { createHostPersistence } = require('../packages/syncloungeserver/dist/socketserver/hostpersistence.js');

const storedRecord = {
  identity: '11111111-1111-1111-1111-111111111111',
  expectsPlayback: true,
  isPartyPausingEnabled: true,
  isAutoHostEnabled: false,
  syncPreset: 'balanced',
};
const waitUntil = async (condition) => {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for room state');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
};

const media = { machineIdentifier: 'server1', ratingKey: 'movie1', title: 'Movie' };
const playback = {
  state: 'playing', time: 10000, duration: 100000, playbackRate: 1, media,
};
const nextEvent = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { reject(new Error(`Timed out: ${event}`)); }, 3000);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});

const fixture = async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'synclounge-host-'));
  const file = path.join(directory, 'room-state.json');
  let router;
  let url;
  const clients = [];
  const start = async () => {
    router = socketServer({ base_url: '/', port: 0, room_state_path: file });
    const address = await router.ready;
    url = `http://127.0.0.1:${address.port}`;
  };
  await start();
  return {
    file,
    join: async (username, token, extra = {}) => {
      const socket = io(url, {
        transports: ['websocket'], reconnection: false, auth: { reconnectToken: token },
      });
      clients.push(socket);
      let reconnectToken;
      socket.on('session', (session) => { reconnectToken = session.reconnectToken; });
      const joined = nextEvent(socket, 'joinResult');
      socket.once('slPing', (secret) => {
        socket.emit('slPong', secret);
        socket.emit('join', {
          roomId: 'room1',
          desiredUsername: username,
          thumb: '',
          playerProduct: 'test',
          desiredPartyPausingEnabled: true,
          desiredAutoHostEnabled: false,
          syncFlexibility: 3000,
          ...playback,
          ...extra,
        });
      });
      const data = await joined;
      return { socket, data, token: reconnectToken };
    },
    restart: async () => { await router.close(); await start(); },
    cleanup: async () => {
      await router.close();
      clients.forEach((socket) => socket.close());
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

describe('durable room ownership', () => {
  it('restores the verified host after a real server restart with another viewer joining first', async () => {
    const room = await fixture();
    try {
      const host = await room.join('host');
      await room.join('viewer');
      host.socket.emit('setSyncPreset', 'strict');
      await nextEvent(host.socket, 'setSyncPreset');
      await room.restart();
      const viewer = await room.join('viewer');
      assert.equal(viewer.data.hostId, viewer.socket.id);
      assert.equal(viewer.data.syncPreset, 'strict');
      const restored = nextEvent(viewer.socket, 'newHost');
      const returning = await room.join('host', host.token);
      assert.equal(returning.data.user.reconnectIdentity, host.data.user.reconnectIdentity);
      assert.equal(returning.data.hostId, returning.socket.id);
      assert.equal(await restored, returning.socket.id);
      const saved = JSON.parse(readFileSync(room.file));
      assert.equal(saved.rooms[0][1].identity, host.data.user.reconnectIdentity);
      assert.equal(statSync(room.file).mode % 0o1000, 0o600);
      assert.equal(JSON.stringify(returning.data).includes(saved.secret), false);
    } finally { await room.cleanup(); }
  });

  it('lets an explicit host transfer revoke the old restart claim', async () => {
    const room = await fixture();
    try {
      const oldHost = await room.join('old-host');
      await room.restart();
      const temporary = await room.join('first-viewer');
      const chosen = await room.join('chosen-host');
      const transfer = nextEvent(chosen.socket, 'newHost');
      temporary.socket.emit('transferHost', chosen.socket.id);
      assert.equal(await transfer, chosen.socket.id);
      const returning = await room.join('old-host', oldHost.token);
      assert.equal(returning.data.hostId, chosen.socket.id);
      await room.restart();
      const oldAgain = await room.join('old-host', oldHost.token);
      const restored = nextEvent(oldAgain.socket, 'newHost');
      const chosenAgain = await room.join('chosen-host', chosen.token);
      assert.equal(await restored, chosenAgain.socket.id);
    } finally { await room.cleanup(); }
  });

  it('rejects copied public identities, tampered tokens, and same usernames', async () => {
    const room = await fixture();
    try {
      const host = await room.join('host');
      await room.restart();
      const viewer = await room.join('viewer');
      const forged = `${host.data.user.reconnectIdentity}.${'0'.repeat(64)}`;
      const imposter = await room.join('host', forged, { reconnectIdentity: host.data.user.reconnectIdentity });
      assert.equal(imposter.data.hostId, viewer.socket.id);
      assert.notEqual(imposter.data.user.reconnectIdentity, host.data.user.reconnectIdentity);
      const returning = await room.join('host', host.token);
      assert.equal(returning.data.hostId, returning.socket.id);
    } finally { await room.cleanup(); }
  });

  it('waits for a returning host to restore playback before replacing a playing viewer', async () => {
    const room = await fixture();
    try {
      const host = await room.join('host');
      await room.restart();
      const viewer = await room.join('viewer');
      const returning = await room.join('host', host.token, { state: 'stopped', media: null });
      assert.equal(returning.data.hostId, viewer.socket.id);
      const restored = nextEvent(viewer.socket, 'newHost');
      returning.socket.emit('mediaUpdate', { ...playback, userInitiated: false });
      assert.equal(await restored, returning.socket.id);
    } finally { await room.cleanup(); }
  });

  it('restores a host who stopped immediately before restart without requiring media', async () => {
    const room = await fixture();
    try {
      const host = await room.join('host');
      const viewer = await room.join('viewer');
      const stopped = nextEvent(viewer.socket, 'playerStateUpdate');
      host.socket.emit('playerStateUpdate', { ...playback, state: 'stopped' });
      await stopped;
      assert.equal(JSON.parse(readFileSync(room.file)).rooms[0][1].expectsPlayback, false);
      await room.restart();
      await room.join('viewer');
      const returning = await room.join('host', host.token, { state: 'stopped', media: null });
      assert.equal(returning.data.hostId, returning.socket.id);
    } finally { await room.cleanup(); }
  });

  it('removes ownership when the final viewer intentionally leaves', async () => {
    const room = await fixture();
    try {
      const host = await room.join('host');
      host.socket.close();
      await waitUntil(() => JSON.parse(readFileSync(room.file)).rooms.length === 0);
      assert.equal(JSON.parse(readFileSync(room.file)).rooms.length, 0);
      await room.restart();
      const viewer = await room.join('viewer');
      const returning = await room.join('host', host.token);
      assert.equal(returning.data.hostId, viewer.socket.id);
    } finally { await room.cleanup(); }
  });

  it('keeps viewers connected through storage failure and retries on the next host update', async (t) => {
    const room = await fixture();
    const error = t.mock.method(console, 'error', () => {});
    try {
      const host = await room.join('host');
      const viewer = await room.join('viewer');
      const originalOpen = fs.openSync;
      let storageBlocked = true;
      t.mock.method(fs, 'openSync', (destination, ...args) => {
        if (storageBlocked && String(destination).startsWith(`${room.file}.`)) {
          throw new Error('Simulated storage failure');
        }
        return originalOpen(destination, ...args);
      });
      const acknowledged = nextEvent(host.socket, 'setSyncPreset');
      host.socket.emit('setSyncPreset', 'strict');
      await acknowledged;
      assert.equal(host.socket.connected, true);
      assert.equal(viewer.socket.connected, true);
      assert.equal(error.mock.callCount(), 1);
      assert.equal(JSON.parse(readFileSync(room.file)).rooms[0][1].syncPreset, 'balanced');

      storageBlocked = false;
      const updated = nextEvent(viewer.socket, 'playerStateUpdate');
      host.socket.emit('playerStateUpdate', playback);
      await updated;
      assert.equal(JSON.parse(readFileSync(room.file)).rooms[0][1].syncPreset, 'strict');
      assert.equal(host.socket.connected, true);
    } finally { await room.cleanup(); }
  });

  it('flushes a failed host transfer once storage recovers before shutdown', async (t) => {
    const room = await fixture();
    t.mock.method(console, 'error', () => {});
    try {
      const host = await room.join('host');
      const chosen = await room.join('chosen');
      const originalOpen = fs.openSync;
      let storageBlocked = true;
      t.mock.method(fs, 'openSync', (destination, ...args) => {
        if (storageBlocked && String(destination).startsWith(`${room.file}.`)) {
          throw new Error('Simulated storage failure');
        }
        return originalOpen(destination, ...args);
      });
      const transferred = nextEvent(chosen.socket, 'newHost');
      host.socket.emit('transferHost', chosen.socket.id);
      await transferred;
      assert.equal(JSON.parse(readFileSync(room.file)).rooms[0][1].identity, host.data.user.reconnectIdentity);
      storageBlocked = false;
      await room.restart();
      const previous = await room.join('host', host.token);
      const restored = nextEvent(previous.socket, 'newHost');
      const returning = await room.join('chosen', chosen.token);
      assert.equal(await restored, returning.socket.id);
    } finally { await room.cleanup(); }
  });

  it('skips malformed room entries and incomplete or incorrectly typed settings', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'synclounge-host-'));
    const file = path.join(directory, 'state.json');
    try {
      createHostPersistence(file);
      const saved = JSON.parse(readFileSync(file));
      const valid = { ...storedRecord, updatedAt: Date.now() };
      saved.rooms = [
        null, {}, 'invalid', [], ['missing-record'], ['bad-record', null],
        ['missing-flags', { identity: valid.identity, updatedAt: valid.updatedAt }],
        ...['expectsPlayback', 'isPartyPausingEnabled', 'isAutoHostEnabled'].map((key) => (
          [key, { ...valid, [key]: 'false' }]
        )),
        ['bad-preset', { ...valid, syncPreset: 'unknown' }], ['valid', valid],
      ];
      writeFileSync(file, JSON.stringify(saved));
      const loaded = createHostPersistence(file);
      assert.deepEqual(loaded.getRecovery('valid'), valid);
      assert.equal(loaded.getRecovery('bad-preset').syncPreset, 'balanced');
      assert.deepEqual(JSON.parse(readFileSync(file)).rooms.map(([id]) => id), ['bad-preset', 'valid']);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('rejects writable parents and never follows or removes an existing temporary symlink', (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'synclounge-host-'));
    const file = path.join(directory, 'state.json');
    const victim = path.join(directory, 'unrelated.txt');
    t.mock.method(crypto, 'randomUUID', () => 'test-nonce');
    const temporary = `${file}.${process.pid}.test-nonce.tmp`;
    try {
      chmodSync(directory, 0o777);
      assert.throws(() => createHostPersistence(file), /not writable by group or others/);
      assert.equal(existsSync(file), false);
      chmodSync(directory, 0o700);
      writeFileSync(victim, 'do not truncate');
      symlinkSync(victim, temporary);
      assert.throws(() => createHostPersistence(file), /EEXIST/);
      assert.equal(readFileSync(victim, 'utf8'), 'do not truncate');
      assert.equal(lstatSync(temporary).isSymbolicLink(), true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('rejects a public state-file symlink even when it points to private storage', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'synclounge-host-'));
    const publicDirectory = path.join(directory, 'public');
    const privateFile = path.join(directory, 'private.json');
    const publicFile = path.join(publicDirectory, 'state.json');
    const publicAlias = path.join(directory, 'public-alias');
    try {
      mkdirSync(publicDirectory);
      createHostPersistence(privateFile);
      symlinkSync(privateFile, publicFile);
      symlinkSync(publicDirectory, publicAlias);
      for (const destination of [publicFile, path.join(publicAlias, 'state.json')]) {
        assert.throws(() => socketServer({
          base_url: '/', port: 0, static_path: publicDirectory, room_state_path: destination,
        }), /outside static_path/);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('expires restart claims and old records and rejects malformed or public storage', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'synclounge-host-'));
    const file = path.join(directory, 'state.json');
    let now = 100000000;
    try {
      const first = createHostPersistence(file, () => now);
      first.remember('room', storedRecord);
      const second = createHostPersistence(file, () => now);
      assert.ok(second.getRecovery('room'));
      now += 60000;
      assert.equal(second.getRecovery('room'), null);
      now += 24 * 60 * 60 * 1000;
      assert.equal(createHostPersistence(file, () => now).getRecovery('room'), null);
      assert.throws(() => socketServer({
        base_url: '/', port: 0, static_path: directory, room_state_path: file,
      }), /outside static_path/);
      const alias = `${directory}-alias`;
      symlinkSync(directory, alias);
      try {
        assert.throws(() => socketServer({
          base_url: '/', port: 0, static_path: directory, room_state_path: path.join(alias, 'nested', 'state.json'),
        }), /outside static_path/);
      } finally { rmSync(alias); }
      writeFileSync(file, '{}');
      assert.throws(() => createHostPersistence(file), /Invalid room state/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
