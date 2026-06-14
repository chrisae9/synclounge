import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';

vi.mock('@/socket', () => ({
  emit: vi.fn(),
  isConnected: vi.fn(() => true),
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  waitForEvent: vi.fn(),
}));

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
      }, { root: true });
      expect(resolved).toBe(false);

      resolvePlayMedia();
      await actionPromise;

      expect(resolved).toBe(true);
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
