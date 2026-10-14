/* eslint-disable no-await-in-loop -- Exercise sequential failures, not concurrent errors. */
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import slplayerActions from '@/store/modules/slplayer/actions';
import slplayerGetters from '@/store/modules/slplayer/getters';
import roomGetters from '@/store/modules/synclounge/getters';

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
  getPlaybackDiagnostics: vi.fn(() => ({ bufferAhead: 0, shaka: {} })),
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
  setCurrentTimeMs, isPaused, isCasting,
} = await import('@/player');

vi.mock('@/utils/streamrecovery', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, default: () => original.default({ delayMs: 0 }) };
});

describe('stream recovery fault injection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isPaused.mockReturnValue(false);
    isCasting.mockReturnValue(false);
    const { getMediaElement } = await import('@/player');
    getMediaElement.mockReturnValue(Object.assign(new EventTarget(), { readyState: 4, seeking: false }));
    await slplayerActions.DESTROY_PLAYER_STATE({ getters: {}, commit: vi.fn(), dispatch: vi.fn() });
    await slplayerActions.CHANGE_PLAYER_SRC({ getters: {}, commit: vi.fn(), dispatch: vi.fn() });
  });
  const error = { detail: { code: 1003, category: 1, severity: 2 } };
  const makeContext = () => {
    const context = {
      getters: { GET_OFFSET_MS: 123000, GET_SRC_URL: 'https://fixture.invalid/video', GET_FORCE_TRANSCODE: true },
      commit: vi.fn((type, value) => {
        if (type === 'SET_OFFSET_MS') context.getters.GET_OFFSET_MS = value;
      }),
    };
    const real = ['UPDATE_PLAYER_SRC_AND_KEEP_TIME', 'CHANGE_PLAYER_SRC', 'LOAD_PLAYER_SRC'];
    context.dispatch = vi.fn((type, payload) => {
      if (real.includes(type)) return slplayerActions[type](context, payload);
      if (type === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') return Promise.resolve(123000);
      return Promise.resolve();
    });
    return context;
  };

  it('coalesces two errors while the first source recovery is pending', async () => {
    const context = makeContext();
    const decisions = [];
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'SEND_PLEX_DECISION_REQUEST') return new Promise((resolve) => { decisions.push(resolve); });
      return dispatch(type, payload);
    });
    const first = slplayerActions.HANDLE_ERROR(context, error).then(() => 'ok', (e) => e.name);
    await vi.waitFor(() => expect(decisions.length).toBe(1));
    const second = slplayerActions.HANDLE_ERROR(context, error).then(() => 'ok', (e) => e.name);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const count = decisions.length;
    decisions.forEach((resolve) => resolve());
    const results = await Promise.all([first, second]);
    expect(count).toBe(1);
    expect(results).toEqual(['ok', 'ok']);
  });

  it('does not revive recovery when teardown happens during the timestamp lookup', async () => {
    const context = makeContext();
    let finishTime;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK') {
        return new Promise((resolve) => { finishTime = resolve; });
      }
      return dispatch(type, payload);
    });
    const pending = slplayerActions.HANDLE_ERROR(context, error).catch((e) => e.name);
    await vi.waitFor(() => expect(finishTime).toBeTypeOf('function'));
    await slplayerActions.DESTROY_PLAYER_STATE(context);
    context.dispatch.mockClear();
    finishTime(123000);
    await pending;
    const restarted = context.dispatch.mock.calls.some(([type]) => type === 'SEND_PLEX_DECISION_REQUEST');
    expect(restarted).toBe(false);
  });

  it('cancels a pending source decision after teardown', async () => {
    const context = makeContext();
    let finishDecision;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'SEND_PLEX_DECISION_REQUEST') return new Promise((resolve) => { finishDecision = resolve; });
      return dispatch(type, payload);
    });
    const pending = slplayerActions.HANDLE_ERROR(context, error).catch((e) => e.name);
    await vi.waitFor(() => expect(finishDecision).toBeTypeOf('function'));
    await slplayerActions.DESTROY_PLAYER_STATE(context);
    finishDecision();
    expect(await pending).toBe('cancelled');
    expect(context.dispatch).not.toHaveBeenCalledWith('LOAD_PLAYER_SRC', expect.anything());
  });

  it('ignores late errors after stop until a new source is explicitly loaded', async () => {
    const context = makeContext();
    await slplayerActions.PRESS_STOP(context);
    context.dispatch.mockClear();
    expect(await slplayerActions.HANDLE_ERROR(context, error)).toBe('cancelled');
    expect(context.dispatch).not.toHaveBeenCalled();
    await slplayerActions.CHANGE_PLAYER_SRC(context);
    expect(await slplayerActions.HANDLE_ERROR(context, error)).toBe('recovered');
  });

  it('preserves paused playback during source recovery', async () => {
    const context = makeContext();
    isPaused.mockReturnValue(true);
    const { pause, getMediaElement } = await import('@/player');
    const video = Object.assign(new EventTarget(), { autoplay: true, readyState: 4, seeking: false });
    getMediaElement.mockReturnValue(video);
    await slplayerActions.HANDLE_ERROR(context, error);
    expect(video.autoplay).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(context.dispatch).not.toHaveBeenCalledWith('PRESS_PLAY');
  });

  it('does not wait for the idle local video while casting', async () => {
    const context = makeContext();
    isCasting.mockReturnValue(true);
    const { getMediaElement } = await import('@/player');
    getMediaElement.mockReturnValue(Object.assign(new EventTarget(), { readyState: 0 }));
    expect(await slplayerActions.HANDLE_ERROR(context, error)).toBe('recovered');
  });

  it('restores the saved timestamp after a successful recovery', async () => {
    const context = makeContext();
    await slplayerActions.HANDLE_ERROR(context, error);
    expect(setCurrentTimeMs).toHaveBeenCalledWith(123000);
    expect(context.dispatch).toHaveBeenCalledWith('REFRESH_PLAYER_STATE');
  });

  it('publishes a progressing room timeline while subtitles remain pending after recovery', async () => {
    const context = makeContext();
    const state = { playerState: 'buffering', maskPlayerState: true, isChangingSource: false };
    Object.defineProperties(context.getters, {
      GET_MASK_PLAYER_STATE: { get: () => state.maskPlayerState },
      GET_PLAYER_STATE: { get: () => slplayerGetters.GET_PLAYER_STATE(state) },
    });
    context.commit.mockImplementation((type, value) => {
      if (type === 'SET_MASK_PLAYER_STATE') state.maskPlayerState = value;
      if (type === 'SET_IS_CHANGING_SOURCE') state.isChangingSource = value;
      if (type === 'SET_PLAYER_STATE') state.playerState = value;
    });
    let finishSubtitles;
    const subtitles = new Promise((resolve) => { finishSubtitles = resolve; });
    let host;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'CHANGE_SUBTITLES') return subtitles;
      if (['REFRESH_PLAYER_STATE', 'FETCH_TIMELINE_POLL_DATA'].includes(type)) {
        return slplayerActions[type](context, payload);
      }
      if (type === 'synclounge/PROCESS_PLAYER_STATE_UPDATE') {
        return slplayerActions.FETCH_TIMELINE_POLL_DATA(context).then((data) => {
          host = { ...data, updatedAt: Date.now() };
        });
      }
      return dispatch(type, payload);
    });
    let result;
    const recovery = slplayerActions.HANDLE_ERROR(context, error).then((value) => { result = value; });
    try {
      await vi.waitFor(() => expect(result).toBe('recovered'));
      expect(host).toMatchObject({ state: 'playing', time: 123000 });
      const clock = vi.spyOn(Date, 'now').mockReturnValue(host.updatedAt + 4000);
      expect(roomGetters.GET_ADJUSTED_HOST_TIME({}, { GET_HOST_USER: host })()).toBe(127000);
      clock.mockRestore();
    } finally {
      finishSubtitles();
      await recovery;
    }
  });

  const subtitleFailures = [new Error('Subtitle fetch failed'), null, undefined];
  it.each(subtitleFailures)('keeps video running after a late subtitle failure: %s', async (reason) => {
    const context = makeContext();
    let failSubtitles;
    const subtitles = new Promise((resolve, reject) => { failSubtitles = reject; });
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => (type === 'CHANGE_SUBTITLES'
      ? subtitles : dispatch(type, payload)));
    expect(await slplayerActions.HANDLE_ERROR(context, error)).toBe('recovered');
    failSubtitles(reason);
    await vi.waitFor(() => {
      expect(context.dispatch).toHaveBeenCalledWith('REPORT_PLAYBACK_DIAGNOSTIC', { event: 'subtitle-load-failed' });
    });
    expect(context.dispatch.mock.calls.filter(([type]) => type === 'LOAD_PLAYER_SRC')).toHaveLength(1);
    expect(context.dispatch).toHaveBeenCalledWith('REFRESH_PLAYER_STATE');
  });

  it('sends periodic reports for the next item without waiting for subtitles', async () => {
    vi.useFakeTimers();
    const context = makeContext();
    context.rootGetters = {
      'plexclients/GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM': {},
      GET_CONFIG: { slplayer_plex_timeline_update_interval: 1000 },
    };
    const commit = context.commit.getMockImplementation();
    context.commit.mockImplementation((type, value) => {
      if (type === 'SET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN') {
        context.getters.GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN = value;
      }
      commit(type, value);
    });
    let finishSubtitles;
    const subtitles = new Promise((resolve) => { finishSubtitles = resolve; });
    let cadence;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'CHANGE_SUBTITLES') return subtitles;
      if (type === 'START_PERIODIC_PLEX_TIMELINE_UPDATE') {
        cadence = slplayerActions[type](context, payload);
        return cadence;
      }
      if (type === 'CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE') return slplayerActions[type](context);
      return dispatch(type, payload);
    });
    const transition = slplayerActions.PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM(context);
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect(context.dispatch).toHaveBeenCalledWith('REPORT_PLAYBACK_DIAGNOSTIC', { event: 'playback-health' });
      expect(context.dispatch).toHaveBeenCalledWith('SEND_PLEX_TIMELINE_UPDATE', {
        signal: expect.objectContaining({ aborted: false }),
      });
    } finally {
      finishSubtitles();
      await transition;
      slplayerActions.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE(context);
      await cadence;
      vi.useRealTimers();
    }
  });

  it('does not show an exhausted notification after stopping at the diagnostic boundary', async () => {
    const context = makeContext();
    for (let attempt = 0; attempt < 3; attempt += 1) await slplayerActions.HANDLE_ERROR(context, error);
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => {
      if (type === 'REPORT_PLAYBACK_DIAGNOSTIC' && payload.event === 'stream-recovery-exhausted') {
        return slplayerActions.PRESS_STOP(context);
      }
      return dispatch(type, payload);
    });
    expect(await slplayerActions.HANDLE_ERROR(context, error)).toBe('cancelled');
    expect(context.dispatch.mock.calls.some(([type]) => type === 'DISPLAY_NOTIFICATION')).toBe(false);
  });

  it('does not perform a fresh source restart for every sequential network error', async () => {
    const context = makeContext();
    for (let attempt = 0; attempt < 5; attempt += 1) await slplayerActions.HANDLE_ERROR(context, error);
    const count = context.dispatch.mock.calls.filter(([type]) => type === 'SEND_PLEX_DECISION_REQUEST').length;
    expect(count).toBeLessThan(5);
  });
});
