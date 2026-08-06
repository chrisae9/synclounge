const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getPublic } = require('../config');

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
});
