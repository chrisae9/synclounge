/* eslint-disable no-restricted-globals -- self is the service worker global, not window. */
// Built with a content-addressed cache name. Only this public offline screen is
// cached: never room HTML, configuration, authentication, posters, or streams.
const CACHE_NAME = '__SL_CACHE_NAME__';
const OFFLINE_ASSETS = ['/offline.html', '/offline.css', '/icons/icon-192.png', '/icons/icon.svg'];
const CACHE_PREFIX = 'synclounge-offline-';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  // Activation is a deliberate user action; never interrupt a movie for updates.
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (
      await cache.match(request) || fetch(request)
    )));
    return;
  }
  if (request.mode !== 'navigate' || /^\/(api|share|socket\.io)(\/|$)/.test(url.pathname)
    || url.pathname === '/health' || /\/[^/]*\.[^/]+$/.test(url.pathname)) return;
  const offlineResponse = async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match('/offline.html') || Response.error();
  };
  event.respondWith(fetch(request).then((response) => (
    response.status >= 500 ? offlineResponse() : response
  )).catch(offlineResponse));
});
