import { ValidationError, validateEvent } from './validation';
import { sanitizePlaybackDiagnostic } from './playbackdiagnostics';

export const createEventHandlers = ({ state: socketState, actions }) => {
  const {
    doesRoomExist, isUserInARoom, getRoomUserData, isUserHost, removeSocketLatencyData,
    getJoinData, createRoom, addUserToRoom, clearSocketLatencyInterval,
    getUserRoomId, isUserInRoom, updateUserMedia, makeUserHost, updateUserPlayerState,
    getSocketPingSecret, updateSocketLatency, setSocketLatencyIntervalId, doesSocketHaveRtt,
    setIsPartyPausingEnabledInSocketRoom, updateUserSyncFlexibility,
    setIsAutoHostEnabledInSocketRoom, isPartyPausingEnabledInSocketRoom,
    isAutoHostEnabledInSocketRoom, initSocketLatencyData, getRoomHostId,
    updateUserRoomPreview, getUserRoomPreview,
  } = socketState;
  const {
    removeUserAndUpdateRoom, emitToSocket, logSocket, emitAdjustedUserDataToRoom,
    announceNewHost, emitPlayerStateUpdateToRoom, emitMediaUpdateToRoom, sendPing,
    emitToSocketRoom, logRoomStats, emitToUserRoomExcept, logSocketStats, logRoomsStats, log,
  } = actions;

  let partyPauseRequestId = 0;
  const recentSeeks = new Map();

  const removeSocketFromRoom = ({ server, socket, onRoomMediaUpdate }) => {
    recentSeeks.delete(socket.id);
    const roomId = getUserRoomId(socket.id);
    const wasHost = isUserHost(socket.id);
    const remainingRoomId = removeUserAndUpdateRoom({ server, socketId: socket.id });

    if (wasHost && onRoomMediaUpdate) {
      const newHostId = remainingRoomId == null ? null : getRoomHostId(remainingRoomId);
      onRoomMediaUpdate({
        roomId,
        roomPreview: newHostId == null ? null : getUserRoomPreview(newHostId),
      });
    }

    return remainingRoomId;
  };

  const join = ({
    onRoomMediaUpdate,
    server, socket, data: {
      roomId, desiredUsername, desiredPartyPausingEnabled, desiredAutoHostEnabled, thumb,
      playerProduct, state, time, duration, playbackRate, media, roomPreview, syncFlexibility,
    },
  }) => {
    if (!doesSocketHaveRtt(socket.id)) {
      // Ignore join if we don't have rtt yet.
      // Client should never do this so this just exists for bad actors
      logSocket({ socketId: socket.id, message: 'Socket tried to join without finishing initial ping/pong' });
      socket.disconnect(true);
      return;
    }

    if (isUserInARoom(socket.id)) {
      removeSocketFromRoom({ server, socket, onRoomMediaUpdate });
    }

    if (!doesRoomExist(roomId)) {
      log('Creating room:', roomId);

      createRoom({
        id: roomId,
        isPartyPausingEnabled: desiredPartyPausingEnabled,
        isAutoHostEnabled: desiredAutoHostEnabled,
        hostId: socket.id,
      });

      logRoomsStats();
    }

    addUserToRoom({
      reconnectIdentity: socket.data?.reconnectIdentity,
      socketId: socket.id,
      roomId,
      desiredUsername,
      thumb,
      playerProduct,
    });

    logSocket({ socketId: socket.id, message: `join "${roomId}"` });

    updateUserPlayerState({
      socketId: socket.id, state, time, duration, playbackRate,
    });

    updateUserSyncFlexibility({
      socketId: socket.id,
      syncFlexibility,
    });

    const activeMedia = state === 'stopped' ? null : media;
    const activeRoomPreview = state === 'stopped' ? null : roomPreview;
    updateUserMedia({ socketId: socket.id, media: activeMedia });
    updateUserRoomPreview({ socketId: socket.id, roomPreview: activeRoomPreview });

    if (isUserHost(socket.id) && onRoomMediaUpdate) {
      onRoomMediaUpdate({ roomId, roomPreview: activeRoomPreview });
    }

    // Broadcast user joined to everyone but this
    emitAdjustedUserDataToRoom({
      server,
      exceptSocketId: socket.id,
      eventName: 'userJoined',
      userData: getRoomUserData(socket.id),
    });

    emitToSocket({
      server,
      socketId: socket.id,
      eventName: 'joinResult',
      data: {
        success: true,
        ...getJoinData({ roomId, socketId: socket.id }),
      },
    });

    logSocketStats();
    logRoomStats(roomId);
  };

  const disconnect = ({ server, socket, onRoomMediaUpdate }) => {
    logSocket({ socketId: socket.id, message: 'disconnect' });

    try {
      if (isUserInARoom(socket.id)) {
        const roomId = removeSocketFromRoom({ server, socket, onRoomMediaUpdate });
        if (roomId != null) {
          logRoomStats(roomId);
        }
      }
    } finally {
      clearSocketLatencyInterval(socket.id);
      removeSocketLatencyData(socket.id);

      logSocketStats();
    }
  };

  const playbackDiagnostic = ({ socket, data }) => {
    if (!isUserInARoom(socket.id)) return;
    const diagnostic = sanitizePlaybackDiagnostic(data);
    if (!diagnostic) return;
    diagnostic.room = getUserRoomId(socket.id);
    logSocket({
      socketId: socket.id,
      message: `playback-diagnostic ${JSON.stringify(diagnostic)}`,
    });
  };

  const transferHost = ({
    server,
    socket,
    data: desiredHostId,
    onRoomMediaUpdate,
  }) => {
    if (!isUserInARoom(socket.id) || !isUserHost(socket.id)) {
      socket.disconnect(true);
      return;
    }

    const roomId = getUserRoomId(socket.id);
    if (!isUserInRoom({ roomId, socketId: desiredHostId })) {
      socket.disconnect(true);
      return;
    }

    logSocket({
      socketId: socket.id,
      message: `Transferring host to: [${desiredHostId}] ${getRoomUserData(desiredHostId).username}`,
    });
    makeUserHost(desiredHostId);
    announceNewHost({
      server,
      roomId,
      hostId: desiredHostId,
    });
    if (onRoomMediaUpdate) {
      onRoomMediaUpdate({
        roomId,
        roomPreview: getUserRoomPreview(desiredHostId),
      });
    }
  };

  const playerStateUpdate = ({
    server, socket, data: {
      state, time, duration, playbackRate, userInitiatedSeek,
    },
  }) => {
    if (!isUserInARoom(socket.id)) {
      socket.disconnect(true);
      return;
    }

    const previous = { ...getRoomUserData(socket.id) };
    updateUserPlayerState({
      socketId: socket.id, state, time, duration, playbackRate,
    });
    const current = getRoomUserData(socket.id);
    const expectedTime = previous.time + (previous.state === 'playing'
      ? (current.updatedAt - previous.updatedAt) * previous.playbackRate : 0);
    // Shaka can send buffering at the new position before seeked, followed by
    // a stable state. Keep the observed discontinuity until that sequence ends.
    if (previous.state !== 'stopped' && state !== 'stopped'
      && Number.isFinite(expectedTime) && Math.abs(current.time - expectedTime) > 250) {
      recentSeeks.set(socket.id, { time: current.time, at: current.updatedAt, intent: false });
    }
    const recent = recentSeeks.get(socket.id);
    const matchesRecent = recent && current.updatedAt - recent.at <= 30000
      && Math.abs(current.time - recent.time) <= 1000;
    if (matchesRecent && userInitiatedSeek === true) recent.intent = true;
    const verifiedSeek = Boolean(matchesRecent && recent.intent && ['playing', 'paused'].includes(state));
    if (verifiedSeek || !matchesRecent || state === 'stopped') recentSeeks.delete(socket.id);
    const marker = userInitiatedSeek === undefined && !verifiedSeek ? undefined : verifiedSeek;

    emitPlayerStateUpdateToRoom({ server, socketId: socket.id, userInitiatedSeek: marker });
  };

  const mediaUpdate = ({
    onRoomMediaUpdate,
    server, socket, data: {
      state, time, duration, playbackRate, media, roomPreview, userInitiated,
    },
  }) => {
    if (!isUserInARoom(socket.id)) {
      socket.disconnect(true);
      return;
    }

    recentSeeks.delete(socket.id);
    updateUserPlayerState({
      socketId: socket.id, state, time, duration, playbackRate,
    });

    const activeMedia = state === 'stopped' ? null : media;
    const activeRoomPreview = state === 'stopped' ? null : roomPreview;
    updateUserMedia({ socketId: socket.id, media: activeMedia });
    updateUserRoomPreview({ socketId: socket.id, roomPreview: activeRoomPreview });

    const makeHost = userInitiated && !isUserHost(socket.id)
    && isAutoHostEnabledInSocketRoom(socket.id);

    if (makeHost) {
    // Emit to user that they are host now
      makeUserHost(socket.id);
      emitToSocket({
        server,
        socketId: socket.id,
        eventName: 'newHost',
        data: socket.id,
      });

      logSocket({
        socketId: socket.id,
        message: 'Making host because user initiated media change',
      });
    }

    if (isUserHost(socket.id) && onRoomMediaUpdate) {
      onRoomMediaUpdate({
        roomId: getUserRoomId(socket.id),
        roomPreview: activeRoomPreview,
      });
    }

    emitMediaUpdateToRoom({ server, socketId: socket.id, makeHost });
  };

  const slPong = ({
    server, pingInterval, pingTimeout, socket, data: secret,
  }) => {
    const expectedSecret = getSocketPingSecret(socket.id);
    if (expectedSecret === null || secret !== expectedSecret) {
      logSocket({
        socketId: socket.id,
        message: `Incorrect secret. Expected "${expectedSecret}", got "${secret}"`,
      });

      socket.disconnect(true);
      return;
    }

    clearSocketLatencyInterval(socket.id);
    updateSocketLatency(socket.id);

    setSocketLatencyIntervalId({
      socketId: socket.id,
      intervalId: setTimeout(() => {
        sendPing({ server, socketId: socket.id, pingTimeout });
      }, pingInterval),
    });
  };

  const sendMessage = ({ server, socket, data: text }) => {
    if (!isUserInARoom(socket.id)) {
      socket.disconnect(true);
      return;
    }

    emitToUserRoomExcept({
      server,
      eventName: 'newMessage',
      data: {
        text,
        senderId: socket.id,
      },
      exceptSocketId: socket.id,
    });
  };

  const setPartyPausingEnabled = ({ server, socket, data: isPartyPausingEnabled }) => {
    if (!isUserInARoom(socket.id) || !isUserHost(socket.id)) {
      socket.disconnect(true);
      return;
    }

    logSocket({
      socketId: socket.id,
      message: `set party pausing to: ${isPartyPausingEnabled}`,
    });

    setIsPartyPausingEnabledInSocketRoom({ socketId: socket.id, isPartyPausingEnabled });

    // Emitting to everyone including sender as an ack that it went through
    emitToSocketRoom({
      server,
      socketId: socket.id,
      eventName: 'setPartyPausingEnabled',
      data: isPartyPausingEnabled,
    });
  };

  const setAutoHostEnabled = ({ server, socket, data: isAutoHostEnabled }) => {
    if (!isUserInARoom(socket.id) || !isUserHost(socket.id)) {
      socket.disconnect(true);
      return;
    }

    logSocket({
      socketId: socket.id,
      message: `set auto host to: ${isAutoHostEnabled}`,
    });

    setIsAutoHostEnabledInSocketRoom({ socketId: socket.id, isAutoHostEnabled });

    // Emitting to everyone including sender as an ack that it went through
    emitToSocketRoom({
      server,
      socketId: socket.id,
      eventName: 'setAutoHostEnabled',
      data: isAutoHostEnabled,
    });
  };

  const partyPause = ({ server, socket, data: isPause }) => {
    if (!isUserInARoom(socket.id) || !isPartyPausingEnabledInSocketRoom(socket.id)) {
      socket.disconnect(true);
      return;
    }

    emitToSocketRoom({
      server,
      socketId: socket.id,
      eventName: 'partyPause',
      data: {
        senderId: socket.id,
        isPause,
        requestId: `${socket.id}:${partyPauseRequestId += 1}`,
      },
    });
  };

  const partyPauseAck = ({ server, socket, data }) => {
    if (!isUserInARoom(socket.id) || !isUserHost(socket.id)) {
      return;
    }

    emitToSocketRoom({
      server,
      socketId: socket.id,
      eventName: 'partyPauseAck',
      data,
    });
  };

  const syncFlexibilityUpdate = ({ server, socket, data: syncFlexibility }) => {
    if (!isUserInARoom(socket.id)) {
      socket.disconnect(true);
      return;
    }

    updateUserSyncFlexibility({
      socketId: socket.id,
      syncFlexibility,
    });

    emitToUserRoomExcept({
      server,
      eventName: 'syncFlexibilityUpdate',
      data: {
        syncFlexibility,
        id: socket.id,
      },
      exceptSocketId: socket.id,
    });
  };

  const kick = ({ server, socket, data: id }) => {
    if (!isUserInARoom(socket.id) || !isUserHost(socket.id)) {
      socket.disconnect(true);
      return;
    }

    const roomId = getUserRoomId(socket.id);
    if (!isUserInRoom({ roomId, socketId: id })) {
      socket.disconnect(true);
      return;
    }

    logSocket({
      socketId: socket.id,
      message: `Kicking: [${id}] ${getRoomUserData(id).username}`,
    });

    emitToSocket({
      server,
      socketId: id,
      eventName: 'kicked',
      data: null,
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
    playbackDiagnostic,
    kick,
  };

  const DEFAULT_EVENT_RATE_LIMIT = { maxEvents: 60, windowMs: 1000 };
  const AGGREGATE_EVENT_RATE_LIMIT = { maxEvents: 100, windowMs: 1000 };
  const EVENT_RATE_LIMITS = {
    playerStateUpdate: { maxEvents: 30, windowMs: 1000 },
    mediaUpdate: { maxEvents: 10, windowMs: 1000 },
    sendMessage: { maxEvents: 5, windowMs: 5000 },
    partyPause: { maxEvents: 10, windowMs: 1000 },
    playbackDiagnostic: { maxEvents: 60, windowMs: 60 * 1000 },
  };

  const createEventRateLimiter = () => {
    const buckets = new Map();
    let aggregateBucket;

    const incrementBucket = (bucket, { maxEvents, windowMs }, now) => {
      if (!bucket || now - bucket.windowStartedAt >= windowMs) {
        return {
          bucket: { count: 1, windowStartedAt: now },
          limited: false,
        };
      }

      const nextBucket = { ...bucket, count: bucket.count + 1 };
      return { bucket: nextBucket, limited: nextBucket.count > maxEvents };
    };

    return (eventName) => {
      const now = Date.now();
      const aggregateResult = incrementBucket(
        aggregateBucket,
        AGGREGATE_EVENT_RATE_LIMIT,
        now,
      );
      aggregateBucket = aggregateResult.bucket;

      const eventResult = incrementBucket(
        buckets.get(eventName),
        EVENT_RATE_LIMITS[eventName] ?? DEFAULT_EVENT_RATE_LIMIT,
        now,
      );
      buckets.set(eventName, eventResult.bucket);

      return aggregateResult.limited || eventResult.limited;
    };
  };

  const attachEventHandlers = ({
    server,
    pingInterval,
    pingTimeout,
    onRoomMediaUpdate,
  }) => {
    server.on('connection', (socket) => {
      const isRateLimited = createEventRateLimiter();
      const forwardedHeader = socket.handshake.headers['x-forwarded-for'];
      const addressInfo = forwardedHeader
        ? `${forwardedHeader} (${socket.conn.remoteAddress})`
        : socket.conn.remoteAddress;

      logSocket({ socketId: socket.id, message: `connection: ${addressInfo}` });
      initSocketLatencyData(socket.id);
      sendPing({ server, socketId: socket.id, pingTimeout });
      logSocketStats();

      // Cleanup must never pass through event validation or rate limiting. A rate-limit
      // rejection disconnects synchronously, so limiting this event would skip cleanup.
      socket.on('disconnect', () => {
        try {
          disconnect({ server, socket, onRoomMediaUpdate });
        } catch (error) {
          log('Unhandled socket disconnect error:', error);
        }
      });

      Object.entries(eventHandlers).forEach(([name, handler]) => {
        socket.on(name, (data) => {
          try {
            validateEvent(name, data);
            if (isRateLimited(name)) {
              logSocket({ socketId: socket.id, message: `Rate limit exceeded for ${name}` });
              socket.disconnect(true);
              return;
            }
            handler({
              server,
              pingInterval,
              pingTimeout,
              onRoomMediaUpdate,
              socket,
              data,
            });
          } catch (error) {
            if (error instanceof ValidationError) {
              logSocket({ socketId: socket.id, message: `Rejected event: ${error.message}` });
            } else {
              log('Unhandled socket event error:', name, error);
            }

            if (socket.connected) {
              socket.disconnect(true);
            }
          }
        });
      });
    });
  };

  return attachEventHandlers;
};

export default createEventHandlers;
