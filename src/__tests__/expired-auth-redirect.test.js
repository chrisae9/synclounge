import {
  describe, expect, it, vi,
} from 'vitest';
import App from '@/App.vue';

describe('expired authentication navigation', () => {
  it.each([
    '/join/movie-night/server-1?watching=example-movie-2026',
    '/join/movie-night?watching=example-movie-2026',
  ])('keeps invite %s as the post-authentication destination', async (fullPath) => {
    const push = vi.fn().mockResolvedValue(undefined);
    const context = {
      pendingAuthRedirect: null,
      $route: {
        name: 'RoomJoin',
        fullPath,
        matched: [{ meta: { requiresAuth: true } }],
      },
      $router: { push },
      rememberAuthRedirect: App.methods.rememberAuthRedirect,
    };

    await App.methods.navigateToSignIn.call(context);

    expect(push).toHaveBeenCalledWith({
      name: 'SignIn',
      query: { redirect: fullPath },
    });
    expect(context.pendingAuthRedirect).toBeNull();
  });

  it('does not overwrite a redirect already saved on the sign-in route', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const context = {
      pendingAuthRedirect: '/join/movie-night',
      $route: {
        name: 'SignIn',
        fullPath: '/signin?redirect=%2Fjoin%2Fmovie-night',
        query: { redirect: '/join/movie-night' },
        matched: [{ meta: { requiresNoAuth: true } }],
      },
      $router: { push },
      rememberAuthRedirect: App.methods.rememberAuthRedirect,
    };

    await App.methods.navigateToSignIn.call(context);

    expect(push).not.toHaveBeenCalled();
    expect(context.pendingAuthRedirect).toBeNull();
  });

  it('restores a captured invite if an earlier expiry report reached bare sign-in', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const context = {
      pendingAuthRedirect: '/join/movie-night',
      $route: {
        name: 'SignIn',
        fullPath: '/signin',
        query: {},
        matched: [{ meta: { requiresNoAuth: true } }],
      },
      $router: { push },
      rememberAuthRedirect: App.methods.rememberAuthRedirect,
    };

    await App.methods.navigateToSignIn.call(context);

    expect(push).toHaveBeenCalledWith({
      name: 'SignIn',
      query: { redirect: '/join/movie-night' },
    });
    expect(context.pendingAuthRedirect).toBeNull();
  });

  it('does not reuse an old invite on a later bare sign-in', async () => {
    const context = {
      pendingAuthRedirect: null,
      $route: {
        name: 'RoomJoin',
        fullPath: '/join/movie-night',
        matched: [{ meta: { requiresAuth: true } }],
      },
      rememberAuthRedirect: App.methods.rememberAuthRedirect,
    };
    const push = vi.fn().mockImplementation(async (route) => {
      context.$route = {
        name: 'SignIn',
        fullPath: '/signin?redirect=%2Fjoin%2Fmovie-night',
        query: route.query,
        matched: [{ meta: { requiresNoAuth: true } }],
      };
    });
    context.$router = { push };

    await App.methods.navigateToSignIn.call(context);
    context.$route = {
      name: 'SignIn',
      fullPath: '/signin',
      query: {},
      matched: [{ meta: { requiresNoAuth: true } }],
    };
    await App.methods.navigateToSignIn.call(context);

    expect(push).toHaveBeenCalledTimes(1);
    expect(context.pendingAuthRedirect).toBeNull();
  });

  it('clears the captured invite after authentication succeeds', async () => {
    const context = {
      pendingAuthRedirect: '/join/movie-night',
      GET_PLEX_AUTH_TOKEN: 'token',
      rememberAuthRedirect: vi.fn(),
      FETCH_PLEX_USER: vi.fn().mockResolvedValue(undefined),
      FETCH_PLEX_DEVICES: vi.fn().mockResolvedValue(undefined),
    };

    await App.created.call(context);

    expect(context.pendingAuthRedirect).toBeNull();
  });
});
