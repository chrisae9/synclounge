import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import SignIn from '@/views/SignIn.vue';

const resolveRedirect = (redirect) => {
  if (redirect === '/room/stale123/player') {
    return {
      fullPath: redirect,
      matched: [{ meta: { requiresAuth: true, protected: true } }],
    };
  }
  if (redirect === '/') {
    return {
      fullPath: '/',
      matched: [{ meta: { requiresAuth: true } }],
    };
  }
  if (redirect === '/signout') {
    return {
      fullPath: '/signout',
      matched: [{ meta: { requiresPlexToken: true } }],
    };
  }
  return {
    fullPath: redirect,
    matched: [{ meta: {} }],
  };
};

const makeContext = (redirect) => {
  const push = vi.fn();
  return {
    loading: false,
    plexAuthResponse: { id: 123, code: 'abc' },
    GET_PLEX_AUTH_URL: vi.fn(() => 'https://plex.tv/auth'),
    REQUEST_PLEX_AUTH_TOKEN: vi.fn().mockResolvedValue(undefined),
    FETCH_PLEX_DEVICES_IF_NEEDED: vi.fn().mockResolvedValue(undefined),
    FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE: vi.fn(),
    getSafeRedirect: SignIn.methods.getSafeRedirect,
    $route: {
      fullPath: `/signin?redirect=${encodeURIComponent(redirect)}`,
      query: { redirect },
    },
    $router: {
      push,
      resolve: vi.fn(resolveRedirect),
    },
  };
};

describe('SignIn redirects', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps safe authenticated local redirects after Plex auth', () => {
    const ctx = makeContext('/room/stale123/player');

    SignIn.methods.signIn.call(ctx);

    expect(JSON.parse(sessionStorage.getItem('plex_auth_pin')).redirect).toBe('/room/stale123/player');
  });

  it.each([
    'https://evil.example/room/stale123/player',
    '//evil.example/room/stale123/player',
    '/signout',
  ])('stores / instead of unsafe redirect during Plex auth: %s', (redirect) => {
    const ctx = makeContext(redirect);

    SignIn.methods.signIn.call(ctx);

    expect(JSON.parse(sessionStorage.getItem('plex_auth_pin')).redirect).toBe('/');
  });

  it('sanitizes saved PIN redirect before pushing after auth completion', async () => {
    const ctx = makeContext('/room/stale123/player');

    await SignIn.methods.completeRedirectAuth.call(ctx, {
      id: 123,
      redirect: '/signout',
    });

    expect(ctx.$router.push).toHaveBeenCalledWith('/');
  });

  it('sanitizes already-authorized redirect before pushing', () => {
    const ctx = makeContext('//evil.example/room/stale123/player');

    SignIn.methods.redirect.call(ctx);

    expect(ctx.$router.push).toHaveBeenCalledWith('/');
  });
});
