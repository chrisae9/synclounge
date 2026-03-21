import { CAF } from 'caf';
import eventhandlers from '@/store/modules/synclounge/eventhandlers';
import { combineUrl, combineRelativeUrlParts } from '@/utils/combineurl';
import { fetchJson } from '@/utils/fetchutils';
import {
  open, close, on, waitForEvent, isConnected, emit,
} from '@/socket';
import notificationSound from '@/assets/sounds/notification_simple-01.wav';

const notificationAudio = new Audio(notificationSound);

// Grace period after sending a party pause — prevents sync from immediately undoing the
// local pause/play before the message reaches the host
let lastPartyPauseTime = 0;
const PARTY_PAUSE_GRACE_MS = 5000;

// Visibility change handler reference for cleanup in DISCONNECT
let visibilityChangeHandler = null;

export default {
  CONNECT_AND_JOIN_ROOM: async ({ dispatch }) => {
    await dispatch('ESTABLISH_SOCKET_CONNECTION');
    await dispatch('JOIN_ROOM_AND_INIT');
  },

  SET_AND_CONNECT_AND_JOIN_ROOM: ({ commit, dispatch }, { server, room }) => {
    commit('SET_SERVER', server);
    commit('SET_ROOM', room);
    return dispatch('CONNECT_AND_JOIN_ROOM');
  },

  DISCONNECT_IF_CONNECTED: async ({ dispatch }) => {
    if (isConnected()) {
      await dispatch('DISCONNECT');
    }
  },

  ESTABLISH_SOCKET_CONNECTION: async ({ getters, commit, dispatch }) => {
    await dispatch('DISCONNECT_IF_CONNECTED');

    const properBase = new URL(getters.GET_SERVER || '/', window.location.origin);

    const url = combineUrl('socket.io', properBase.toString());
    console.log('ESTABLISH_SOCKET_CONNECTION', url.toString());

    const { id } = await open(url.origin, {
      path: url.pathname,
      transports: ['websocket', 'polling'],
    });

    commit('SET_SOCKET_ID', id);

    // Wait for initial slPing
    // Doing it this way rather than adding the normal listener because there is no guarentee on
    // the order of event handlers so, if I did a one time listener for slping just to wait, that
    // handler might be fired first, which means it will do stuff before actually responding to the
    // ping(which the normal handler does). I am not very happy with this but I don't know of a easy
    // better way atm. Maybe reactive streams in the future, but that's a bit over my head now
    const secret = await waitForEvent('slPing');

    // Explicitly handling the slping because we haven't registered the events yet
    await dispatch('HANDLE_SLPING', secret);
    await dispatch('ADD_EVENT_HANDLERS');
  },

  JOIN_ROOM: async ({ getters, rootGetters, dispatch }) => {
    const joinPlayerData = await dispatch(
      'plexclients/FETCH_JOIN_PLAYER_DATA',
      null,
      { root: true },
    );

    emit({
      eventName: 'join',
      data: {
        roomId: getters.GET_ROOM,
        desiredUsername: getters.GET_DISPLAY_USERNAME,
        desiredPartyPausingEnabled: getters.IS_PARTY_PAUSING_ENABLED,
        desiredAutoHostEnabled: getters.IS_AUTO_HOST_ENABLED,
        thumb: rootGetters['plex/GET_PLEX_USER'].thumb,
        syncFlexibility: rootGetters['settings/GET_SYNCFLEXIBILITY'],
        ...joinPlayerData,
      },
    });

    const { success, error, ...rest } = await waitForEvent('joinResult');
    if (!success) {
      throw new Error(error);
    }

    return rest;
  },

  JOIN_ROOM_AND_INIT: async ({
    getters, rootGetters, dispatch, commit,
  }) => {
    // Note: this is also called on rejoining, so be careful not to register handlers twice
    // or duplicate tasks
    const {
      user: { id, ...rest }, users, isPartyPausingEnabled, isAutoHostEnabled, hostId,
    } = await dispatch('JOIN_ROOM');
    const updatedAt = Date.now();

    commit('SET_HOST_ID', hostId);

    commit('SET_USERS', Object.fromEntries(
      Object.entries(users).map(([socketid, data]) => {
        const existing = getters.GET_USER(socketid);
        return [socketid, {
          ...data,
          ...(existing || {}),
          updatedAt: existing?.updatedAt || updatedAt,
        }];
      }),
    ));

    // Add ourselves to user list
    commit('SET_USER', {
      id,
      data: {
        ...rest,
        thumb: rootGetters['plex/GET_PLEX_USER'].thumb,
        media: rootGetters['plexclients/GET_ACTIVE_MEDIA_POLL_METADATA'],
        playerProduct: rootGetters['plexclients/GET_CHOSEN_CLIENT'].product,
        syncFlexibility: rootGetters['settings/GET_SYNCFLEXIBILITY'],
        updatedAt,
        ...await dispatch('plexclients/FETCH_TIMELINE_POLL_DATA_CACHE', null, { root: true }),
      },
    });

    commit('SET_IS_PARTY_PAUSING_ENABLED', isPartyPausingEnabled);
    commit('SET_IS_AUTO_HOST_ENABLED', isAutoHostEnabled);
    commit('SET_IS_IN_ROOM', true);

    await dispatch('DISPLAY_NOTIFICATION', {
      text: 'Joined room',
      color: 'success',
    }, { root: true });

    commit('SET_JOIN_SYNC_IN_PROGRESS', true);
    try {
      await dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
    } finally {
      commit('SET_JOIN_SYNC_IN_PROGRESS', false);
    }

    // Schedule a delayed re-sync to catch up after initial media load settles
    setTimeout(() => {
      if (getters.IS_IN_ROOM) {
        dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
      }
    }, 2000);

    // Start periodic sync polling to correct drift during continuous playback
    dispatch('START_SYNC_POLL_INTERVAL');

    // Re-sync when the tab becomes visible again (Chrome pauses video in background tabs)
    if (visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
    }
    visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible' && getters.IS_IN_ROOM && !getters.AM_I_HOST) {
        dispatch('SYNC_MEDIA_AND_PLAYER_STATE');
      }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);
  },

  DISCONNECT: async ({ commit, dispatch }) => {
    await dispatch('CANCEL_IN_PROGRESS_SYNC');
    await dispatch('CANCEL_UPNEXT');
    await dispatch('STOP_SYNC_POLL_INTERVAL');

    // Clean up visibilitychange handler
    if (visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
      visibilityChangeHandler = null;
    }

    // Clean up host grace period timer
    await dispatch('CLEAR_HOST_GRACE_PERIOD');

    close();
    commit('SET_IS_IN_ROOM', false);
    commit('SET_USERS', {});
    commit('SET_HOST_ID', null);
    commit('SET_SERVER', null);
    commit('SET_ROOM', null);
    commit('SET_SOCKET_ID', null);
    commit('CLEAR_MESSAGES');
    commit('SET_MESSAGES_USER_CACHE', {});
    commit('SET_IS_PARTY_PAUSING_ENABLED', null);
    commit('SET_IS_AUTO_HOST_ENABLED', null);
  },

  SEND_MESSAGE: async ({ dispatch, getters }, msg) => {
    if (!isConnected()) {
      throw new Error('Cannot send message: not connected');
    }

    await dispatch('ADD_MESSAGE_AND_CACHE', {
      senderId: getters.GET_SOCKET_ID,
      text: msg,
    });

    emit({
      eventName: 'sendMessage',
      data: msg,
    });
  },

  TRANSFER_HOST: (context, id) => {
    emit({
      eventName: 'transferHost',
      data: id,
    });
  },

  SEND_SET_PARTY_PAUSING_ENABLED: (context, value) => {
    emit({
      eventName: 'setPartyPausingEnabled',
      data: value,
    });
  },

  SEND_SET_AUTO_HOST_ENABLED: (context, value) => {
    emit({
      eventName: 'setAutoHostEnabled',
      data: value,
    });
  },

  sendPartyPause: ({ getters }, isPause) => {
    if (!getters.AM_I_HOST && getters.IS_PARTY_PAUSING_ENABLED) {
      lastPartyPauseTime = Date.now();
      emit({
        eventName: 'partyPause',
        data: isPause,
      });
    }
  },

  FETCH_SERVERS_HEALTH: async ({ rootGetters, commit }) => {
    const start = Date.now();
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, rootGetters.GET_CONFIG.socket_server_health_timeout);

    const results = await Promise.allSettled(
      rootGetters.GET_CONFIG.servers.map(async ({ url }) => [
        url,
        {
          ...await fetchJson(
            combineRelativeUrlParts(url, 'health'),
            null,
            { signal: controller.signal },
          ),
          latency: Date.now() - start,
        },
      ]),
    );

    clearTimeout(timeout);

    const aliveServerHealths = Object.fromEntries(
      results.filter((result) => result.status === 'fulfilled')
        .map(({ value }) => value),
    );

    commit('SET_SERVERS_HEALTH', aliveServerHealths);
  },

  ADD_EVENT_HANDLERS: ({ dispatch }) => {
    const makeHandler = (action) => (data) => dispatch(action, data);

    const registerListener = ({ eventName, action }) => on({
      eventName,
      handler: makeHandler(action),
    });

    registerListener({ eventName: 'userJoined', action: 'HANDLE_USER_JOINED' });
    registerListener({ eventName: 'userLeft', action: 'HANDLE_USER_LEFT' });
    registerListener({ eventName: 'newHost', action: 'HANDLE_NEW_HOST' });
    registerListener({ eventName: 'newMessage', action: 'ADD_MESSAGE_AND_CACHE_AND_NOTIFY' });
    registerListener({ eventName: 'slPing', action: 'HANDLE_SLPING' });
    registerListener({ eventName: 'playerStateUpdate', action: 'HANDLE_PLAYER_STATE_UPDATE' });
    registerListener({ eventName: 'mediaUpdate', action: 'HANDLE_MEDIA_UPDATE' });
    registerListener({
      eventName: 'syncFlexibilityUpdate',
      action: 'HANDLE_SYNC_FLEXIBILITY_UPDATE',
    });
    registerListener({
      eventName: 'setPartyPausingEnabled',
      action: 'HANDLE_SET_PARTY_PAUSING_ENABLED',
    });

    registerListener({
      eventName: 'setAutoHostEnabled',
      action: 'HANDLE_SET_AUTO_HOST_ENABLED',
    });
    registerListener({ eventName: 'partyPause', action: 'HANDLE_PARTY_PAUSE' });
    registerListener({ eventName: 'disconnect', action: 'HANDLE_DISCONNECT' });
    registerListener({ eventName: 'connect', action: 'HANDLE_RECONNECT' });
    registerListener({ eventName: 'kicked', action: 'HANDLE_KICKED' });
  },

  CANCEL_UPNEXT: ({ getters, commit }) => {
    if (getters.GET_UPNEXT_TIMEOUT_ID != null) {
      clearTimeout(getters.GET_UPNEXT_TIMEOUT_ID);
      commit('SET_UPNEXT_TIMEOUT_ID', null);
    }
  },

  DISPLAY_UPNEXT: async ({ rootGetters, dispatch, commit }) => {
    console.debug('DISPLAY_UPNEXT');
    if (rootGetters['plexclients/ACTIVE_PLAY_QUEUE_NEXT_ITEM_EXISTS']) {
      commit(
        'SET_UP_NEXT_POST_PLAY_DATA',
        await dispatch(
          'plexclients/FETCH_METADATA_OF_PLAY_QUEUE_ITEM',
          rootGetters['plexclients/GET_ACTIVE_PLAY_QUEUE'].Metadata[
            rootGetters['plexclients/GET_ACTIVE_PLAY_QUEUE'].playQueueSelectedItemOffset + 1],
          { root: true },
        ),
        { root: true },
      );
    }

    commit('SET_UP_NEXT_TRIGGERED', true);
  },

  SCHEDULE_UPNEXT: async ({ rootGetters, dispatch, commit }, playerState) => {
    if (playerState.duration && !Number.isNaN(playerState.time)) {
      const timeUntilUpnextTrigger = playerState.duration - playerState.time
        - rootGetters.GET_CONFIG.synclounge_upnext_trigger_time_from_end;

      console.debug('SCHEDULE_UPNEXT', timeUntilUpnextTrigger);
      commit('SET_UPNEXT_TIMEOUT_ID', setTimeout(
        () => dispatch('DISPLAY_UPNEXT'),
        timeUntilUpnextTrigger,
      ));
    }
  },

  CALC_IS_IN_UPNEXT_REGION: async ({ rootGetters }, playerState) => playerState.duration
    && playerState.time
      && (playerState.duration - playerState.time)
        < rootGetters.GET_CONFIG.synclounge_upnext_trigger_time_from_end,

  PROCESS_UPNEXT: async ({
    getters, rootGetters, dispatch,
  }, playerState) => {
    // Cancel any timers because the state has changed and previous is now invalid
    await dispatch('CANCEL_UPNEXT');

    // Check if we need to activate the upnext feature
    if (getters.AM_I_HOST && playerState.state !== 'stopped'
      && !rootGetters.GET_UP_NEXT_POST_PLAY_DATA) {
      // If in region and not already scheduled
      if (await dispatch('CALC_IS_IN_UPNEXT_REGION', playerState)) {
        if (!getters.GET_UP_NEXT_TRIGGERED) {
          // Display upnext immediately
          await dispatch('DISPLAY_UPNEXT');
        }
      } else if (playerState.state === 'playing') {
        await dispatch('SCHEDULE_UPNEXT', playerState);
      }
    }
  },

  PROCESS_PLAYER_STATE_UPDATE: async ({ getters, dispatch, commit }, noSync) => {
    if (!getters.IS_IN_ROOM || !isConnected()) return;

    const playerState = await dispatch(
      'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE',
      null,
      { root: true },
    );

    commit('SET_USER_PLAYER_STATE', {
      ...playerState,
      id: getters.GET_SOCKET_ID,
    });

    emit({
      eventName: 'playerStateUpdate',
      data: playerState,
    });

    await dispatch('PROCESS_UPNEXT', playerState);

    if (playerState.state !== 'buffering' && !noSync && !getters.IS_JOIN_SYNC_IN_PROGRESS) {
      await dispatch('SYNC_PLAYER_STATE');
    }
  },

  PROCESS_MEDIA_UPDATE: async ({
    dispatch, getters, commit, rootGetters,
  }, userInitiated) => {
    if (!getters.IS_IN_ROOM || !isConnected()) return;

    const playerState = await dispatch(
      'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE',
      null,
      { root: true },
    );

    if (playerState.state !== 'stopped') {
      if (rootGetters.GET_UP_NEXT_POST_PLAY_DATA) {
        commit('SET_UP_NEXT_POST_PLAY_DATA', null, { root: true });
      }
    }

    if (getters.GET_UP_NEXT_TRIGGERED) {
      commit('SET_UP_NEXT_TRIGGERED', false);
    }

    const media = rootGetters['plexclients/GET_ACTIVE_MEDIA_POLL_METADATA'];

    commit('SET_USER_MEDIA', {
      id: getters.GET_SOCKET_ID,
      media,
    });

    commit('SET_USER_PLAYER_STATE', {
      ...playerState,
      id: getters.GET_SOCKET_ID,
    });

    emit({
      eventName: 'mediaUpdate',
      data: {
        media,
        ...playerState,
        userInitiated,
      },
    });

    await dispatch('PROCESS_UPNEXT', playerState);

    if (!userInitiated) {
      await dispatch('SYNC_PLAYER_STATE');
    }
  },

  ADD_MESSAGE_AND_CACHE_AND_NOTIFY: async ({ getters, dispatch }, msg) => {
    // Intercept force sync commands — don't display in chat, trigger sync instead
    if (msg.text && msg.text.startsWith('!forcesync')) {
      await dispatch('MANUAL_SYNC');
      return;
    }

    await dispatch('ADD_MESSAGE_AND_CACHE', msg);

    if (getters.ARE_SOUND_NOTIFICATIONS_ENABLED) {
      notificationAudio.play();
    }

    if (getters.ARE_NOTIFICATIONS_ENABLED) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return;
        }
      }

      const { username, thumb } = getters.GET_MESSAGES_USER_CACHE_USER(msg.senderId);

      // TODO: notifications don't work when on http. Maybe make alternative popup thing?
      // eslint-disable-next-line no-new
      new Notification(username, {
        body: msg.text,
        icon: thumb,
      });
    }
  },

  ADD_MESSAGE_AND_CACHE: ({ getters, commit }, msg) => {
    const { username, thumb } = getters.GET_USER(msg.senderId);
    if (!getters.GET_MESSAGES_USER_CACHE_USER(msg.senderId)) {
      // Cache user details so we can still display user avatar and username after user leaves

      commit('SET_MESSAGES_USER_CACHE_USER', {
        id: msg.senderId,
        data: {
          username, thumb,
        },
      });
    }

    commit('ADD_MESSAGE', {
      ...msg,
      time: Date.now(),
    });
  },

  CANCEL_IN_PROGRESS_SYNC: ({ getters, commit }) => {
    // TODO: if the slplayer is currently being initialized, wait for that to finish
    if (!getters.GET_SYNC_CANCEL_TOKEN) {
      return;
    }

    // If sync in progress, cancel it
    getters.GET_SYNC_CANCEL_TOKEN.abort('Sync cancelled');
    console.log('sync cancelled');
    commit('SET_SYNC_CANCEL_TOKEN', null);
  },

  MANUAL_SYNC: async ({
    getters, dispatch, commit,
  }) => {
    console.debug('MANUAL_SYNC');
    await dispatch('CANCEL_IN_PROGRESS_SYNC');

    const offset = getters.GET_ADJUSTED_HOST_TIME();

    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();
    commit('SET_SYNC_CANCEL_TOKEN', token);
    try {
      await dispatch('plexclients/SEEK_TO', {
        cancelSignal: token.signal,
        offset,
      }, { root: true });
    } catch (e) {
      if (!token.signal.aborted) {
        console.error('Error in manual sync:', e);
      }
    }

    if (getters.GET_SYNC_CANCEL_TOKEN === token) {
      commit('SET_SYNC_CANCEL_TOKEN', null);
      // Refresh stored time/updatedAt so sidebar displays the new position immediately
      await dispatch('PROCESS_PLAYER_STATE_UPDATE', true);
    }
  },

  FORCE_SYNC_ALL: async ({ dispatch }) => {
    emit({
      eventName: 'sendMessage',
      data: '!forcesync',
    });
    await dispatch('DISPLAY_NOTIFICATION', {
      text: 'Force sync sent to all users',
      color: 'success',
    }, { root: true });
  },

  SYNC_MEDIA_AND_PLAYER_STATE: async ({ getters, commit, dispatch }) => {
    if (getters.AM_I_HOST || getters.GET_SYNC_CANCEL_TOKEN || getters.IS_HOST_GRACE_PERIOD) {
      return;
    }

    /* This is data from the host, we should react to this data by potentially changing
        what we're playing or seeking to get back in sync with the host.

        We need to limit how ourself to make sure we dont hit the client too hard.
        We'll only fetch new data if our data is older than 1000ms.
        If we need to fetch new data, we'll do that and then decide
        if we need to seek or start playing something.
      */

    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();
    commit('SET_SYNC_CANCEL_TOKEN', token);

    try {
      await dispatch('_SYNC_MEDIA_AND_PLAYER_STATE', token.signal);
    } catch (e) {
      if (!token.signal.aborted) {
        console.error('Error in sync media logic:', e);
      }
    } finally {
      // Always clear our token — the === check can fail if a concurrent operation
      // overwrites the token, causing a permanent deadlock where no syncs can run
      if (getters.GET_SYNC_CANCEL_TOKEN === token) {
        commit('SET_SYNC_CANCEL_TOKEN', null);
      } else if (getters.GET_SYNC_CANCEL_TOKEN) {
        console.warn('Sync cancel token was replaced during SYNC_MEDIA_AND_PLAYER_STATE — clearing stale token');
        commit('SET_SYNC_CANCEL_TOKEN', null);
      }
    }
  },

  // Interal action without lock. Use the one with the lock to stop multiple syncs from happening
  // at once
  _SYNC_MEDIA_AND_PLAYER_STATE: async ({ getters, dispatch, rootGetters }, cancelSignal) => {
    if (!getters.GET_HOST_USER) {
      return;
    }
    console.debug('_SYNC_MEDIA_AND_PLAYER_STATE');
    const timeline = await dispatch(
      'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE',
      null,
      { root: true },
    );

    if (getters.GET_HOST_USER.state === 'stopped' || !getters.GET_HOST_USER.media) {
      // First, decide if we should stop playback
      if (timeline.state !== 'stopped') {
        await dispatch('DISPLAY_NOTIFICATION', {
          text: 'The host pressed stop',
          color: 'info',
        }, { root: true });
        await dispatch('plexclients/PRESS_STOP', null, { root: true });
        return;
      }

      return;
    }

    // Logic for deciding whether we should play somethign different
    if (rootGetters['settings/GET_AUTOPLAY']) {
      const bestMatch = await dispatch(
        'plexservers/FIND_BEST_MEDIA_MATCH',
        getters.GET_HOST_USER.media,
        { root: true },
      );
      console.debug('_SYNC_MEDIA_AND_PLAYER_STATE: match result:', {
        hostMedia: getters.GET_HOST_USER.media?.title,
        bestMatch: bestMatch ? { title: bestMatch.title, ratingKey: bestMatch.ratingKey } : null,
        alreadyPlaying: bestMatch ? rootGetters['plexclients/IS_THIS_MEDIA_PLAYING'](bestMatch) : false,
      });
      if (bestMatch) {
        if (!rootGetters['plexclients/IS_THIS_MEDIA_PLAYING'](bestMatch)) {
          // If we aren't playing the best match, play it
          await dispatch('PLAY_MEDIA_AND_SYNC_TIME', bestMatch);
          return;
        }
        // TODO: fix
      } else {
        const text = `Failed to find a compatible copy of ${getters.GET_HOST_USER.media.title
        }. If you have access to the content try manually playing it.`;
        console.warn(text);
        await dispatch('DISPLAY_NOTIFICATION', {
          text,
          color: 'error',
        }, { root: true });
      }
    }

    await dispatch('_SYNC_PLAYER_STATE', cancelSignal);
  },

  SYNC_PLAYER_STATE: async ({ dispatch, getters, commit }) => {
    if (getters.AM_I_HOST || getters.GET_SYNC_CANCEL_TOKEN || getters.IS_HOST_GRACE_PERIOD) {
      return;
    }

    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();
    commit('SET_SYNC_CANCEL_TOKEN', token);

    try {
      await dispatch('_SYNC_PLAYER_STATE', token.signal);
    } catch (e) {
      if (!token.signal.aborted) {
        console.error('Error in sync player logic:', e);
      }
    } finally {
      // Always clear our token — the === check can fail if a concurrent operation
      // overwrites the token, causing a permanent deadlock where no syncs can run
      if (getters.GET_SYNC_CANCEL_TOKEN === token) {
        commit('SET_SYNC_CANCEL_TOKEN', null);
      } else if (getters.GET_SYNC_CANCEL_TOKEN) {
        console.warn('Sync cancel token was replaced during SYNC_PLAYER_STATE — clearing stale token');
        commit('SET_SYNC_CANCEL_TOKEN', null);
      }
    }
  },

  // Private version without lock. Please use the locking version unless you know what you are doing
  _SYNC_PLAYER_STATE: async ({ getters, rootGetters, dispatch }, cancelSignal) => {
    if (!getters.GET_HOST_USER) {
      return;
    }
    console.debug('_SYNC_PLAYER_STATE:', {
      hostState: getters.GET_HOST_USER.state,
      hostTime: getters.GET_HOST_USER.time,
    });
    const timeline = await dispatch(
      'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE',
      null,
      { root: true },
    );

    // If we didn't find a good match or .... wtf??
    if (timeline.state === 'stopped') {
      return;
    }

    // Don't override local play/pause state during party pause grace period —
    // the party pause message needs time to reach the host and propagate back
    const inPartyPauseGrace = (Date.now() - lastPartyPauseTime) < PARTY_PAUSE_GRACE_MS;

    if (getters.GET_HOST_USER.state === 'playing'
      && timeline.state === 'paused') {
      if (inPartyPauseGrace) {
        console.debug('_SYNC_PLAYER_STATE: skipping resume during party pause grace period');
        return;
      }
      if (rootGetters['slplayer/IS_AUTOPLAY_BLOCKED']) {
        console.debug('_SYNC_PLAYER_STATE: skipping resume because autoplay is blocked');
        return;
      }
      await dispatch('DISPLAY_NOTIFICATION', {
        text: 'Resuming..',
        color: 'info',
      }, { root: true });
      await dispatch('plexclients/PRESS_PLAY', cancelSignal, { root: true });
      // Fall through to SYNC below to also seek to the correct host position
    }

    if (getters.GET_HOST_USER.state === 'paused' && timeline.state === 'playing') {
      if (inPartyPauseGrace) {
        console.debug('_SYNC_PLAYER_STATE: skipping pause during party pause grace period');
        return;
      }
      await dispatch('DISPLAY_NOTIFICATION', {
        text: 'Pausing..',
        color: 'info',
      }, { root: true });
      await dispatch('plexclients/PRESS_PAUSE', cancelSignal, { root: true });
      return;
    }

    // When host is buffering, don't pause other users — just skip sync until host recovers
    if (getters.GET_HOST_USER.state === 'buffering') {
      return;
    }

    // TODO: potentially update the player state if we paused or played so we know in the sync
    await dispatch('plexclients/SYNC', cancelSignal, { root: true });
    console.debug('_SYNC_PLAYER_STATE: sync complete');
  },

  PLAY_MEDIA_AND_SYNC_TIME: async ({ getters, dispatch }, media) => {
    const offset = getters.GET_ADJUSTED_HOST_TIME();

    dispatch('plexclients/PLAY_MEDIA', {
      mediaIndex: media.mediaIndex || 0,
      // TODO: potentially play ahead a bit by the time it takes to buffer / transcode.
      offset: offset || 0,
      metadata: media,
      machineIdentifier: media.machineIdentifier,
    }, { root: true }).catch((e) => {
      console.error('Error during PLAY_MEDIA:', e);
    });
  },

  REQUEST_ALLOW_NOTIFICATIONS: async ({ commit }) => {
    const permission = await Notification.requestPermission();
    commit('SET_ARE_NOTIFICATIONS_ENABLED', permission === 'granted');
  },

  CHANGE_NOTIFICATIONS_ENABLED: async ({ commit, dispatch }, enabled) => {
    if (enabled) {
      if (Notification.permission === 'granted') {
        commit('SET_ARE_NOTIFICATIONS_ENABLED', true);
      } else {
        await dispatch('REQUEST_ALLOW_NOTIFICATIONS');
      }
    } else {
      commit('SET_ARE_NOTIFICATIONS_ENABLED', false);
    }
  },

  SEND_SYNC_FLEXIBILITY_UPDATE: ({ rootGetters }) => {
    emit({
      eventName: 'syncFlexibilityUpdate',
      data: rootGetters['settings/GET_SYNCFLEXIBILITY'],
    });
  },

  UPDATE_SYNC_FLEXIBILITY: async ({ getters, dispatch, commit }, syncFlexibility) => {
    commit('settings/SET_SYNCFLEXIBILITY', syncFlexibility, { root: true });

    if (getters.IS_IN_ROOM) {
      commit('SET_USER_SYNC_FLEXIBILITY', {
        id: getters.GET_SOCKET_ID,
        syncFlexibility,
      });

      await dispatch('SEND_SYNC_FLEXIBILITY_UPDATE');
    }
  },

  KICK_USER: (ctx, id) => {
    console.log('KICK_USER', id);
    emit({
      eventName: 'kick',
      data: id,
    });
  },

  DISCONNECT_AND_NAVIGATE_HOME: async ({ dispatch }) => {
    await dispatch('DISCONNECT');
    await dispatch('NAVIGATE_HOME', null, { root: true });
  },

  START_SYNC_POLL_INTERVAL: ({ getters, commit, dispatch }) => {
    dispatch('STOP_SYNC_POLL_INTERVAL');

    const id = setInterval(() => {
      if (!getters.IS_IN_ROOM || getters.AM_I_HOST || getters.GET_SYNC_CANCEL_TOKEN
        || getters.IS_HOST_GRACE_PERIOD) {
        return;
      }
      dispatch('SYNC_PLAYER_STATE');
    }, 5000);

    commit('SET_SYNC_POLL_INTERVAL_ID', id);
  },

  STOP_SYNC_POLL_INTERVAL: ({ commit }) => {
    commit('CLEAR_SYNC_POLL_INTERVAL');
  },

  ...eventhandlers,
};
