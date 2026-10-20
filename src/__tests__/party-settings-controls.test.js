import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import TheSettingsDialog from '@/components/TheSettingsDialog.vue';
import settings from '@/store/modules/settings';

it.each([true, false])('keeps room policy controls scoped to the host (host: %s)', async (host) => {
  const autoHost = vi.fn();
  const preset = vi.fn();
  const store = createStore({
    getters: { GET_CONFIG: () => ({ default_sync_flexability: 3000, default_client_poll_interval: 1000 }) },
    modules: {
      settings,
      synclounge: {
        namespaced: true,
        state: { syncPreset: 'personal', isInRoom: true },
        getters: {
          AM_I_HOST: () => host,
          IS_AUTO_HOST_ENABLED: () => false,
          ARE_NOTIFICATIONS_ENABLED: () => false,
          ARE_SOUND_NOTIFICATIONS_ENABLED: () => false,
        },
        actions: {
          SEND_SET_AUTO_HOST_ENABLED: (_, value) => autoHost(value),
          SEND_SYNC_PRESET: (_, value) => preset(value),
        },
      },
      slplayer: { namespaced: true, state: {}, getters: { GET_STREAMING_PROTOCOL: () => 'hls' } },
      plexservers: { namespaced: true, getters: { GET_PLEX_SERVERS: () => [], GET_BLOCKED_SERVER_IDS: () => [] } },
      plex: { namespaced: true, getters: { GET_PLEX_USER: () => null } },
    },
  });
  const wrapper = mount(TheSettingsDialog, {
    data: () => ({ dialogOpen: true, advancedOpen: 0 }),
    global: {
      plugins: [store, createVuetify({ components, directives })],
      stubs: {
        VDialog: { template: '<div><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  try {
    await flushPromises();
    await wrapper.get('input[aria-label="Show party diagnostics"]').setValue(true);
    expect(store.getters['settings/GET_ADVANCED_PARTY_MODE']).toBe(true);
    const transfer = wrapper.find('input[aria-label="Transfer host automatically"]');
    expect(transfer.exists()).toBe(host);
    const selection = wrapper.findAllComponents(components.VSelect)
      .find((node) => node.find('[aria-label="Room synchronization"]').exists());
    expect(selection.props('disabled')).toBe(!host);
    expect(selection.props('modelValue')).toBe('personal');
    if (host) {
      await transfer.setValue(true);
      expect(autoHost).toHaveBeenCalledWith(true);
      selection.vm.$emit('update:modelValue', 'relaxed');
      await flushPromises();
      expect(preset).toHaveBeenCalledWith('relaxed');
    }
  } finally { wrapper.unmount(); }
});
