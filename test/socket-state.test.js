const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const state = require('../packages/syncloungeserver/dist/socketserver/state');

describe('socket server room state', () => {
  it('allocates duplicate usernames when an existing similar name has a non-numeric suffix', () => {
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
