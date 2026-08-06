const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getPublic } = require('../config');

describe('public configuration projection', () => {
  it('keeps documented browser settings and removes nested or arbitrary secrets', () => {
    const result = getPublic({
      servers: [{ name: 'Public server' }],
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
    assert.equal('deployment' in result, false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  });
});
