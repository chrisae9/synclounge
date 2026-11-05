import { describe, expect, it } from 'vitest';
import router from '@/router';

describe('production route contracts across router upgrades', () => {
  it('round-trips room invitations with encoded room names and join options', () => {
    const route = router.resolve({
      name: 'RoomJoin',
      params: { room: 'Movie night #1', server: 'qa-server' },
      query: { roomPassword: 'sample-only' },
    });
    const parsed = router.resolve(route.fullPath);
    expect(parsed.name).toBe('RoomJoin');
    expect(parsed.params).toEqual({ room: 'Movie night #1', server: 'qa-server' });
    expect(parsed.query).toEqual({ roomPassword: 'sample-only' });
    expect(parsed.meta.requiresAuth).toBe(true);
    expect(parsed.meta.redirectAfterAuth).toBe(true);
  });

  it('keeps player and library routes in the same protected room', () => {
    for (const name of ['WebPlayer', 'PlexHome']) {
      const route = router.resolve({ name, params: { room: 'movie-night', server: 'qa-server' } });
      const parsed = router.resolve(route.fullPath);
      expect(parsed.name).toBe(name);
      expect(parsed.params).toEqual({ room: 'movie-night', server: 'qa-server' });
      expect(parsed.meta.requiresAuth).toBe(true);
      expect(parsed.meta.protected).toBe(true);
    }
  });
});
