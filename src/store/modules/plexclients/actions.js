export default {
  PLAY_MEDIA: async ({
    commit, dispatch, rootGetters,
  }, {
    mediaIndex, offset, metadata, machineIdentifier, userInitiated,
  }) => {
    console.debug('PLAY_MEDIA:', {
      title: metadata.title,
      ratingKey: metadata.ratingKey,
      machineIdentifier,
      mediaIndex,
      offset,
    });

    // Fire-and-forget: update room metadata for Discord embeds
    try {
      const room = rootGetters['synclounge/GET_ROOM'];
      const posterUrl = rootGetters['plexservers/GET_MEDIA_IMAGE_URL']({
        machineIdentifier,
        mediaUrl: metadata.thumb,
        width: 600,
        height: 900,
      });

      fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metadata.title,
          year: metadata.year,
          summary: metadata.summary,
          type: metadata.type,
          posterUrl,
          machineIdentifier,
          ratingKey: metadata.ratingKey,
          grandparentTitle: metadata.grandparentTitle,
          parentIndex: metadata.parentIndex,
          index: metadata.index,
          room,
        }),
      }).catch(() => {});
    } catch {
      // Best-effort
    }

    commit('SET_ACTIVE_PLAY_QUEUE', await dispatch('plexservers/CREATE_PLAY_QUEUE', {
      machineIdentifier,
      ratingKey: metadata.ratingKey,
    }, { root: true }));

    commit('SET_ACTIVE_PLAY_QUEUE_MACHINE_IDENTIFIER', machineIdentifier);
    commit('SET_ACTIVE_MEDIA_METADATA', metadata);
    commit('SET_ACTIVE_SERVER_ID', machineIdentifier);
    commit('plexservers/SET_LAST_SERVER_ID', machineIdentifier, { root: true });
    commit('slplayer/SET_MEDIA_INDEX', mediaIndex, { root: true });
    commit('slplayer/SET_OFFSET_MS', Math.round(offset) || 0, { root: true });
    commit('slplayer/SET_PLAYER_STATE', 'buffering', { root: true });
    commit('slplayer/SET_MASK_PLAYER_STATE', true, { root: true });
    await dispatch('synclounge/PROCESS_MEDIA_UPDATE', userInitiated, { root: true });

    if (rootGetters['slplayer/IS_PLAYER_INITIALIZED']) {
      await dispatch('slplayer/CHANGE_PLAYER_SRC', true, { root: true });
    } else {
      await dispatch('slplayer/NAVIGATE_AND_INITIALIZE_PLAYER', null, { root: true });
    }
  },

  FETCH_TIMELINE_POLL_DATA_CACHE: ({ dispatch }) => dispatch('slplayer/FETCH_TIMELINE_POLL_DATA', null, { root: true }),

  FETCH_TIMELINE_POLL_DATA: ({ dispatch }) => dispatch('slplayer/FETCH_TIMELINE_POLL_DATA', null, { root: true }),

  FETCH_JOIN_PLAYER_DATA: async ({ getters, dispatch }) => ({
    ...await dispatch('FETCH_TIMELINE_POLL_DATA'),
    media: getters.GET_ACTIVE_MEDIA_POLL_METADATA,
    playerProduct: getters.GET_CHOSEN_CLIENT.product,
  }),

  SYNC: async ({ dispatch, rootGetters }, cancelSignal) => {
    const playerPollData = await dispatch('FETCH_TIMELINE_POLL_DATA_CACHE');
    const adjustedHostTime = rootGetters['synclounge/GET_ADJUSTED_HOST_TIME']();

    const difference = adjustedHostTime - playerPollData.time;
    const absDifference = Math.abs(difference);

    console.debug('SYNC difference', difference);

    if (absDifference > rootGetters['settings/GET_SYNCFLEXIBILITY']
      || (rootGetters['synclounge/GET_HOST_USER'].state === 'paused'
        && absDifference > rootGetters.GET_CONFIG.paused_sync_flexibility)) {
      const offset = adjustedHostTime;

      if (rootGetters['settings/GET_SYNCMODE'] === 'cleanseek'
        || rootGetters['synclounge/GET_HOST_USER'].state === 'paused') {
        return dispatch('SEEK_TO', { cancelSignal, offset });
      }

      return dispatch('SKIP_AHEAD', { cancelSignal, offset });
    }

    if (absDifference > rootGetters.GET_CONFIG.slplayer_soft_seek_threshold) {
      return dispatch('slplayer/SOFT_SEEK', adjustedHostTime, { root: true });
    }

    return 'No sync needed';
  },

  PRESS_PLAY: ({ dispatch }) => dispatch('slplayer/PRESS_PLAY', null, { root: true }),

  PRESS_PAUSE: ({ dispatch }) => dispatch('slplayer/PRESS_PAUSE', null, { root: true }),

  PRESS_STOP: ({ dispatch }) => dispatch('slplayer/PRESS_STOP', null, { root: true }),

  SEEK_TO: ({ dispatch }, { cancelSignal, offset }) => {
    console.debug('SEEK_TO', offset);
    return dispatch(
      'slplayer/SPEED_OR_NORMAL_SEEK',
      { cancelSignal, seekToMs: offset },
      { root: true },
    );
  },

  SKIP_AHEAD: async ({ rootGetters, dispatch }, { offset, cancelSignal }) => {
    const { CAF } = await import('caf');
    const startedAt = Date.now();
    const duration = rootGetters.GET_CONFIG.skip_ahead_time;
    await dispatch('SEEK_TO', {
      offset: offset + duration,
      cancelSignal,
    });
    await dispatch('PRESS_PAUSE', cancelSignal);

    const elapsed = Date.now() - startedAt;
    await CAF.delay(cancelSignal, duration - elapsed);

    await dispatch('PRESS_PLAY', cancelSignal);
  },

  UPDATE_ACTIVE_PLAY_QUEUE: async ({ getters, dispatch, commit }) => {
    commit('SET_ACTIVE_PLAY_QUEUE', await dispatch('plexservers/FETCH_PLAY_QUEUE', {
      machineIdentifier: getters.GET_ACTIVE_PLAY_QUEUE_MACHINE_IDENTIFIER,
      playQueueID: getters.GET_ACTIVE_PLAY_QUEUE.playQueueID,
    }, { root: true }));
  },

  UPDATE_STATE_FROM_ACTIVE_PLAY_QUEUE_SELECTED_ITEM: async ({ getters, dispatch, commit }) => {
    const metadata = await dispatch(
      'FETCH_METADATA_OF_PLAY_QUEUE_ITEM',
      getters.GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM,
    );
    if (!getters.GET_ACTIVE_MEDIA_METADATA
      || metadata.ratingKey !== getters.GET_ACTIVE_MEDIA_METADATA.ratingKey
      || getters.GET_ACTIVE_SERVER_ID !== metadata.machineIdentifier) {
      commit('SET_ACTIVE_SERVER_ID', metadata.machineIdentifier);
      commit('plexservers/SET_LAST_SERVER_ID', metadata.machineIdentifier, { root: true });
      commit('SET_ACTIVE_MEDIA_METADATA', metadata);
    }
  },

  FETCH_METADATA_OF_PLAY_QUEUE_ITEM: ({ getters, dispatch }, playQueueItem) => {
    if (playQueueItem.source) {
      const regex = /^server:\/\/(\w+)\//;
      const machineIdentifier = playQueueItem.source.match(regex)[1];

      return dispatch('plexservers/FETCH_PLEX_METADATA', {
        machineIdentifier,
        ratingKey: playQueueItem.ratingKey,
      }, { root: true });
    }

    return {
      machineIdentifier: getters.GET_ACTIVE_PLAY_QUEUE_MACHINE_IDENTIFIER,
      ...playQueueItem,
    };
  },

  PLAY_NEXT: ({ rootGetters, dispatch }, metadata) => {
    console.debug('plexclients/PLAY_NEXT');
    if (rootGetters['slplayer/IS_PLAYER_INITIALIZED']) {
      return dispatch('slplayer/PLAY_NEXT', null, { root: true });
    }

    const { viewOffset: offset, machineIdentifier } = metadata;
    return dispatch('PLAY_MEDIA', {
      mediaIndex: 0,
      offset,
      machineIdentifier,
      metadata,
      userInitiated: true,
    });
  },

  RELOAD_ACTIVE_MEDIA_METADATA: async ({ getters, dispatch, commit }) => {
    const metadata = await dispatch('plexservers/FETCH_PLEX_METADATA', {
      machineIdentifier: getters.GET_ACTIVE_SERVER_ID,
      ratingKey: getters.GET_ACTIVE_MEDIA_METADATA.ratingKey,
    }, { root: true });
    commit('SET_ACTIVE_MEDIA_METADATA', metadata);
  },
};
