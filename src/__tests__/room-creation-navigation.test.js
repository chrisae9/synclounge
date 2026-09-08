import {
  describe, it, expect, vi,
} from 'vitest';
import RoomCreation from '@/views/RoomCreation.vue';

describe('creating another room', () => {
  it('closes a previously opened chat before entering library browsing', async () => {
    const commit = vi.fn();
    const push = vi.fn();
    const connect = vi.fn().mockResolvedValue();
    const context = {
      $store: { commit },
      $route: { name: 'RoomCreation' },
      $router: { push },
      GET_BEST_SERVER: '',
      SET_AND_CONNECT_AND_JOIN_ROOM: connect,
      linkWithRoom: (route) => route,
    };
    await RoomCreation.methods.createRoom.call(context);
    expect(commit).toHaveBeenCalledWith('SET_RIGHT_SIDEBAR_OPEN', false);
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]);
    expect(push).toHaveBeenCalledWith({ name: 'PlexHome' });
  });
  it.each([true, false])('preserves navigation on failure or route changes: failure=%s', async (fails) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = {
      $store: { commit: vi.fn() },
      $route: { name: 'Elsewhere' },
      $router: { push: vi.fn() },
      SET_AND_CONNECT_AND_JOIN_ROOM: fails ? vi.fn().mockRejectedValue(new Error('test')) : vi.fn(),
      DISCONNECT_IF_CONNECTED: vi.fn(),
      fetchServersHealth: vi.fn(),
    };
    try {
      await RoomCreation.methods.createRoom.call(context);
      expect(context.loading).toBe(false);
      expect(context.$router.push).not.toHaveBeenCalled();
      expect(context.$store.commit).toHaveBeenCalledWith('SET_RIGHT_SIDEBAR_OPEN', false);
      if (fails) {
        expect(context.error).toBeTruthy();
        expect(context.fetchServersHealth).toHaveBeenCalledOnce();
      }
    } finally {
      errorLog.mockRestore();
    }
  });
});
