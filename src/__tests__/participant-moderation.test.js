import {
  describe, expect, it, vi,
} from 'vitest';
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import UserList from '@/components/UserList.vue';

vi.stubGlobal('visualViewport', {
  width: 1280, height: 800, addEventListener() {}, removeEventListener() {},
});

const media = {
  type: 'movie', title: 'Movie', machineIdentifier: 'one', ratingKey: '1',
};
const participant = (username, extra = {}) => ({
  username, state: 'playing', media, time: 10000, updatedAt: Date.now(), playbackRate: 1, duration: 60000, ...extra,
});
const setup = (friendOptions = {}) => {
  const kick = vi.fn().mockResolvedValue();
  const transfer = vi.fn().mockResolvedValue();
  const store = createStore({
    getters: { GET_CONFIG: () => ({ sidebar_time_update_interval: 1000 }) },
    modules: {
      settings: { namespaced: true, getters: { GET_ADVANCED_PARTY_MODE: () => false } },
      plexservers: { namespaced: true, getters: { GET_PLEX_SERVER: () => () => ({ name: 'Library' }) } },
      synclounge: {
        namespaced: true,
        state: {
          host: 'me',
          users: {
            me: participant('Host viewer'),
            friend: participant('Morgan with a long display name', friendOptions),
            buffering: participant('Sam', { state: 'buffering' }),
            different: participant('Taylor', { media: { ...media, title: 'Another movie', ratingKey: '2' } }),
            stopped: participant('Alex', { state: 'stopped', media: null }),
          },
        },
        getters: {
          GET_USERS: (state) => state.users,
          GET_HOST_ID: (state) => state.host,
          GET_HOST_USER: (state) => state.users[state.host],
          GET_SOCKET_ID: () => 'me',
          AM_I_HOST: (state) => state.host === 'me',
          GET_ADJUSTED_HOST_TIME: () => () => 10000,
        },
        actions: { KICK_USER: (_, id) => kick(id), TRANSFER_HOST: (_, id) => transfer(id) },
      },
    },
  });
  const wrapper = mount(UserList, {
    attachTo: document.body, global: { plugins: [store, createVuetify({ components, directives })] },
  });
  return {
    wrapper, store, kick, transfer,
  };
};
const body = () => new DOMWrapper(document.body);
const clickText = async (text) => {
  const item = body().findAll('.v-list-item, button').find((element) => element.text() === text);
  await item.trigger('click');
  await flushPromises();
};

describe('participant actions and readable status', () => {
  it('shows basic readiness and the Host badge without advanced controls', () => {
    const { wrapper } = setup();
    try {
      expect(wrapper.text()).toContain('Host');
      expect(wrapper.text()).toContain('In sync');
      expect(wrapper.text()).toContain('Buffering');
      expect(wrapper.text()).toContain('Different movie or episode');
      expect(wrapper.text()).toContain('Not watching');
      expect(wrapper.find('[aria-label="Remove Morgan with a long display name from the room"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it.each([[3000, 'In sync'], [500, '2.0s behind']])('renders readiness with tolerance %s', (tolerance, label) => {
    const { wrapper } = setup({ time: 8000, syncFlexibility: tolerance });
    try {
      const row = wrapper.findAll('.v-list-item').find((item) => item.text().includes('Morgan'));
      expect(row.text()).toContain(label);
    } finally {
      wrapper.unmount();
    }
  });
  it('renders the reported incident as ahead, rather than catching up', () => {
    const { wrapper } = setup({ time: 17000, syncFlexibility: 500 });
    try {
      const row = wrapper.findAll('.v-list-item').find((item) => item.text().includes('Morgan'));
      expect(row.text()).toContain('7.0s ahead');
      expect(row.text()).not.toContain('Catching up');
    } finally { wrapper.unmount(); }
  });
  const moderationCases = [['Remove from room', 'kick'], ['Make host', 'transfer']];
  it.each(moderationCases)('requires named confirmation for %s', async (label, action) => {
    const { wrapper, kick, transfer } = setup();
    try {
      await wrapper.get('[aria-label="Actions for Morgan with a long display name"]').trigger('click');
      await flushPromises();
      await clickText(label);
      expect(kick).not.toHaveBeenCalled();
      expect(transfer).not.toHaveBeenCalled();
      expect(body().findAll('.v-dialog')).toHaveLength(1);
      expect(body().get('.v-dialog').text()).toContain('Morgan with a long display name');
      await body().findAll('.v-dialog button').find((button) => button.text() === label).trigger('click');
      await flushPromises();
      expect(action === 'kick' ? kick : transfer).toHaveBeenCalledExactlyOnceWith('friend');
      expect(action === 'kick' ? transfer : kick).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });
  it('cancels safely and refuses a stale confirmation after host permissions change', async () => {
    const { wrapper, store, kick } = setup();
    try {
      wrapper.vm.requestModeration('friend', 'remove');
      await flushPromises();
      await body().findAll('.v-dialog button').find((button) => button.text() === 'Cancel').trigger('click');
      expect(kick).not.toHaveBeenCalled();
      expect(wrapper.vm.moderation).toBe(null);
      wrapper.vm.requestModeration('friend', 'remove');
      store.state.synclounge.host = 'friend';
      await wrapper.vm.confirmModeration();
      expect(kick).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });
});
