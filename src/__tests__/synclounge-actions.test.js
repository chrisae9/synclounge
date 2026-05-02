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
