import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import plexclientActions from '@/store/modules/plexclients/actions';

const baseHostUser = {
  state: 'playing',
  time: 10300,
  updatedAt: Date.now(),
  playbackRate: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('plexclients PLAY_MEDIA', () => {
  it('starts Plex timeline polling when media arrives after an empty initialized player', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
    const metadata = {
      title: 'Episode 2',
      ratingKey: 'episode-2',
      thumb: '/thumb.jpg',
    };
    const playQueue = { playQueueID: 123 };
    const commit = vi.fn();
    const dispatch = vi.fn((action) => {
      if (action === 'plexservers/CREATE_PLAY_QUEUE') {
        return Promise.resolve(playQueue);
      }
      return Promise.resolve();
    });
    const rootGetters = {
      'synclounge/GET_ROOM': 'room123',
      'plexservers/GET_MEDIA_IMAGE_URL': vi.fn(() => '/poster.jpg'),
      'slplayer/IS_PLAYER_INITIALIZED': true,
      'slplayer/GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN': null,
    };

    await plexclientActions.PLAY_MEDIA({ commit, dispatch, rootGetters }, {
      mediaIndex: 0,
      offset: 12345,
      metadata,
      machineIdentifier: 'server-1',
      shouldPlay: true,
    });

    expect(dispatch).toHaveBeenCalledWith('slplayer/CHANGE_PLAYER_SRC', true, { root: true });
    expect(dispatch).toHaveBeenCalledWith('slplayer/PRESS_PLAY', null, { root: true });
    expect(dispatch).toHaveBeenCalledWith(
      'slplayer/START_PERIODIC_PLEX_TIMELINE_UPDATE',
      null,
      { root: true },
    );
  });

  it('loads media without pressing play when following a paused host', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
    const metadata = {
      title: 'Episode 2',
      ratingKey: 'episode-2',
      thumb: '/thumb.jpg',
    };
    const dispatch = vi.fn((action) => {
      if (action === 'plexservers/CREATE_PLAY_QUEUE') {
        return Promise.resolve({ playQueueID: 123 });
      }
      return Promise.resolve();
    });
    const rootGetters = {
      'synclounge/GET_ROOM': 'room123',
      'plexservers/GET_MEDIA_IMAGE_URL': vi.fn(() => '/poster.jpg'),
      'slplayer/IS_PLAYER_INITIALIZED': true,
      'slplayer/GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN': null,
    };

    await plexclientActions.PLAY_MEDIA({ commit: vi.fn(), dispatch, rootGetters }, {
      mediaIndex: 0,
      offset: 12345,
      metadata,
      machineIdentifier: 'server-1',
      shouldPlay: false,
    });

    expect(dispatch).toHaveBeenCalledWith('slplayer/CHANGE_PLAYER_SRC', true, { root: true });
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/PRESS_PLAY', null, { root: true });
    expect(dispatch).toHaveBeenCalledWith(
      'slplayer/START_PERIODIC_PLEX_TIMELINE_UPDATE',
      null,
      { root: true },
    );
  });
});

describe('plexclients SYNC drift strategy', () => {
  it('stops cleanly when the host leaves during the timeline read', async () => {
    let hostUser = baseHostUser;
    const rootGetters = makeRootGetters();
    Object.defineProperty(rootGetters, 'synclounge/GET_HOST_USER', {
      get: () => hostUser,
    });
    const dispatch = vi.fn(async (action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        hostUser = null;
        return {
          state: 'playing', time: 10000, duration: 100000, playbackRate: 1,
        };
      }
      return undefined;
    });

    await expect(plexclientActions.SYNC(
      { dispatch, rootGetters },
      new AbortController().signal,
    )).resolves.toBeUndefined();

    expect(dispatch).not.toHaveBeenCalledWith('SEEK_TO', expect.anything());
  });

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
