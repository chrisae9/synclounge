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
});
