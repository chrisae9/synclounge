const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const waitForHealth = async (port) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Wait for the listener.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Server did not start in time');
};

describe('embedded socket server lifecycle', () => {
  it('closes all listeners and allows its port to be reused', async () => {
    const { socketServer } = require('../packages/syncloungeserver/dist/lib');
    const port = await getFreePort();
    const router = socketServer({
      base_url: '/',
      port,
      ping_interval: 10000,
      ping_timeout: 10000,
    });
    await waitForHealth(port);
    await router.close();

    const replacement = http.createServer();
    await new Promise((resolve) => replacement.listen(port, '127.0.0.1', resolve));
    assert.equal(replacement.address().port, port);
    await new Promise((resolve) => replacement.close(resolve));
  });
});
