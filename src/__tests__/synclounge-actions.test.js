import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';

const socketMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  isConnected: vi.fn(() => true),
  hasSocket: vi.fn(() => true),
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  waitForEvent: vi.fn(),
}));

vi.mock('@/socket', () => socketMocks);

function createAudioMock() {
  return class AudioMock {
    play = vi.fn();
  };
}

describe('synclounge actions', () => {
  let actions;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('Audio', createAudioMock());
    actions = (await import('@/store/modules/synclounge/actions')).default;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('DISCONNECT_IF_CONNECTED', () => {
    it('disconnects stale socket managers even if the transport is not connected', async () => {
      socketMocks.isConnected.mockReturnValue(false);
      socketMocks.hasSocket.mockReturnValue(true);
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await actions.DISCONNECT_IF_CONNECTED({ dispatch });

      expect(dispatch).toHaveBeenCalledWith('DISCONNECT');
    });
  });

  describe('SET_AND_CONNECT_AND_JOIN_ROOM', () => {
    it('refreshes Plex user and devices before opening the room socket', async () => {
      const calls = [];
      const commit = vi.fn((type, value) => calls.push(['commit', type, value]));
      const dispatch = vi.fn(async (type, payload, options) => {
        calls.push(['dispatch', type, payload, options]);
      });
      const rootGetters = {
        'plex/GET_PLEX_AUTH_TOKEN': 'token',
      };

      await actions.SET_AND_CONNECT_AND_JOIN_ROOM({
        commit,
        dispatch,
        rootGetters,
      }, {
        server: '',
        room: 'stale123',
      });

      expect(calls).toEqual([
        ['dispatch', 'DISCONNECT_IF_CONNECTED', undefined, undefined],
        ['commit', 'SET_SERVER', ''],
        ['commit', 'SET_ROOM', 'stale123'],
        ['dispatch', 'plex/FETCH_PLEX_USER', null, { root: true }],
        ['dispatch', 'plex/FETCH_PLEX_DEVICES', null, { root: true }],
        ['dispatch', 'CONNECT_AND_JOIN_ROOM', { syncOnJoin: true }, undefined],
      ]);
    });

    it('forwards syncOnJoin so non-player deep links can join without auto-play navigation', async () => {
      const dispatch = vi.fn(async () => {});
      const rootGetters = {
        'plex/GET_PLEX_AUTH_TOKEN': 'token',
      };

      await actions.SET_AND_CONNECT_AND_JOIN_ROOM({
        commit: vi.fn(),
        dispatch,
        rootGetters,
      }, {
        server: '',
        room: 'stale123',
        syncOnJoin: false,
      });

      expect(dispatch).toHaveBeenLastCalledWith('CONNECT_AND_JOIN_ROOM', { syncOnJoin: false });
    });
  });

  describe('PLAY_MEDIA_AND_SYNC_TIME', () => {
    it('waits for PLAY_MEDIA to finish before resolving join sync', async () => {
      const media = {
        title: 'Episode 2',
        ratingKey: 'episode-2',
        machineIdentifier: 'server-1',
        mediaIndex: 0,
      };
      let resolvePlayMedia;
      const playMediaPromise = new Promise((resolve) => { resolvePlayMedia = resolve; });
      const dispatch = vi.fn((type) => {
        if (type === 'plexclients/PLAY_MEDIA') {
          return playMediaPromise;
        }
        return undefined;
      });
      const getters = {
        GET_ADJUSTED_HOST_TIME: vi.fn(() => 12345),
        GET_HOST_USER: { state: 'paused' },
      };

      let resolved = false;
      const actionPromise = actions.PLAY_MEDIA_AND_SYNC_TIME({ getters, dispatch }, media)
        .then(() => { resolved = true; });

      await Promise.resolve();

      expect(dispatch).toHaveBeenCalledWith('plexclients/PLAY_MEDIA', {
        mediaIndex: 0,
        offset: 12345,
        metadata: media,
        machineIdentifier: 'server-1',
        shouldPlay: false,
      }, { root: true });
      expect(resolved).toBe(false);

      resolvePlayMedia();
      await actionPromise;

      expect(resolved).toBe(true);
    });

    it('requests playback when loading media for a playing host', async () => {
      const media = {
        title: 'Episode 2',
        ratingKey: 'episode-2',
        machineIdentifier: 'server-1',
        mediaIndex: 0,
      };
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const getters = {
        GET_ADJUSTED_HOST_TIME: vi.fn(() => 12345),
        GET_HOST_USER: { state: 'playing' },
      };

      await actions.PLAY_MEDIA_AND_SYNC_TIME({ getters, dispatch }, media);

      expect(dispatch).toHaveBeenCalledWith('plexclients/PLAY_MEDIA', {
        mediaIndex: 0,
        offset: 12345,
        metadata: media,
        machineIdentifier: 'server-1',
        shouldPlay: true,
      }, { root: true });
    });
  });

  describe('JOIN_ROOM_AND_INIT', () => {
    it('uses the fresh join snapshot instead of stale cached host state on reconnect', async () => {
      const staleHost = {
        state: 'paused',
        time: 1000,
        media: { ratingKey: 'old' },
        updatedAt: 1,
      };
      const freshHost = {
        state: 'playing',
        time: 5000,
        media: { ratingKey: 'new' },
        playbackRate: 1,
      };
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          return {
            user: { id: 'me-1', username: 'Me' },
            users: { 'host-1': freshHost },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'host-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = {
        GET_USERS: { 'host-1': staleHost },
        GET_USER: (id) => (id === 'host-1' ? staleHost : undefined),
      };
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      await actions.JOIN_ROOM_AND_INIT({
        getters, rootGetters, dispatch, commit,
      }, { syncOnJoin: false });

      expect(commit).toHaveBeenCalledWith('SET_USERS', {
        'host-1': expect.objectContaining(freshHost),
      });
      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users['host-1'].media.ratingKey).toBe('new');
      expect(users['host-1'].updatedAt).not.toBe(1);
    });

    it('preserves a newer socket update received while the join snapshot is resolving', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(100);
      let cachedHost = {
        state: 'paused',
        time: 1000,
        media: { ratingKey: 'stale-cache' },
        updatedAt: 1,
      };
      const joinSnapshot = {
        state: 'playing',
        time: 5000,
        media: { ratingKey: 'join-snapshot' },
        playbackRate: 1,
      };
      const liveUpdate = {
        state: 'playing',
        time: 6000,
        media: { ratingKey: 'live-update' },
        playbackRate: 1,
        updatedAt: 200,
      };
      let eventRevision = 0;
      const eventRevisions = {};
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          vi.setSystemTime(200);
          cachedHost = liveUpdate;
          eventRevision = 1;
          eventRevisions['host-1'] = { player: 1, media: 1 };
          return {
            user: { id: 'me-1', username: 'Me' },
            users: { 'host-1': joinSnapshot },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'host-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = { GET_USER: () => cachedHost };
      Object.defineProperty(getters, 'GET_USERS', {
        get: () => ({ 'host-1': cachedHost }),
      });
      Object.defineProperty(getters, 'GET_USER_EVENT_REVISION', {
        get: () => eventRevision,
      });
      getters.GET_USER_EVENT_REVISIONS = eventRevisions;
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      try {
        await actions.JOIN_ROOM_AND_INIT({
          getters, rootGetters, dispatch, commit,
        }, { syncOnJoin: false });
      } finally {
        vi.useRealTimers();
      }

      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users['host-1']).toEqual(liveUpdate);
    });

    it('keeps snapshot media when only player state changes during join', async () => {
      const cachedHost = {
        state: 'paused',
        time: 1000,
        duration: 100000,
        playbackRate: 1,
        media: { ratingKey: 'stale-cache' },
        updatedAt: 1,
      };
      const snapshotMedia = { ratingKey: 'join-snapshot' };
      let eventRevision = 0;
      const eventRevisions = {};
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          cachedHost.state = 'playing';
          cachedHost.time = 6000;
          cachedHost.updatedAt = 2;
          eventRevision = 1;
          eventRevisions['host-1'] = { player: 1 };
          return {
            user: { id: 'me-1', username: 'Me' },
            users: {
              'host-1': {
                state: 'playing',
                time: 5000,
                duration: 100000,
                playbackRate: 1,
                media: snapshotMedia,
              },
            },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'host-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = {
        GET_USERS: { 'host-1': cachedHost },
        GET_USER: () => cachedHost,
        GET_USER_EVENT_REVISIONS: eventRevisions,
      };
      Object.defineProperty(getters, 'GET_USER_EVENT_REVISION', {
        get: () => eventRevision,
      });
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      await actions.JOIN_ROOM_AND_INIT({
        getters, rootGetters, dispatch, commit,
      }, { syncOnJoin: false });

      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users['host-1']).toEqual(expect.objectContaining({
        state: 'playing',
        time: 6000,
        media: snapshotMedia,
      }));
    });

    it('does not restore a cached user who leaves while join resolves', async () => {
      const cachedUsers = {
        'host-1': {
          state: 'playing', time: 5000, media: { ratingKey: 'movie-1' }, updatedAt: 1,
        },
        'guest-1': {
          state: 'playing', time: 5000, media: { ratingKey: 'movie-1' }, updatedAt: 1,
        },
      };
      let eventRevision = 0;
      const eventRevisions = {};
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          delete cachedUsers['guest-1'];
          eventRevision = 1;
          eventRevisions['guest-1'] = { membership: 1 };
          return {
            user: { id: 'me-1', username: 'Me' },
            users: {
              'host-1': cachedUsers['host-1'],
              'guest-1': {
                state: 'playing', time: 5000, media: { ratingKey: 'movie-1' },
              },
            },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'host-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = {
        GET_USERS: cachedUsers,
        GET_USER: (id) => cachedUsers[id],
        GET_USER_EVENT_REVISIONS: eventRevisions,
      };
      Object.defineProperty(getters, 'GET_USER_EVENT_REVISION', {
        get: () => eventRevision,
      });
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      await actions.JOIN_ROOM_AND_INIT({
        getters, rootGetters, dispatch, commit,
      }, { syncOnJoin: false });

      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users).not.toHaveProperty('guest-1');
    });

    it('does not restore a snapshot user who joined and left during join', async () => {
      const cachedUsers = {};
      let eventRevision = 0;
      const eventRevisions = {};
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          eventRevision = 1;
          eventRevisions['guest-1'] = { membership: 1 };
          return {
            user: { id: 'me-1', username: 'Me' },
            users: {
              'guest-1': {
                state: 'playing', time: 5000, media: { ratingKey: 'movie-1' },
              },
            },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'guest-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = {
        GET_USERS: cachedUsers,
        GET_USER: (id) => cachedUsers[id],
        GET_USER_EVENT_REVISIONS: eventRevisions,
      };
      Object.defineProperty(getters, 'GET_USER_EVENT_REVISION', {
        get: () => eventRevision,
      });
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      await actions.JOIN_ROOM_AND_INIT({
        getters, rootGetters, dispatch, commit,
      }, { syncOnJoin: false });

      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users).not.toHaveProperty('guest-1');
    });

    it('preserves explicit media clears and sync flexibility updates during join', async () => {
      const cachedHost = {
        state: 'playing',
        time: 5000,
        media: null,
        syncFlexibility: 3000,
        updatedAt: 1,
      };
      let eventRevision = 0;
      const eventRevisions = {};
      const commit = vi.fn();
      const dispatch = vi.fn(async (type) => {
        if (type === 'JOIN_ROOM') {
          cachedHost.syncFlexibility = 1000;
          eventRevision = 2;
          eventRevisions['host-1'] = { media: 1, syncFlexibility: 2 };
          return {
            user: { id: 'me-1', username: 'Me' },
            users: {
              'host-1': {
                state: 'playing',
                time: 5000,
                media: { ratingKey: 'snapshot-media' },
                syncFlexibility: 3000,
              },
            },
            isPartyPausingEnabled: true,
            isAutoHostEnabled: false,
            hostId: 'host-1',
          };
        }
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'stopped', time: 0, duration: 0, playbackRate: 0,
          };
        }
        return undefined;
      });
      const getters = {
        GET_USERS: { 'host-1': cachedHost },
        GET_USER: () => cachedHost,
        GET_USER_EVENT_REVISIONS: eventRevisions,
      };
      Object.defineProperty(getters, 'GET_USER_EVENT_REVISION', {
        get: () => eventRevision,
      });
      const rootGetters = {
        'plex/GET_PLEX_USER': { thumb: 'thumb' },
        'plexclients/GET_ACTIVE_MEDIA_POLL_METADATA': null,
        'plexclients/GET_CHOSEN_CLIENT': { product: 'SyncLounge' },
        'settings/GET_SYNCFLEXIBILITY': 3000,
      };

      await actions.JOIN_ROOM_AND_INIT({
        getters, rootGetters, dispatch, commit,
      }, { syncOnJoin: false });

      const users = commit.mock.calls.find(([type]) => type === 'SET_USERS')[1];
      expect(users['host-1']).toEqual(expect.objectContaining({
        media: null,
        syncFlexibility: 1000,
      }));
    });
  });

  describe('_SYNC_MEDIA_AND_PLAYER_STATE', () => {
    it('plays host media when a media update carries stopped transition state and media', async () => {
      const hostMedia = {
        title: 'Episode 2',
        type: 'episode',
        ratingKey: 'episode-2',
        machineIdentifier: 'server-1',
      };
      const bestMatch = {
        ...hostMedia,
        mediaIndex: 0,
      };
      const getters = {
        GET_HOST_USER: {
          state: 'stopped',
          media: hostMedia,
          time: 0,
          updatedAt: Date.now(),
          playbackRate: 1,
        },
      };
      const rootGetters = {
        'settings/GET_AUTOPLAY': true,
        'plexclients/IS_THIS_MEDIA_PLAYING': vi.fn(() => false),
      };
      const dispatch = vi.fn(async (type) => {
        if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
          return {
            state: 'playing',
            time: 120000,
            duration: 1800000,
            playbackRate: 1,
          };
        }
        if (type === 'plexservers/FIND_BEST_MEDIA_MATCH') {
          return bestMatch;
        }
        return undefined;
      });

      await actions._SYNC_MEDIA_AND_PLAYER_STATE(
        { getters, dispatch, rootGetters },
        new AbortController().signal,
      );

      expect(dispatch).toHaveBeenCalledWith(
        'plexservers/FIND_BEST_MEDIA_MATCH',
        hostMedia,
        { root: true },
      );
      expect(dispatch).toHaveBeenCalledWith('PLAY_MEDIA_AND_SYNC_TIME', bestMatch);
      expect(dispatch).not.toHaveBeenCalledWith('plexclients/PRESS_STOP', null, { root: true });
    });
  });
});
