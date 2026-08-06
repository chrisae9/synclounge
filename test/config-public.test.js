const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const config = require('../config');

const { getPublic } = config;

describe('public configuration projection', () => {
  it('keeps documented browser settings and removes nested or arbitrary secrets', () => {
    const result = getPublic({
      servers: [{
        name: 'Public server',
        location: 'Remote',
        url: 'https://example.test',
        image: 'server.png',
        token: 'server-secret',
      }],
      authentication: {
        mechanism: 'plex',
        type: ['server'],
        authorized: ['machine-id'],
        token: 'nested-secret',
      },
      autojoin: {
        server: 'https://example.test',
        room: 'room-code',
        secret: 'autojoin-secret',
      },
      default_slplayer_quality: 12000,
      deployment: { password: 'deployment-secret' },
    });

    assert.deepEqual(result.authentication, {
      mechanism: 'plex',
      type: ['server'],
      authorized: ['machine-id'],
    });
    assert.deepEqual(result.autojoin, {
      server: 'https://example.test',
      room: 'room-code',
    });
    assert.equal(result.default_slplayer_quality, 12000);
    assert.deepEqual(result.servers, [{
      name: 'Public server',
      location: 'Remote',
      url: 'https://example.test',
      image: 'server.png',
    }]);
    assert.equal('deployment' in result, false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  });

  it('falls back or omits values whose shape does not match browser settings', () => {
    const result = getPublic({
      servers: { token: 'nested-secret' },
      authentication: {
        mechanism: { token: 'nested-secret' },
        type: ['server', { token: 'nested-secret' }],
        authorized: 'nested-secret',
      },
      autojoin: { server: { token: 'nested-secret' }, room: 1234 },
      default_slplayer_quality: { token: 'nested-secret' },
      default_client_poll_interval: { token: 'nested-secret' },
    });

    assert.deepEqual(result.servers, [{
      name: 'Local Server',
      location: 'Local',
      url: '',
      image: 'synclounge-white.png',
    }]);
    assert.deepEqual(result.authentication, {
      mechanism: 'none',
      type: [],
      authorized: [],
    });
    assert.equal(result.default_client_poll_interval, 1000);
    assert.equal('autojoin' in result, false);
    assert.equal('default_slplayer_quality' in result, false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  });

  it('always supplies safe authorization arrays for a minimal Plex configuration', () => {
    const result = getPublic({
      authentication: { mechanism: 'plex' },
    });

    assert.deepEqual(result.authentication, {
      mechanism: 'plex',
      type: [],
      authorized: [],
    });
  });

  it('validates socket event timeout boundaries', () => {
    const fallbackForZero = getPublic({ socket_event_timeout: 0 });
    const fallbackAboveMaximum = getPublic({ socket_event_timeout: 2_147_483_648 });
    const maximum = getPublic({ socket_event_timeout: 2_147_483_647 });

    assert.equal(fallbackForZero.socket_event_timeout, 15000);
    assert.equal(fallbackAboveMaximum.socket_event_timeout, 15000);
    assert.equal(maximum.socket_event_timeout, 2_147_483_647);
  });

  it('filters nested secrets from the static build artifact', async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'synclounge-config-'));
    const outputFile = path.join(temporaryDirectory, 'config.json');

    try {
      const viteConfigUrl = pathToFileURL(path.join(__dirname, '..', 'vite.config.js'));
      const { generateConfigPlugin } = await import(viteConfigUrl.href);
      const plugin = generateConfigPlugin({
        configModule: config,
        configFile: outputFile,
        loadConfig: () => ({
          authentication: {
            mechanism: 'plex',
            token: 'static-build-secret',
          },
          deployment: { password: 'nested-secret' },
        }),
      });

      plugin.buildStart();

      const generatedConfig = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      assert.deepEqual(generatedConfig.authentication, {
        mechanism: 'plex',
        type: [],
        authorized: [],
      });
      assert.equal(JSON.stringify(generatedConfig).includes('secret'), false);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
