import {
  describe, it, expect, vi,
} from 'vitest';
import RoomJoin from '@/views/RoomJoin.vue';
import RoomCreation from '@/views/RoomCreation.vue';
import AdvancedRoomJoin from '@/views/AdvancedRoomJoin.vue';

const resolveRedirect = (redirect) => {
  if (redirect.startsWith('/room/stale123/player')) {
    return {
      name: 'WebPlayer',
      fullPath: redirect,
      params: { room: 'stale123' },
      matched: [{ meta: { protected: true } }],
    };
  }

  if (redirect.startsWith('/room/stale123/browse')) {
    return {
      name: 'PlexMedia',
      fullPath: redirect,
      params: { room: 'stale123' },
      matched: [{ meta: { protected: true } }],
    };
  }

  if (redirect.startsWith('/room/other-room/player')) {
    return {
      name: 'WebPlayer',
      fullPath: redirect,
      params: { room: 'other-room' },
      matched: [{ meta: { protected: true } }],
    };
  }

  return {
    fullPath: redirect,
    params: {},
    matched: [{ meta: {} }],
  };
};

const makeJoinContext = (query, options = {}) => {
  const push = vi.fn();
  const ctx = {
    room: 'stale123',
    server: '',
    error: null,
    loading: false,
    SET_AND_CONNECT_AND_JOIN_ROOM: vi.fn().mockResolvedValue(undefined),
    DISCONNECT_IF_CONNECTED: vi.fn().mockResolvedValue(undefined),
    linkWithRoom: vi.fn((destination) => ({ ...destination, params: { room: 'stale123' } })),
    getSafeRoomRedirect: RoomJoin.methods.getSafeRoomRedirect,
    $route: {
      name: 'RoomJoin',
      query,
    },
    $router: {
      push,
      resolve: vi.fn(resolveRedirect),
    },
  };

  if (options.joinChangesRoute) {
    ctx.SET_AND_CONNECT_AND_JOIN_ROOM = vi.fn(async () => {
      ctx.$route = {
        name: 'WebPlayer',
        query: {},
      };
    });
  }

  return { ctx, push };
};

describe('RoomJoin stale/deep URL recovery', () => {
  it('silently abandons a cancelled join without disconnecting the next room', async () => {
    const { ctx, push } = makeJoinContext({});
    ctx.SET_AND_CONNECT_AND_JOIN_ROOM.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
    await RoomJoin.methods.joinInvite.call(ctx);
    expect(ctx.DISCONNECT_IF_CONNECTED).not.toHaveBeenCalled();
    expect(ctx.error).toBeNull();
    expect(ctx.loading).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('clears loading after following a saved redirect', async () => {
    const { ctx } = makeJoinContext({ redirect: '/room/stale123/browse' });
    await RoomJoin.methods.joinInvite.call(ctx);
    expect(ctx.loading).toBe(false);
  });

  it('returns to the original protected route after joining from a stale URL', async () => {
    const redirect = '/room/stale123/browse/server/server-1/ratingKey/episode-1';
    const { ctx, push } = makeJoinContext({ redirect });

    await RoomJoin.methods.joinInvite.call(ctx);

    expect(ctx.SET_AND_CONNECT_AND_JOIN_ROOM).toHaveBeenCalledWith({
      server: '',
      room: 'stale123',
      syncOnJoin: false,
    });
    expect(push).toHaveBeenCalledWith(redirect);
    expect(ctx.linkWithRoom).not.toHaveBeenCalled();
  });

  it('keeps join sync enabled for stale player redirects', async () => {
    const redirect = '/room/stale123/player';
    const { ctx } = makeJoinContext({ redirect });

    await RoomJoin.methods.joinInvite.call(ctx);

    expect(ctx.SET_AND_CONNECT_AND_JOIN_ROOM).toHaveBeenCalledWith({
      server: '',
      room: 'stale123',
      syncOnJoin: true,
    });
  });

  it('still follows the saved deep redirect if join sync navigates first', async () => {
    const redirect = '/room/stale123/browse/server/server-1/ratingKey/episode-1';
    const { ctx, push } = makeJoinContext({ redirect }, { joinChangesRoute: true });

    await RoomJoin.methods.joinInvite.call(ctx);

    expect(push).toHaveBeenCalledWith(redirect);
  });

  it.each([
    'https://evil.example/room/stale123/player',
    '//evil.example/room/stale123/player',
    '/signout',
    '/room/other-room/player',
  ])('ignores unsafe redirect after joining: %s', async (redirect) => {
    const { ctx, push } = makeJoinContext({ redirect });

    await RoomJoin.methods.joinInvite.call(ctx);

    expect(push).toHaveBeenCalledWith({
      name: 'PlexHome',
      params: { room: 'stale123' },
    });
  });

  it('does not overwrite navigation that happened during join when there is no safe redirect', async () => {
    const { ctx, push } = makeJoinContext({}, { joinChangesRoute: true });

    await RoomJoin.methods.joinInvite.call(ctx);

    expect(push).not.toHaveBeenCalled();
  });
});

describe('cancelled room creation', () => {
  it.each([
    ['quick creation', RoomCreation.methods.createRoom],
    ['advanced creation', AdvancedRoomJoin.methods.connect],
  ])('%s does not tear down a replacement join', async (label, action) => {
    const ctx = {
      $store: { commit: vi.fn() },
      SET_AND_CONNECT_AND_JOIN_ROOM: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
      DISCONNECT_IF_CONNECTED: vi.fn(),
      fetchServersHealth: vi.fn(),
      error: null,
      serverError: null,
    };
    await action.call(ctx, 'https://server.invalid');
    expect(ctx.DISCONNECT_IF_CONNECTED).not.toHaveBeenCalled();
    expect(ctx.fetchServersHealth).not.toHaveBeenCalled();
    expect(ctx.error).toBeNull();
    expect(ctx.serverError).toBeNull();
  });
});
