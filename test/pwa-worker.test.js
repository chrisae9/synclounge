const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

function setup({ failNetwork = false } = {}) {
  const handlers = {};
  const added = [];
  const removed = [];
  const requests = [];
  const fallback = new Response('offline screen');
  let activated = 0;
  const context = {
    URL,
    Response,
    self: {
      location: { origin: 'https://lounge.example' },
      addEventListener: (type, callback) => { handlers[type] = callback; },
      clients: { claim: async () => {} },
      skipWaiting: () => { activated += 1; },
    },
    caches: {
      open: async () => ({ addAll: async (urls) => added.push(...urls), match: async () => fallback }),
      keys: async () => ['synclounge-offline-old', '__SL_CACHE_NAME__', 'another-app-cache'],
      delete: async (key) => { removed.push(key); },
    },
    fetch: async (request) => {
      requests.push(request.url);
      if (failNetwork) throw new Error('offline');
      return new Response('live room');
    },
  };
  vm.runInNewContext(readFileSync('src/pwa/service-worker.js', 'utf8'), context);
  async function fetchEvent(path, options = {}) {
    let response;
    handlers.fetch({
      request: {
        url: new URL(path, 'https://lounge.example').href,
        method: 'GET',
        mode: 'navigate',
        headers: new Headers(),
        ...options,
      },
      respondWith: (promise) => { response = promise; },
    });
    return response;
  }
  return {
    handlers, added, removed, requests, fetchEvent, activated: () => activated,
  };
}

test('worker caches only the offline screen and leaves unrelated caches intact', async () => {
  const app = setup();
  await new Promise((resolve) => { app.handlers.install({ waitUntil: resolve }); });
  assert.deepEqual(app.added, ['/offline.html', '/offline.css', '/icons/icon-192.png', '/icons/icon.svg']);
  assert.equal(app.activated(), 0);
  await new Promise((resolve) => { app.handlers.activate({ waitUntil: resolve }); });
  assert.deepEqual(app.removed, ['synclounge-offline-old']);
  app.handlers.message({ data: { type: 'unrelated' } });
  assert.equal(app.activated(), 0);
  app.handlers.message({ data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(app.activated(), 1);
});

test('room navigation stays live online and falls back only when unreachable', async () => {
  const online = setup();
  assert.equal(await (await online.fetchEvent('/join/friends?watching=movie')).text(), 'live room');
  assert.deepEqual(online.added, []);
  const offline = setup({ failNetwork: true });
  assert.equal(await (await offline.fetchEvent('/join/friends')).text(), 'offline screen');
});

test('worker bypasses authentication, room metadata, media, config, and range requests', async () => {
  const app = setup({ failNetwork: true });
  const privatePaths = ['/config.json', '/api/auth', '/share/poster/room', '/socket.io/',
    '/health', '/cast-receiver.html'];
  await Promise.all(privatePaths.map(async (path) => {
    assert.equal(await app.fetchEvent(path), undefined, path);
  }));
  assert.equal(await app.fetchEvent('https://plex.example/video.m3u8'), undefined);
  assert.equal(await app.fetchEvent('/stream', { headers: new Headers({ range: 'bytes=0-' }) }), undefined);
  assert.equal(await app.fetchEvent('/api', { method: 'POST' }), undefined);
  assert.equal(await app.fetchEvent('/library/metadata', { mode: 'cors' }), undefined);
  assert.equal(await app.fetchEvent('/icons/icon.svg?X-Plex-Token=private', { mode: 'cors' }), undefined);
  assert.deepEqual(app.requests, []);
});
