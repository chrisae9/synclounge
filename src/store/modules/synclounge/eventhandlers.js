import { CAF } from 'caf';
import { emit, waitForEvent, getId } from '@/socket';

// Strip server-assigned dedup suffix like "(1)", "(2)" for username comparison.
// When the same Plex user reconnects, the server may assign a different suffix.
const stripUsernameSuffix = (name) => name?.replace(/\(\d+\)$/, '').trim();

const matchesPreviousHost = (getters, user) => {
  const thumbMatch = user?.thumb
    && user.thumb === getters.GET_HOST_GRACE_PREVIOUS_HOST_THUMB;
  const nameMatch = user?.username
    && stripUsernameSuffix(user.username)
      === stripUsernameSuffix(getters.GET_HOST_GRACE_PREVIOUS_HOST_USERNAME);
  return thumbMatch || nameMatch;
};

const hasRestoredPlayback = (user) => user?.media
  && (user.state === 'playing' || user.state === 'paused');

const HOST_RESTORE_TIMEOUT = 30000;
let partyPauseCommandQueue = Promise.resolve();
let partyPauseCommandGeneration = 0;

const invalidatePartyPauseCommands = () => {
  partyPauseCommandGeneration += 1;
  partyPauseCommandQueue = Promise.resolve();
};

const matchesPreviousHostPlayback = (getters, user) => {
  const previousState = getters.GET_HOST_GRACE_PREVIOUS_HOST_STATE;
  const expectedState = previousState === 'playing' || previousState === 'paused'
    ? previousState
    : null;
  return hasRestoredPlayback(user)
    && (!expectedState || user.state === expectedState);
};

const matchesHostRestorePlayback = (getters, user) => hasRestoredPlayback(user)
  && (!getters.GET_HOST_RESTORE_EXPECTED_STATE
    || user.state === getters.GET_HOST_RESTORE_EXPECTED_STATE);

const reclaimReturningHost = async ({ getters, commit, dispatch }, id) => {
  if (getters.GET_PENDING_HOST_ID !== getters.GET_SOCKET_ID) {
    return;
  }

  await dispatch('CLEAR_HOST_GRACE_PERIOD');
  commit('SET_HOST_ID', id);
  dispatch('TRANSFER_HOST', id);

  await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
    senderId: id,
    text: `${getters.GET_USER(id).username} is now the host`,
  });

  try {
    await dispatch('CANCEL_IN_PROGRESS_SYNC');
    await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
  } catch (e) {
    console.error('Error syncing after host reclaim:', e);
  }
};

const startHostGraceTimeout = ({ getters, commit, dispatch }, timeoutMs) => {
  if (getters.GET_HOST_GRACE_TIMEOUT_ID != null) {
    clearTimeout(getters.GET_HOST_GRACE_TIMEOUT_ID);
    commit('SET_HOST_GRACE_TIMEOUT_ID', null);
  }

  const timeoutId = setTimeout(async () => {
    if (!getters.IS_HOST_GRACE_PERIOD || getters.GET_PENDING_HOST_ID == null) {
      return;
    }

    const pendingHostId = getters.GET_PENDING_HOST_ID;
    await dispatch('CLEAR_HOST_GRACE_PERIOD');
    commit('SET_HOST_ID', pendingHostId);

    try {
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
    } catch (e) {
      console.error('Error syncing after grace period timeout:', e);
    }
  }, timeoutMs);

  commit('SET_HOST_GRACE_TIMEOUT_ID', timeoutId);
};

const startReturningHostRestoreWindow = (context) => {
  const { getters, commit } = context;
  let deadline = getters.GET_HOST_GRACE_RESTORE_DEADLINE_AT;
  if (deadline == null) {
    deadline = Date.now() + HOST_RESTORE_TIMEOUT;
    commit('SET_HOST_GRACE_RESTORE_DEADLINE_AT', deadline);
  }
  startHostGraceTimeout(context, Math.max(0, deadline - Date.now()));
};

const completeHostRestore = async ({ getters, commit, dispatch }, id, force = false) => {
  if (getters.GET_HOST_RESTORE_PENDING_ID !== id) {
    return;
  }
  if (!force && !matchesHostRestorePlayback(getters, getters.GET_USER(id))) {
    return;
  }

  await dispatch('CANCEL_IN_PROGRESS_SYNC');
  if (getters.GET_HOST_RESTORE_PENDING_ID !== id) {
    return;
  }
  if (!force && !matchesHostRestorePlayback(getters, getters.GET_USER(id))) {
    return;
  }

  if (getters.GET_HOST_RESTORE_TIMEOUT_ID != null) {
    clearTimeout(getters.GET_HOST_RESTORE_TIMEOUT_ID);
    commit('SET_HOST_RESTORE_TIMEOUT_ID', null);
  }
  commit('SET_HOST_RESTORE_PENDING_ID', null);
  commit('SET_HOST_RESTORE_EXPECTED_STATE', null);
  await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
};

const startHostRestoreTimeout = (context, id, expectedState, timeoutMs) => {
  const { getters, commit } = context;
  if (getters.GET_HOST_RESTORE_TIMEOUT_ID != null) {
    clearTimeout(getters.GET_HOST_RESTORE_TIMEOUT_ID);
    commit('SET_HOST_RESTORE_TIMEOUT_ID', null);
  }
  commit('SET_HOST_RESTORE_PENDING_ID', id);
  commit('SET_HOST_RESTORE_EXPECTED_STATE', expectedState);
  const timeoutId = setTimeout(() => {
    completeHostRestore(context, id, true).catch((e) => {
      console.error('Error syncing after host restoration timeout:', e);
    });
  }, Math.max(0, timeoutMs));
  commit('SET_HOST_RESTORE_TIMEOUT_ID', timeoutId);
};

const applyPartyPause = async (
  { getters, dispatch },
  { senderId, isPause, requestId },
  generation,
) => {
  if (generation !== partyPauseCommandGeneration) return;
  const sender = getters.GET_USER(senderId);
  if (sender) {
    const text = `${sender.username} pressed ${isPause ? 'pause' : 'play'}`;
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId,
      text,
    });

    await dispatch('DISPLAY_NOTIFICATION', {
      text,
      color: 'info',
    }, { root: true });
  }

  if (generation !== partyPauseCommandGeneration) return;
  await dispatch('CANCEL_IN_PROGRESS_SYNC');
  if (generation !== partyPauseCommandGeneration) return;
  if (isPause) {
    await dispatch('plexclients/PRESS_PAUSE', null, { root: true });
  } else {
    await dispatch('plexclients/PRESS_PLAY', null, { root: true });
  }
  if (generation !== partyPauseCommandGeneration) return;
  if (getters.AM_I_HOST) {
    await dispatch('plexclients/REFRESH_PLAYER_STATE', null, { root: true });
    await dispatch('SEND_PARTY_PAUSE_ACK', requestId);
    await dispatch('ACKNOWLEDGE_PARTY_PAUSE', requestId);
  }
};

export default {
  INVALIDATE_PARTY_PAUSE_COMMANDS: invalidatePartyPauseCommands,

  CLEAR_HOST_GRACE_PERIOD: ({ getters, commit }) => {
    if (getters.GET_HOST_GRACE_TIMEOUT_ID != null) {
      clearTimeout(getters.GET_HOST_GRACE_TIMEOUT_ID);
      commit('SET_HOST_GRACE_TIMEOUT_ID', null);
    }
    commit('SET_IS_HOST_GRACE_PERIOD', false);
    commit('SET_PENDING_HOST_ID', null);
    commit('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', null);
    commit('SET_HOST_GRACE_PREVIOUS_HOST_THUMB', null);
    commit('SET_HOST_GRACE_PREVIOUS_HOST_STATE', null);
    commit('SET_HOST_GRACE_RESTORE_DEADLINE_AT', null);
  },

  CLEAR_HOST_RESTORE_PENDING: ({ getters, commit }) => {
    if (getters.GET_HOST_RESTORE_TIMEOUT_ID != null) {
      clearTimeout(getters.GET_HOST_RESTORE_TIMEOUT_ID);
      commit('SET_HOST_RESTORE_TIMEOUT_ID', null);
    }
    commit('SET_HOST_RESTORE_PENDING_ID', null);
    commit('SET_HOST_RESTORE_EXPECTED_STATE', null);
  },

  HANDLE_SET_PARTY_PAUSING_ENABLED: async ({ getters, dispatch, commit }, value) => {
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: getters.GET_HOST_ID,
      text: `Party Pausing has been turned ${value ? 'on' : 'off'}`,
    });

    commit('SET_IS_PARTY_PAUSING_ENABLED', value);
  },

  HANDLE_SET_AUTO_HOST_ENABLED: async ({ getters, dispatch, commit }, value) => {
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: getters.GET_HOST_ID,
      text: `Auto Host has been turned ${value ? 'on' : 'off'}`,
    });

    commit('SET_IS_AUTO_HOST_ENABLED', value);
  },

  HANDLE_USER_JOINED: async ({ getters, commit, dispatch }, { id, ...rest }) => {
    commit('SET_USER', {
      id,
      data: {
        ...rest,
        updatedAt: Date.now(),
      },
    });
    commit('RECORD_USER_EVENT', {
      id,
      fields: ['membership', 'player', 'media', 'syncFlexibility'],
    });

    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: id,
      text: `${rest.username} joined`,
    });

    // If a user joins during grace period whose identity matches the previous host, reclaim.
    // Match by thumb (Plex account identity) or stripped username (fallback).
    if (getters.IS_HOST_GRACE_PERIOD && matchesPreviousHost(getters, rest)) {
      if (matchesPreviousHostPlayback(getters, rest)) {
        await reclaimReturningHost({ getters, commit, dispatch }, id);
      } else {
        startReturningHostRestoreWindow({ getters, commit, dispatch });
      }
    }
  },

  HANDLE_USER_LEFT: async ({ getters, dispatch, commit }, { id, newHostId }) => {
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: id,
      text: `${getters.GET_USER(id).username} left the room`,
    });

    if (newHostId) {
      await dispatch('HANDLE_NEW_HOST', { hostId: newHostId, previousHostLeft: true });
    }

    commit('DELETE_USER', id);
    commit('RECORD_USER_EVENT', { id, fields: ['membership'] });
  },

  HANDLE_NEW_HOST: async ({ getters, dispatch, commit }, rawArg) => {
    const hostId = typeof rawArg === 'object' ? rawArg.hostId : rawArg;
    const previousHostLeft = typeof rawArg === 'object' && rawArg.previousHostLeft;

    // No-op if already set to this host
    if (hostId === getters.GET_HOST_ID && !getters.IS_HOST_GRACE_PERIOD) {
      return;
    }

    invalidatePartyPauseCommands();
    await dispatch('CLEAR_PENDING_PARTY_PAUSE');
    await dispatch('CLEAR_HOST_RESTORE_PENDING');

    // Socket-originated newHost (explicit transfer, auto-host, reclaim confirmation):
    // Accept immediately — grace period only applies when previous host disconnected
    if (!previousHostLeft) {
      if (getters.IS_HOST_GRACE_PERIOD) {
        await dispatch('CLEAR_HOST_GRACE_PERIOD');
      }
      commit('SET_HOST_ID', hostId);
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      if (hostId !== getters.GET_SOCKET_ID) {
        await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
      }
      return;
    }

    // --- From here, previousHostLeft is true (user disconnected) ---

    // If we're in a grace period and the original host reconnected, cancel the grace period
    // and keep the original host
    const newUser = getters.GET_USER(hostId);
    const newThumbMatch = newUser?.thumb
      && newUser.thumb === getters.GET_HOST_GRACE_PREVIOUS_HOST_THUMB;
    const newNameMatch = getters.GET_HOST_GRACE_PREVIOUS_HOST_USERNAME
      && stripUsernameSuffix(newUser?.username)
        === stripUsernameSuffix(getters.GET_HOST_GRACE_PREVIOUS_HOST_USERNAME);
    if (getters.IS_HOST_GRACE_PERIOD && (newThumbMatch || newNameMatch)) {
      const expectedState = getters.GET_HOST_GRACE_PREVIOUS_HOST_STATE;
      const restoreDeadline = getters.GET_HOST_GRACE_RESTORE_DEADLINE_AT
        ?? Date.now() + HOST_RESTORE_TIMEOUT;
      commit('SET_HOST_ID', hostId);
      startHostRestoreTimeout(
        { getters, commit, dispatch },
        hostId,
        expectedState,
        restoreDeadline - Date.now(),
      );
      await dispatch('CLEAR_HOST_GRACE_PERIOD');

      await dispatch('CANCEL_IN_PROGRESS_SYNC');

      await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
        senderId: hostId,
        text: `${getters.GET_USER(hostId).username} is now the host`,
      });

      await completeHostRestore({ getters, commit, dispatch }, hostId);
      return;
    }

    // Store the previous host's username before starting grace period
    // Guard: only store on first grace period entry to prevent cascading disconnects
    // from overwriting the username with undefined
    if (!getters.IS_HOST_GRACE_PERIOD) {
      const previousHost = getters.GET_USER(getters.GET_HOST_ID);
      if (!previousHost?.username) {
        // Can't identify previous host — skip grace period, accept new host directly
        commit('SET_HOST_ID', hostId);
        await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
          senderId: hostId,
          text: `${getters.GET_USER(hostId).username} is now the host`,
        });
        try {
          await dispatch('CANCEL_IN_PROGRESS_SYNC');
          await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
        } catch (e) {
          console.error('Error syncing after host change:', e);
        }
        return;
      }
      commit('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', previousHost.username);
      commit('SET_HOST_GRACE_PREVIOUS_HOST_THUMB', previousHost.thumb || null);
      commit(
        'SET_HOST_GRACE_PREVIOUS_HOST_STATE',
        previousHost.state === 'playing' || previousHost.state === 'paused'
          ? previousHost.state
          : null,
      );
      commit('SET_HOST_GRACE_RESTORE_DEADLINE_AT', null);
    }

    commit('SET_PENDING_HOST_ID', hostId);
    commit('SET_IS_HOST_GRACE_PERIOD', true);

    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: hostId,
      text: `${getters.GET_USER(hostId).username} is now the host`,
    });

    // Give the previous host 10 seconds to reconnect before accepting the elected host.
    const timeoutMs = getters.GET_HOST_GRACE_RESTORE_DEADLINE_AT == null
      ? 10000
      : Math.max(0, getters.GET_HOST_GRACE_RESTORE_DEADLINE_AT - Date.now());
    startHostGraceTimeout({ getters, commit, dispatch }, timeoutMs);
  },

  HANDLE_DISCONNECT: async ({ dispatch }) => {
    invalidatePartyPauseCommands();
    console.warn('HANDLE_DISCONNECT: lost connection to SyncLounge server');
    await dispatch('DISPLAY_NOTIFICATION', {
      text: 'Disconnected from the SyncLounge server',
      color: 'info',
    }, { root: true });
  },

  HANDLE_RECONNECT: async ({ dispatch, commit }) => {
    console.debug('HANDLE_RECONNECT: attempting to rejoin room');

    try {
      await waitForEvent('slPing', 15000);
      commit('SET_SOCKET_ID', getId());
      await dispatch('JOIN_ROOM_AND_INIT');
    } catch (e) {
      const text = `Error reconnecting: ${e.message}`;
      console.error(text);
      await dispatch('DISPLAY_NOTIFICATION', {
        text,
        color: 'error',
      }, { root: true });
      await dispatch('DISCONNECT_AND_NAVIGATE_HOME');
    }
  },

  HANDLE_SLPING: async (context, secret) => {
    emit({
      eventName: 'slPong',
      data: secret,
    });
  },

  HANDLE_PLAYER_STATE_UPDATE: async ({
    getters, rootGetters, dispatch, commit,
  }, data) => {
    console.debug('HANDLE_PLAYER_STATE_UPDATE:', {
      from: data.id, isHost: data.id === getters.GET_HOST_ID, state: data.state, time: data.time,
    });

    // During host grace period, ignore state updates from the pending host
    if (getters.IS_HOST_GRACE_PERIOD && data.id === getters.GET_PENDING_HOST_ID) {
      return;
    }

    const previousUser = getters.GET_USER(data.id);
    const previousState = previousUser?.state;
    const previousTime = previousUser?.time;
    commit('SET_USER_PLAYER_STATE', data);
    commit('RECORD_USER_EVENT', { id: data.id, fields: ['player'] });

    const updatedUser = getters.GET_USER(data.id);
    if (data.id === getters.GET_HOST_RESTORE_PENDING_ID) {
      await completeHostRestore({ getters, commit, dispatch }, data.id);
      return;
    }

    if (getters.IS_HOST_GRACE_PERIOD
      && getters.GET_PENDING_HOST_ID === getters.GET_SOCKET_ID
      && matchesPreviousHostPlayback(getters, updatedUser)
      && matchesPreviousHost(getters, updatedUser)) {
      await reclaimReturningHost({ getters, commit, dispatch }, data.id);
      return;
    }

    if (data.state === 'buffering' && previousState !== 'buffering'
      && data.id !== getters.GET_SOCKET_ID) {
      const user = getters.GET_USER(data.id);
      if (user) {
        dispatch('DISPLAY_NOTIFICATION', {
          text: `${user.username} is buffering...`,
          color: 'warning',
          icon: 'sync',
          location: 'top end',
        }, { root: true });
      }
    }

    // Skip sync dispatch during join sync to prevent concurrent sync evaluations
    if (getters.IS_JOIN_SYNC_IN_PROGRESS) {
      return;
    }

    if (data.id === getters.GET_HOST_ID) {
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      await dispatch('SYNC_PLAYER_STATE');
    } else if (data.id !== getters.GET_SOCKET_ID && getters.AM_I_HOST
      && !rootGetters['slplayer/IS_CHANGING_SOURCE']
      && !rootGetters['slplayer/IS_PLAY_QUEUE_TRANSITIONING']
      && previousTime != null && Math.abs(data.time - previousTime) > 5000
      && data.state !== 'buffering') {
      // Non-host user seeked (time jump > 5s) — follow their seek
      const user = getters.GET_USER(data.id);
      console.debug('Non-host seek detected from', user?.username, 'seeking to', data.time);
      await dispatch('DISPLAY_NOTIFICATION', {
        text: `${user?.username} seeked`,
        color: 'info',
      }, { root: true });
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      // eslint-disable-next-line new-cap
      const token = new CAF.cancelToken();
      commit('SET_SYNC_CANCEL_TOKEN', token);
      try {
        await dispatch('plexclients/SEEK_TO', {
          cancelSignal: token.signal,
          offset: data.time,
        }, { root: true });
      } catch (e) {
        if (!token.signal.aborted) {
          console.error('Error following non-host seek:', e);
        }
      } finally {
        if (getters.GET_SYNC_CANCEL_TOKEN === token) {
          commit('SET_SYNC_CANCEL_TOKEN', null);
        }
      }
    }
  },

  HANDLE_MEDIA_UPDATE: async ({
    getters, dispatch, commit,
  }, {
    id, state, time, duration, playbackRate, media, makeHost,
  }) => {
    console.debug('HANDLE_MEDIA_UPDATE:', {
      from: id, isHost: id === getters.GET_HOST_ID, title: media?.title, state, makeHost,
    });
    commit('SET_USER_PLAYER_STATE', {
      id,
      state,
      time,
      duration,
      playbackRate,
    });

    commit('SET_USER_MEDIA', {
      id,
      media,
    });
    commit('RECORD_USER_EVENT', { id, fields: ['player', 'media'] });

    if (makeHost) {
      await dispatch('HANDLE_NEW_HOST', id);
      return;
    }

    const user = getters.GET_USER(id);
    if (id === getters.GET_HOST_RESTORE_PENDING_ID) {
      await completeHostRestore({ getters, commit, dispatch }, id);
      return;
    }

    if (getters.IS_HOST_GRACE_PERIOD
      && getters.GET_PENDING_HOST_ID === getters.GET_SOCKET_ID
      && matchesPreviousHostPlayback(getters, user)
      && matchesPreviousHost(getters, user)) {
      await reclaimReturningHost({ getters, commit, dispatch }, id);
      return;
    }

    if (id === getters.GET_HOST_ID) {
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
    }
  },

  HANDLE_SYNC_FLEXIBILITY_UPDATE: ({ commit }, data) => {
    commit('SET_USER_SYNC_FLEXIBILITY', data);
    commit('RECORD_USER_EVENT', { id: data.id, fields: ['syncFlexibility'] });
  },

  HANDLE_PARTY_PAUSE: (context, data) => {
    const generation = partyPauseCommandGeneration;
    const pending = context.dispatch('MARK_PARTY_PAUSE_RECEIVED', {
      isPause: data.isPause,
      requestId: data.requestId,
    });
    const command = partyPauseCommandQueue.then(async () => {
      await pending;
      return applyPartyPause(context, data, generation);
    });
    partyPauseCommandQueue = command.catch(() => {});
    return command;
  },

  HANDLE_PARTY_PAUSE_ACK: async ({ dispatch }, { requestId }) => {
    if (!await dispatch('ACKNOWLEDGE_PARTY_PAUSE', requestId)) {
      return;
    }
    await dispatch('CANCEL_IN_PROGRESS_SYNC');
    await dispatch('SYNC_PLAYER_STATE');
  },

  HANDLE_KICKED: async ({ dispatch }) => {
    console.log('HANDLE_KICKED');
    await dispatch('DISCONNECT_AND_NAVIGATE_HOME');
  },
};
