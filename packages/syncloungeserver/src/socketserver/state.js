import { v4 as uuidv4 } from 'uuid';

export const createState = () => {
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
    userRoomData.state = state;
    // Adjust time by sender's latency
    userRoomData.time = state === 'playing'
      ? time + getSocketLatency(socketId)
      : time;
    userRoomData.duration = duration;
    userRoomData.playbackRate = playbackRate;
    userRoomData.updatedAt = Date.now();
  };

  const updateUserMedia = ({
    socketId, media,
  }) => {
    const userRoomData = getRoomUserData(socketId);
    userRoomData.media = media;
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
    socketId, roomId, desiredUsername, thumb, playerProduct,
  }) => {
    const { users } = rooms.get(roomId);

    const usernames = [...users.values()].map((user) => user.username);

    socketRoomId.set(socketId, roomId);
    users.set(socketId, {
      username: getUniqueUsername({ usernames, desiredUsername }),
      thumb,
      playerProduct,
    });
  };

  const createRoom = ({
    id, isPartyPausingEnabled, isAutoHostEnabled, hostId,
  }) => {
    rooms.set(id, {
      isPartyPausingEnabled,
      isAutoHostEnabled,
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
    const { username } = getRoomUserData(socketId);
    const { isPartyPausingEnabled, isAutoHostEnabled } = rooms.get(roomId);

    return {
      isPartyPausingEnabled,
      isAutoHostEnabled,
      hostId: getRoomHostId(roomId),
      user: {
        id: socketId,
        username,
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
  };

  const isUserHost = (socketId) => getUserRoom(socketId).hostId === socketId;

  const getRoomSize = (roomId) => rooms.get(roomId).users.size;

  const isRoomEmpty = (roomId) => getRoomSize(roomId) <= 0;

  const getAnySocketIdInRoom = (roomId) => rooms.get(roomId).users.keys().next().value;

  const makeUserHost = (socketId) => {
    getUserRoom(socketId).hostId = socketId;
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

  const setIsPartyPausingEnabledInSocketRoom = ({ socketId, isPartyPausingEnabled }) => {
    getUserRoom(socketId).isPartyPausingEnabled = isPartyPausingEnabled;
  };

  const setIsAutoHostEnabledInSocketRoom = ({ socketId, isAutoHostEnabled }) => {
    getUserRoom(socketId).isAutoHostEnabled = isAutoHostEnabled;
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
    removeRoom,
    removeSocketLatencyData,
    removeUser,
    setIsAutoHostEnabledInSocketRoom,
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
