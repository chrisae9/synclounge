import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { CAF } from 'caf';
import slplayerActions from '@/store/modules/slplayer/actions';
import slplayerGetters from '@/store/modules/slplayer/getters';

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
  getMediaElement: vi.fn(() => ({ muted: true })),
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
  isPaused, isBuffering,
} = await import('@/player');

describe('REFRESH_PLAYER_STATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the media element paused state before an acknowledgment is sent', async () => {
    isPaused.mockReturnValue(true);
    isBuffering.mockReturnValue(false);
    const commit = vi.fn();
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await slplayerActions.REFRESH_PLAYER_STATE({ commit, dispatch });

    expect(commit).toHaveBeenCalledWith('SET_PLAYER_STATE', 'paused');
    expect(dispatch).toHaveBeenCalledWith('synclounge/PROCESS_PLAYER_STATE_UPDATE', true, {
      root: true,
    });
    expect(dispatch).not.toHaveBeenCalledWith('SEND_PLEX_TIMELINE_UPDATE');
  });
});

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

  it('loads media without pressing play when initialized while following a paused host', async () => {
    const commit = vi.fn();
    const dispatch = vi.fn(() => Promise.resolve());
    const getters = {
      GET_PLAYER_INITIALIZED_DEFERRED_PROMISE: null,
      GET_SHOULD_PLAY_ON_LOAD: null,
    };
    const rootGetters = {
      'settings/GET_SLPLAYERVOLUME': 1,
      'plexclients/GET_ACTIVE_MEDIA_METADATA': { ratingKey: 'episode-2' },
      'plexclients/GET_ACTIVE_SERVER_ID': 'server-1',
      'synclounge/GET_HOST_USER': { state: 'paused' },
    };

    await slplayerActions.INIT_PLAYER_STATE({
      getters,
      rootGetters,
      commit,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith('CHANGE_PLAYER_SRC');
    expect(dispatch).not.toHaveBeenCalledWith('PRESS_PLAY');
    expect(commit).toHaveBeenCalledWith('SET_SHOULD_PLAY_ON_LOAD', null);
    expect(dispatch).toHaveBeenCalledWith('START_PERIODIC_PLEX_TIMELINE_UPDATE');
    expect(commit).toHaveBeenCalledWith('SET_IS_PLAYER_INITIALIZED', true);
  });

  it('honors explicit play intent while initialized under a paused host', async () => {
    const commit = vi.fn();
    const dispatch = vi.fn(() => Promise.resolve());
    const getters = {
      GET_PLAYER_INITIALIZED_DEFERRED_PROMISE: null,
      GET_SHOULD_PLAY_ON_LOAD: true,
    };
    const rootGetters = {
      'settings/GET_SLPLAYERVOLUME': 1,
      'plexclients/GET_ACTIVE_MEDIA_METADATA': { ratingKey: 'episode-2' },
      'plexclients/GET_ACTIVE_SERVER_ID': 'server-1',
      'synclounge/GET_HOST_USER': { state: 'paused' },
    };

    await slplayerActions.INIT_PLAYER_STATE({
      getters,
      rootGetters,
      commit,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith('CHANGE_PLAYER_SRC');
    expect(dispatch).toHaveBeenCalledWith('PRESS_PLAY');
    expect(commit).toHaveBeenCalledWith('SET_SHOULD_PLAY_ON_LOAD', null);
    expect(dispatch).toHaveBeenCalledWith('START_PERIODIC_PLEX_TIMELINE_UPDATE');
  });

  it('rolls back partial initialization and propagates the failure', async () => {
    const error = new Error('media load failed');
    const commit = vi.fn();
    const dispatch = vi.fn((type) => {
      if (type === 'CHANGE_PLAYER_SRC') return Promise.reject(error);
      return Promise.resolve();
    });
    const getters = {
      GET_PLAYER_INITIALIZED_DEFERRED_PROMISE: null,
      GET_SHOULD_PLAY_ON_LOAD: null,
    };
    const rootGetters = {
      'settings/GET_SLPLAYERVOLUME': 1,
      'plexclients/GET_ACTIVE_MEDIA_METADATA': { ratingKey: 'episode-2' },
      'plexclients/GET_ACTIVE_SERVER_ID': 'server-1',
      'synclounge/GET_HOST_USER': { state: 'playing' },
    };

    await expect(slplayerActions.INIT_PLAYER_STATE({
      getters,
      rootGetters,
      commit,
      dispatch,
    })).rejects.toThrow('media load failed');

    expect(dispatch).toHaveBeenCalledWith('ROLLBACK_PLAYER_INITIALIZATION');
    expect(commit).not.toHaveBeenCalledWith('SET_IS_PLAYER_INITIALIZED', true);
  });

  it('releases partial player resources during rollback', async () => {
    const abort = vi.fn();
    const commit = vi.fn();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const { destroy } = await import('@/player');

    await slplayerActions.ROLLBACK_PLAYER_INITIALIZATION({
      getters: { GET_PLAYER_DESTROY_CANCEL_TOKEN: { abort } },
      commit,
      dispatch,
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith('UNREGISTER_PLAYER_EVENTS');
    expect(dispatch).toHaveBeenCalledWith('CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE');
    expect(dispatch).toHaveBeenCalledWith('DESTROY_SUBTITLES');
    expect(destroy).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith('SET_IS_PLAYER_INITIALIZED', false);
  });

  it('finishes rollback after cleanup failures and remains repeatable', async () => {
    const cleanupError = new Error('event cleanup failed');
    const commit = vi.fn();
    let shouldRejectCleanup = true;
    const dispatch = vi.fn((type) => {
      if (type === 'UNREGISTER_PLAYER_EVENTS' && shouldRejectCleanup) {
        shouldRejectCleanup = false;
        return Promise.reject(cleanupError);
      }
      return Promise.resolve();
    });
    const { destroy } = await import('@/player');

    await expect(slplayerActions.ROLLBACK_PLAYER_INITIALIZATION({
      getters: {},
      commit,
      dispatch,
    })).resolves.toBeUndefined();
    await expect(slplayerActions.ROLLBACK_PLAYER_INITIALIZATION({
      getters: {},
      commit,
      dispatch,
    })).resolves.toBeUndefined();

    expect(dispatch).toHaveBeenCalledWith('CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE');
    expect(dispatch).toHaveBeenCalledWith('DESTROY_SUBTITLES');
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith('SET_IS_PLAYER_INITIALIZED', false);
    expect(commit.mock.calls.filter(([type]) => type === 'SET_IS_PLAYER_INITIALIZED'))
      .toHaveLength(2);
  });
});

describe('autoplay recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unmute retry clears autoplay block and attempts playback again', async () => {
    const mediaElement = { muted: true };
    const { getMediaElement } = await import('@/player');
    getMediaElement.mockReturnValue(mediaElement);
    const commit = vi.fn();
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await slplayerActions.UNMUTE_AFTER_AUTOPLAY_BLOCK({ commit, dispatch });

    expect(mediaElement.muted).toBe(false);
    expect(commit).toHaveBeenCalledWith('SET_AUTOPLAY_BLOCKED', false);
    expect(dispatch).toHaveBeenCalledWith('PRESS_PLAY');
  });

  it('keeps the unmute prompt available when the muted retry also fails', async () => {
    const mediaElement = { muted: false };
    const { getMediaElement, play } = await import('@/player');
    getMediaElement.mockReturnValue(mediaElement);
    play.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const commit = vi.fn();

    await slplayerActions.PRESS_PLAY({ commit });

    expect(mediaElement.muted).toBe(true);
    expect(commit).toHaveBeenCalledWith('SET_AUTOPLAY_BLOCKED', true);
  });

  it('stop clears stale autoplay block state and unmutes autoplay-muted media', async () => {
    const mediaElement = { muted: true };
    const { getMediaElement } = await import('@/player');
    getMediaElement.mockReturnValue(mediaElement);
    const commit = vi.fn();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const getters = { IS_AUTOPLAY_BLOCKED: true };

    await slplayerActions.PRESS_STOP({ getters, commit, dispatch });

    expect(mediaElement.muted).toBe(false);
    expect(commit).toHaveBeenCalledWith('SET_AUTOPLAY_BLOCKED', false);
    expect(dispatch).toHaveBeenCalledWith('CHANGE_PLAYER_STATE', 'stopped');
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
    const rejection = expect(promise).rejects.toThrow();

    // Flush microtasks so the generator starts and setPlaybackRate(rate) runs
    await vi.advanceTimersByTimeAsync(100);

    // Abort while the CAF.delay is still pending
    cancelToken.abort();

    // Flush so the abort propagates through CAF
    await vi.advanceTimersByTimeAsync(0);

    await rejection;

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
    const rejection = expect(promise).rejects.toThrow();

    // Let generator start
    await vi.advanceTimersByTimeAsync(100);

    cancelToken.abort();
    await vi.advanceTimersByTimeAsync(0);

    // Should reject from CAF abort, but NOT leave an unhandled rejection
    // from PROCESS_STATE_UPDATE_ON_PLAYER_EVENT (handled by .catch(() => {}))
    await rejection;

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

describe('Source request cancellation', () => {
  it('keeps early native pause events buffering until source loading has settled', async () => {
    const state = { playerState: 'buffering', maskPlayerState: true, isChangingSource: false };
    const getters = {
      get GET_PLAYER_STATE() { return slplayerGetters.GET_PLAYER_STATE(state); },
      get GET_MASK_PLAYER_STATE() { return state.maskPlayerState; },
    };
    const controller = new AbortController();
    let finishLoad;
    const commit = (type, value) => {
      if (type === 'SET_PLAYER_STATE') state.playerState = value;
      if (type === 'SET_MASK_PLAYER_STATE') state.maskPlayerState = value;
      if (type === 'SET_IS_CHANGING_SOURCE') state.isChangingSource = value;
    };
    const reports = [];
    const dispatch = vi.fn(async (type, value) => {
      if (type === 'LOAD_PLAYER_SRC') await new Promise((resolve) => { finishLoad = resolve; });
      if (type === 'REFRESH_PLAYER_STATE') {
        await slplayerActions.REFRESH_PLAYER_STATE({ commit, dispatch });
      }
      if (type === 'synclounge/PROCESS_PLAYER_STATE_UPDATE') {
        const timeline = await slplayerActions.FETCH_TIMELINE_POLL_DATA({ getters, dispatch });
        reports.push(timeline.state);
        // A stable timeline can immediately trigger host reclamation and cancel follower sync.
        if (timeline.state === 'paused') controller.abort();
      }
      if (type === 'CHANGE_PLAYER_STATE') {
        await slplayerActions.CHANGE_PLAYER_STATE({ commit, dispatch }, value);
      }
    });
    const { unload } = await import('@/player');
    unload.mockClear();
    isPaused.mockReturnValue(true);
    const pending = slplayerActions.CHANGE_PLAYER_SRC({ getters, commit, dispatch }, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(finishLoad).toBeTypeOf('function'));
    await slplayerActions.HANDLE_PLAYER_BUFFERING({ getters, dispatch }, { buffering: false });
    await slplayerActions.REFRESH_PLAYER_STATE({ commit, dispatch });
    expect(reports).toEqual(['buffering', 'buffering']);
    expect(controller.signal.aborted).toBe(false);
    finishLoad();
    await pending;
    expect(reports).toEqual(['buffering', 'buffering', 'paused']);
    expect(state.isChangingSource).toBe(false);
    expect(state.maskPlayerState).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(unload).not.toHaveBeenCalled();
  });

  it('preserves explicit stopped state during source cancellation', () => {
    expect(slplayerGetters.GET_PLAYER_STATE({
      playerState: 'stopped', maskPlayerState: true, isChangingSource: true,
    })).toBe('stopped');
  });

  it('does not commit a decision response after cancellation', async () => {
    const { fetchJson } = await import('@/utils/fetchutils');
    let finish;
    fetchJson.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const commit = vi.fn();
    const pending = slplayerActions.SEND_PLEX_DECISION_REQUEST(
      { getters: {}, commit, dispatch: vi.fn() },
      { signal: controller.signal },
    );
    controller.abort();
    finish({ MediaContainer: {} });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not retry transcoding after cancellation during source load', async () => {
    const controller = new AbortController();
    const commit = vi.fn();
    let started = false;
    const dispatch = vi.fn((type) => {
      if (type === 'LOAD_PLAYER_SRC') {
        started = true;
        return new Promise(() => {});
      }
      return Promise.resolve();
    });
    const pending = slplayerActions.CHANGE_PLAYER_SRC({ getters: {}, commit, dispatch }, { signal: controller.signal });
    await vi.waitFor(() => expect(started).toBe(true));
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    const { unload } = await import('@/player');
    expect(unload).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalledWith('SET_FORCE_TRANSCODE_RETRY', true);
    expect(commit).toHaveBeenCalledWith('SET_IS_CHANGING_SOURCE', false);
  });

  it('shares player initialization between overlapping callers', () => {
    const getters = {};
    const commit = vi.fn((type, value) => {
      if (type === 'SET_PLAYER_INITIALIZED_DEFERRED_PROMISE') getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE = value;
    });
    const first = slplayerActions.NAVIGATE_AND_INITIALIZE_PLAYER({ getters, commit });
    const second = slplayerActions.NAVIGATE_AND_INITIALIZE_PLAYER({ getters, commit });
    expect(first).toBe(second);
    expect(commit.mock.calls.filter(([type]) => type === 'SET_NAVIGATE_TO_PLAYER')).toHaveLength(1);
  });
});
