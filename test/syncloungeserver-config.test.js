const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const serverPackagePath = path.join(__dirname, '..', 'packages', 'syncloungeserver');
const nconf = require(require.resolve('nconf', { paths: [serverPackagePath] }));
const {
  defaultConfig,
  getConfig,
} = require('../packages/syncloungeserver/dist/lib');

describe('embedded socket server configuration', () => {
  it('does not reset the imported nconf singleton', () => {
    nconf.reset();
    nconf.use('memory');
    nconf.set('instance_isolation_sentinel', 'preserved');

    try {
      getConfig();
      assert.equal(nconf.get('instance_isolation_sentinel'), 'preserved');
    } finally {
      nconf.reset();
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
