import {
  describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll,
} from 'vitest';
import { CAF } from 'caf';
import slplayerActions from '@/store/modules/slplayer/actions';

// CAF's generator abort leaves orphaned CAF.delay rejections that are briefly unhandled
// before being caught by CAF's internals. Suppress these expected rejections.
const suppressRejection = () => {};
beforeAll(() => { process.on('unhandledRejection', suppressRejection); });
afterAll(() => { process.removeListener('unhandledRejection', suppressRejection); });

vi.mock('@/player', () => ({
  setPlaybackRate: vi.fn(),
  getPlaybackRate: vi.fn(() => 1),
  getCurrentTimeMs: vi.fn(() => 0),
  waitForMediaElementEvent: vi.fn(() => Promise.resolve()),
  play: vi.fn(),
  pause: vi.fn(),
  getDurationMs: vi.fn(() => 100000),
  isTimeInBufferedRange: vi.fn(() => true),
  isMediaElementAttached: vi.fn(() => true),
  isPlaying: vi.fn(() => true),
  isPresentationPaused: vi.fn(() => false),
  isBuffering: vi.fn(() => false),
  getVolume: vi.fn(() => 1),
  isPaused: vi.fn(() => false),
  destroy: vi.fn(),
  cancelTrickPlay: vi.fn(),
  load: vi.fn(),
  setCurrentTimeMs: vi.fn(),
  setVolume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  areControlsShown: vi.fn(() => false),
  getSmallPlayButton: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  getBigPlayButton: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  unload: vi.fn(),
  isCasting: vi.fn(() => false),
  addCastStatusListener: vi.fn(),
  removeCastStatusListener: vi.fn(),
}));

vi.mock('@/utils/random', () => ({
  getRandomPlexId: vi.fn(() => 'mock-id'),
}));

vi.mock('@/utils/fetchutils', () => ({
  fetchJson: vi.fn(),
  queryFetch: vi.fn(),
}));

vi.mock('@/utils/deferredpromise', () => ({
  default: vi.fn(() => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }),
}));

const {
  setPlaybackRate, setCurrentTimeMs, waitForMediaElementEvent, getCurrentTimeMs,
} = await import('@/player');

describe('INIT_PLAYER_STATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not request a Plex media source when the player route opens without active media', async () => {
    const commit = vi.fn();
    const dispatch = vi.fn(() => Promise.resolve());
    const getters = {
      GET_PLAYER_INITIALIZED_DEFERRED_PROMISE: null,
    };
    const rootGetters = {
      'settings/GET_SLPLAYERVOLUME': 1,
      'plexclients/GET_ACTIVE_MEDIA_METADATA': null,
      'plexclients/GET_ACTIVE_SERVER_ID': null,
    };

    await slplayerActions.INIT_PLAYER_STATE({
      getters,
      rootGetters,
      commit,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith('REGISTER_PLAYER_EVENTS');
    expect(dispatch).toHaveBeenCalledWith('START_UPDATE_PLAYER_CONTROLS_SHOWN_INTERVAL');
    expect(dispatch).not.toHaveBeenCalledWith('CHANGE_PLAYER_SRC');
    expect(dispatch).not.toHaveBeenCalledWith('START_PERIODIC_PLEX_TIMELINE_UPDATE');
    expect(commit).toHaveBeenCalledWith('SET_IS_PLAYER_INITIALIZED', true);
  });
});

describe('SPEED_SEEK', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normal completion: sets rate, delays, resets rate to 1', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve();
    });
    const rootGetters = { GET_CONFIG: { slplayer_speed_sync_rate: 0.1 } };

    const promise = slplayerActions.SPEED_SEEK(
      { dispatch, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 1000 },
    );

    // seekToMs=1000, currentTimeMs=0, rate=1.1, timeUntilSynced=10000
    // Advance past the CAF.delay to let SPEED_SEEK complete
    await vi.advanceTimersByTimeAsync(11000);
    await promise;

    expect(setPlaybackRate).toHaveBeenCalledWith(expect.closeTo(1.1, 1));
    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
  });

  it('cancellation: abort mid-seek, finally block resets rate to 1', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve();
    });
    const rootGetters = { GET_CONFIG: { slplayer_speed_sync_rate: 0.1 } };

    const promise = slplayerActions.SPEED_SEEK(
      { dispatch, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 100000 },
    );

    // Flush microtasks so the generator starts and setPlaybackRate(rate) runs
    await vi.advanceTimersByTimeAsync(100);

    // Abort while the CAF.delay is still pending
    cancelToken.abort();

    // Flush so the abort propagates through CAF
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow();

    // Rate must still be reset to 1 in the finally block
    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
  });

  it('Bug 5: PROCESS_STATE_UPDATE_ON_PLAYER_EVENT rejection suppressed on abort', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action, payload) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      // Simulate the real behavior: waitForMediaElementEvent rejects when signal is aborted
      if (action === 'PROCESS_STATE_UPDATE_ON_PLAYER_EVENT' && payload?.signal?.aborted) {
        return Promise.reject(new Error('signal aborted'));
      }
      return Promise.resolve();
    });
    const rootGetters = { GET_CONFIG: { slplayer_speed_sync_rate: 0.1 } };

    const promise = slplayerActions.SPEED_SEEK(
      { dispatch, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 1000 },
    );

    // Let generator start
    await vi.advanceTimersByTimeAsync(100);

    cancelToken.abort();
    await vi.advanceTimersByTimeAsync(0);

    // Should reject from CAF abort, but NOT leave an unhandled rejection
    // from PROCESS_STATE_UPDATE_ON_PLAYER_EVENT (handled by .catch(() => {}))
    await expect(promise).rejects.toThrow();

    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
  });
});

describe('NORMAL_SEEK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the seeked listener before setting currentTime so fast seeks cannot strand sync tokens', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const rootGetters = { GET_CONFIG: { slplayer_seek_timeout: 15000 } };
    const commit = vi.fn();

    await slplayerActions.NORMAL_SEEK(
      { rootGetters, commit },
      { cancelSignal: cancelToken.signal, seekToMs: 1000 },
    );

    expect(waitForMediaElementEvent).toHaveBeenCalledWith({
      signal: expect.anything(),
      type: 'seeked',
    });
    expect(setCurrentTimeMs).toHaveBeenCalledWith(1000);
    expect(waitForMediaElementEvent.mock.invocationCallOrder[0])
      .toBeLessThan(setCurrentTimeMs.mock.invocationCallOrder[0]);
  });

  it('falls back after a short settle period only if current time reached the target', async () => {
    vi.useFakeTimers();
    waitForMediaElementEvent.mockReturnValueOnce(new Promise(() => {}));
    getCurrentTimeMs.mockReturnValueOnce(1000);
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const rootGetters = { GET_CONFIG: { slplayer_seek_timeout: 15000 } };
    const commit = vi.fn();

    const promise = slplayerActions.NORMAL_SEEK(
      { rootGetters, commit },
      { cancelSignal: cancelToken.signal, seekToMs: 1000 },
    );

    await vi.advanceTimersByTimeAsync(600);
    await expect(promise).resolves.toBeUndefined();
    expect(setCurrentTimeMs).toHaveBeenCalledWith(1000);
    vi.useRealTimers();
  });

  it('waits for delayed seeked events when current time has not settled at fallback time', async () => {
    vi.useFakeTimers();
    let resolveSeeked;
    waitForMediaElementEvent.mockReturnValueOnce(new Promise((resolve) => { resolveSeeked = resolve; }));
    getCurrentTimeMs.mockReturnValueOnce(0);
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const rootGetters = { GET_CONFIG: { slplayer_seek_timeout: 15000 } };
    const commit = vi.fn();
    let resolved = false;

    const promise = slplayerActions.NORMAL_SEEK(
      { rootGetters, commit },
      { cancelSignal: cancelToken.signal, seekToMs: 1000 },
    ).then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(600);
    expect(resolved).toBe(false);

    resolveSeeked();
    await promise;
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});

describe('SPEED_OR_NORMAL_SEEK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips seek when player is buffering', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve();
    });
    const getters = { GET_PLAYER_STATE: 'buffering' };
    const rootGetters = {
      GET_CONFIG: {
        slplayer_speed_sync_max_diff: 10000,
      },
    };

    const result = await slplayerActions.SPEED_OR_NORMAL_SEEK(
      { dispatch, getters, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 5000 },
    );

    // Should NOT have dispatched SPEED_SEEK or NORMAL_SEEK
    expect(dispatch).not.toHaveBeenCalledWith('SPEED_SEEK', expect.anything());
    expect(dispatch).not.toHaveBeenCalledWith('NORMAL_SEEK', expect.anything());
    expect(result).toBe('Skipped seek: player is buffering');
  });

  it('normal seeks multi-second drift instead of speeding playback for a long catch-up', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve('normal-seek-result');
    });
    const getters = { GET_PLAYER_STATE: 'playing' };
    const rootGetters = {
      GET_CONFIG: {
        slplayer_speed_sync_max_diff: 10000,
        slplayer_speed_sync_max_correction: 500,
      },
    };

    await slplayerActions.SPEED_OR_NORMAL_SEEK(
      { dispatch, getters, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 5000 },
    );

    expect(dispatch).toHaveBeenCalledWith('NORMAL_SEEK', {
      cancelSignal: cancelToken.signal,
      seekToMs: 5000,
    });
    expect(dispatch).not.toHaveBeenCalledWith('SPEED_SEEK', expect.anything());
  });

  it('uses speed seek for tiny drift within the correction window while playing', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve('speed-seek-result');
    });
    const getters = { GET_PLAYER_STATE: 'playing' };
    const rootGetters = {
      GET_CONFIG: {
        slplayer_speed_sync_max_correction: 500,
      },
    };

    await slplayerActions.SPEED_OR_NORMAL_SEEK(
      { dispatch, getters, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 300 },
    );

    expect(dispatch).toHaveBeenCalledWith('SPEED_SEEK', {
      cancelSignal: cancelToken.signal,
      seekToMs: 300,
    });
    expect(dispatch).not.toHaveBeenCalledWith('NORMAL_SEEK', expect.anything());
  });

  it('defaults the speed correction window to sub-second drift when no explicit cap is configured', async () => {
    // eslint-disable-next-line new-cap
    const cancelToken = new CAF.cancelToken();
    const dispatch = vi.fn().mockImplementation((action) => {
      if (action === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(0);
      return Promise.resolve('normal-seek-result');
    });
    const getters = { GET_PLAYER_STATE: 'playing' };
    const rootGetters = {
      GET_CONFIG: {
        slplayer_speed_sync_max_diff: 10000,
      },
    };

    await slplayerActions.SPEED_OR_NORMAL_SEEK(
      { dispatch, getters, rootGetters },
      { cancelSignal: cancelToken.signal, seekToMs: 5000 },
    );

    expect(dispatch).toHaveBeenCalledWith('NORMAL_SEEK', {
      cancelSignal: cancelToken.signal,
      seekToMs: 5000,
    });
    expect(dispatch).not.toHaveBeenCalledWith('SPEED_SEEK', expect.anything());
  });
});
