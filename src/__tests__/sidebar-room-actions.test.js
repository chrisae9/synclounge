import {
  describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import TheSidebarLeft from '@/components/TheSidebarLeft.vue';
import TheSidebarRight from '@/components/TheSidebarRight.vue';

vi.mock('@/components/UserList.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MessageList.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/MessageInput.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/ThePwaInstall.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/ReportProblem.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/TheSettingsDialog.vue', () => ({ default: { template: '<div />' } }));

const setup = (component, inRoom = true, host = null) => {
  const disconnect = vi.fn();
  const store = createStore({
    state: { isLeftSidebarOpen: true, isRightSidebarOpen: true },
    mutations: {
      SET_LEFT_SIDEBAR_OPEN(state, value) { state.isLeftSidebarOpen = value; },
      SET_RIGHT_SIDEBAR_OPEN(state, value) { state.isRightSidebarOpen = value; },
    },
    modules: {
      synclounge: {
        namespaced: true,
        state: { syncPreset: null },
        getters: {
          IS_IN_ROOM: () => inRoom,
          GET_USERS: () => ({ me: { username: 'Me' } }),
          GET_HOST_USER: () => host,
          AM_I_HOST: () => false,
          IS_PARTY_PAUSING_ENABLED: () => false,
          IS_AUTO_HOST_ENABLED: () => false,
          GET_ROOM: () => 'movie-night',
          GET_SERVER: () => 'https://fixture.invalid',
        },
        actions: { DISCONNECT_AND_NAVIGATE_HOME: disconnect },
      },
      plex: { namespaced: true, getters: { GET_PLEX_USER: () => null } },
      settings: { namespaced: true, getters: { GET_ADVANCED_PARTY_MODE: () => false } },
    },
  });
  const wrapper = mount(component, {
    global: {
      plugins: [store, createVuetify({ components, directives })],
      stubs: {
        VNavigationDrawer: { template: '<nav><slot name="prepend" /><slot /><slot name="append" /></nav>' },
        UserList: true,
        MessageList: true,
        MessageInput: true,
        ThePwaInstall: true,
        ReportProblem: true,
        TheSettingsDialog: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  return { wrapper, store, disconnect };
};

describe('sidebar close and room exit', () => {
  it.each([
    [TheSidebarLeft, 'Close navigation sidebar', 'isLeftSidebarOpen'],
    [TheSidebarRight, 'Close watch party sidebar', 'isRightSidebarOpen'],
  ])('closes only the selected sidebar without disconnecting', async (component, label, stateKey) => {
    const { wrapper, store, disconnect } = setup(component);
    try {
      const close = wrapper.get(`[aria-label="${label}"]`);
      expect(close.text()).toContain('Close');
      await close.trigger('click');
      expect(store.state[stateKey]).toBe(false);
      expect(store.state[stateKey === 'isLeftSidebarOpen' ? 'isRightSidebarOpen' : 'isLeftSidebarOpen']).toBe(true);
      expect(disconnect).not.toHaveBeenCalled();
      if (component === TheSidebarRight) expect(wrapper.find('[aria-label="Leave room"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('omits host-only control rows for a viewer during playback', () => {
    const { wrapper } = setup(TheSidebarRight, true, { username: 'Host', state: 'playing' });
    try {
      expect(wrapper.findAll('.switch-item')).toHaveLength(0);
      expect(wrapper.get('[aria-label="Pause party"]').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('disconnects only through the labeled navigation action', async () => {
    const { wrapper, store, disconnect } = setup(TheSidebarLeft);
    try {
      const leave = wrapper.get('[aria-label="Leave room"]');
      expect(leave.text()).toContain('Disconnect from this watch party');
      await leave.trigger('click');
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(store.state.isLeftSidebarOpen).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('does not offer room exit outside a room', () => {
    const { wrapper } = setup(TheSidebarLeft, false);
    expect(wrapper.find('[aria-label="Leave room"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
