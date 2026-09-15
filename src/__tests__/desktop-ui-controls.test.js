import {
  describe, expect, it, vi,
} from 'vitest';
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import PlexItem from '@/components/PlexItem.vue';
import PlexMediaPlayDialog from '@/components/PlexMediaPlayDialog.vue';
import TheSidebarRightButton from '@/components/TheSidebarRightButton.vue';
import TheUpnextDialog from '@/components/TheUpnextDialog.vue';

vi.stubGlobal('visualViewport', {
  width: 1280, height: 800, addEventListener() {}, removeEventListener() {},
});

const vuetify = () => createVuetify({ components, directives });
const metadata = {
  machineIdentifier: 'server-1',
  viewOffset: 120000,
  Media: [720, 1080].map((resolution) => ({
    videoResolution: String(resolution),
    duration: 600000,
    videoCodec: 'h264',
    bitrate: 4000,
    Part: [{ key: `/media/${resolution}`, Stream: [] }],
  })),
};

describe('desktop playback choices', () => {
  it.each([undefined, 0])('starts an unwatched item without a resume dialog (offset=%s)', async (viewOffset) => {
    const play = vi.fn();
    const item = {
      ...metadata,
      viewOffset,
      ratingKey: 'movie-1',
      type: 'movie',
      title: 'Unwatched movie',
      year: 2026,
      duration: 600000,
      Media: [metadata.Media[0]],
    };
    const store = createStore({
      modules: {
        plexclients: {
          namespaced: true,
          getters: { GET_ACTIVE_MEDIA_METADATA: () => null },
          actions: { PLAY_MEDIA: (_, payload) => play(payload) },
        },
        plexservers: {
          namespaced: true,
          actions: { FETCH_RELATED: () => [] },
        },
      },
    });
    const wrapper = mount(PlexItem, {
      props: { metadata: item },
      global: {
        plugins: [store, vuetify()],
        stubs: { PlexMediaLayout: { template: '<section><slot name="actions" /></section>' } },
      },
    });
    try {
      await flushPromises();
      const button = wrapper.get('button');
      expect(button.text()).toContain('Play');
      expect(wrapper.text()).not.toContain('Resume');
      expect(wrapper.findComponent(PlexMediaPlayDialog).exists()).toBe(false);
      await button.trigger('click');
      await flushPromises();
      expect(play).toHaveBeenCalledExactlyOnceWith({
        metadata: item,
        machineIdentifier: 'server-1',
        mediaIndex: 0,
        offset: 0,
        userInitiated: true,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it.each([true, false])('plays the selected version with resume=%s', async (resume) => {
    vi.useFakeTimers();
    const play = vi.fn();
    const store = createStore({
      modules: { plexclients: { namespaced: true, actions: { PLAY_MEDIA: (_, payload) => play(payload) } } },
    });
    const wrapper = mount(PlexMediaPlayDialog, {
      props: { metadata },
      attachTo: document.body,
      global: {
        plugins: [store, vuetify()],

      },
    });
    try {
      await wrapper.setData({ dialog: true });
      await flushPromises();
      await vi.advanceTimersByTimeAsync(300);
      const dialog = new DOMWrapper(document.body);
      await dialog.get('input[type="checkbox"]').setValue(resume);
      const buttons = dialog.findAll('.playback-option-action');
      expect(buttons.map((button) => button.text())).toEqual([resume ? 'Resume' : 'Play', resume ? 'Resume' : 'Play']);
      await buttons[1].trigger('click');
      await flushPromises();
      expect(play).toHaveBeenCalledExactlyOnceWith({
        metadata,
        machineIdentifier: 'server-1',
        mediaIndex: 1,
        offset: resume ? 120000 : 0,
        userInitiated: true,
      });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
});

describe('watch party opener', () => {
  it('does not duplicate the drawer close action and returns after the drawer closes', async () => {
    const store = createStore({
      state: { isRightSidebarOpen: true },
      mutations: {
        SET_RIGHT_SIDEBAR_OPEN: (state, open) => { state.isRightSidebarOpen = open; },
        TOGGLE_RIGHT_SIDEBAR_OPEN: (state) => { state.isRightSidebarOpen = !state.isRightSidebarOpen; },
      },
    });
    const wrapper = mount(TheSidebarRightButton, { global: { plugins: [store, vuetify()] } });
    try {
      expect(wrapper.find('button').exists()).toBe(false);
      store.commit('SET_RIGHT_SIDEBAR_OPEN', false);
      await wrapper.vm.$nextTick();
      await wrapper.get('button[aria-label="Open watch party"]').trigger('click');
      expect(store.state.isRightSidebarOpen).toBe(true);
      expect(wrapper.find('button').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('up next cancellation', () => {
  it('cancels the pending automatic playback through the remaining Cancel action', async () => {
    vi.useFakeTimers();
    const playNext = vi.fn();
    const clearNext = vi.fn();
    const store = createStore({
      getters: {
        GET_CONFIG: () => ({ synclounge_upnext_popup_lifetime: 10000 }),
        GET_UP_NEXT_POST_PLAY_DATA: () => ({ machineIdentifier: 'server-1', title: 'Next episode', type: 'movie' }),
      },
      mutations: { SET_UP_NEXT_POST_PLAY_DATA: (_, value) => clearNext(value) },
      modules: {
        plexclients: { namespaced: true, actions: { PLAY_NEXT: playNext } },
        plexservers: {
          namespaced: true,
          getters: { GET_PLEX_SERVER: () => () => ({ name: 'Library' }), GET_MEDIA_IMAGE_URL: () => () => '' },
        },
      },
    });
    const wrapper = mount(TheUpnextDialog, {
      attachTo: document.body,
      global: { plugins: [store, vuetify()] },
    });
    try {
      await wrapper.vm.$nextTick();
      const buttons = new DOMWrapper(document.body).findAll('.v-bottom-sheet button');
      expect(buttons.map((button) => button.text())).toEqual(['Play Now', 'Cancel']);
      await buttons[1].trigger('click');
      expect(clearNext).toHaveBeenCalledExactlyOnceWith(null);
      await vi.advanceTimersByTimeAsync(10001);
      expect(playNext).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
});
