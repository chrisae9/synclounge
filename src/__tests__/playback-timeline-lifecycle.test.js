import {
  afterEach, expect, it, vi,
} from 'vitest';
import events from '@/store/modules/synclounge/eventhandlers';
import mutations from '@/store/modules/synclounge/mutations';
import sync from '@/store/modules/synclounge/actions';
import player from '@/store/modules/slplayer/actions';
import { getCurrentTimeMs } from '@/player';

vi.mock('@/socket', () => ({
  emit: vi.fn(),
  isConnected: () => true,
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  waitForEvent: vi.fn(),
  getId: vi.fn(),
}));
vi.mock('@/player', () => ({ getCurrentTimeMs: vi.fn(() => 90000) }));

afterEach(() => { vi.useRealTimers(); });

it.each([
  // Explicit markers are verified by the server, including after buffering already updated time.
  [90000, undefined, true], [10000, undefined, false], [10000, true, true],
  [90000, true, true], [11000, true, true], [0, true, true],
  [10000, false, false], [90000, false, false],
])('handles guest position %s with explicit seek=%s using real mutations', async (time, explicit, seeks) => {
  const state = {
    users: {
      guest: {
        state: 'playing', time: 10000, updatedAt: Date.now(), playbackRate: 1,
      },
    },
    userEventRevision: 0,
    userEventRevisions: {},
  };
  const ctx = {
    getters: {
      GET_HOST_ID: 'host',
      GET_SOCKET_ID: 'host',
      AM_I_HOST: true,
      GET_USER: (id) => state.users[id],
    },
    rootGetters: {},
    commit: (name, data) => mutations[name]?.(state, data),
    dispatch: vi.fn(async () => {}),
  };
  await events.HANDLE_PLAYER_STATE_UPDATE(ctx, {
    id: 'guest',
    state: 'playing',
    time,
    duration: 100000,
    playbackRate: 1,
    ...(explicit === undefined ? {} : { userInitiatedSeek: explicit }),
  });
  expect(ctx.dispatch.mock.calls.some(([type]) => type === 'plexclients/SEEK_TO')).toBe(seeks);
});

it.each([null, 90000])('publishes a paused seek and identifies automatic target %s', async (target) => {
  getCurrentTimeMs.mockReturnValue(90000);
  const ctx = {
    state: { isChangingSource: false, syncSeekTarget: target },
    commit: vi.fn(),
    dispatch: vi.fn(async () => {}),
  };
  await player.HANDLE_SEEKED(ctx);
  expect(ctx.dispatch).toHaveBeenCalledWith('synclounge/PROCESS_PLAYER_STATE_UPDATE', {
    noSync: true, userInitiatedSeek: target === null,
  }, { root: true });
  expect(ctx.commit).toHaveBeenCalledWith('SET_SYNC_SEEK_TARGET', null);
});

it.each(['ios', 'cast', 'browser'])('isolates an automatic %s recovery in a four-person room', async (guest) => {
  const users = Object.fromEntries(['host', 'ios', 'cast', 'browser'].map((id) => [id, {
    username: id, state: 'playing', time: 10000, updatedAt: Date.now(), playbackRate: 1,
  }]));
  const state = { users, userEventRevision: 0, userEventRevisions: {} };
  const host = {
    getters: {
      GET_HOST_ID: 'host',
      GET_SOCKET_ID: 'host',
      AM_I_HOST: true,
      GET_USER: (id) => users[id],
    },
    rootGetters: {},
    commit: (name, data) => mutations[name]?.(state, data),
    dispatch: vi.fn(async () => {}),
  };
  getCurrentTimeMs.mockReturnValue(90000);
  const recoveringPlayer = {
    state: { syncSeekTarget: 90000 },
    commit: vi.fn(),
    dispatch: vi.fn(async (name, options) => {
      if (name === 'synclounge/PROCESS_PLAYER_STATE_UPDATE') {
        await events.HANDLE_PLAYER_STATE_UPDATE(host, {
          id: guest,
          state: 'playing',
          time: 90000,
          duration: 100000,
          playbackRate: 1,
          userInitiatedSeek: options.userInitiatedSeek,
        });
      }
    }),
  };
  await player.HANDLE_SEEKED(recoveringPlayer);
  expect(host.dispatch.mock.calls.some(([name]) => name === 'plexclients/SEEK_TO')).toBe(false);
  expect(users.host.time).toBe(10000);
  expect(users[guest].time).toBe(90000);

  // A subsequent deliberate seek still moves the host, preserving party controls.
  recoveringPlayer.state.syncSeekTarget = null;
  await player.HANDLE_SEEKED(recoveringPlayer);
  const seek = expect.objectContaining({ offset: 90000 });
  expect(host.dispatch).toHaveBeenCalledWith('plexclients/SEEK_TO', seek, { root: true });
});

it('starts ongoing synchronization after a browse join without autoplay', async () => {
  const getters = {
    GET_USERS: {}, GET_USER_EVENT_REVISIONS: {}, IS_IN_ROOM: true, AM_I_HOST: false,
  };
  const dispatch = vi.fn(async (type) => {
    if (type === 'JOIN_ROOM') {
      return { user: { id: 'me' }, users: {}, hostId: 'host' };
    }
    return undefined;
  });
  await sync.JOIN_ROOM_AND_INIT({
    getters, rootGetters: { 'plex/GET_PLEX_USER': {} }, commit: vi.fn(), dispatch,
  }, { syncOnJoin: false });
  expect(dispatch).toHaveBeenCalledWith('START_SYNC_POLL_INTERVAL');
  expect(dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(dispatch).toHaveBeenCalledWith('SYNC_PLAYER_STATE');
  await sync.DISCONNECT({ commit: vi.fn(), dispatch });
  vi.restoreAllMocks();
});
