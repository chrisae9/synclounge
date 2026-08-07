const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { socketServer } = require('../packages/syncloungeserver/dist/lib');

const waitForEvent = (socket, eventName, timeoutMs = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
  socket.once(eventName, (value) => {
    clearTimeout(timer);
    resolve(value);
  });
});

const joinClient = ({ url, roomId, username, media }) => new Promise((resolve, reject) => {
  const socket = io(url, {
    path: '/socket.io',
    transports: ['websocket'],
  });
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error(`${username} did not join in time`));
  }, 3000);

  socket.once('connect_error', reject);
  socket.once('slPing', (secret) => {
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
      media,
      syncFlexibility: 3000,
    });
  });
  socket.once('joinResult', (joinResult) => {
    clearTimeout(timer);
    resolve({ socket, joinResult });
  });
});

describe('embedded socket server instance isolation', () => {
  it('isolates same-named rooms, health, timers, sequencing, and lifecycle', async () => {
    const roomId = 'shared-room';
    const routers = [
      socketServer({ base_url: '/', port: 0, ping_interval: 60000, ping_timeout: 3000 }),
      socketServer({ base_url: '/', port: 0, ping_interval: 60000, ping_timeout: 3000 }),
    ];
    const clients = [];
    const closed = new Set();

    try {
      const [addressA, addressB] = await Promise.all(routers.map(({ ready }) => ready));
      assert.notEqual(addressA.port, addressB.port);
      assert.equal(routers[0].address().port, addressA.port);
      assert.equal(routers[1].address().port, addressB.port);

      const urlA = `http://127.0.0.1:${addressA.port}`;
      const urlB = `http://127.0.0.1:${addressB.port}`;
      const [clientA, clientB] = await Promise.all([
        joinClient({
          url: urlA,
          roomId,
          username: 'server-a-host',
          media: { title: 'server-a-media' },
        }),
        joinClient({
          url: urlB,
          roomId,
          username: 'server-b-host',
          media: { title: 'server-b-media' },
        }),
      ]);
      clients.push(clientA.socket, clientB.socket);

      assert.equal(clientA.joinResult.hostId, clientA.socket.id);
      assert.equal(clientB.joinResult.hostId, clientB.socket.id);
      assert.deepEqual(clientA.joinResult.users, {});
      assert.deepEqual(clientB.joinResult.users, {});
      assert.equal(JSON.stringify(clientA.joinResult).includes('server-b'), false);
      assert.equal(JSON.stringify(clientB.joinResult).includes('server-a'), false);

      const pauseA = waitForEvent(clientA.socket, 'partyPause');
      const pauseB = waitForEvent(clientB.socket, 'partyPause');
      clientA.socket.emit('partyPause', true);
      clientB.socket.emit('partyPause', false);
      assert.match((await pauseA).requestId, /:1$/);
      assert.match((await pauseB).requestId, /:1$/);

      const additionalAClients = await Promise.all(Array.from({ length: 24 }, (_, index) => (
        joinClient({
          url: urlA,
          roomId,
          username: `server-a-user-${index}`,
          media: { title: `server-a-media-${index}` },
        })
      )));
      clients.push(...additionalAClients.map(({ socket }) => socket));

      assert.deepEqual(await (await fetch(`${urlA}/health`)).json(), { load: 'medium' });
      assert.deepEqual(await (await fetch(`${urlB}/health`)).json(), { load: 'low' });

      const disconnectedA = waitForEvent(clientA.socket, 'disconnect');
      await routers[0].close();
      closed.add(routers[0]);
      await disconnectedA;
      assert.equal(routers[0].address(), null);
      await assert.rejects(fetch(`${urlA}/health`));

      assert.equal(clientB.socket.connected, true);
      assert.equal(routers[1].address().port, addressB.port);
      assert.deepEqual(await (await fetch(`${urlB}/health`)).json(), { load: 'low' });
      const pauseBAfterClose = waitForEvent(clientB.socket, 'partyPause');
      clientB.socket.emit('partyPause', true);
      assert.match((await pauseBAfterClose).requestId, /:2$/);

      await routers[1].close();
      closed.add(routers[1]);
      assert.equal(routers[1].address(), null);
    } finally {
      clients.forEach((client) => client.close());
      await Promise.allSettled(routers
        .filter((router) => !closed.has(router))
        .map((router) => router.close()));
    }
  });
});
