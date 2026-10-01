import {
  beforeEach, afterEach, describe, expect, it, vi,
} from 'vitest';
import { createStore } from 'vuex';
import stateFactory from '@/store/modules/synclounge/state';
import mutations from '@/store/modules/synclounge/mutations';
import getters from '@/store/modules/synclounge/getters';

vi.mock('@/socket', () => ({
  emit: vi.fn(), isConnected: () => true,
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

let actions;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Audio', class {});
  actions = (await import('@/store/modules/synclounge/actions')).default;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fixture = (blockedAction) => {
  const blocked = deferred();
  const release = deferred();
  const initial = stateFactory();
  initial.hostId = 'old-host';
  initial.socketId = 'me';
  initial.users = {
    'old-host': { username: 'Old host', reconnectIdentity: 'old-identity', state: 'playing' },
    'new-host': { username: 'New host', state: 'playing' },
  };
  const snapshot = {
    user: { id: 'me', username: 'Me' },
    users: structuredClone(initial.users),
    hostId: 'old-host',
    isPartyPausingEnabled: true,
    isAutoHostEnabled: false,
  };
  const waitIfBlocked = async (type, result) => {
    if (blockedAction === type) {
      blocked.resolve();
      await release.promise;
    }
    return result;
  };
  const store = createStore({
    getters: { 'plex/GET_PLEX_USER': () => ({}) },
    actions: {
      'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE': () => waitIfBlocked('timeline', { state: 'stopped' }),
      DISPLAY_NOTIFICATION: vi.fn(),
    },
    modules: {
      synclounge: {
        namespaced: true,
        state: initial,
        mutations,
        getters,
        actions: {
          ...actions,
          JOIN_ROOM: () => waitIfBlocked('snapshot', snapshot),
          ADD_MESSAGE_AND_CACHE_AND_NOTIFY: vi.fn(),
          CANCEL_IN_PROGRESS_SYNC: vi.fn(),
          SYNC_MEDIA_AND_PLAYER_STATE: vi.fn(),
          START_SYNC_POLL_INTERVAL: vi.fn(),
          SEND_SYNC_FLEXIBILITY_UPDATE: vi.fn(),
        },
      },
    },
  });
  return { store, blocked, release };
};

describe('join snapshot authority reconciliation', () => {
  it.each([
    ['snapshot', false], ['timeline', false], ['snapshot', true], ['timeline', true],
  ])('keeps newer authority and flags during %s (reconnecting %s)', async (stage, reconnecting) => {
    const { store, blocked, release } = fixture(stage);
    const joining = store.dispatch('synclounge/JOIN_ROOM_AND_INIT', { syncOnJoin: false, reconnecting });
    await blocked.promise;
    await store.dispatch('synclounge/HANDLE_NEW_HOST', 'new-host');
    await store.dispatch('synclounge/HANDLE_SET_PARTY_PAUSING_ENABLED', false);
    await store.dispatch('synclounge/HANDLE_SET_AUTO_HOST_ENABLED', true);
    release.resolve();
    await joining;
    expect(store.state.synclounge).toMatchObject({
      hostId: 'new-host', isPartyPausingEnabled: false, isAutoHostEnabled: true,
    });
  });

  it.each(['snapshot', 'timeline'])('preserves departure grace during %s', async (stage) => {
    const { store, blocked, release } = fixture(stage);
    const joining = store.dispatch('synclounge/JOIN_ROOM_AND_INIT', { syncOnJoin: false, reconnecting: true });
    await blocked.promise;
    await store.dispatch('synclounge/HANDLE_USER_LEFT', { id: 'old-host', newHostId: 'new-host' });
    release.resolve();
    await joining;
    expect(store.state.synclounge.users['old-host']).toBeUndefined();
    expect(store.state.synclounge).toMatchObject({ isHostGracePeriod: true, pendingHostId: 'new-host' });
    await vi.advanceTimersByTimeAsync(10000);
    expect(store.state.synclounge.hostId).toBe('new-host');
    expect(store.state.synclounge.isHostGracePeriod).toBe(false);
  });

  it('still replaces stale cached authority and flags when no newer event arrives', async () => {
    const { store, blocked, release } = fixture('snapshot');
    store.state.synclounge.hostId = 'cached-host';
    store.state.synclounge.isPartyPausingEnabled = false;
    store.state.synclounge.isAutoHostEnabled = true;
    const joining = store.dispatch('synclounge/JOIN_ROOM_AND_INIT', { syncOnJoin: false, reconnecting: true });
    await blocked.promise;
    release.resolve();
    await joining;
    expect(store.state.synclounge).toMatchObject({
      hostId: 'old-host', isPartyPausingEnabled: true, isAutoHostEnabled: false,
    });
  });
});
