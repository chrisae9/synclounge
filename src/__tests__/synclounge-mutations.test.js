import { describe, it, expect } from 'vitest';
import { CAF } from 'caf';
import { isProxy } from 'vue';
import stateFactory from '@/store/modules/synclounge/state';
import mutations from '@/store/modules/synclounge/mutations';

describe('synclounge mutations', () => {
  it('stores sync cancel tokens as raw objects so identity cleanup works in Vuex', () => {
    const state = stateFactory();
    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();

    mutations.SET_SYNC_CANCEL_TOKEN(state, token);

    expect(state.syncCancelToken).toBe(token);
    expect(isProxy(state.syncCancelToken)).toBe(false);
  });

  it('retains updates received before a snapshot creates the user', () => {
    const state = stateFactory();

    mutations.SET_USER_PLAYER_STATE(state, {
      id: 'host-1', state: 'playing', time: 5000, duration: 100000, playbackRate: 1,
    });
    mutations.SET_USER_MEDIA(state, { id: 'host-1', media: null });
    mutations.SET_USER_SYNC_FLEXIBILITY(state, {
      id: 'host-1', syncFlexibility: 1000,
    });

    expect(state.users['host-1']).toEqual(expect.objectContaining({
      state: 'playing',
      time: 5000,
      duration: 100000,
      playbackRate: 1,
      media: null,
      syncFlexibility: 1000,
    }));
  });
});
