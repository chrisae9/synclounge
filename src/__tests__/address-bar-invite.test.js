import {
  describe, expect, it, vi,
} from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import appRouter from '@/router';
import App from '@/App.vue';
import SignIn from '@/views/SignIn.vue';
import RoomJoin from '@/views/RoomJoin.vue';
import { getRoomJoinRedirect, getSignInRoute, shouldRedirectProtectedRoute } from '@/router/guardutils';

const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes });
const service = 'https://lounge.example.test/custom-path';

describe('address-bar invites with real route resolution', () => {
  const pages = ['WebPlayer', 'PlexHome', 'PlexMedia', 'PlexLibrary', 'PlexSearch'];
  it.each(pages)('rejoins a shared %s URL after authentication', async (name) => {
    const original = router.resolve({
      name,
      params: {
        room: 'movie-night',
        server: service,
        machineIdentifier: 'sample',
        ratingKey: '123',
        sectionId: '1',
        query: 'space adventure',
      },
    });
    const signIn = router.resolve(getSignInRoute(original));
    const restored = router.resolve(SignIn.methods.getSafeRedirect.call({ $router: router }, signIn.query.redirect));
    expect(restored.fullPath).toBe(original.fullPath);
    expect(shouldRedirectProtectedRoute(restored, { inRoom: false }, false)).toBe(true);
    const join = router.resolve(getRoomJoinRedirect(restored));
    const context = {
      room: join.params.room,
      server: join.params.server,
      $route: join,
      $router: { resolve: router.resolve, push: vi.fn() },
      getSafeRoomRedirect: RoomJoin.methods.getSafeRoomRedirect,
      SET_AND_CONNECT_AND_JOIN_ROOM: vi.fn().mockResolvedValue(),
      DISCONNECT_IF_CONNECTED: vi.fn(),
    };
    await RoomJoin.methods.joinInvite.call(context);
    expect(context.SET_AND_CONNECT_AND_JOIN_ROOM).toHaveBeenCalledWith({
      room: 'movie-night', server: service, syncOnJoin: name === 'WebPlayer',
    });
    expect(context.$router.push).toHaveBeenCalledWith(original.fullPath);
    expect(context.DISCONNECT_IF_CONNECTED).not.toHaveBeenCalled();
  });

  it('does not copy the autojoin root when currently in a different room or service', () => {
    const context = {
      GET_CONFIG: { autojoin: { room: 'default-room' } },
      GET_ROOM: 'movie-night',
      GET_SERVER: service,
      GET_ACTIVE_MEDIA_METADATA: null,
      $router: router,
    };
    const url = new URL(App.computed.inviteUrl.call(context));
    const route = router.resolve(url.pathname);
    expect(route.name).toBe('RoomJoin');
    expect(route.params.room).toBe('movie-night');
    expect(route.params.server).toBe(service);
    expect(App.computed.inviteUrl.call({ ...context, GET_ROOM: 'default-room', GET_SERVER: null }))
      .toBe(window.location.origin);
  });

  it('rejects redirects into another room or service', () => {
    const context = { room: 'movie-night', server: service, $router: router };
    for (const params of [{ room: 'other-room', server: service }, { room: 'movie-night', server: 'other' }]) {
      const to = router.resolve({ name: 'WebPlayer', params });
      expect(RoomJoin.methods.getSafeRoomRedirect.call(context, to.fullPath)).toBe(null);
    }
  });
});
