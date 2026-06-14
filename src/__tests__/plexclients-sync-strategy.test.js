import {
  describe, it, expect, vi,
} from 'vitest';
import plexclientActions from '@/store/modules/plexclients/actions';

const baseHostUser = {
  state: 'playing',
  time: 10300,
  updatedAt: Date.now(),
  playbackRate: 1,
};

const makeRootGetters = (overrides = {}) => ({
  'synclounge/GET_ADJUSTED_HOST_TIME': () => 10300,
  'synclounge/GET_HOST_USER': baseHostUser,
  'settings/GET_SYNCFLEXIBILITY': 3000,
  'settings/GET_SYNCMODE': 'cleanseek',
  GET_CONFIG: {
    paused_sync_flexibility: 10,
    slplayer_soft_seek_threshold: 200,
  },
  GET_BROWSER: {
    name: 'chrome',
    os: 'macOS',
  },
  ...overrides,
});

describe('plexclients SYNC drift strategy', () => {
  it('soft-seeks small desktop drift above the soft threshold', async () => {
    const dispatch = vi.fn((action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing',
          time: 10000,
          duration: 100000,
          playbackRate: 1,
        });
      }
      return Promise.resolve('soft-seek-result');
    });
    const rootGetters = makeRootGetters();

    const result = await plexclientActions.SYNC(
      { dispatch, rootGetters },
      new AbortController().signal,
    );

    expect(result).toBe('soft-seek-result');
    expect(dispatch).toHaveBeenCalledWith('slplayer/SOFT_SEEK', 10300, { root: true });
    expect(dispatch).not.toHaveBeenCalledWith('SEEK_TO', expect.anything());
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SPEED_SEEK', expect.anything(), expect.anything());
  });

  it('does not soft-seek tiny drift below the soft threshold', async () => {
    const dispatch = vi.fn((action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing',
          time: 10150,
          duration: 100000,
          playbackRate: 1,
        });
      }
      return Promise.resolve();
    });

    const result = await plexclientActions.SYNC(
      { dispatch, rootGetters: makeRootGetters() },
      new AbortController().signal,
    );

    expect(result).toBe('No sync needed');
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SOFT_SEEK', expect.anything(), expect.anything());
  });

  it.each(['iOS', 'iPadOS'])('does not soft-seek small drift on %s browsers', async (os) => {
    const dispatch = vi.fn((action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing',
          time: 10000,
          duration: 100000,
          playbackRate: 1,
        });
      }
      return Promise.resolve();
    });

    const rootGetters = makeRootGetters({
      GET_BROWSER: {
        name: os.toLowerCase(),
        os,
      },
    });

    const result = await plexclientActions.SYNC(
      { dispatch, rootGetters },
      new AbortController().signal,
    );

    expect(result).toBe('No sync needed');
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SOFT_SEEK', expect.anything(), expect.anything());
    expect(dispatch).not.toHaveBeenCalledWith('SEEK_TO', expect.anything());
  });

  it('routes larger drift to a seek instead of playback-rate speed sync', async () => {
    const cancelSignal = new AbortController().signal;
    const dispatch = vi.fn((action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing',
          time: 7000,
          duration: 100000,
          playbackRate: 1,
        });
      }
      return Promise.resolve('normal-seek-result');
    });

    const result = await plexclientActions.SYNC(
      { dispatch, rootGetters: makeRootGetters() },
      cancelSignal,
    );

    expect(result).toBe('normal-seek-result');
    expect(dispatch).toHaveBeenCalledWith('SEEK_TO', { cancelSignal, offset: 10300 });
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SPEED_SEEK', expect.anything(), expect.anything());
  });

  it('SEEK_TO performs a direct normal seek rather than playback-rate speed sync', async () => {
    const cancelSignal = new AbortController().signal;
    const dispatch = vi.fn().mockResolvedValue('normal-seek-result');

    const result = await plexclientActions.SEEK_TO(
      { dispatch },
      { cancelSignal, offset: 10300 },
    );

    expect(result).toBe('normal-seek-result');
    expect(dispatch).toHaveBeenCalledWith(
      'slplayer/NORMAL_SEEK',
      { cancelSignal, seekToMs: 10300 },
      { root: true },
    );
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SPEED_OR_NORMAL_SEEK', expect.anything(), expect.anything());
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/SPEED_SEEK', expect.anything(), expect.anything());
  });
});
