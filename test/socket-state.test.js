const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The generated dist module does not exist until build:server runs.
// eslint-disable-next-line import/extensions
const { createState } = require('../packages/syncloungeserver/dist/socketserver/state.js');

describe('socket server room state', () => {
  it('allocates duplicate usernames when an existing similar name has a non-numeric suffix', () => {
    const state = createState();
    const roomId = `username-${Date.now()}-${Math.random()}`;
    state.createRoom({
      id: roomId,
      isPartyPausingEnabled: true,
      isAutoHostEnabled: false,
      hostId: 'socket-1',
    });

    state.addUserToRoom({
      socketId: 'socket-1',
      roomId,
      desiredUsername: 'Alice',
      thumb: '',
      playerProduct: 'test',
    });
    state.addUserToRoom({
      socketId: 'socket-2',
      roomId,
      desiredUsername: 'Alice(foo)',
      thumb: '',
      playerProduct: 'test',
    });

    assert.doesNotThrow(() => {
      state.addUserToRoom({
        socketId: 'socket-3',
        roomId,
        desiredUsername: 'Alice',
        thumb: '',
        playerProduct: 'test',
      });
    });
    assert.equal(state.getRoomUserData('socket-3').username, 'Alice(1)');
  });
});
