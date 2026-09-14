import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { CAF } from 'caf';
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

    expect(dispatch).toHaveBeenCalledWith('slplayer/CHANGE_PLAYER_SRC', { signal: undefined }, { root: true });
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

    expect(dispatch).toHaveBeenCalledWith('slplayer/CHANGE_PLAYER_SRC', { signal: undefined }, { root: true });
    expect(dispatch).not.toHaveBeenCalledWith('slplayer/PRESS_PLAY', null, { root: true });
    expect(dispatch).toHaveBeenCalledWith(
      'slplayer/START_PERIODIC_PLEX_TIMELINE_UPDATE',
      null,
      { root: true },
    );
  });
});

describe('plexclients SYNC drift strategy', () => {
  it('resumes playback after the configured skip-ahead delay', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn((action) => {
      if (action === 'FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({ state: 'playing' });
      }
      return Promise.resolve();
    });

    try {
      const skipAhead = plexclientActions.SKIP_AHEAD(
        { dispatch, rootGetters: { GET_CONFIG: { skip_ahead_time: 1000 } } },
        { offset: 5000, cancelSignal: cancelToken.signal },
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(dispatch).not.toHaveBeenCalledWith('PRESS_PLAY', cancelToken.signal);

      await vi.advanceTimersByTimeAsync(1);
      await skipAhead;

      expect(dispatch.mock.calls).toEqual([
        ['FETCH_TIMELINE_POLL_DATA_CACHE'],
        ['SEEK_TO', { offset: 6000, cancelSignal: cancelToken.signal }],
        ['PRESS_PAUSE', cancelToken.signal],
        ['PRESS_PLAY', cancelToken.signal],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

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

  const toleranceCases = [500, 3000, 7000].flatMap((tolerance) => [-1, 1]
    .flatMap((direction) => [350, tolerance - 1, tolerance, tolerance + 1]
      .map((magnitude) => [tolerance, direction * magnitude])));

  it.each(toleranceCases)('honors %ims tolerance for %ims drift', async (tolerance, drift) => {
    const cancelSignal = new AbortController().signal;
    const dispatch = vi.fn((action) => Promise.resolve(
      action === 'FETCH_TIMELINE_POLL_DATA_CACHE'
        ? { state: 'playing', time: 10300 - drift, playbackRate: 1 }
        : 'normal-seek-result',
    ));
    const rootGetters = makeRootGetters({ 'settings/GET_SYNCFLEXIBILITY': tolerance });

    const result = await plexclientActions.SYNC({ dispatch, rootGetters }, cancelSignal);

    if (Math.abs(drift) > tolerance) {
      expect(result).toBe('normal-seek-result');
      expect(dispatch.mock.calls).toEqual([
        ['FETCH_TIMELINE_POLL_DATA_CACHE'],
        ['SEEK_TO', { cancelSignal, offset: 10300 }],
      ]);
    } else {
      expect(result).toBe('No sync needed');
      expect(dispatch.mock.calls).toEqual([['FETCH_TIMELINE_POLL_DATA_CACHE']]);
    }
  });

  it.each(['Linux', 'macOS', 'iOS', 'iPadOS'])('leaves repeated small drift undisturbed on %s', async (os) => {
    let hostTime = 10300;
    const dispatch = vi.fn((action) => Promise.resolve(
      action === 'FETCH_TIMELINE_POLL_DATA_CACHE'
        ? { state: 'playing', time: hostTime - 350, playbackRate: 1 }
        : undefined,
    ));
    const rootGetters = makeRootGetters({
      'synclounge/GET_ADJUSTED_HOST_TIME': () => hostTime,
      GET_BROWSER: { os },
    });
    const cancelSignal = new AbortController().signal;

    // Twelve successive five-second polls model a minute of persistent small drift.
    for (let poll = 0; poll < 12; poll += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(plexclientActions.SYNC({ dispatch, rootGetters }, cancelSignal))
        .resolves.toBe('No sync needed');
      hostTime += 5000;
    }

    expect(dispatch.mock.calls).toEqual(Array.from({ length: 12 }, () => ['FETCH_TIMELINE_POLL_DATA_CACHE']));
  });

  it.each([-11, -10, -9, 9, 10, 11])('preserves paused-host precision for %ims drift', async (drift) => {
    const cancelSignal = new AbortController().signal;
    const dispatch = vi.fn((action) => Promise.resolve(
      action === 'FETCH_TIMELINE_POLL_DATA_CACHE'
        ? { state: 'paused', time: 10300 - drift, playbackRate: 1 }
        : 'normal-seek-result',
    ));
    const rootGetters = makeRootGetters({
      'synclounge/GET_HOST_USER': { ...baseHostUser, state: 'paused' },
      'settings/GET_SYNCMODE': 'skipahead',
    });

    await plexclientActions.SYNC({ dispatch, rootGetters }, cancelSignal);

    expect(dispatch.mock.calls).toEqual(Math.abs(drift) > 10 ? [
      ['FETCH_TIMELINE_POLL_DATA_CACHE'],
      ['SEEK_TO', { cancelSignal, offset: 10300 }],
    ] : [['FETCH_TIMELINE_POLL_DATA_CACHE']]);
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

describe('Playback request ownership', () => {
  it('does not commit an older queue after a newer playback request completes', async () => {
    let finishOldQueue;
    const commit = vi.fn();
    const dispatch = vi.fn((type, payload) => {
      if (type === 'plexservers/CREATE_PLAY_QUEUE' && payload.ratingKey === '1') {
        return new Promise((resolve) => { finishOldQueue = resolve; });
      }
      return Promise.resolve({ playQueueID: 2 });
    });
    const ctx = { commit, dispatch, rootGetters: { 'slplayer/IS_PLAYER_INITIALIZED': true } };
    const old = plexclientActions.PLAY_MEDIA(ctx, { metadata: { ratingKey: '1' } });
    await plexclientActions.PLAY_MEDIA(ctx, { metadata: { ratingKey: '2' } });
    finishOldQueue({ playQueueID: 1 });
    await expect(old).rejects.toMatchObject({ name: 'AbortError' });
    expect(commit.mock.calls.filter(([type]) => type === 'SET_ACTIVE_MEDIA_METADATA')).toEqual([
      ['SET_ACTIVE_MEDIA_METADATA', { ratingKey: '2' }],
    ]);
  });

  it('does not load a cancelled selection when shared player initialization eventually completes', async () => {
    const controller = new AbortController();
    let finishInitialization;
    const dispatch = vi.fn((type) => {
      if (type === 'slplayer/NAVIGATE_AND_INITIALIZE_PLAYER') {
        return new Promise((resolve) => { finishInitialization = resolve; });
      }
      return Promise.resolve({});
    });
    const pending = plexclientActions.PLAY_MEDIA({ commit: vi.fn(), dispatch, rootGetters: {} }, {
      metadata: { ratingKey: '1' }, signal: controller.signal,
    });
    await vi.waitFor(() => expect(finishInitialization).toBeTypeOf('function'));
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    finishInitialization();
    await Promise.resolve();
    expect(dispatch.mock.calls.some(([type]) => type === 'slplayer/CHANGE_PLAYER_SRC')).toBe(false);
  });
});
