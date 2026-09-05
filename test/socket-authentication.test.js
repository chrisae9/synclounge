const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
// eslint-disable-next-line import/extensions
const { socketServer } = require('../packages/syncloungeserver/dist/lib.js');
const {
  createSocketAuthentication, createReconnectIdentity,
  // eslint-disable-next-line import/extensions
} = require('../packages/syncloungeserver/dist/socketserver/authentication.js');

const policy = { mechanism: 'plex', type: ['user'], authorized: ['alice'] };
const response = (data) => ({ ok: true, json: async () => data });

describe('socket access authentication', () => {
  it('verifies the user at Plex and sends the credential only in headers', async () => {
    const requests = [];
    const verify = createSocketAuthentication(policy, async (url, options) => {
      requests.push({ url, options });
      return response({ username: 'alice' });
    });
    await verify('test-credential');
    assert.equal(requests[0].url, 'https://plex.tv/api/v2/user');
    assert.equal(requests[0].options.headers['X-Plex-Token'], 'test-credential');
    assert.equal(requests[0].options.redirect, 'error');
    assert.ok(requests[0].options.signal);
    await assert.rejects(verify());
  });

  it('denies users outside the allowlist and failures from Plex', async () => {
    await assert.rejects(createSocketAuthentication(policy, async () => response({ username: 'bob' }))('token'));
    await assert.rejects(createSocketAuthentication(policy, async () => ({ ok: false }))('token'));
    await assert.rejects(createSocketAuthentication(policy, async () => { throw new Error('offline'); })('token'));
  });

  it('authorizes only accessible resources that provide a matching server', async () => {
    const serverPolicy = { mechanism: 'plex', type: ['server'], authorized: ['server-1'] };
    await createSocketAuthentication(serverPolicy, async () => response([
      { provides: 'server', clientIdentifier: 'server-1' },
    ]))('token');
    await assert.rejects(createSocketAuthentication(serverPolicy, async () => response([
      { provides: 'player', clientIdentifier: 'server-1' },
    ]))('token'));
    await assert.rejects(createSocketAuthentication(serverPolicy, async () => response([]))('token'));
  });

  it('fails closed for invalid restrictions and leaves unrestricted mode available', async () => {
    const invalidPolicies = [
      {}, { mechanism: 'unknown' }, { ...policy, authorized: [] }, { ...policy, type: ['bogus'] },
    ];
    for (const invalid of invalidPolicies) {
      assert.throws(() => createSocketAuthentication(invalid), TypeError);
    }
    await createSocketAuthentication()();
  });

  it('rejects an unauthenticated real socket before it can join a restricted server', async () => {
    const router = socketServer({ base_url: '/', port: 0, authentication: policy });
    const address = await router.ready;
    const socket = io(`http://127.0.0.1:${address.port}`, { transports: ['websocket'], reconnection: false });
    try {
      const error = await new Promise((resolve, reject) => {
        socket.once('connect', () => reject(new Error('unexpected connection')));
        socket.once('connect_error', resolve);
      });
      assert.match(error.message, /Not authorized/);
      assert.equal(socket.connected, false);
    } finally {
      socket.close();
      await router.close();
    }
  });
});

describe('server-issued reconnect identity', () => {
  it('accepts its proof and rejects public identities, tampering, and another server signature', () => {
    const identify = createReconnectIdentity();
    const session = identify();
    assert.deepEqual(identify(session.token), session);
    assert.notEqual(identify(session.identity).identity, session.identity);
    assert.notEqual(identify(`${session.identity}.${'0'.repeat(64)}`).identity, session.identity);
    assert.notEqual(createReconnectIdentity()(session.token).identity, session.identity);
  });

  it('preserves verified identity across real socket reconnects and ignores a claimed public identity', async () => {
    const router = socketServer({ base_url: '/', port: 0 });
    const address = await router.ready;
    const clients = [];
    const join = (auth = {}) => new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${address.port}`, { transports: ['websocket'], reconnection: false, auth });
      clients.push(socket);
      let reconnectToken;
      socket.once('connect_error', reject);
      socket.on('session', (data) => { reconnectToken = data.reconnectToken; });
      socket.once('slPing', (secret) => {
        socket.emit('slPong', secret);
        socket.emit('join', {
          roomId: 'identity-test',
          desiredUsername: 'Alice',
          thumb: '',
          playerProduct: 'test',
          desiredPartyPausingEnabled: true,
          desiredAutoHostEnabled: false,
          state: 'stopped',
          time: 0,
          duration: 0,
          playbackRate: 1,
          media: null,
          syncFlexibility: 3000,
          reconnectIdentity: auth.reconnectIdentity,
        });
      });
      socket.once('joinResult', (data) => resolve({ socket, data, reconnectToken }));
    });
    try {
      const first = await join();
      const identity = first.data.user.reconnectIdentity;
      assert.ok(identity);
      first.socket.close();
      const second = await join({ reconnectToken: first.reconnectToken });
      assert.equal(second.data.user.reconnectIdentity, identity);
      const imposter = await join({ reconnectIdentity: identity });
      assert.notEqual(imposter.data.user.reconnectIdentity, identity);
      assert.equal(JSON.stringify(second.data).includes(first.reconnectToken), false);
    } finally {
      clients.forEach((socket) => socket.close());
      await router.close();
    }
  });
});
