import {
  describe, it, expect, vi,
} from 'vitest';
import RoomJoin from '@/views/RoomJoin.vue';

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
