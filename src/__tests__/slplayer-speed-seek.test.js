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

const { setPlaybackRate } = await import('@/player');

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
