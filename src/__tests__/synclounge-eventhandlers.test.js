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
    GET_HOST_GRACE_PREVIOUS_HOST_THUMB: null,
    GET_HOST_GRACE_PREVIOUS_HOST_STATE: null,
    GET_HOST_GRACE_RESTORE_DEADLINE_AT: null,
    GET_HOST_RESTORE_PENDING_ID: null,
    GET_HOST_RESTORE_EXPECTED_STATE: null,
    GET_HOST_RESTORE_TIMEOUT_ID: null,
    GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
    IS_JOIN_SYNC_IN_PROGRESS: false,
    AM_I_HOST: false,
    ...getterOverrides,
  };
  return {
    getters,
    rootGetters: {
      'slplayer/IS_CHANGING_SOURCE': false,
      'slplayer/IS_PLAY_QUEUE_TRANSITIONING': false,
    },
    commit: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HANDLE_PARTY_PAUSE', () => {
  it('records the requested state before applying the party pause', async () => {
    const ctx = createMockContext();

    await eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1',
      isPause: true,
      requestId: 'request-1',
    });

    const graceCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'MARK_PARTY_PAUSE_RECEIVED')
    ];
    const pauseCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/PRESS_PAUSE')
    ];
    expect(ctx.dispatch).toHaveBeenCalledWith('MARK_PARTY_PAUSE_RECEIVED', {
      isPause: true,
      requestId: 'request-1',
    });
    expect(graceCall).toBeLessThan(pauseCall);
  });

  it('publishes the host playback result as an acknowledgment', async () => {
    const ctx = createMockContext({ AM_I_HOST: true });

    await eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1',
      isPause: false,
      requestId: 'request-1',
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/REFRESH_PLAYER_STATE', null, {
      root: true,
    });
    expect(ctx.dispatch).toHaveBeenCalledWith('SEND_PARTY_PAUSE_ACK', 'request-1');
    const playCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/PRESS_PLAY')
    ];
    const updateCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/REFRESH_PLAYER_STATE')
    ];
    expect(playCall).toBeLessThan(updateCall);
  });

  it('serializes commands so the latest request determines the final host state', async () => {
    let resolvePlay;
    const playPromise = new Promise((resolve) => { resolvePlay = resolve; });
    const ctx = createMockContext({ AM_I_HOST: true });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/PRESS_PLAY') return playPromise;
      return Promise.resolve();
    });

    const playCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: false, requestId: 'request-1',
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PLAY', null, {
        root: true,
      });
    });

    const pauseCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: true, requestId: 'request-2',
    });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(ctx.dispatch).not.toHaveBeenCalledWith('plexclients/PRESS_PAUSE', null, {
      root: true,
    });

    resolvePlay();
    await Promise.all([playCommand, pauseCommand]);

    const playCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/PRESS_PLAY')
    ];
    const pauseCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/PRESS_PAUSE')
    ];
    expect(playCall).toBeLessThan(pauseCall);
  });

  it('accepts the latest acknowledgment even when it overtakes a queued command', async () => {
    let pendingRequestId = null;
    let resolvePlay;
    const playPromise = new Promise((resolve) => { resolvePlay = resolve; });
    const ctx = createMockContext();
    ctx.dispatch.mockImplementation((action, payload) => {
      if (action === 'MARK_PARTY_PAUSE_RECEIVED') {
        pendingRequestId = payload.requestId;
      }
      if (action === 'ACKNOWLEDGE_PARTY_PAUSE') {
        if (pendingRequestId !== payload) return Promise.resolve(false);
        pendingRequestId = null;
        return Promise.resolve(true);
      }
      if (action === 'plexclients/PRESS_PLAY') return playPromise;
      return Promise.resolve();
    });

    const playCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: false, requestId: 'request-1',
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PLAY', null, {
        root: true,
      });
    });

    const pauseCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: true, requestId: 'request-2',
    });
    await Promise.resolve();
    expect(pendingRequestId).toBe('request-2');

    await eventhandlers.HANDLE_PARTY_PAUSE_ACK(ctx, { requestId: 'request-2' });
    expect(pendingRequestId).toBeNull();

    resolvePlay();
    await Promise.all([playCommand, pauseCommand]);
    expect(pendingRequestId).toBeNull();
  });

  it('still applies a queued command after its sender leaves the room', async () => {
    let senderPresent = true;
    let resolvePlay;
    const playPromise = new Promise((resolve) => { resolvePlay = resolve; });
    const ctx = createMockContext({
      GET_USER: (id) => (id === 'guest-2' && !senderPresent
        ? undefined
        : { username: `user-${id}` }),
    });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/PRESS_PLAY') return playPromise;
      return Promise.resolve();
    });

    const playCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: false, requestId: 'request-1',
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PLAY', null, {
        root: true,
      });
    });
    const pauseCommand = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-2', isPause: true, requestId: 'request-2',
    });
    senderPresent = false;

    resolvePlay();
    await Promise.all([playCommand, pauseCommand]);

    expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PAUSE', null, {
      root: true,
    });
  });

  it('invalidates old-room work without blocking new-room commands', async () => {
    let amHost = false;
    let resolvePlay;
    const playPromise = new Promise((resolve) => { resolvePlay = resolve; });
    const ctx = createMockContext();
    Object.defineProperty(ctx.getters, 'AM_I_HOST', { get: () => amHost });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/PRESS_PLAY') return playPromise;
      return Promise.resolve();
    });

    const oldPlay = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: false, requestId: 'old-request-1',
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PLAY', null, {
        root: true,
      });
    });
    const oldPause = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: true, requestId: 'old-request-2',
    });

    eventhandlers.INVALIDATE_PARTY_PAUSE_COMMANDS();
    amHost = true;
    const newPause = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-2', isPause: true, requestId: 'new-request-1',
    });
    await newPause;

    expect(ctx.dispatch).toHaveBeenCalledWith('SEND_PARTY_PAUSE_ACK', 'new-request-1');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SEND_PARTY_PAUSE_ACK', 'old-request-1');

    resolvePlay();
    await Promise.all([oldPlay, oldPause]);
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SEND_PARTY_PAUSE_ACK', 'old-request-2');
  });

  it('does not acknowledge old-room work invalidated during host state refresh', async () => {
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => { resolveRefresh = resolve; });
    const ctx = createMockContext({ AM_I_HOST: true });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'plexclients/REFRESH_PLAYER_STATE') return refreshPromise;
      return Promise.resolve();
    });

    const command = eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: true, requestId: 'old-request-1',
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('plexclients/REFRESH_PLAYER_STATE', null, {
        root: true,
      });
    });

    eventhandlers.INVALIDATE_PARTY_PAUSE_COMMANDS();
    resolveRefresh();
    await command;

    expect(ctx.dispatch).not.toHaveBeenCalledWith('SEND_PARTY_PAUSE_ACK', 'old-request-1');
  });

  it('refreshes actual paused state before sending the host acknowledgment', async () => {
    const ctx = createMockContext({ AM_I_HOST: true });

    await eventhandlers.HANDLE_PARTY_PAUSE(ctx, {
      senderId: 'guest-1', isPause: true, requestId: 'request-1',
    });

    const pauseCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/PRESS_PAUSE')
    ];
    const refreshCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'plexclients/REFRESH_PLAYER_STATE')
    ];
    const ackCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([type]) => type === 'SEND_PARTY_PAUSE_ACK')
    ];
    expect(ctx.dispatch).toHaveBeenCalledWith('ACKNOWLEDGE_PARTY_PAUSE', 'request-1');
    expect(pauseCall).toBeLessThan(refreshCall);
    expect(refreshCall).toBeLessThan(ackCall);
    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_PENDING_PARTY_PAUSE');
  });
});

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

  it('always resets grace period state fields', () => {
    const ctx = createMockContext({ GET_HOST_GRACE_TIMEOUT_ID: null });

    eventhandlers.CLEAR_HOST_GRACE_PERIOD(ctx);

    expect(ctx.commit).toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', false);
    expect(ctx.commit).toHaveBeenCalledWith('SET_PENDING_HOST_ID', null);
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', null);
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_STATE', null);
  });
});

describe('HANDLE_USER_JOINED', () => {
  it('always adds user and sends join message', async () => {
    const ctx = createMockContext();

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

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

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
  });

  it('no reclaim when username does not match', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Bob',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
  });

  it('does not reclaim a returning host before its media is restored', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'stopped', media: null,
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });

  it('reclaims host when username matches during grace period and this client is pending host', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'u1');
    expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  });

  it('leaves host grace untouched when a bystander recognizes the returning host', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'other-pending-host',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      AM_I_HOST: false,
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).not.toHaveBeenCalledWith('SET_HOST_ID', 'u1');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });

  it('reclaims host when username matches after server suffix change', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice(2)',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice(1)', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'u1');
  });

  it('reclaims host by thumb even when username changed', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'OldName',
      GET_HOST_GRACE_PREVIOUS_HOST_THUMB: 'https://plex.tv/avatar/abc',
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1',
      username: 'NewName',
      thumb: 'https://plex.tv/avatar/abc',
      state: 'playing',
      media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'u1');
  });

  it('pending host reclaim dispatches TRANSFER_HOST to notify server', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      AM_I_HOST: false,
    });

    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
    expect(ctx.dispatch).toHaveBeenCalledWith('INVALIDATE_PARTY_PAUSE_COMMANDS');
    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_PENDING_PARTY_PAUSE');
    const invalidateCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(
        ([action]) => action === 'INVALIDATE_PARTY_PAUSE_COMMANDS',
      )
    ];
    const hostCall = ctx.commit.mock.invocationCallOrder[
      ctx.commit.mock.calls.findIndex(([mutation]) => mutation === 'SET_HOST_ID')
    ];
    expect(invalidateCall).toBeLessThan(hostCall);
  });

  it('catches sync error after host reclaim (Bug 4)', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
    });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'SYNC_MEDIA_AND_PLAYER_STATE') {
        return Promise.reject(new Error('sync failed'));
      }
      return Promise.resolve();
    });

    // Should not throw
    await eventhandlers.HANDLE_USER_JOINED(ctx, {
      id: 'u1', username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' },
    });
  });
});

describe('returning host media readiness', () => {
  it('does not reclaim while the returning host is still buffering restored media', async () => {
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      GET_USER: () => ({ username: 'Alice', state: 'buffering', time: 5000 }),
    });

    await eventhandlers.HANDLE_MEDIA_UPDATE(ctx, {
      id: 'u1',
      state: 'buffering',
      time: 5000,
      duration: 100000,
      playbackRate: 1,
      media: { ratingKey: 'movie-1' },
      makeHost: false,
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).not.toHaveBeenCalledWith('SET_HOST_ID', 'u1');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });
});

describe('HANDLE_NEW_HOST', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('socket-originated newHost (explicit transfer / auto-host)', () => {
    it('accepts immediately when receiving self as host', async () => {
      const ctx = createMockContext({
        GET_SOCKET_ID: 'me-1',
        IS_HOST_GRACE_PERIOD: true,
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'me-1');

      expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'me-1');
      expect(ctx.dispatch).toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
    });

    it('sender accepts new host immediately without grace period', async () => {
      const ctx = createMockContext({
        GET_SOCKET_ID: 'me-1',
        GET_HOST_ID: 'me-1',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      // Sender receives newHost for someone else (explicit transfer)
      await eventhandlers.HANDLE_NEW_HOST(ctx, 'other-user');

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'other-user');
      expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_PENDING_PARTY_PAUSE');
      expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
      // Must NOT enter grace period
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
    });

    it('enters grace period when previousHostLeft even for self', async () => {
      const ctx = createMockContext({
        GET_SOCKET_ID: 'me-1',
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'me-1', previousHostLeft: true });

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_USERNAME', 'user-old-host');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_PREVIOUS_HOST_STATE', 'playing');
      expect(ctx.commit).toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
      expect(ctx.commit).toHaveBeenCalledWith('SET_PENDING_HOST_ID', 'me-1');
    });
  });

  describe('duplicate guard', () => {
    it('no-ops when hostId already matches and not in grace period', async () => {
      const ctx = createMockContext({
        GET_HOST_ID: 'host-1',
        IS_HOST_GRACE_PERIOD: false,
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'host-1');

      expect(ctx.commit).not.toHaveBeenCalledWith('SET_HOST_ID', expect.anything());
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', expect.anything());
    });

    it('does not no-op when hostId matches but grace period is active', async () => {
      const ctx = createMockContext({
        GET_HOST_ID: 'host-1',
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'SomeUser',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, 'host-1');

      // Should proceed past the duplicate guard (not return early)
      expect(ctx.commit).toHaveBeenCalled();
    });
  });

  describe('reclaim', () => {
    it('original host reconnects — clears grace period, sets host, syncs', async () => {
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_HOST_GRACE_PREVIOUS_HOST_STATE: 'playing',
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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'bob-1', previousHostLeft: true });

      expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    });

    it('does not sync a server-elected returning host before playback is ready', async () => {
      let restorePendingId = null;
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_HOST_GRACE_PREVIOUS_HOST_STATE: 'playing',
        GET_USER: (id) => (id === 'alice-new'
          ? { username: 'Alice', state: 'buffering', media: null }
          : { username: `user-${id}`, state: 'playing', media: { ratingKey: 'movie-1' } }),
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
        get: () => restorePendingId,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = value;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, {
        hostId: 'alice-new',
        previousHostLeft: true,
      });

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'alice-new');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_RESTORE_PENDING_ID', 'alice-new');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_RESTORE_EXPECTED_STATE', 'playing');
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_RESTORE_TIMEOUT_ID', expect.anything());
      expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
      const pendingCall = ctx.commit.mock.invocationCallOrder[
        ctx.commit.mock.calls.findIndex(([mutation]) => mutation === 'SET_HOST_RESTORE_PENDING_ID')
      ];
      const messageCall = ctx.dispatch.mock.invocationCallOrder[
        ctx.dispatch.mock.calls.findIndex(
          ([action]) => action === 'ADD_MESSAGE_AND_CACHE_AND_NOTIFY',
        )
      ];
      const hostCall = ctx.commit.mock.invocationCallOrder[
        ctx.commit.mock.calls.findIndex(([mutation]) => mutation === 'SET_HOST_ID')
      ];
      const timeoutCall = ctx.commit.mock.invocationCallOrder[
        ctx.commit.mock.calls.findIndex(([mutation]) => mutation === 'SET_HOST_RESTORE_TIMEOUT_ID')
      ];
      expect(hostCall).toBeLessThan(timeoutCall);
      expect(pendingCall).toBeLessThan(messageCall);
    });

    it('falls back to one full sync when an elected host never becomes ready', async () => {
      vi.setSystemTime(1000);
      let restorePendingId = null;
      let restoreTimeoutId = null;
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_HOST_GRACE_RESTORE_DEADLINE_AT: 2000,
        GET_USER: (id) => (id === 'alice-new'
          ? { username: 'Alice', state: 'buffering', media: null }
          : { username: `user-${id}`, state: 'playing', media: { ratingKey: 'movie-1' } }),
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
        get: () => restorePendingId,
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_TIMEOUT_ID', {
        get: () => restoreTimeoutId,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = value;
        if (mutation === 'SET_HOST_RESTORE_TIMEOUT_ID') restoreTimeoutId = value;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, {
        hostId: 'alice-new',
        previousHostLeft: true,
      });
      await vi.advanceTimersByTimeAsync(1000);

      expect(restorePendingId).toBeNull();
      expect(ctx.dispatch.mock.calls.filter(
        ([action]) => action === 'SYNC_MEDIA_AND_PLAYER_STATE',
      )).toHaveLength(1);
    });

    it('does not run an expired restore timeout before grace is cleared', async () => {
      vi.setSystemTime(1000);
      let restorePendingId = null;
      let restoreTimeoutId = null;
      let isGracePeriod = true;
      let resolveClearGrace;
      const clearGracePromise = new Promise((resolve) => { resolveClearGrace = resolve; });
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_HOST_GRACE_PREVIOUS_HOST_STATE: 'playing',
        GET_HOST_GRACE_RESTORE_DEADLINE_AT: 1000,
        GET_USER: (id) => (id === 'alice-new'
          ? { username: 'Alice', state: 'buffering', media: null }
          : { username: `user-${id}`, state: 'playing', media: { ratingKey: 'movie-1' } }),
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
        get: () => restorePendingId,
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_TIMEOUT_ID', {
        get: () => restoreTimeoutId,
      });
      Object.defineProperty(ctx.getters, 'IS_HOST_GRACE_PERIOD', {
        get: () => isGracePeriod,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = value;
        if (mutation === 'SET_HOST_RESTORE_TIMEOUT_ID') restoreTimeoutId = value;
      });
      ctx.dispatch.mockImplementation((action) => {
        if (action === 'CLEAR_HOST_GRACE_PERIOD') return clearGracePromise;
        return Promise.resolve();
      });

      const newHost = eventhandlers.HANDLE_NEW_HOST(ctx, {
        hostId: 'alice-new', previousHostLeft: true,
      });
      await vi.waitFor(() => {
        expect(restorePendingId).toBe('alice-new');
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');

      isGracePeriod = false;
      resolveClearGrace();
      await newHost;
      await vi.advanceTimersByTimeAsync(0);
      expect(ctx.dispatch.mock.calls.filter(
        ([action]) => action === 'SYNC_MEDIA_AND_PLAYER_STATE',
      )).toHaveLength(1);
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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host', previousHostLeft: true });

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'new-host');
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_IS_HOST_GRACE_PERIOD', true);
    });

    it('previous host exists — stores username, starts grace period', async () => {
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host', previousHostLeft: true });

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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host-2', previousHostLeft: true });

      expect(clearSpy).toHaveBeenCalledWith(oldTimeout);
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_GRACE_TIMEOUT_ID', null);
      clearSpy.mockRestore();
    });

    it('preserves the absolute restoration deadline across temporary host elections', async () => {
      vi.setSystemTime(10000);
      let timeoutId = null;
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_HOST_GRACE_TIMEOUT_ID: null,
        GET_HOST_GRACE_RESTORE_DEADLINE_AT: 11000,
        GET_PENDING_HOST_ID: 'temporary-host-2',
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_TIMEOUT_ID', {
        get: () => timeoutId,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_HOST_GRACE_TIMEOUT_ID') timeoutId = value;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, {
        hostId: 'temporary-host-2', previousHostLeft: true,
      });
      await vi.advanceTimersByTimeAsync(1000);

      expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    });
  });

  describe('timeout callback', () => {
    it('does not extend the restoration deadline when the host reconnects repeatedly', async () => {
      vi.setSystemTime(1000);
      let timeoutId = null;
      let restoreDeadline = null;
      const ctx = createMockContext({
        IS_HOST_GRACE_PERIOD: true,
        GET_PENDING_HOST_ID: 'me-1',
        GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_TIMEOUT_ID', {
        get: () => timeoutId,
      });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_RESTORE_DEADLINE_AT', {
        get: () => restoreDeadline,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_HOST_GRACE_TIMEOUT_ID') timeoutId = value;
        if (mutation === 'SET_HOST_GRACE_RESTORE_DEADLINE_AT') restoreDeadline = value;
      });

      await eventhandlers.HANDLE_USER_JOINED(ctx, {
        id: 'returning-1', username: 'Alice', state: 'buffering', media: { ratingKey: 'movie-1' },
      });
      const originalDeadline = restoreDeadline;

      await vi.advanceTimersByTimeAsync(29000);
      await eventhandlers.HANDLE_USER_JOINED(ctx, {
        id: 'returning-2', username: 'Alice', state: 'buffering', media: { ratingKey: 'movie-1' },
      });

      expect(restoreDeadline).toBe(originalDeadline);
      await vi.advanceTimersByTimeAsync(1000);
      expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    });

    it('gives a recognized returning host time to finish restoring playback', async () => {
      let isGracePeriod = false;
      let pendingHostId = null;
      let timeoutId = null;
      let previousHostUsername = null;
      const users = {
        'old-host': { username: 'Alice', state: 'playing', media: { ratingKey: 'movie-1' } },
        'me-1': { username: 'Temporary Host', state: 'playing', media: { ratingKey: 'movie-1' } },
      };
      const ctx = createMockContext({
        GET_HOST_ID: 'old-host',
        GET_USER: (id) => users[id],
      });
      Object.defineProperty(ctx.getters, 'IS_HOST_GRACE_PERIOD', { get: () => isGracePeriod });
      Object.defineProperty(ctx.getters, 'GET_PENDING_HOST_ID', { get: () => pendingHostId });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_TIMEOUT_ID', { get: () => timeoutId });
      Object.defineProperty(ctx.getters, 'GET_HOST_GRACE_PREVIOUS_HOST_USERNAME', {
        get: () => previousHostUsername,
      });
      ctx.commit.mockImplementation((mutation, value) => {
        if (mutation === 'SET_IS_HOST_GRACE_PERIOD') isGracePeriod = value;
        if (mutation === 'SET_PENDING_HOST_ID') pendingHostId = value;
        if (mutation === 'SET_HOST_GRACE_TIMEOUT_ID') timeoutId = value;
        if (mutation === 'SET_HOST_GRACE_PREVIOUS_HOST_USERNAME') {
          previousHostUsername = value;
        }
        if (mutation === 'SET_USER') users[value.id] = value.data;
      });

      await eventhandlers.HANDLE_NEW_HOST(ctx, {
        hostId: 'me-1',
        previousHostLeft: true,
      });
      await vi.advanceTimersByTimeAsync(5000);
      await eventhandlers.HANDLE_USER_JOINED(ctx, {
        id: 'returning-host',
        username: 'Alice',
        state: 'buffering',
        media: { ratingKey: 'movie-1' },
      });

      ctx.commit.mockClear();
      await vi.advanceTimersByTimeAsync(6000);
      expect(ctx.commit).not.toHaveBeenCalledWith('SET_HOST_ID', 'me-1');

      await vi.advanceTimersByTimeAsync(24000);
      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'me-1');
    });

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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host', previousHostLeft: true });

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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host', previousHostLeft: true });

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

      await eventhandlers.HANDLE_NEW_HOST(ctx, { hostId: 'new-host', previousHostLeft: true });

      // Should not throw when timer fires
      await vi.advanceTimersByTimeAsync(10000);

      expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'new-host');
    });
  });
});

describe('HANDLE_PLAYER_STATE_UPDATE', () => {
  it('rechecks restoration readiness after canceling an in-progress sync', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    let restorePendingId = 'alice-new';
    let resolveCancel;
    const cancelPromise = new Promise((resolve) => { resolveCancel = resolve; });
    const ctx = createMockContext({
      GET_HOST_ID: 'alice-new',
      GET_HOST_RESTORE_EXPECTED_STATE: 'playing',
      GET_USER: () => returningUser,
    });
    Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
      get: () => restorePendingId,
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') returningUser.state = data.state;
      if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = data;
    });
    ctx.dispatch.mockImplementation((action) => {
      if (action === 'CANCEL_IN_PROGRESS_SYNC') return cancelPromise;
      return Promise.resolve();
    });

    const readyUpdate = eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'alice-new', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });
    await vi.waitFor(() => {
      expect(ctx.dispatch).toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
    });
    returningUser.state = 'paused';
    resolveCancel();
    await readyUpdate;

    expect(restorePendingId).toBe('alice-new');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  });

  it('waits for the saved host state after server election', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    let restorePendingId = 'alice-new';
    const ctx = createMockContext({
      GET_HOST_ID: 'alice-new',
      GET_HOST_RESTORE_EXPECTED_STATE: 'playing',
      GET_USER: () => returningUser,
    });
    Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
      get: () => restorePendingId,
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') returningUser.state = data.state;
      if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = data;
    });

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'alice-new', state: 'paused', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(restorePendingId).toBe('alice-new');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'alice-new', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });
    expect(restorePendingId).toBeNull();
    expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  });

  it('performs a full sync when a server-elected returning host becomes ready', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    let restorePendingId = 'alice-new';
    const ctx = createMockContext({
      GET_HOST_ID: 'alice-new',
      GET_USER: () => returningUser,
    });
    Object.defineProperty(ctx.getters, 'GET_HOST_RESTORE_PENDING_ID', {
      get: () => restorePendingId,
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') returningUser.state = data.state;
      if (mutation === 'SET_HOST_RESTORE_PENDING_ID') restorePendingId = data;
    });

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'alice-new', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(restorePendingId).toBeNull();
    expect(ctx.dispatch).toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
    expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');

    const cancelCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([action]) => action === 'CANCEL_IN_PROGRESS_SYNC')
    ];
    const clearCall = ctx.commit.mock.invocationCallOrder[
      ctx.commit.mock.calls.findIndex(([mutation]) => mutation === 'SET_HOST_RESTORE_PENDING_ID')
    ];
    const syncCall = ctx.dispatch.mock.invocationCallOrder[
      ctx.dispatch.mock.calls.findIndex(([action]) => action === 'SYNC_MEDIA_AND_PLAYER_STATE')
    ];
    expect(cancelCall).toBeLessThan(clearCall);
    expect(clearCall).toBeLessThan(syncCall);

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'alice-new', state: 'playing', time: 6000, duration: 100000, playbackRate: 1,
    });
    expect(ctx.dispatch.mock.calls.filter(
      ([action]) => action === 'SYNC_MEDIA_AND_PLAYER_STATE',
    )).toHaveLength(1);
  });

  it('does not reclaim on a transient paused update while the room is playing', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      GET_HOST_GRACE_PREVIOUS_HOST_STATE: 'playing',
      GET_USER: (id) => (id === 'u1'
        ? returningUser
        : { username: 'Temporary Host', state: 'paused', media: { ratingKey: 'movie-1' } }),
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') {
        returningUser.state = data.state;
      }
    });

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'u1', state: 'paused', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.dispatch).not.toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });

  it('reclaims a returning host after restored playback reaches a stable state', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      GET_USER: () => returningUser,
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') {
        returningUser.state = data.state;
      }
    });

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'u1', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.commit).toHaveBeenCalledWith('SET_HOST_ID', 'u1');
    expect(ctx.dispatch).toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });

  it('allows a buffering host to reclaim after restoring stable playback', async () => {
    const returningUser = {
      username: 'Alice', state: 'buffering', time: 5000, media: { ratingKey: 'movie-1' },
    };
    const ctx = createMockContext({
      IS_HOST_GRACE_PERIOD: true,
      GET_PENDING_HOST_ID: 'me-1',
      GET_HOST_GRACE_PREVIOUS_HOST_USERNAME: 'Alice',
      GET_HOST_GRACE_PREVIOUS_HOST_STATE: 'buffering',
      GET_USER: () => returningUser,
    });
    ctx.commit.mockImplementation((mutation, data) => {
      if (mutation === 'SET_USER_PLAYER_STATE') {
        returningUser.state = data.state;
      }
    });

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'u1', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(ctx.dispatch).toHaveBeenCalledWith('CLEAR_HOST_GRACE_PERIOD');
    expect(ctx.dispatch).toHaveBeenCalledWith('TRANSFER_HOST', 'u1');
  });

  it('does not treat an ordinary host state update as a party-pause acknowledgment', async () => {
    const ctx = createMockContext();

    await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
      id: 'host-1', state: 'paused', time: 5000, duration: 100000, playbackRate: 1,
    });

    expect(ctx.dispatch).not.toHaveBeenCalledWith('CLEAR_PENDING_PARTY_PAUSE');
  });

  it('syncs only when the matching party-pause acknowledgment arrives', async () => {
    const ctx = createMockContext();
    ctx.dispatch.mockImplementation((action, payload) => {
      if (action === 'ACKNOWLEDGE_PARTY_PAUSE') {
        return Promise.resolve(payload === 'request-1');
      }
      return Promise.resolve();
    });

    await eventhandlers.HANDLE_PARTY_PAUSE_ACK(ctx, { requestId: 'stale-request' });
    expect(ctx.dispatch).not.toHaveBeenCalledWith('SYNC_PLAYER_STATE');

    await eventhandlers.HANDLE_PARTY_PAUSE_ACK(ctx, { requestId: 'request-1' });
    expect(ctx.dispatch).toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
    expect(ctx.dispatch).toHaveBeenCalledWith('SYNC_PLAYER_STATE');
  });

  describe('host non-host seek-follow guard', () => {
    it('ignores non-host seek-like updates while host is changing source', async () => {
      const ctx = createMockContext({
        AM_I_HOST: true,
        GET_SOCKET_ID: 'host-1',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });
      ctx.rootGetters['slplayer/IS_CHANGING_SOURCE'] = true;

      await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
        id: 'guest-1', state: 'paused', time: 3641944.991,
      });

      expect(ctx.dispatch).not.toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
      expect(ctx.dispatch).not.toHaveBeenCalledWith(
        'plexclients/SEEK_TO',
        expect.anything(),
        { root: true },
      );
    });

    it('ignores non-host seek-like updates while host is changing play queue items', async () => {
      const ctx = createMockContext({
        AM_I_HOST: true,
        GET_SOCKET_ID: 'host-1',
        GET_USER: (id) => ({ username: `user-${id}`, state: 'playing', time: 0 }),
      });
      ctx.rootGetters['slplayer/IS_PLAY_QUEUE_TRANSITIONING'] = true;

      await eventhandlers.HANDLE_PLAYER_STATE_UPDATE(ctx, {
        id: 'guest-1', state: 'paused', time: 3641944.991,
      });

      expect(ctx.dispatch).not.toHaveBeenCalledWith('CANCEL_IN_PROGRESS_SYNC');
      expect(ctx.dispatch).not.toHaveBeenCalledWith(
        'plexclients/SEEK_TO',
        expect.anything(),
        { root: true },
      );
    });
  });

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
