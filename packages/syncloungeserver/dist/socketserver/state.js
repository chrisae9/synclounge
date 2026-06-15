"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateUserSyncFlexibility = exports.updateUserPlayerState = exports.updateUserMedia = exports.updateSocketLatency = exports.setSocketLatencyIntervalId = exports.setIsPartyPausingEnabledInSocketRoom = exports.setIsAutoHostEnabledInSocketRoom = exports.removeUser = exports.removeSocketLatencyData = exports.removeRoom = exports.makeUserHost = exports.isUserInRoom = exports.isUserInARoom = exports.isUserHost = exports.isRoomEmpty = exports.isPartyPausingEnabledInSocketRoom = exports.isAutoHostEnabledInSocketRoom = exports.initSocketLatencyData = exports.getUserRoomId = exports.getUserRoom = exports.getSocketPingSecret = exports.getSocketLatency = exports.getSocketCount = exports.getRoomUserData = exports.getRoomSocketIds = exports.getRoomSize = exports.getRoomHostId = exports.getRoomCount = exports.getJoinedUserCount = exports.getJoinData = exports.getHealth = exports.getAnySocketIdInRoom = exports.generateAndSetSocketLatencySecret = exports.formatUserData = exports.doesSocketHaveRtt = exports.doesRoomExist = exports.createRoom = exports.clearSocketLatencyInterval = exports.addUserToRoom = void 0;
var _uuid = require("uuid");
const _excluded = ["recipientId", "updatedAt", "playbackRate", "state", "time"];
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
const rooms = new Map();
// Map from socket id to room name
const socketRoomId = new Map();
const socketLatencyData = new Map();
const getNumberFromUsername = username => {
  const match = username.match(/\((\d+)\)$/);
  return match ? parseInt(match[1], 10) : null;
};
const getUserRoomId = socketId => socketRoomId.get(socketId);
exports.getUserRoomId = getUserRoomId;
const getUserRoom = socketId => rooms.get(getUserRoomId(socketId));
exports.getUserRoom = getUserRoom;
const getRoomUserData = socketId => getUserRoom(socketId).users.get(socketId);
exports.getRoomUserData = getRoomUserData;
const getUniqueUsername = ({
  usernames,
  desiredUsername
}) => {
  if (!usernames.includes(desiredUsername)) {
    return desiredUsername;
  }

  // Get users with same username that are numbered like:  username(1)
  const sameUsersNum = usernames.filter(username => username.startsWith("".concat(desiredUsername, "(")));
  if (sameUsersNum.length > 0) {
    const userNumbers = sameUsersNum.map(getNumberFromUsername).filter(number => number != null);
    if (userNumbers.length === 0) {
      return "".concat(desiredUsername, "(1)");
    }
    const nextNumber = Math.max(...userNumbers) + 1;
    return "".concat(desiredUsername, "(").concat(nextNumber, ")");
  }
  return "".concat(desiredUsername, "(1)");
};
const getSocketLatency = socketId => socketLatencyData.get(socketId).rtt / 2;
exports.getSocketLatency = getSocketLatency;
const updateUserPlayerState = ({
  socketId,
  state,
  time,
  duration,
  playbackRate
}) => {
  const userRoomData = getRoomUserData(socketId);
  userRoomData.state = state;
  // Adjust time by sender's latency
  userRoomData.time = state === 'playing' ? time + getSocketLatency(socketId) : time;
  userRoomData.duration = duration;
  userRoomData.playbackRate = playbackRate;
  userRoomData.updatedAt = Date.now();
};
exports.updateUserPlayerState = updateUserPlayerState;
const updateUserMedia = ({
  socketId,
  media
}) => {
  const userRoomData = getRoomUserData(socketId);
  userRoomData.media = media;
};
exports.updateUserMedia = updateUserMedia;
const updateUserSyncFlexibility = ({
  socketId,
  syncFlexibility
}) => {
  const userRoomData = getRoomUserData(socketId);
  userRoomData.syncFlexibility = syncFlexibility;
};
exports.updateUserSyncFlexibility = updateUserSyncFlexibility;
const addUserToRoom = ({
  socketId,
  roomId,
  desiredUsername,
  thumb,
  playerProduct
}) => {
  const {
    users
  } = rooms.get(roomId);
  const usernames = [...users.values()].map(user => user.username);
  socketRoomId.set(socketId, roomId);
  users.set(socketId, {
    username: getUniqueUsername({
      usernames,
      desiredUsername
    }),
    thumb,
    playerProduct
  });
};
exports.addUserToRoom = addUserToRoom;
const createRoom = ({
  id,
  isPartyPausingEnabled,
  isAutoHostEnabled,
  hostId
}) => {
  rooms.set(id, {
    isPartyPausingEnabled,
    isAutoHostEnabled,
    hostId,
    users: new Map()
  });
};
exports.createRoom = createRoom;
const isUserInARoom = socketId => socketRoomId.has(socketId);
exports.isUserInARoom = isUserInARoom;
const doesRoomExist = roomId => rooms.has(roomId);
exports.doesRoomExist = doesRoomExist;
const getRoomSocketIds = roomId => [...rooms.get(roomId).users.keys()];
exports.getRoomSocketIds = getRoomSocketIds;
const formatUserData = _ref => {
  let {
      recipientId,
      updatedAt,
      playbackRate,
      state,
      time
    } = _ref,
    rest = _objectWithoutProperties(_ref, _excluded);
  return _objectSpread(_objectSpread({}, rest), {}, {
    playbackRate,
    state,
    // Adjust time by age if playing
    time: state === 'playing' ? time + (getSocketLatency(recipientId) + Date.now() - updatedAt) * playbackRate : time
  });
};
exports.formatUserData = formatUserData;
const getOtherUserData = ({
  roomId,
  exceptSocketId
}) => Object.fromEntries([...rooms.get(roomId).users].filter(([socketId]) => socketId !== exceptSocketId).map(([id, data]) => [id, formatUserData(_objectSpread({
  recipientId: exceptSocketId
}, data))]));
const getRoomHostId = roomId => rooms.get(roomId).hostId;
exports.getRoomHostId = getRoomHostId;
const getJoinData = ({
  roomId,
  socketId
}) => {
  const {
    username
  } = getRoomUserData(socketId);
  const {
    isPartyPausingEnabled,
    isAutoHostEnabled
  } = rooms.get(roomId);
  return {
    isPartyPausingEnabled,
    isAutoHostEnabled,
    hostId: getRoomHostId(roomId),
    user: {
      id: socketId,
      username
    },
    users: getOtherUserData({
      roomId,
      exceptSocketId: socketId
    })
  };
};
exports.getJoinData = getJoinData;
const removeUser = socketId => {
  rooms.get(getUserRoomId(socketId)).users["delete"](socketId);
  socketRoomId["delete"](socketId);
};
exports.removeUser = removeUser;
const removeRoom = roomId => {
  rooms["delete"](roomId);
};
exports.removeRoom = removeRoom;
const isUserHost = socketId => getUserRoom(socketId).hostId === socketId;
exports.isUserHost = isUserHost;
const getRoomSize = roomId => rooms.get(roomId).users.size;
exports.getRoomSize = getRoomSize;
const isRoomEmpty = roomId => getRoomSize(roomId) <= 0;
exports.isRoomEmpty = isRoomEmpty;
const getAnySocketIdInRoom = roomId => rooms.get(roomId).users.keys().next().value;
exports.getAnySocketIdInRoom = getAnySocketIdInRoom;
const makeUserHost = socketId => {
  getUserRoom(socketId).hostId = socketId;
};
exports.makeUserHost = makeUserHost;
const isUserInRoom = ({
  roomId,
  socketId
}) => rooms.get(roomId).users.has(socketId);
exports.isUserInRoom = isUserInRoom;
const getSocketPingSecret = socketId => {
  var _socketLatencyData$ge;
  return (_socketLatencyData$ge = socketLatencyData.get(socketId)) === null || _socketLatencyData$ge === void 0 ? void 0 : _socketLatencyData$ge.secret;
};
exports.getSocketPingSecret = getSocketPingSecret;
const updateSocketLatency = socketId => {
  const latencyData = socketLatencyData.get(socketId);

  // TODO: potentially smooth it? or also measure variance?
  latencyData.rtt = Date.now() - latencyData.sentAt;

  // Reset secret
  latencyData.secret = null;
};
exports.updateSocketLatency = updateSocketLatency;
const generateAndSetSocketLatencySecret = socketId => {
  const secret = (0, _uuid.v4)();
  const latencyData = socketLatencyData.get(socketId);
  latencyData.secret = secret;
  latencyData.sentAt = Date.now();
  return secret;
};
exports.generateAndSetSocketLatencySecret = generateAndSetSocketLatencySecret;
const setSocketLatencyIntervalId = ({
  socketId,
  intervalId
}) => {
  socketLatencyData.get(socketId).intervalId = intervalId;
};
exports.setSocketLatencyIntervalId = setSocketLatencyIntervalId;
const doesSocketHaveRtt = socketId => {
  var _socketLatencyData$ge2;
  return ((_socketLatencyData$ge2 = socketLatencyData.get(socketId)) === null || _socketLatencyData$ge2 === void 0 ? void 0 : _socketLatencyData$ge2.rtt) != null;
};
exports.doesSocketHaveRtt = doesSocketHaveRtt;
const initSocketLatencyData = socketId => {
  socketLatencyData.set(socketId, {});
};
exports.initSocketLatencyData = initSocketLatencyData;
const removeSocketLatencyData = socketId => {
  socketLatencyData["delete"](socketId);
};
exports.removeSocketLatencyData = removeSocketLatencyData;
const setIsPartyPausingEnabledInSocketRoom = ({
  socketId,
  isPartyPausingEnabled
}) => {
  getUserRoom(socketId).isPartyPausingEnabled = isPartyPausingEnabled;
};
exports.setIsPartyPausingEnabledInSocketRoom = setIsPartyPausingEnabledInSocketRoom;
const setIsAutoHostEnabledInSocketRoom = ({
  socketId,
  isAutoHostEnabled
}) => {
  getUserRoom(socketId).isAutoHostEnabled = isAutoHostEnabled;
};
exports.setIsAutoHostEnabledInSocketRoom = setIsAutoHostEnabledInSocketRoom;
const isPartyPausingEnabledInSocketRoom = socketId => getUserRoom(socketId).isPartyPausingEnabled;
exports.isPartyPausingEnabledInSocketRoom = isPartyPausingEnabledInSocketRoom;
const isAutoHostEnabledInSocketRoom = socketId => getUserRoom(socketId).isAutoHostEnabled;
exports.isAutoHostEnabledInSocketRoom = isAutoHostEnabledInSocketRoom;
const clearSocketLatencyInterval = socketId => {
  clearInterval(socketLatencyData.get(socketId).intervalId);
};
exports.clearSocketLatencyInterval = clearSocketLatencyInterval;
const getJoinedUserCount = () => socketRoomId.size;
exports.getJoinedUserCount = getJoinedUserCount;
const getLoad = () => {
  if (getJoinedUserCount() < 25) {
    return 'low';
  }
  if (getJoinedUserCount() < 50) {
    return 'medium';
  }
  return 'high';
};
const getHealth = () => ({
  load: getLoad()
});
exports.getHealth = getHealth;
const getSocketCount = () => socketLatencyData.size;
exports.getSocketCount = getSocketCount;
const getRoomCount = () => rooms.size;
exports.getRoomCount = getRoomCount;