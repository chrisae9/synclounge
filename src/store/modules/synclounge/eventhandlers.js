import { emit, waitForEvent, getId } from '@/socket';

export default {
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

  HANDLE_USER_JOINED: async ({ commit, dispatch }, { id, ...rest }) => {
    commit('SET_USER', {
      id,
      data: {
        ...rest,
        updatedAt: Date.now(),
      },
    });

    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: id,
      text: `${rest.username} joined`,
    });
  },

  HANDLE_USER_LEFT: async ({ getters, dispatch, commit }, { id, newHostId }) => {
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: id,
      text: `${getters.GET_USER(id).username} left the room`,
    });

    if (newHostId) {
      await dispatch('HANDLE_NEW_HOST', newHostId);
    }

    commit('DELETE_USER', id);
  },

  HANDLE_NEW_HOST: async ({ getters, dispatch, commit }, hostId) => {
    commit('SET_HOST_ID', hostId);
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId: hostId,
      text: `${getters.GET_USER(hostId).username} is now the host`,
    });

    await dispatch('CANCEL_IN_PROGRESS_SYNC');
    await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
  },

  HANDLE_DISCONNECT: async ({ dispatch }) => {
    console.warn('HANDLE_DISCONNECT: lost connection to SyncLounge server');
    await dispatch('DISPLAY_NOTIFICATION', {
      text: 'Disconnected from the SyncLounge server',
      color: 'info',
    }, { root: true });
  },

  HANDLE_RECONNECT: async ({ dispatch, commit }) => {
    console.debug('HANDLE_RECONNECT: attempting to rejoin room');
    await waitForEvent('slPing');
    commit('SET_SOCKET_ID', getId());

    try {
      await dispatch('JOIN_ROOM_AND_INIT');
    } catch (e) {
      const text = `Error reconnecting: ${e.message}`;
      console.error(text);
      await dispatch('DISPLAY_NOTIFICATION', {
        text,
        color: 'error',
      }, { root: true });
      await dispatch('NAVIGATE_HOME', null, { root: true });
    }
  },

  HANDLE_SLPING: async (context, secret) => {
    emit({
      eventName: 'slPong',
      data: secret,
    });
  },

  HANDLE_PLAYER_STATE_UPDATE: async ({ getters, dispatch, commit }, data) => {
    console.debug('HANDLE_PLAYER_STATE_UPDATE:', {
      from: data.id, isHost: data.id === getters.GET_HOST_ID, state: data.state, time: data.time,
    });

    const previousUser = getters.GET_USER(data.id);
    const previousState = previousUser?.state;
    const previousTime = previousUser?.time;
    commit('SET_USER_PLAYER_STATE', data);

    if (data.state === 'buffering' && previousState !== 'buffering'
      && data.id !== getters.GET_SOCKET_ID) {
      const user = getters.GET_USER(data.id);
      if (user) {
        dispatch('DISPLAY_NOTIFICATION', {
          text: `${user.username} is buffering...`,
          color: 'info',
        }, { root: true });
      }
    }

    if (data.id === getters.GET_HOST_ID) {
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      await dispatch('SYNC_PLAYER_STATE');
    } else if (data.id !== getters.GET_SOCKET_ID && getters.AM_I_HOST
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
      await dispatch('plexclients/SEEK_TO', {
        offset: data.time,
      }, { root: true });
    }
  },

  HANDLE_MEDIA_UPDATE: async ({
    getters, dispatch, commit,
  }, {
    id, state, time, duration, media, makeHost,
  }) => {
    console.debug('HANDLE_MEDIA_UPDATE:', {
      from: id, isHost: id === getters.GET_HOST_ID, title: media?.title, state, makeHost,
    });
    commit('SET_USER_PLAYER_STATE', {
      id,
      state,
      time,
      duration,
    });

    commit('SET_USER_MEDIA', {
      id,
      media,
    });

    if (makeHost) {
      await dispatch('HANDLE_NEW_HOST', id);
      return;
    }

    if (id === getters.GET_HOST_ID) {
      await dispatch('CANCEL_IN_PROGRESS_SYNC');
      await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
    }
  },

  HANDLE_SYNC_FLEXIBILITY_UPDATE: ({ commit }, data) => {
    commit('SET_USER_SYNC_FLEXIBILITY', data);
  },

  HANDLE_PARTY_PAUSE: async ({ getters, dispatch }, { senderId, isPause }) => {
    // TODO: maybe stop it from looking at host after party pausing until host also updates or acks
    // that it got the party pause ?
    const text = `${getters.GET_USER(senderId).username} pressed ${isPause ? 'pause' : 'play'}`;
    await dispatch('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', {
      senderId,
      text,
    });

    await dispatch('DISPLAY_NOTIFICATION', {
      text,
      color: 'info',
    }, { root: true });

    await dispatch('CANCEL_IN_PROGRESS_SYNC');
    if (isPause) {
      await dispatch('plexclients/PRESS_PAUSE', null, { root: true });
    } else {
      await dispatch('plexclients/PRESS_PLAY', null, { root: true });
    }
  },

  HANDLE_KICKED: async ({ dispatch }) => {
    console.log('HANDLE_KICKED');
    await dispatch('DISCONNECT_AND_NAVIGATE_HOME');
  },
};
