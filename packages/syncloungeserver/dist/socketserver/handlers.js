"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _state = require("./state");
var _actions = require("./actions");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const join = ({
  server,
  socket,
  data: {
    roomId,
    desiredUsername,
    desiredPartyPausingEnabled,
    desiredAutoHostEnabled,
    thumb,
    playerProduct,
    state,
    time,
    duration,
    playbackRate,
    media,
    syncFlexibility
  }
}) => {
  if (!(0, _state.doesSocketHaveRtt)(socket.id)) {
    // Ignore join if we don't have rtt yet.
    // Client should never do this so this just exists for bad actors
    (0, _actions.logSocket)({
      socketId: socket.id,
      message: 'Socket tried to join without finishing initial ping/pong'
    });
    socket.disconnect(true);
    return;
  }
  if ((0, _state.isUserInARoom)(socket.id)) {
    (0, _actions.removeUserAndUpdateRoom)({
      server,
      socketId: socket.id
    });
  }
  if (!(0, _state.doesRoomExist)(roomId)) {
    (0, _actions.log)('Creating room:', roomId);
    (0, _state.createRoom)({
      id: roomId,
      isPartyPausingEnabled: desiredPartyPausingEnabled,
      isAutoHostEnabled: desiredAutoHostEnabled,
      hostId: socket.id
    });
    (0, _actions.logRoomsStats)();
  }
  (0, _state.addUserToRoom)({
    socketId: socket.id,
    roomId,
    desiredUsername,
    thumb,
    playerProduct
  });
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: "join \"".concat(roomId, "\"")
  });
  (0, _state.updateUserPlayerState)({
    socketId: socket.id,
    state,
    time,
    duration,
    playbackRate
  });
  (0, _state.updateUserSyncFlexibility)({
    socketId: socket.id,
    syncFlexibility
  });
  (0, _state.updateUserMedia)({
    socketId: socket.id,
    media
  });

  // Broadcast user joined to everyone but this
  (0, _actions.emitAdjustedUserDataToRoom)({
    server,
    exceptSocketId: socket.id,
    eventName: 'userJoined',
    userData: (0, _state.getRoomUserData)(socket.id)
  });
  (0, _actions.emitToSocket)({
    server,
    socketId: socket.id,
    eventName: 'joinResult',
    data: _objectSpread({
      success: true
    }, (0, _state.getJoinData)({
      roomId,
      socketId: socket.id
    }))
  });
  (0, _actions.logSocketStats)();
  (0, _actions.logRoomStats)(roomId);
};
const disconnect = ({
  server,
  socket
}) => {
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: 'disconnect'
  });
  if ((0, _state.isUserInARoom)(socket.id)) {
    const roomId = (0, _actions.removeUserAndUpdateRoom)({
      server,
      socketId: socket.id
    });
    if (roomId != null) {
      (0, _actions.logRoomStats)(roomId);
    }
  }
  (0, _state.clearSocketLatencyInterval)(socket.id);
  (0, _state.removeSocketLatencyData)(socket.id);
  (0, _actions.logSocketStats)();
};
const transferHost = ({
  server,
  socket,
  data: desiredHostId
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isUserHost)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  const roomId = (0, _state.getUserRoomId)(socket.id);
  if (!(0, _state.isUserInRoom)({
    roomId,
    socketId: desiredHostId
  })) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: "Transferring host to: [".concat(desiredHostId, "] ").concat((0, _state.getRoomUserData)(desiredHostId).username)
  });
  (0, _state.makeUserHost)(desiredHostId);
  (0, _actions.announceNewHost)({
    server,
    roomId,
    hostId: desiredHostId
  });
};
const playerStateUpdate = ({
  server,
  socket,
  data: {
    state,
    time,
    duration,
    playbackRate
  }
}) => {
  if (!(0, _state.isUserInARoom)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _state.updateUserPlayerState)({
    socketId: socket.id,
    state,
    time,
    duration,
    playbackRate
  });
  (0, _actions.emitPlayerStateUpdateToRoom)({
    server,
    socketId: socket.id
  });
};
const mediaUpdate = ({
  server,
  socket,
  data: {
    state,
    time,
    duration,
    playbackRate,
    media,
    userInitiated
  }
}) => {
  if (!(0, _state.isUserInARoom)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _state.updateUserPlayerState)({
    socketId: socket.id,
    state,
    time,
    duration,
    playbackRate
  });
  (0, _state.updateUserMedia)({
    socketId: socket.id,
    media
  });
  const makeHost = userInitiated && !(0, _state.isUserHost)(socket.id) && (0, _state.isAutoHostEnabledInSocketRoom)(socket.id);
  if (makeHost) {
    // Emit to user that they are host now
    (0, _state.makeUserHost)(socket.id);
    (0, _actions.emitToSocket)({
      server,
      socketId: socket.id,
      eventName: 'newHost',
      data: socket.id
    });
    (0, _actions.logSocket)({
      socketId: socket.id,
      message: 'Making host because user initiated media change'
    });
  }
  (0, _actions.emitMediaUpdateToRoom)({
    server,
    socketId: socket.id,
    makeHost
  });
};
const slPong = ({
  server,
  pingInterval,
  socket,
  data: secret
}) => {
  const expectedSecret = (0, _state.getSocketPingSecret)(socket.id);
  if (expectedSecret === null || secret !== expectedSecret) {
    (0, _actions.logSocket)({
      socketId: socket.id,
      message: "Incorrect secret. Expected \"".concat(expectedSecret, "\", got \"").concat(secret, "\"")
    });
    socket.disconnect(true);
    return;
  }
  (0, _state.updateSocketLatency)(socket.id);
  (0, _state.setSocketLatencyIntervalId)({
    socketId: socket.id,
    intervalId: setTimeout(() => {
      (0, _actions.sendPing)({
        server,
        socketId: socket.id
      });
    }, pingInterval)
  });
};
const sendMessage = ({
  server,
  socket,
  data: text
}) => {
  if (!(0, _state.isUserInARoom)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.emitToUserRoomExcept)({
    server,
    eventName: 'newMessage',
    data: {
      text,
      senderId: socket.id
    },
    exceptSocketId: socket.id
  });
};
const setPartyPausingEnabled = ({
  server,
  socket,
  data: isPartyPausingEnabled
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isUserHost)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: "set party pausing to: ".concat(isPartyPausingEnabled)
  });
  (0, _state.setIsPartyPausingEnabledInSocketRoom)({
    socketId: socket.id,
    isPartyPausingEnabled
  });

  // Emitting to everyone including sender as an ack that it went through
  (0, _actions.emitToSocketRoom)({
    server,
    socketId: socket.id,
    eventName: 'setPartyPausingEnabled',
    data: isPartyPausingEnabled
  });
};
const setAutoHostEnabled = ({
  server,
  socket,
  data: isAutoHostEnabled
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isUserHost)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: "set auto host to: ".concat(isAutoHostEnabled)
  });
  (0, _state.setIsAutoHostEnabledInSocketRoom)({
    socketId: socket.id,
    isAutoHostEnabled
  });

  // Emitting to everyone including sender as an ack that it went through
  (0, _actions.emitToSocketRoom)({
    server,
    socketId: socket.id,
    eventName: 'setAutoHostEnabled',
    data: isAutoHostEnabled
  });
};
const partyPause = ({
  server,
  socket,
  data: isPause
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isPartyPausingEnabledInSocketRoom)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.emitToSocketRoom)({
    server,
    socketId: socket.id,
    eventName: 'partyPause',
    data: {
      senderId: socket.id,
      isPause,
      requestId: "".concat(socket.id, ":").concat(++partyPauseRequestId)
    }
  });
};
let partyPauseRequestId = 0;
const partyPauseAck = ({
  server,
  socket,
  data
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isUserHost)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.emitToSocketRoom)({
    server,
    socketId: socket.id,
    eventName: 'partyPauseAck',
    data
  });
};
const syncFlexibilityUpdate = ({
  server,
  socket,
  data: syncFlexibility
}) => {
  if (!(0, _state.isUserInARoom)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  (0, _state.updateUserSyncFlexibility)({
    socketId: socket.id,
    syncFlexibility
  });
  (0, _actions.emitToUserRoomExcept)({
    server,
    eventName: 'syncFlexibilityUpdate',
    data: {
      syncFlexibility,
      id: socket.id
    },
    exceptSocketId: socket.id
  });
};
const kick = ({
  server,
  socket,
  data: id
}) => {
  if (!(0, _state.isUserInARoom)(socket.id) || !(0, _state.isUserHost)(socket.id)) {
    socket.disconnect(true);
    return;
  }
  const roomId = (0, _state.getUserRoomId)(socket.id);
  if (!(0, _state.isUserInRoom)({
    roomId,
    socketId: id
  })) {
    socket.disconnect(true);
    return;
  }
  (0, _actions.logSocket)({
    socketId: socket.id,
    message: "Kicking: [".concat(id, "] ").concat((0, _state.getRoomUserData)(id).username)
  });
  (0, _actions.emitToSocket)({
    server,
    socketId: id,
    eventName: 'kicked',
    data: null
  });
  const kickedSocket = server.sockets.sockets.get(id);
  if (kickedSocket) {
    setImmediate(() => kickedSocket.disconnect(true));
  }
};
const eventHandlers = {
  join,
  slPong,
  playerStateUpdate,
  mediaUpdate,
  syncFlexibilityUpdate,
  transferHost,
  sendMessage,
  setPartyPausingEnabled,
  setAutoHostEnabled,
  partyPause,
  partyPauseAck,
  disconnect,
  kick
};
const attachEventHandlers = ({
  server,
  pingInterval
}) => {
  server.on('connection', socket => {
    const forwardedHeader = socket.handshake.headers['x-forwarded-for'];
    const addressInfo = forwardedHeader ? "".concat(forwardedHeader, " (").concat(socket.conn.remoteAddress, ")") : socket.conn.remoteAddres;
    (0, _actions.logSocket)({
      socketId: socket.id,
      message: "connection: ".concat(addressInfo)
    });
    (0, _state.initSocketLatencyData)(socket.id);
    (0, _actions.sendPing)({
      server,
      socketId: socket.id
    });
    (0, _actions.logSocketStats)();
    Object.entries(eventHandlers).forEach(([name, handler]) => {
      socket.on(name, data => {
        // TODO: eventually pass in state to everything rather than having it all global
        // TODO: move ping interval into state too
        handler({
          server,
          pingInterval,
          socket,
          data
        });
      });
    });
  });
};
var _default = exports["default"] = attachEventHandlers;
