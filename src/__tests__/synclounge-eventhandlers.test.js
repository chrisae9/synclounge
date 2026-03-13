import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import eventhandlers from '@/store/modules/synclounge/eventhandlers';

vi.mock('@/socket', () => ({
  emit: vi.fn(),
  waitForEvent: vi.fn(),
  getId: vi.fn(),
}));

function createMockContext(getterOverrides = {}) {
  const getters = {
    GET_HOST_ID: 'host-1',
    GET_SOCKET_ID: 'me-1',
    IS_HOST_GRACE_PERIOD: false,
    GET_HOST_GRACE_TIMEOUT_ID: null,
    GET_PENDING_HOST_ID: null,
    GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: null,
    GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
    IS_JOIN_SYNC_IN_PROGRESS: false,
    AM_I_HOST: false,
    ...getterOverrides,
  };
  return {
    getters,
    commit: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CLEAR_HOST_GRACE_PERIOD', () => {
  it('clears timeout when one exists', () => {
    const timeoutId = setTimeout(() => {}, 99999);
    const ctx = createMockContext({ GET_HOST_GRACE_TIMEOUT_ID: timeoutId });

    eventhandlers.CLEAR_HOST_GRACE_PERIOD(ctx);

    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_TIMEOUT_ID', null);
  });

  it('no-ops on clearTimeout when ID is null', () => {
    const ctx = createMockContext({ GET_HOST_GRACE_TIMEOUT_ID: null });
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    eventhandlers.CLEAR_HOST_GRACE_PERIOD(ctx);

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('always resets all 3 grace period state fields', () => {
    const ctx = createMockContext({ GET_HOST_GRACE_TIMEOUT_ID: null });

    eventhandlers.CLEAR_HOST_GRACE_PERIOD(ctx);

    expect(ctx.commit).toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', false);
    expect(ctx.commit).toHaveBeenCalledWith('SET_PENDING_HOST_ID', null);
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', null);
  });
});

describe('HANDLE_USER_JOINED', () => {
  it('always adds user and sends join message', async () => {
    const ctx = createMockContext();

    await eventhandlers.HANDLE_USER_JOINED(ctx, { id: 'u1', username: 'Alice' });

    expect(ctx.commit).toHaveBeenCalledWith('SET_USER', expect.objectContaining({
      id: 'u1',
      data: expect.objectContaining({ username: 'Alice' }),
    }));
    expect(ctx.dispatch).toHaveBeenCalledWith('ADD_MESSAGE_AND_CACHE_AND_NOTIFY', expect.objectContaining({
      senderId: 'u1',
      text: 'Alice joined',
    }));
  });

  it('no reclaim when not in grace period', async () => {
    const ctx = createMockContext({ IS_HOST_GRACE_PERIOD: false });

    await eventhandlers.HANDLE_USER_JOINED(ctx, { id: 'u1', username: 'Alice' });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
  });

  it('no reclaim when username does not match', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Bob',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, { id: 'u1', username: 'Alice' });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
  });

  it('reclaims host when username matches during grace period', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, { id: 'u1', username: 'Alice' });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'u1');
    expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  });

  it('catches sync error after host reclaim (Bug 4)', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
    });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'SYNC_MEDIA_AND_PLAYER_STATE') {
        return Promise.reject(new Error('sync failed'));
      }
      return Promise.resolve();
    });

    // Should not throw
    await eventhandlers.HANDLE_USER_JOINED(ctx, { id: 'u1', username: 'Alice' });
  });
});

describe('HANDLE_NEW_HOST', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('reclaim', () => {
    it('original host reconnects — clears grace period, sets host, syncs', async () => {
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_USER: (id) => ({ username: id === 'alice-new' ? 'Alice' : `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'alice-new');

      expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'alice-new');
      expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
    });

    it('non-matching user does not reclaim', async () => {
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_USER: (id) => ({ username: id === 'bob-1' ? 'Bob' : `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'bob-1');

      expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    });
  });

  describe('Bug 2: undefined previous host', () => {
    it('previous host not in users map — skips grace period, accepts directly', async () => {
      const ctx = createMockContext({
        GET_HOST_ID: 'gone-host',
        GET_USER: (id) => {
          if (id === 'gone-host') return undefined;
          return { username: `user-${id}`, state: 'playing', time: 0 };
        },
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host');

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'new-host');
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
    });

    it('previous host exists — stores username, starts grace period', async () => {
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host');

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', 'user-old-host');
      expect(ctx.commit).toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
      expect(ctx.commit).toHaveBeenCalledWith('SET_PENDING_HOST_ID', 'new-host');
    });
  });

  describe('Bug 1: cascading disconnect', () => {
    it('second call during active grace period clears old timer before creating new', async () => {
      const oldTimeout = 12345;
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_TIMEOUT_ID: oldTimeout,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_HOST_ID: 'old-host',
        // new-host-2 username doesn't match Alice, so no reclaim
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host-2');

      expect(clearSpy).toHaveBeenCalledWith(oldTimeout);
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_TIMEOUT_ID', null);
      clearSpy.mockRestore();
    });
  });

  describe('timeout callback', () => {
    it('timer fires after 10s — commits pending host as actual host', async () => {
      // Track mutable grace period state so the timeout callback sees updated values
      let isGracePeriod = false;
      let pendingHostId = null;
      let timeoutId = null;
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      // Make getters reactive to our mutable tracking vars
      Object.defineProperty(ctx.getters, 'IS_HOST_GRACE_PERIOD', { get: () => isGracePeriod });
      Object.defineProperty(ctx.getters, 'GET_PENDING_HOST_ID', { get: () => pendingHostId });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_TIMEOUT_ID', { get: () => timeoutId });

      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_IS_HOST_GRACE_PERIOD') isGracePeriod = value;
        if (mutation === 'SET_PENDING_HOST_ID') pendingHostId = value;
        if (mutation === 'SET_HOST_GRACE_TIMEOUT_ID') timeoutId = value;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host');

      expect(isGracePeriod).toBe(true);
      expect(pendingHostId).toBe('new-host');

      // Fire the 10s timer
      await vi.advanceTimersByTimeAsync(10000);

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'new-host');
    });

    it('Bug 3: timer fires after grace period resolved — no-ops', async () => {
      let isGracePeriod = false;
      let pendingHostId = null;
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      Object.defineProperty(ctx.getters, 'IS_HOST_GRACE_PERIOD', { get: () => isGracePeriod });
      Object.defineProperty(ctx.getters, 'GET_PENDING_HOST_ID', { get: () => pendingHostId });

      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_IS_HOST_GRACE_PERIOD') isGracePeriod = value;
        if (mutation === 'SET_PENDING_HOST_ID') pendingHostId = value;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host');

      // Simulate grace period resolved before timer fires
      isGracePeriod = false;
      pendingHostId = null;

      ctx.commit.mockClear();
      await vi.advanceTimersByTimeAsync(10000);

      // Should not have set a new host
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_HOST_ID', expect.anything());
    });

    it('Bug 4: sync error in timeout callback is caught', async () => {
      let isGracePeriod = false;
      let pendingHostId = null;
      let timeoutId = null;
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      Object.defineProperty(ctx.getters, 'IS_HOST_GRACE_PERIOD', { get: () => isGracePeriod });
      Object.defineProperty(ctx.getters, 'GET_PENDING_HOST_ID', { get: () => pendingHostId });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_TIMEOUT_ID', { get: () => timeoutId });

      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_IS_HOST_GRACE_PERIOD') isGracePeriod = value;
        if (mutation === 'SET_PENDING_HOST_ID') pendingHostId = value;
        if (mutation === 'SET_HOST_GRACE_TIMEOUT_ID') timeoutId = value;
      });
      ctx.dispatch.mockImplementation((action) => {
        if (action === 'SYNC_MEDIA_AND_PLAYER_STATE') {
          return Promise.reject(new Error('sync failed'));
        }
        return Promise.resolve();
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'new-host');

      // Should not throw when timer fires
      await vi.advanceTimersByTimeAsync(10000);

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'new-host');
    });
  });
});

describe('HANDLE_PLAYER_STATE_UPDATE', () => {
  describe('grace period guard', () => {
    it('ignores updates from pending host during grace period', async () => {
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_PENDING_HOST_ID: 'pending-1',
      });

      await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
        id: 'pending-1', state: 'playing', time: 5000,
      });

      expect(ctx.commit).not.toHaveBeenCalledWith('SET_USER_PLAYER_STATE', expect.anything());
    });

    it('allows updates from other users during grace period', async () => {
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_PENDING_HOST_ID: 'pending-1',
      });

      await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
        id: 'other-user', state: 'playing', time: 5000,
      });

      expect(ctx.commit).toHaveBeenCalledWith('SET_USER_PLAYER_STATE', expect.objectContaining({
        id: 'other-user',
      }));
    });
  });
});
