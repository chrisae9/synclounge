const { it } = require('node:test');
const assert = require('node:assert/strict');
// eslint-disable-next-line import/extensions
const { validateEvent } = require('../packages/syncloungeserver/dist/socketserver/validation.js');

const timeline = {
  state: 'playing', time: 0, duration: 10000, playbackRate: 1,
};

it('rejects media identifiers containing URL syntax on joins and media updates', () => {
  for (const event of ['join', 'mediaUpdate']) {
    for (const field of ['ratingKey', 'machineIdentifier']) {
      for (const value of ['..', '../preferences', '1?x=1', '1#fragment', '1/2', '1\\2', '%2f', {}, -1, '\ud800']) {
        assert.throws(() => validateEvent(event, {
          ...timeline,
          roomId: 'room',
          desiredUsername: 'viewer',
          desiredPartyPausingEnabled: true,
          desiredAutoHostEnabled: false,
          syncFlexibility: 3000,
          media: { ratingKey: '123', machineIdentifier: 'server', [field]: value },
        }));
      }
    }
  }
});

it('accepts ordinary string and numeric Plex library identifiers', () => {
  for (const ratingKey of ['123', 123, 'episode-2']) {
    assert.doesNotThrow(() => validateEvent('mediaUpdate', {
      ...timeline, media: { ratingKey, machineIdentifier: 'server-1' },
    }));
  }
});
