const { it } = require('node:test');
const assert = require('node:assert/strict');
// eslint-disable-next-line import/extensions
const { createEventHandlers } = require('../packages/syncloungeserver/dist/socketserver/handlers.js');

it('resumes diagnostics after the window expires and logs only one warning per window', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const listeners = new Map();
  const logs = [];
  const broadcasts = [];
  const user = {};
  const socket = {
    id: 'viewer',
    connected: true,
    handshake: { headers: {} },
    conn: { remoteAddress: 'test' },
    on: (name, handler) => listeners.set(name, handler),
    disconnect: () => { socket.connected = false; },
  };
  const attach = createEventHandlers({
    state: {
      initSocketLatencyData: () => {},
      isUserInARoom: () => true,
      getUserRoomId: () => 'room',
      getRoomUserData: () => user,
    },
    actions: {
      sendPing: () => {},
      logSocketStats: () => {},
      logSocket: (entry) => logs.push(entry.message),
      emitToSocketRoom: (entry) => broadcasts.push(entry),
    },
  });
  attach({ server: { on: (name, handler) => handler(socket) } });
  const diagnostic = listeners.get('playbackDiagnostic');
  const send = (count) => {
    for (let i = 0; i < count; i += 1) {
      diagnostic({ event: 'buffering-start', playback: { bufferAhead: 0 } });
    }
  };
  send(160);
  assert.equal(socket.connected, true);
  assert.equal(broadcasts.length, 60);
  assert.equal(logs.filter((line) => line.includes('Rate limit exceeded')).length, 1);
  t.mock.timers.tick(59999);
  send(5);
  assert.equal(broadcasts.length, 60);
  t.mock.timers.tick(1);
  send(61);
  assert.equal(socket.connected, true);
  assert.equal(broadcasts.length, 120);
  assert.equal(logs.filter((line) => line.includes('Rate limit exceeded')).length, 2);
});
