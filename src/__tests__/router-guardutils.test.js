import { describe, it, expect } from 'vitest';
import {
  getSignInRoute,
  shouldApplyAutojoin,
  shouldRedirectProtectedRoute,
} from '@/router/guardutils';

describe('router guard helpers', () => {
  it('preserves an invite URL and its watching context through sign-in', () => {
    const fullPath = '/join/movie-night/server-1?watching=example-movie-2026';

    expect(getSignInRoute({
      name: 'RoomJoin',
      fullPath,
      matched: [{ meta: { requiresAuth: true } }],
    })).toEqual({
      name: 'SignIn',
      query: { redirect: fullPath },
    });
  });

  it('does not attach a redirect for routes that do not require authentication', () => {
    expect(getSignInRoute({
      name: 'SignOut',
      fullPath: '/signout',
      matched: [{ meta: { requiresPlexToken: true } }],
    })).toEqual({ name: 'SignIn' });
  });

  it('does not autojoin over explicit room deep links', () => {
    expect(shouldApplyAutojoin({
      fullPath: '/room/stale123/player',
      name: 'WebPlayer',
      params: { room: 'stale123' },
    }, { autojoin: { room: 'configured' } })).toBe(false);
  });

  it('applies autojoin only for the default room creation entry route', () => {
    expect(shouldApplyAutojoin({
      fullPath: '/',
      name: 'RoomCreation',
      params: {},
    }, { autojoin: { room: 'configured' } })).toBe(true);
  });

  it('does not apply autojoin when no autojoin config exists', () => {
    expect(shouldApplyAutojoin({
      fullPath: '/',
      name: 'RoomCreation',
      params: {},
    }, {})).toBe(false);
  });

  it('redirects protected room routes when persisted room state exists without a live socket', () => {
    const to = {
      params: { room: 'stale123' },
      matched: [{ meta: { protected: true } }],
    };
    const state = {
      inRoom: true,
      server: undefined,
      room: 'stale123',
    };

    expect(shouldRedirectProtectedRoute(to, state, false)).toBe(true);
  });
});
