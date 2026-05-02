"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sendPing = exports.removeUserAndUpdateRoom = exports.logSocketStats = exports.logSocket = exports.logRoomsStats = exports.logRoomStats = exports.log = exports.emitToUserRoomExcept = exports.emitToSocketRoom = exports.emitToSocket = exports.emitPlayerStateUpdateToRoom = exports.emitMediaUpdateToRoom = exports.emitAdjustedUserDataToRoom = exports.announceNewHost = void 0;
var _state = require("./state");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const log = (...args) => {
  console.log(new Date().toISOString(), ...args);
};
exports.log = log;
const logSocket = ({
  socketId,
  message
}) => {
  const identifier = (0, _state.isUserInARoom)(socketId) ? "[".concat(socketId, "] ").concat((0, _state.getRoomUserData)(socketId).username) : "[".concat(socketId, "]");
  log(identifier, ':', message);
};
exports.logSocket = logSocket;
const logSocketStats = () => {
  log('Connected:', (0, _state.getSocketCount)(), '|', 'Joined:', (0, _state.getJoinedUserCount)());
};
exports.logSocketStats = logSocketStats;
const logRoomStats = roomId => {
  log('Room:', roomId, '|', 'Users:', (0, _state.getRoomSize)(roomId));
};
exports.logRoomStats = logRoomStats;
const logRoomsStats = () => {
  log('Rooms:', (0, _state.getRoomCount)());
};
exports.logRoomsStats = logRoomsStats;
const emitToSocket = ({
  server,
  socketId,
  eventName,
  data
}) => {
  server.to(socketId).emit(eventName, data);
};
exports.emitToSocket = emitToSocket;
const emitToUserRoomExcept = ({
  server,
  eventName,
  data,
  exceptSocketId
}) => {
  (0, _state.getRoomSocketIds)((0, _state.getUserRoomId)(exceptSocketId)).filter(socketId => socketId !== exceptSocketId).forEach(socketId => {
    emitToSocket({
      server,
      socketId,
      eventName,
      data
    });
  });
};
exports.emitToUserRoomExcept = emitToUserRoomExcept;
const emitToRoom = ({
  server,
  roomId,
  eventName,
  data
}) => {
  (0, _state.getRoomSocketIds)(roomId).forEach(socketId => {
    emitToSocket({
      server,
      socketId,
      eventName,
      data
    });
  });
};
const emitToSocketRoom = ({
  server,
  socketId,
  eventName,
  data
}) => {
  emitToRoom({
    server,
    roomId: (0, _state.getUserRoomId)(socketId),
    eventName,
    data
  });
};
exports.emitToSocketRoom = emitToSocketRoom;
const announceNewHost = ({
  server,
  roomId,
  hostId
}) => {
  emitToRoom({
    server,
    roomId,
    eventName: 'newHost',
    data: hostId
  });
};
exports.announceNewHost = announceNewHost;
const removeUserAndUpdateRoom = ({
  server,
  socketId
}) => {
  const roomId = (0, _state.getUserRoomId)(socketId);
  (0, _state.removeUser)(socketId);
  if ((0, _state.isRoomEmpty)(roomId)) {
    log('Removing room:', roomId);
    (0, _state.removeRoom)(roomId);
    logRoomsStats();
    return null;
  }
  if ((0, _state.getRoomHostId)(roomId) === socketId) {
    // Make someone else host
    const desiredHostId = (0, _state.getAnySocketIdInRoom)(roomId);
    (0, _state.makeUserHost)(desiredHostId);
    logSocket({
      socketId,
      message: "Transferring host to: [".concat(desiredHostId, "] ").concat((0, _state.getRoomUserData)(desiredHostId).username)
    });
    emitToRoom({
      server,
      roomId,
      eventName: 'userLeft',
      data: {
        id: socketId,
        newHostId: desiredHostId
      }
    });
  } else {
    emitToRoom({
      server,
      roomId,
      eventName: 'userLeft',
      data: {
        id: socketId
      }
    });
  }
  return roomId;
};
exports.removeUserAndUpdateRoom = removeUserAndUpdateRoom;
const sendPing = ({
  server,
  socketId
}) => {
  const secret = (0, _state.generateAndSetSocketLatencySecret)(socketId);
  emitToSocket({
    server,
    socketId,
    eventName: 'slPing',
    data: secret
  });
};

// Used to emit both player state updates and media updates.
// Adjusts the time by the latency to the recipient
exports.sendPing = sendPing;
const emitAdjustedUserDataToRoom = ({
  server,
  eventName,
  exceptSocketId,
  userData
}) => {
  (0, _state.getRoomSocketIds)((0, _state.getUserRoomId)(exceptSocketId)).filter(socketId => socketId !== exceptSocketId).forEach(socketId => {
    emitToSocket({
      server,
      socketId,
      eventName,
      data: _objectSpread(_objectSpread({}, (0, _state.formatUserData)(_objectSpread(_objectSpread({}, userData), {}, {
        recipientId: socketId
      }))), {}, {
        id: exceptSocketId
      })
    });
  });
};
exports.emitAdjustedUserDataToRoom = emitAdjustedUserDataToRoom;
const emitPlayerStateUpdateToRoom = ({
  server,
  socketId
}) => {
  const {
    updatedAt,
    state,
    time,
    duration,
    playbackRate
  } = (0, _state.getRoomUserData)(socketId);
  emitAdjustedUserDataToRoom({
    server,
    eventName: 'playerStateUpdate',
    exceptSocketId: socketId,
    userData: {
      updatedAt,
      state,
      time,
      duration,
      playbackRate
    }
  });
};
exports.emitPlayerStateUpdateToRoom = emitPlayerStateUpdateToRoom;
const emitMediaUpdateToRoom = ({
  server,
  socketId,
  makeHost
}) => {
  const {
    updatedAt,
    state,
    time,
    duration,
    playbackRate,
    media
  } = (0, _state.getRoomUserData)(socketId);
  emitAdjustedUserDataToRoom({
    server,
    eventName: 'mediaUpdate',
    exceptSocketId: socketId,
    userData: {
      updatedAt,
      state,
      time,
      duration,
      playbackRate,
      media,
      makeHost
    }
  });
};
exports.emitMediaUpdateToRoom = emitMediaUpdateToRoom;