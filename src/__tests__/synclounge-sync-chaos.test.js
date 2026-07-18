import {
  describe, it, expect, vi,
} from 'vitest';
import { CAF } from 'caf';
import actions from '@/store/modules/synclounge/actions';

// Mock all external dependencies that actions.js imports
vi.mock('@/store/modules/synclounge/eventhandlers', () => ({ default: {} }));
vi.mock('@/utils/combineurl', () => ({
  combineUrl: vi.fn(),
  combineRelativeUrlParts: vi.fn(),
}));
vi.mock('@/utils/fetchutils', () => ({
  fetchJson: vi.fn(),
}));
vi.mock('@/socket', () => ({
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  waitForEvent: vi.fn(),
  isConnected: vi.fn(() => true),
  emit: vi.fn(),
  getId: vi.fn(() => 'me-1'),
}));
vi.mock('@/assets/sounds/notification_simple-01.wav', () => ({ default: 'mock-sound' }));

// Mock Audio constructor used at module level
globalThis.Audio = vi.fn(() => ({ play: vi.fn() }));

/**
 * Creates a mock Vuex context where GET_SYNC_CANCEL_TOKEN is backed by a real
 * mutable variable, updated by commit('SET_SYNC_CANCEL_TOKEN', value).
 * This lets us faithfully test the token race conditions.
 */
function createSyncContext(getterOverrides = {}) {
  let syncCancelToken = null;

  const getters = {
    AM_I_HOST: false,
    IS_HOST_GRACE_PERIOD: false,
    GET_HOST_RESTORE_PENDING_ID: null,
    IS_IN_ROOM: true,
    IS_JOIN_SYNC_IN_PROGRESS: false,
    GET_SOCKET_ID: 'me-1',
    GET_HOST_ID: 'host-1',
    GET_HOST_USER: {
      id: 'host-1', username: 'Host', state: 'playing', time: 10000, updatedAt: Date.now(), playbackRate: 1,
    },
    GET_ADJUSTED_HOST_TIME: () => 10000,
    GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
    ...getterOverrides,
  };

  // Make GET_SYNC_CANCEL_TOKEN reactive via the mutable variable
  Object.defineProperty(getters, 'GET_SYNC_CANCEL_TOKEN', {
    get: () => syncCancelToken,
    enumerable: true,
  });

  const commit = vi.fn((mutation, value) => {
    if (mutation === 'SET_SYNC_CANCEL_TOKEN') {
      syncCancelToken = value;
    }
  });

  const dispatch = vi.fn().mockResolvedValue(undefined);

  const rootGetters = {
    'slplayer/IS_AUTOPLAY_BLOCKED': false,
  };

  return {
    getters, commit, dispatch, rootGetters, getSyncCancelToken: () => syncCancelToken,
  };
}

describe('Sync Token Deadlock (Bug 1)', () => {
  it('concurrent SYNC_PLAYER_STATE calls do not leave token stuck', async () => {
    // Simulate _SYNC_PLAYER_STATE taking some time to resolve
    const ctx = createSyncContext();
    ctx.dispatch.mockImplementation((action) => {
      if (action === '_SYNC_PLAYER_STATE') {
        // Simulate async work
        return new Promise((resolve) => { setTimeout(resolve, 10); });
      }
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing', time: 10000, duration: 100000, ratingKey: '123',
        });
      }
      return Promise.resolve();
    });

    // Fire 10 concurrent SYNC_PLAYER_STATE calls
    const promises = Array.from({ length: 10 }, () => actions.SYNC_PLAYER_STATE(ctx));

    await Promise.all(promises);

    // The token MUST be null after all operations complete — if it's stuck non-null,
    // all future sync operations will be silently skipped (deadlock)
    expect(ctx.getSyncCancelToken()).toBeNull();
  });

  it('token replacement during sync does not clear the newer token', async () => {
    // This tests the specific race:
    // 1. Sync A creates tokenA, starts _SYNC_PLAYER_STATE
    // 2. Something calls CANCEL_IN_PROGRESS_SYNC (aborts tokenA, sets token to null)
    // 3. Sync B creates tokenB, starts _SYNC_PLAYER_STATE
    // 4. Sync A's finally block runs — it must NOT clear tokenB

    let resolveA;
    let resolveB;
    const ctx = createSyncContext();

    let callCount = 0;
    ctx.dispatch.mockImplementation((action) => {
      if (action === '_SYNC_PLAYER_STATE') {
        callCount += 1;
        if (callCount === 1) {
          // Sync A: wait for manual resolve
          return new Promise((resolve) => { resolveA = resolve; });
        }
        // Sync B: wait for manual resolve
        return new Promise((resolve) => { resolveB = resolve; });
      }
      return Promise.resolve();
    });

    // Start Sync A
    const promiseA = actions.SYNC_PLAYER_STATE(ctx);
    // Let microtasks run so A's token is set
    await new Promise((r) => { setTimeout(r, 0); });
    const tokenA = ctx.getSyncCancelToken();
    expect(tokenA).not.toBeNull();

    // Simulate an external cancel (e.g., HANDLE_PLAYER_STATE_UPDATE calling CANCEL_IN_PROGRESS_SYNC)
    tokenA.abort('cancelled externally');
    ctx.commit('SET_SYNC_CANCEL_TOKEN', null);

    // Start Sync B (A hasn't finished its finally block yet since resolveA hasn't been called)
    const promiseB = actions.SYNC_PLAYER_STATE(ctx);
    await new Promise((r) => { setTimeout(r, 0); });
    const tokenB = ctx.getSyncCancelToken();
    expect(tokenB).not.toBeNull();
    expect(tokenB).not.toBe(tokenA);

    // Now resolve A's _SYNC_PLAYER_STATE — A's finally block will run
    resolveA();
    await promiseA;

    // CRITICAL ASSERTION: tokenB must still be the current token.
    // The bug is that A's finally block sees tokenB !== tokenA,
    // hits the else-if branch, and clears tokenB.
    expect(ctx.getSyncCancelToken()).toBe(tokenB);

    // Clean up
    resolveB();
    await promiseB;
    expect(ctx.getSyncCancelToken()).toBeNull();
  });

  it('SYNC_MEDIA_AND_PLAYER_STATE has the same token race protection', async () => {
    // Same pattern as above but for SYNC_MEDIA_AND_PLAYER_STATE
    let resolveA;
    let resolveB;
    const ctx = createSyncContext();

    let callCount = 0;
    ctx.dispatch.mockImplementation((action) => {
      if (action === '_SYNC_MEDIA_AND_PLAYER_STATE') {
        callCount += 1;
        if (callCount === 1) {
          return new Promise((resolve) => { resolveA = resolve; });
        }
        return new Promise((resolve) => { resolveB = resolve; });
      }
      return Promise.resolve();
    });

    const promiseA = actions.SYNC_MEDIA_AND_PLAYER_STATE(ctx);
    await new Promise((r) => { setTimeout(r, 0); });
    const tokenA = ctx.getSyncCancelToken();

    // External cancel
    tokenA.abort('cancelled');
    ctx.commit('SET_SYNC_CANCEL_TOKEN', null);

    const promiseB = actions.SYNC_MEDIA_AND_PLAYER_STATE(ctx);
    await new Promise((r) => { setTimeout(r, 0); });
    const tokenB = ctx.getSyncCancelToken();

    resolveA();
    await promiseA;

    // tokenB must survive A's finally block
    expect(ctx.getSyncCancelToken()).toBe(tokenB);

    resolveB();
    await promiseB;
    expect(ctx.getSyncCancelToken()).toBeNull();
  });
});

describe('MANUAL_SYNC token cleanup (Bug 5)', () => {
  it('MANUAL_SYNC does not orphan token when overwritten by concurrent sync', async () => {
    // 1. MANUAL_SYNC creates tokenM, starts plexclients/SYNC
    // 2. SYNC_PLAYER_STATE runs, overwrites tokenM with tokenS
    // 3. MANUAL_SYNC finishes — its === check fails, token must not be orphaned

    let resolveSync;
    const ctx = createSyncContext();

    ctx.dispatch.mockImplementation((action) => {
      if (action === 'CANCEL_IN_PROGRESS_SYNC') {
        // Actual implementation
        const token = ctx.getSyncCancelToken();
        if (token) {
          token.abort('Sync cancelled');
          ctx.commit('SET_SYNC_CANCEL_TOKEN', null);
        }
        return Promise.resolve();
      }
      if (action === 'plexclients/SYNC') {
        return new Promise((resolve) => { resolveSync = resolve; });
      }
      if (action === 'PROCESS_PLAYER_STATE_UPDATE') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    // Start MANUAL_SYNC
    const manualPromise = actions.MANUAL_SYNC(ctx);
    await new Promise((r) => { setTimeout(r, 0); });
    const tokenM = ctx.getSyncCancelToken();
    expect(tokenM).not.toBeNull();

    // Simulate concurrent operation overwriting the token
    // eslint-disable-next-line new-cap
    const tokenS = new CAF.cancelToken();
    ctx.commit('SET_SYNC_CANCEL_TOKEN', tokenS);

    // Resolve sync — MANUAL_SYNC's cleanup runs
    resolveSync();
    await manualPromise;

    // tokenS must not be cleared by MANUAL_SYNC's cleanup
    // (Currently MANUAL_SYNC only clears if === tokenM, which is correct.
    // But it should also not leave tokenM orphaned if it fails the check.)
    expect(ctx.getSyncCancelToken()).toBe(tokenS);
  });

  it('MANUAL_SYNC uses the shared plexclient sync strategy instead of direct seek', async () => {
    const ctx = createSyncContext();

    ctx.dispatch.mockImplementation((action) => {
      if (action === 'CANCEL_IN_PROGRESS_SYNC' || action === 'PROCESS_PLAYER_STATE_UPDATE') {
        return Promise.resolve();
      }
      if (action === 'plexclients/SYNC') {
        return Promise.resolve('synced');
      }
      return Promise.resolve();
    });

    await actions.MANUAL_SYNC(ctx);

    expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/SYNC', expect.anything(), { root: true });
    expect(ctx.dispatch).not.toHaveBeenCalledWith('plexclients/SEEK_TO', expect.anything(), { root: true });
    expect(ctx.getSyncCancelToken()).toBeNull();
  });
});

describe('Grace period blocks and unblocks sync', () => {
  it('SYNC_PLAYER_STATE returns early during grace period', async () => {
    const ctx = createSyncContext({ IS_HOST_GRACE_PERIOD: true });

    await actions.SYNC_PLAYER_STATE(ctx);

    // Should not have created a token or dispatched internal sync
    expect(ctx.dispatch).not.toHaveBeenCalledWith('_SYNC_PLAYER_STATE', expect.anything());
    expect(ctx.getSyncCancelToken()).toBeNull();
  });

  it('SYNC_MEDIA_AND_PLAYER_STATE returns early during grace period', async () => {
    const ctx = createSyncContext({ IS_HOST_GRACE_PERIOD: true });

    await actions.SYNC_MEDIA_AND_PLAYER_STATE(ctx);

    expect(ctx.dispatch).not.toHaveBeenCalledWith('_SYNC_MEDIA_AND_PLAYER_STATE', expect.anything());
    expect(ctx.getSyncCancelToken()).toBeNull();
  });

  it('SYNC_PLAYER_STATE proceeds after grace period clears', async () => {
    // Start with grace period active
    const ctx = createSyncContext({ IS_HOST_GRACE_PERIOD: true });
    await actions.SYNC_PLAYER_STATE(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalledWith('_SYNC_PLAYER_STATE', expect.anything());

    // Clear grace period
    ctx.getters.IS_HOST_GRACE_PERIOD = false;
    ctx.dispatch.mockImplementation((action) => {
      if (action === '_SYNC_PLAYER_STATE') return Promise.resolve();
      return Promise.resolve();
    });

    await actions.SYNC_PLAYER_STATE(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith('_SYNC_PLAYER_STATE', expect.anything());
  });
});

describe('Host leaving mid-sync (TOCTOU)', () => {
  it('_SYNC_MEDIA_AND_PLAYER_STATE does not throw when host leaves during timeline fetch', async () => {
    const ctx = createSyncContext();

    // Host disappears during the FETCH_TIMELINE_POLL_DATA_CACHE await
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        ctx.getters.GET_HOST_USER = undefined;
        return Promise.resolve({ state: 'playing' });
      }
      return Promise.resolve();
    });

    // Should not throw — must re-check GET_HOST_USER after each await
    await expect(actions._SYNC_MEDIA_AND_PLAYER_STATE(ctx, null)).resolves.not.toThrow();
  });

  it('_SYNC_MEDIA_AND_PLAYER_STATE does not throw when host leaves during FIND_BEST_MEDIA_MATCH', async () => {
    const ctx = createSyncContext({
      GET_HOST_USER: {
        id: 'host-1',
        state: 'playing',
        time: 0,
        updatedAt: Date.now(),
        playbackRate: 1,
        media: { ratingKey: 'k1', title: 'Show' },
      },
    });
    ctx.rootGetters['settings/GET_AUTOPLAY'] = true;
    ctx.rootGetters['plexclients/IS_THIS_MEDIA_PLAYING'] = () => true;

    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({ state: 'playing' });
      }
      if (action === 'plexservers/FIND_BEST_MEDIA_MATCH') {
        ctx.getters.GET_HOST_USER = undefined;
        return Promise.resolve(null);
      }
      return Promise.resolve();
    });

    await expect(actions._SYNC_MEDIA_AND_PLAYER_STATE(ctx, null)).resolves.not.toThrow();
  });

  it('_SYNC_PLAYER_STATE does not throw when host leaves during timeline fetch', async () => {
    const ctx = createSyncContext();

    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        ctx.getters.GET_HOST_USER = undefined;
        return Promise.resolve({ state: 'playing' });
      }
      return Promise.resolve();
    });

    await expect(actions._SYNC_PLAYER_STATE(ctx, null)).resolves.not.toThrow();
  });
});

describe('Reconnection listener cleanup (Bug 2)', () => {
  it('ADD_EVENT_HANDLERS registers socket listeners', async () => {
    const { on } = await import('@/socket');
    on.mockClear();

    const ctx = createSyncContext();
    actions.ADD_EVENT_HANDLERS(ctx);

    // Should register handlers for all expected events
    const registeredEvents = on.mock.calls.map((call) => call[0].eventName);
    expect(registeredEvents).toContain('playerStateUpdate');
    expect(registeredEvents).toContain('disconnect');
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('newHost');
  });

  it('calling ADD_EVENT_HANDLERS twice removes old listeners before re-adding', async () => {
    const { on, off } = await import('@/socket');
    on.mockClear();
    off.mockClear();

    const ctx = createSyncContext();
    // Need dispatch to actually call REMOVE_EVENT_HANDLERS
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'REMOVE_EVENT_HANDLERS') {
        return actions.REMOVE_EVENT_HANDLERS(ctx);
      }
      return Promise.resolve();
    });

    actions.ADD_EVENT_HANDLERS(ctx);

    // Second call should remove old listeners first via off()
    off.mockClear();
    actions.ADD_EVENT_HANDLERS(ctx);

    // off() should have been called for each event to clean up old listeners
    expect(off.mock.calls.length).toBeGreaterThan(0);
    const removedEvents = off.mock.calls.map((call) => call[0].eventName);
    expect(removedEvents).toContain('playerStateUpdate');
    expect(removedEvents).toContain('disconnect');
    expect(removedEvents).toContain('connect');
  });
});

describe('Post-buffering sync cooldown', () => {
  it('PROCESS_PLAYER_STATE_UPDATE skips sync immediately after buffering ends', async () => {
    const ctx = createSyncContext();

    const mockDispatch = (action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'buffering', time: 5000, duration: 100000,
        });
      }
      if (action === 'PROCESS_UPNEXT') return Promise.resolve();
      if (action === 'SYNC_PLAYER_STATE') return Promise.resolve();
      return Promise.resolve();
    };

    // First call with buffering state — sets the cooldown timestamp
    ctx.dispatch.mockImplementation(mockDispatch);
    await actions.PROCESS_PLAYER_STATE_UPDATE(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');

    // Immediately after: buffering ends, state becomes 'playing'
    ctx.dispatch.mockClear();
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'playing', time: 5000, duration: 100000, ratingKey: '123',
        });
      }
      if (action === 'PROCESS_UPNEXT') return Promise.resolve();
      if (action === 'SYNC_PLAYER_STATE') return Promise.resolve();
      return Promise.resolve();
    });

    await actions.PROCESS_PLAYER_STATE_UPDATE(ctx);

    // Should NOT sync during cooldown — prevents buffering→seek→rebuffer loop
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');
  });
});

describe('Autoplay-muted client sync', () => {
  it('resumes a paused client when the host is playing even if unmute is still required', async () => {
    const ctx = createSyncContext();
    ctx.rootGetters['slplayer/IS_AUTOPLAY_BLOCKED'] = true;
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'paused', time: 10000, duration: 100000,
        });
      }
      return Promise.resolve();
    });
    const cancelSignal = new AbortController().signal;

    await actions._SYNC_PLAYER_STATE(ctx, cancelSignal);

    expect(ctx.dispatch).toHaveBeenCalledWith(
      'plexclients/PRESS_PLAY',
      cancelSignal,
      { root: true },
    );
  });

  it('waits for the matching command acknowledgment before resuming synchronization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const ctx = createSyncContext();
    const hostUser = ctx.getters.GET_HOST_USER;
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
        return Promise.resolve({
          state: 'paused', time: 10000, duration: 100000,
        });
      }
      return Promise.resolve();
    });

    actions.MARK_PARTY_PAUSE_RECEIVED(null, {
      isPause: true,
      requestId: 'request-1',
    });
    await vi.advanceTimersByTimeAsync(6000);
    await actions._SYNC_PLAYER_STATE(ctx, new AbortController().signal);

    expect(ctx.dispatch).not.toHaveBeenCalledWith(
      'plexclients/PRESS_PLAY',
      expect.anything(),
      { root: true },
    );

    expect(actions.ACKNOWLEDGE_PARTY_PAUSE(null, 'stale-request')).toBe(false);
    hostUser.state = 'paused';
    await actions._SYNC_PLAYER_STATE(ctx, new AbortController().signal);
    hostUser.state = 'playing';
    await actions._SYNC_PLAYER_STATE(ctx, new AbortController().signal);
    expect(ctx.dispatch).not.toHaveBeenCalledWith(
      'plexclients/PRESS_PLAY',
      expect.anything(),
      { root: true },
    );
    expect(actions.ACKNOWLEDGE_PARTY_PAUSE(null, 'request-1')).toBe(true);

    hostUser.state = 'paused';
    await actions._SYNC_PLAYER_STATE(ctx, new AbortController().signal);
    hostUser.state = 'playing';
    await actions._SYNC_PLAYER_STATE(ctx, new AbortController().signal);

    expect(ctx.dispatch).toHaveBeenCalledWith(
      'plexclients/PRESS_PLAY',
      expect.anything(),
      { root: true },
    );
    vi.useRealTimers();
  });
});

describe('Sync poll interval guards', () => {
  it('START_SYNC_POLL_INTERVAL guards against running sync when token exists', async () => {
    vi.useFakeTimers();
    const ctx = createSyncContext();

    // Set a non-null token to simulate an in-progress sync
    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();
    ctx.commit('SET_SYNC_CANCEL_TOKEN', token);

    ctx.commit.mockClear();
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'STOP_SYNC_POLL_INTERVAL') return Promise.resolve();
      return Promise.resolve();
    });

    actions.START_SYNC_POLL_INTERVAL(ctx);

    // Advance past the 5s interval
    vi.advanceTimersByTime(5500);

    // Should NOT have dispatched SYNC_PLAYER_STATE because token is non-null
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');

    vi.useRealTimers();
  });

  it('blocks all general sync entry points while host restoration is pending', async () => {
    vi.useFakeTimers();
    const ctx = createSyncContext({ GET_HOST_RESTORE_PENDING_ID: 'host-1' });

    await actions.SYNC_MEDIA_AND_PLAYER_STATE(ctx);
    await actions.SYNC_PLAYER_STATE(ctx);
    actions.START_SYNC_POLL_INTERVAL(ctx);
    await vi.advanceTimersByTimeAsync(5500);

    expect(ctx.dispatch).not.toHaveBeenCalledWith('_SYNC_MEDIA_AND_PLAYER_STATE', expect.anything());
    expect(ctx.dispatch).not.toHaveBeenCalledWith('_SYNC_PLAYER_STATE', expect.anything());
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');
    expect(ctx.getSyncCancelToken()).toBeNull();
    vi.useRealTimers();
  });
});
