import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

vi.mock('@/socket', () => ({
  isConnected: () => true, emit: vi.fn(), close: vi.fn(),
}));

let actions;
let timeline;
let context;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  vi.stubGlobal('Audio', class {});
  actions = (await import('@/store/modules/synclounge/actions')).default;
  timeline = { state: 'playing', time: 10000 };
  context = {
    getters: { IS_IN_ROOM: true, GET_SOCKET_ID: 'follower', GET_HOST_USER: { state: 'playing' } },
    commit: vi.fn(),
    dispatch: vi.fn(async (type) => {
      if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') return timeline;
      return undefined;
    }),
  };
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('automatic follower buffering recovery', () => {
  it('does not seek a buffering follower through the periodic sync path', async () => {
    timeline.state = 'buffering';
    await actions._SYNC_PLAYER_STATE(context);
    expect(context.dispatch).not.toHaveBeenCalledWith('plexclients/SYNC', undefined, { root: true });
  });

  it('starts the cooldown when a long buffering episode ends and applies it to polls', async () => {
    timeline.state = 'buffering';
    await actions.PROCESS_PLAYER_STATE_UPDATE(context, true);
    vi.advanceTimersByTime(20000);
    timeline.state = 'playing';
    await actions.PROCESS_PLAYER_STATE_UPDATE(context, true);
    context.dispatch.mockClear();
    await actions._SYNC_PLAYER_STATE(context);
    expect(context.dispatch).not.toHaveBeenCalledWith('plexclients/SYNC', undefined, { root: true });
    vi.advanceTimersByTime(5000);
    await actions._SYNC_PLAYER_STATE(context);
    expect(context.dispatch).toHaveBeenCalledWith('plexclients/SYNC', undefined, { root: true });
  });

  it('still follows a host pause during recovery', async () => {
    timeline.state = 'buffering';
    await actions.PROCESS_PLAYER_STATE_UPDATE(context, true);
    timeline.state = 'playing';
    await actions.PROCESS_PLAYER_STATE_UPDATE(context, true);
    context.getters.GET_HOST_USER.state = 'paused';
    await actions._SYNC_PLAYER_STATE(context);
    expect(context.dispatch).toHaveBeenCalledWith('plexclients/PRESS_PAUSE', undefined, { root: true });
  });
});
