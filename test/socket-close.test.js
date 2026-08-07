const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io } = require('socket.io-client');
const { socketServer } = require('../packages/syncloungeserver/dist/lib');

const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const listen = (server, port) => new Promise((resolve, reject) => {
  const handleError = (error) => reject(error);
  server.once('error', handleError);
  server.listen(port, '127.0.0.1', () => {
    server.off('error', handleError);
    resolve(server.address());
  });
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => {
    if (error) reject(error);
    else resolve();
  });
});

const waitForEvent = (socket, eventName, timeoutMs = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
  socket.once(eventName, (value) => {
    clearTimeout(timer);
    resolve(value);
  });
});

const waitForHealth = async (url, startupTimeoutMs = 3000) => {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    try {
      // Sequential polling is intentional: each request observes a later listener state.
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: AbortSignal.timeout(250) });
      const healthy = response.ok;
      // eslint-disable-next-line no-await-in-loop
      await response.body?.cancel();
      if (healthy) return;
    } catch {
      // Wait for the listener.
    }
    // eslint-disable-next-line no-await-in-loop
    await delay(20);
  }
  throw new Error('Server did not start in time');
};

describe('embedded socket server lifecycle', () => {
  it('disconnects clients, closes its listener, and allows its port to be reused', async () => {
    let client;
    let cleanupError;
    let replacement;
    let router;
    let routerClosed = false;
    let testError;

    try {
      router = socketServer({
        base_url: '/',
        port: 0,
        ping_interval: 10000,
      });
      const { port } = await router.ready;
      assert.equal(router.address().port, port);
      await waitForHealth(`http://127.0.0.1:${port}/health`);

      client = io(`http://127.0.0.1:${port}`, {
        path: '/socket.io',
        transports: ['websocket'],
      });
      await waitForEvent(client, 'connect');
      await delay(25);
      assert.equal(client.connected, true);
      const disconnected = waitForEvent(client, 'disconnect');

      await router.close();
      routerClosed = true;
      await disconnected;
      assert.equal(client.connected, false);

      replacement = http.createServer();
      const replacementAddress = await listen(replacement, port);
      assert.equal(replacementAddress.port, port);
    } catch (error) {
      testError = error;
    } finally {
      client?.close();
      const cleanup = [];
      if (router && !routerClosed) cleanup.push(router.close());
      if (replacement?.listening) cleanup.push(close(replacement));
      const outcomes = await Promise.allSettled(cleanup);
      const failedCleanup = outcomes.find(({ status }) => status === 'rejected');
      cleanupError = failedCleanup?.reason;
    }

    if (testError) throw testError;
    if (cleanupError) throw cleanupError;
  });
});
