import { v4 as uuidv4 } from 'uuid';

export const createState = ({ hostPersistence } = {}) => {
  const rooms = new Map();
  // Map from socket id to room name
  const socketRoomId = new Map();
  const socketLatencyData = new Map();
  const socketRoomPreview = new Map();

  const getNumberFromUsername = (username) => {
    const match = username.match(/\((\d+)\)$/);
    return match ? parseInt(match[1], 10) : null;
  };

  const getUserRoomId = (socketId) => socketRoomId.get(socketId);

  const getUserRoom = (socketId) => rooms.get(getUserRoomId(socketId));

  const getRoomUserData = (socketId) => getUserRoom(socketId)
    .users.get(socketId);

  const rememberHost = (roomId, options = {}) => {
    const room = rooms.get(roomId);
    const host = room?.users.get(room.hostId);
    if (!host?.reconnectIdentity || (hostPersistence?.getRecovery(roomId)
      && !options.revokeRecovery)) return;
    hostPersistence?.remember(roomId, {
      identity: host.reconnectIdentity,
      expectsPlayback: host.state !== 'stopped' && Boolean(host.media),
      isPartyPausingEnabled: room.isPartyPausingEnabled,
      isAutoHostEnabled: room.isAutoHostEnabled,
      syncPreset: room.syncPreset,
    }, options);
  };

  const restoreReturningHost = (socketId) => {
    const roomId = getUserRoomId(socketId);
    const claim = hostPersistence?.getRecovery(roomId);
    const user = getRoomUserData(socketId);
    if (!claim || claim.identity !== user.reconnectIdentity
      || (claim.expectsPlayback && (!user.media || !['playing', 'paused'].includes(user.state)))) return false;
    const room = rooms.get(roomId);
    const changed = room.hostId !== socketId;
    room.hostId = socketId;
    rememberHost(roomId, { force: true, revokeRecovery: true });
    return changed;
  };

  const getUniqueUsername = ({ usernames, desiredUsername }) => {
    if (!usernames.includes(desiredUsername)) {
      return desiredUsername;
    }

    // Get users with same username that are numbered like:  username(1)
    const sameUsersNum = usernames.filter((username) => username.startsWith(`${desiredUsername}(`));
    if (sameUsersNum.length > 0) {
      const userNumbers = sameUsersNum.map(getNumberFromUsername).filter((number) => number != null);
      if (userNumbers.length === 0) {
        return `${desiredUsername}(1)`;
      }
      const nextNumber = Math.max(...userNumbers) + 1;

      return `${desiredUsername}(${nextNumber})`;
    }

    return `${desiredUsername}(1)`;
  };

  const getSocketLatency = (socketId) => socketLatencyData.get(socketId).rtt / 2;

  const updateUserPlayerState = ({
    socketId, state, time, duration, playbackRate,
  }) => {
    const userRoomData = getRoomUserData(socketId);
    const changedStoppedness = (userRoomData.state === 'stopped') !== (state === 'stopped');
    userRoomData.state = state;
    // Adjust time by sender's latency
    userRoomData.time = state === 'playing'
      ? time + getSocketLatency(socketId)
      : time;
    userRoomData.duration = duration;
    userRoomData.playbackRate = playbackRate;
    userRoomData.updatedAt = Date.now();
    rememberHost(getUserRoomId(socketId), { force: changedStoppedness });
  };

  const updateUserMedia = ({
    socketId, media,
  }) => {
    const userRoomData = getRoomUserData(socketId);
    const changedMedia = Boolean(userRoomData.media) !== Boolean(media);
    userRoomData.media = media;
    rememberHost(getUserRoomId(socketId), { force: changedMedia });
  };

  const updateUserRoomPreview = ({ socketId, roomPreview }) => {
    if (roomPreview == null) {
      socketRoomPreview.delete(socketId);
    } else {
      socketRoomPreview.set(socketId, roomPreview);
    }
  };

  const getUserRoomPreview = (socketId) => socketRoomPreview.get(socketId) ?? null;

  const updateUserSyncFlexibility = ({
    socketId, syncFlexibility,
  }) => {
    const userRoomData = getRoomUserData(socketId);
    userRoomData.syncFlexibility = syncFlexibility;
  };

  const addUserToRoom = ({
    socketId, roomId, desiredUsername, thumb, playerProduct, reconnectIdentity,
  }) => {
    const { users } = rooms.get(roomId);

    const usernames = [...users.values()].map((user) => user.username);

    socketRoomId.set(socketId, roomId);
    users.set(socketId, {
      reconnectIdentity,
      username: getUniqueUsername({ usernames, desiredUsername }),
      thumb,
      playerProduct,
    });
  };

  const createRoom = ({
    id, isPartyPausingEnabled, isAutoHostEnabled, hostId,
  }) => {
    const claim = hostPersistence?.getRecovery(id);
    rooms.set(id, {
      isPartyPausingEnabled: claim?.isPartyPausingEnabled ?? isPartyPausingEnabled,
      isAutoHostEnabled: claim?.isAutoHostEnabled ?? isAutoHostEnabled,
      syncPreset: ['strict', 'balanced', 'relaxed'].includes(claim?.syncPreset)
        ? claim.syncPreset : 'balanced',
      hostId,
      users: new Map(),
    });
  };

  const isUserInARoom = (socketId) => socketRoomId.has(socketId);

  const doesRoomExist = (roomId) => rooms.has(roomId);

  const getRoomSocketIds = (roomId) => [...rooms.get(roomId).users.keys()];

  const formatUserData = ({
    recipientId, updatedAt, playbackRate, state, time, ...rest
  }) => ({
    ...rest,
    playbackRate,
    state,
    // Adjust time by age if playing
    time: state === 'playing'
      ? time + (getSocketLatency(recipientId) + Date.now() - updatedAt) * playbackRate
      : time,
  });

  const getOtherUserData = ({ roomId, exceptSocketId }) => Object.fromEntries(
    [...rooms.get(roomId).users]
      .filter(([socketId]) => socketId !== exceptSocketId)
      .map(([id, data]) => ([id, formatUserData({ recipientId: exceptSocketId, ...data })])),
  );

  const getRoomHostId = (roomId) => rooms.get(roomId).hostId;

  const getJoinData = ({ roomId, socketId }) => {
    const { username, reconnectIdentity } = getRoomUserData(socketId);
    const { isPartyPausingEnabled, isAutoHostEnabled, syncPreset } = rooms.get(roomId);

    return {
      syncPreset,
      isPartyPausingEnabled,
      isAutoHostEnabled,
      hostId: getRoomHostId(roomId),
      user: {
        id: socketId,
        username,
        reconnectIdentity,
      },
      users: getOtherUserData({ roomId, exceptSocketId: socketId }),
    };
  };

  const removeUser = (socketId) => {
    rooms.get(getUserRoomId(socketId)).users.delete(socketId);
    socketRoomId.delete(socketId);
    socketRoomPreview.delete(socketId);
  };

  const removeRoom = (roomId) => {
    rooms.delete(roomId);
    hostPersistence?.remove(roomId);
  };

  const isUserHost = (socketId) => getUserRoom(socketId).hostId === socketId;

  const getRoomSize = (roomId) => rooms.get(roomId).users.size;

  const isRoomEmpty = (roomId) => getRoomSize(roomId) <= 0;

  const getAnySocketIdInRoom = (roomId) => rooms.get(roomId).users.keys().next().value;

  const makeUserHost = (socketId, { preserveRecovery = false } = {}) => {
    getUserRoom(socketId).hostId = socketId;
    rememberHost(getUserRoomId(socketId), { force: true, revokeRecovery: !preserveRecovery });
  };

  const isUserInRoom = ({ roomId, socketId }) => rooms.get(roomId).users.has(socketId);

  const getSocketPingSecret = (socketId) => socketLatencyData.get(socketId)?.secret;

  const updateSocketLatency = (socketId) => {
    const latencyData = socketLatencyData.get(socketId);

    // TODO: potentially smooth it? or also measure variance?
    latencyData.rtt = Date.now() - latencyData.sentAt;

    // Reset secret
    latencyData.secret = null;
  };

  const generateAndSetSocketLatencySecret = (socketId) => {
    const secret = uuidv4();
    const latencyData = socketLatencyData.get(socketId);
    latencyData.secret = secret;
    latencyData.sentAt = Date.now();
    return secret;
  };

  const setSocketLatencyIntervalId = ({ socketId, intervalId }) => {
    socketLatencyData.get(socketId).intervalId = intervalId;
  };

  const doesSocketHaveRtt = (socketId) => socketLatencyData.get(socketId)?.rtt != null;

  const initSocketLatencyData = (socketId) => {
    socketLatencyData.set(socketId, {});
  };

  const removeSocketLatencyData = (socketId) => {
    socketLatencyData.delete(socketId);
  };

  const setRoomSyncPreset = ({ socketId, preset }) => {
    getUserRoom(socketId).syncPreset = preset;
    rememberHost(getUserRoomId(socketId), { force: true });
  };

  const setIsPartyPausingEnabledInSocketRoom = ({ socketId, isPartyPausingEnabled }) => {
    getUserRoom(socketId).isPartyPausingEnabled = isPartyPausingEnabled;
    rememberHost(getUserRoomId(socketId), { force: true });
  };

  const setIsAutoHostEnabledInSocketRoom = ({ socketId, isAutoHostEnabled }) => {
    getUserRoom(socketId).isAutoHostEnabled = isAutoHostEnabled;
    rememberHost(getUserRoomId(socketId), { force: true });
  };

  const isPartyPausingEnabledInSocketRoom = (socketId) => getUserRoom(socketId)
    .isPartyPausingEnabled;

  const isAutoHostEnabledInSocketRoom = (socketId) => getUserRoom(socketId)
    .isAutoHostEnabled;

  const clearSocketLatencyInterval = (socketId) => {
    clearInterval(socketLatencyData.get(socketId)?.intervalId);
  };

  const getJoinedUserCount = () => socketRoomId.size;

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
    load: getLoad(),
  });

  const getSocketCount = () => socketLatencyData.size;

  const getRoomCount = () => rooms.size;

  return {
    addUserToRoom,
    clearSocketLatencyInterval,
    createRoom,
    doesRoomExist,
    doesSocketHaveRtt,
    formatUserData,
    generateAndSetSocketLatencySecret,
    getAnySocketIdInRoom,
    getHealth,
    getJoinedUserCount,
    getJoinData,
    getRoomCount,
    getRoomHostId,
    getRoomSize,
    getRoomSocketIds,
    getRoomUserData,
    getSocketCount,
    getSocketPingSecret,
    getUserRoomId,
    getUserRoomPreview,
    initSocketLatencyData,
    isAutoHostEnabledInSocketRoom,
    isPartyPausingEnabledInSocketRoom,
    isRoomEmpty,
    isUserHost,
    isUserInARoom,
    isUserInRoom,
    makeUserHost,
    restoreReturningHost,
    removeRoom,
    removeSocketLatencyData,
    removeUser,
    setIsAutoHostEnabledInSocketRoom,
    setRoomSyncPreset,
    setIsPartyPausingEnabledInSocketRoom,
    setSocketLatencyIntervalId,
    updateSocketLatency,
    updateUserMedia,
    updateUserPlayerState,
    updateUserRoomPreview,
    updateUserSyncFlexibility,
  };
};

export default createState;
