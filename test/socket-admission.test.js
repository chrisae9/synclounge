const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
// eslint-disable-next-line import/extensions
const { default: createAdmission } = require('../packages/syncloungeserver/dist/socketserver/admission.js');
// eslint-disable-next-line import/extensions
const { socketServer } = require('../packages/syncloungeserver/dist/lib.js');

describe('socket admission limits', () => {
  it('bounds pending auth and releases failed requests exactly once', () => {
    const admit = createAdmission({ maxPending: 1 });
    const lease = admit('a');
    assert.throws(() => admit('b'));
    lease.release();
    lease.release();
    const next = admit('b');
    assert.throws(() => admit('c'));
    next.authenticated();
    admit('c').release();
    next.release();
  });

  it('bounds active connections globally and per IP, restoring capacity on close', () => {
    const admit = createAdmission({ maxConnections: 2, maxPerIp: 1 });
    const first = admit('a');
    first.authenticated();
    assert.throws(() => admit('a'));
    const second = admit('b');
    second.authenticated();
    assert.throws(() => admit('c'));
    first.release();
    admit('c').release();
    second.release();
    admit('a').release();
  });

  it('limits reconnect attempts and bounds IP buckets with expiry', () => {
    let time = 0;
    const admit = createAdmission({ attemptsPerMinute: 2, maxBuckets: 1, now: () => time });
    admit('a').release();
    admit('a').release();
    assert.throws(() => admit('a'));
    assert.throws(() => admit('b'));
    time = 60000;
    admit('b').release();
  });

  it('rejects disabled, fractional and unbounded limit settings', () => {
    for (const maxConnections of [0, -1, 1.5, Infinity, '512']) {
      assert.throws(() => createAdmission({ maxConnections }), TypeError);
    }
  });

  it('rejects extra real sockets and frees a disconnected client slot', async () => {
    const router = socketServer({
      port: 0, base_url: '/', socket_max_per_ip: 1, trust_proxy: false,
    });
    const { port } = await router.ready;
    const clients = [];
    const connect = () => new Promise((resolve) => {
      const client = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { 'X-Forwarded-For': `spoof-${clients.length}` },
      });
      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', resolve);
    });
    try {
      const first = await connect();
      assert.equal(first.connected, true);
      assert.ok(await connect() instanceof Error);
      first.close();
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      assert.equal((await connect()).connected, true);
    } finally {
      clients.forEach((client) => client.close());
      await router.close();
    }
  });
});
