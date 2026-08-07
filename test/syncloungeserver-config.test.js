const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');

const serverPackagePath = path.join(__dirname, '..', 'packages', 'syncloungeserver');
const requireFromServer = createRequire(path.join(serverPackagePath, 'package.json'));
const nconf = requireFromServer('nconf');
// The generated dist entry does not exist until build:server runs.
const {
  defaultConfig,
  getConfig,
  socketServer,
} = require('../packages/syncloungeserver/dist/lib.js'); // eslint-disable-line import/extensions

describe('embedded socket server configuration', () => {
  it('does not reset the imported nconf singleton', () => {
    nconf.reset();
    nconf.use('memory');
    nconf.set('instance_isolation_sentinel', 'preserved');

    try {
      const config = getConfig();
      assert.equal(nconf.get('instance_isolation_sentinel'), 'preserved');
      assert.equal(config.port, 8088);
      assert.equal(config.base_url, '/');
      assert.equal(config.ping_interval, 10000);
      assert.equal(config.ping_timeout, 10000);
      assert.equal(config.trust_proxy, 'loopback');
    } finally {
      nconf.reset();
    }
  });

  it('parses boundary values from argv without mutating exported defaults', () => {
    const originalArgv = process.argv;
    process.argv = [...process.argv.slice(0, 2), '--port=0', '--ping_interval=1'];

    try {
      const config = getConfig();
      assert.equal(config.port, 0);
      assert.equal(config.ping_interval, 1);
      assert.equal(defaultConfig.port, 8088);
      assert.equal(defaultConfig.ping_interval, 10000);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('leaves malformed environment input observable for server validation', () => {
    const originalPingTimeout = process.env.PING_TIMEOUT;
    process.env.PING_TIMEOUT = 'not-a-number';

    try {
      const config = getConfig();
      assert.equal(config.ping_timeout, 'not-a-number');
      assert.throws(() => socketServer(config), {
        name: 'TypeError',
        message: 'ping_timeout must be a positive number',
      });
    } finally {
      if (originalPingTimeout === undefined) delete process.env.PING_TIMEOUT;
      else process.env.PING_TIMEOUT = originalPingTimeout;
    }
  });

  it('exports immutable defaults', () => {
    assert.equal(Object.isFrozen(defaultConfig), true);
    assert.throws(() => {
      Object.defineProperty(defaultConfig, 'port', { value: 1 });
    }, TypeError);
    assert.equal(defaultConfig.port, 8088);
  });
});
