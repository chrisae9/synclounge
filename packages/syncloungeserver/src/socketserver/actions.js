export const createActions = (socketState) => {
  const {
    isUserInARoom, getRoomUserData, getUserRoomId, makeUserHost, getSocketCount, getRoomSize,
    getRoomSocketIds, removeUser, isRoomEmpty, removeRoom, getAnySocketIdInRoom, getRoomCount,
    generateAndSetSocketLatencySecret, formatUserData, getRoomHostId, getJoinedUserCount,
    clearSocketLatencyInterval, setSocketLatencyIntervalId,
  } = socketState;

  const log = (...args) => {
    console.log(new Date().toISOString(), ...args);
  };

  const logSocket = ({ socketId, message }) => {
    const identifier = isUserInARoom(socketId)
      ? `[${socketId}] ${getRoomUserData(socketId).username}`
      : `[${socketId}]`;

    log(identifier, ':', message);
  };

  const logSocketStats = () => {
    log('Connected:', getSocketCount(), '|', 'Joined:', getJoinedUserCount());
  };

  const logRoomStats = (roomId) => {
    log('Room:', roomId, '|', 'Users:', getRoomSize(roomId));
  };

  const logRoomsStats = () => {
    log('Rooms:', getRoomCount());
  };

  const emitToSocket = ({
    server, socketId, eventName, data,
  }) => {
    server.to(socketId).emit(eventName, data);
  };

  const emitToUserRoomExcept = ({
    server, eventName, data, exceptSocketId,
  }) => {
    getRoomSocketIds(getUserRoomId(exceptSocketId))
      .filter((socketId) => socketId !== exceptSocketId)
      .forEach((socketId) => {
        emitToSocket({
          server, socketId, eventName, data,
        });
      });
  };

  const emitToRoom = ({
    server, roomId, eventName, data,
  }) => {
    getRoomSocketIds(roomId).forEach((socketId) => {
      emitToSocket({
        server, socketId, eventName, data,
      });
    });
  };

  const emitToSocketRoom = ({
    server, socketId, eventName, data,
  }) => {
    emitToRoom({
      server, roomId: getUserRoomId(socketId), eventName, data,
    });
  };

  const announceNewHost = ({ server, roomId, hostId }) => {
    emitToRoom({
      server,
      roomId,
      eventName: 'newHost',
      data: hostId,
    });
  };

  const removeUserAndUpdateRoom = ({ server, socketId }) => {
    const roomId = getUserRoomId(socketId);

    removeUser(socketId);

    if (isRoomEmpty(roomId)) {
      log('Removing room:', roomId);

      removeRoom(roomId);
      logRoomsStats();
      return null;
    }

    if (getRoomHostId(roomId) === socketId) {
      // Make someone else host
      const desiredHostId = getAnySocketIdInRoom(roomId);
      makeUserHost(desiredHostId);

      logSocket({
        socketId,
        message: `Transferring host to: [${desiredHostId}] ${getRoomUserData(desiredHostId).username}`,
      });
      emitToRoom({
        server,
        roomId,
        eventName: 'userLeft',
        data: {
          id: socketId,
          newHostId: desiredHostId,
        },
      });
    } else {
      emitToRoom({
        server,
        roomId,
        eventName: 'userLeft',
        data: {
          id: socketId,
        },
      });
    }

    return roomId;
  };

  const sendPing = ({ server, socketId, pingTimeout }) => {
    clearSocketLatencyInterval(socketId);
    const secret = generateAndSetSocketLatencySecret(socketId);

    emitToSocket({
      server,
      socketId,
      eventName: 'slPing',
      data: secret,
    });

    setSocketLatencyIntervalId({
      socketId,
      intervalId: setTimeout(() => {
        const socket = server.sockets.sockets.get(socketId);
        if (socket?.connected) {
          logSocket({ socketId, message: 'Disconnecting after slPing response timeout' });
          socket.disconnect(true);
        }
      }, pingTimeout),
    });
  };

  // Used to emit both player state updates and media updates.
  // Adjusts the time by the latency to the recipient
  const emitAdjustedUserDataToRoom = ({
    server, eventName, exceptSocketId, userData,
  }) => {
    getRoomSocketIds(getUserRoomId(exceptSocketId))
      .filter((socketId) => socketId !== exceptSocketId)
      .forEach((socketId) => {
        emitToSocket({
          server,
          socketId,
          eventName,
          data: {
            ...formatUserData({
              ...userData,
              recipientId: socketId,
            }),
            id: exceptSocketId,
          },
        });
      });
  };

  const emitPlayerStateUpdateToRoom = ({ server, socketId }) => {
    const {
      updatedAt, state, time, duration, playbackRate,
    } = getRoomUserData(socketId);

    emitAdjustedUserDataToRoom({
      server,
      eventName: 'playerStateUpdate',
      exceptSocketId: socketId,
      userData: {
        updatedAt,
        state,
        time,
        duration,
        playbackRate,
      },
    });
  };

  const emitMediaUpdateToRoom = ({ server, socketId, makeHost }) => {
    const {
      updatedAt, state, time, duration, playbackRate, media,
    } = getRoomUserData(socketId);

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
        makeHost,
      },
    });
  };

  return {
    announceNewHost,
    emitAdjustedUserDataToRoom,
    emitMediaUpdateToRoom,
    emitPlayerStateUpdateToRoom,
    emitToSocket,
    emitToSocketRoom,
    emitToUserRoomExcept,
    log,
    logRoomsStats,
    logRoomStats,
    logSocket,
    logSocketStats,
    removeUserAndUpdateRoom,
    sendPing,
  };
};

export default createActions;
