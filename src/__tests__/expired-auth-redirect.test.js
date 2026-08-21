import {
  describe, expect, it, vi,
} from 'vitest';
import App from '@/App.vue';

describe('expired authentication navigation', () => {
  it('keeps the current invite as the post-authentication destination', () => {
    const push = vi.fn();
    const fullPath = '/join/movie-night/server-1?watching=example-movie-2026';
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

    App.methods.navigateToSignIn.call(context);

    expect(push).toHaveBeenCalledWith({
      name: 'SignIn',
      query: { redirect: fullPath },
    });
  });

  it('does not overwrite a redirect already saved on the sign-in route', () => {
    const push = vi.fn();
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

    App.methods.navigateToSignIn.call(context);

    expect(push).not.toHaveBeenCalled();
  });

  it('restores a captured invite if an earlier expiry report reached bare sign-in', () => {
    const push = vi.fn();
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

    App.methods.navigateToSignIn.call(context);

    expect(push).toHaveBeenCalledWith({
      name: 'SignIn',
      query: { redirect: '/join/movie-night' },
    });
  });
});
