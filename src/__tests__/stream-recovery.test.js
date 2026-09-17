/* eslint-disable no-await-in-loop -- Exercise sequential failures, not concurrent errors. */
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import slplayerActions from '@/store/modules/slplayer/actions';

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

  it('does not perform a fresh source restart for every sequential network error', async () => {
    const context = makeContext();
    for (let attempt = 0; attempt < 5; attempt += 1) await slplayerActions.HANDLE_ERROR(context, error);
    const count = context.dispatch.mock.calls.filter(([type]) => type === 'SEND_PLEX_DECISION_REQUEST').length;
    expect(count).toBeLessThan(5);
  });
});
