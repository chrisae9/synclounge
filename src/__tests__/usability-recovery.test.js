import {
  describe, expect, it, vi,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import PlexSearch from '@/views/PlexSearch.vue';
import PlexLibrary from '@/views/PlexLibrary.vue';
import PlexHome from '@/views/PlexHome.vue';
import AdvancedRoomJoin from '@/views/AdvancedRoomJoin.vue';

vi.mock('@/components/PlexThumbnail.vue', () => ({
  __esModule: true, default: { template: '<div>Movie result</div>' },
}));
vi.mock('@/components/PlexOnDeck.vue', () => ({ __esModule: true, default: { template: '<div />' } }));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const server = {
  clientIdentifier: 'one',
  name: 'Movie library',
  chosenConnection: {},
  libraries: { 1: { title: 'Movies', type: 'movie' } },
};
const setup = (component, options = {}) => {
  const search = options.search || vi.fn().mockResolvedValue([]);
  const fetchContents = options.fetchContents || vi.fn().mockResolvedValue([]);
  const refresh = options.refresh || vi.fn().mockResolvedValue();
  const connect = vi.fn().mockResolvedValue();
  const store = createStore({
    state: { listView: false },
    getters: {
      IS_LIBRARY_LIST_VIEW: (state) => state.listView,
      GET_CONFIG: () => ({ servers: [{ url: 'https://service.invalid', name: 'Movie night' }] }),
    },
    mutations: { SET_ACTIVE_METADATA() {} },
    modules: {
      settings: {
        namespaced: true,
        state: { customServerUrl: 'https://' },
        mutations: { SET_CUSTOM_SERVER_URL(state, value) { state.customServerUrl = value; } },
      },
      plex: { namespaced: true, actions: { FETCH_PLEX_DEVICES: () => refresh() } },
      synclounge: {
        namespaced: true,
        state: { health: {} },
        getters: {
          GET_ROOM: () => 'room',
          GET_SERVER: () => 'https://service.invalid',
          GET_SERVER_HEALTH: (state) => (url) => state.health[url],
        },
        actions: {
          FETCH_SERVERS_HEALTH: () => {},
          SET_AND_CONNECT_AND_JOIN_ROOM: (_, payload) => connect(payload),
          DISCONNECT_IF_CONNECTED() {},
        },
      },
      plexservers: {
        namespaced: true,
        state: { enabled: options.enabled ?? true, available: options.available ?? true },
        getters: {
          GET_PLEX_SERVERS: () => [options.server || server],
          GET_LAST_SERVER: () => options.server || server,
          GET_LAST_SERVER_ID: () => 'one',
          GET_PLEX_SERVER: () => () => server,
          GET_ENABLED_PLEX_SERVER_IDS: (state) => (state.enabled && state.available ? (options.ids || ['one']) : []),
          IS_PLEX_SERVER_ENABLED: (state) => () => state.enabled,
          GET_SERVER_LIBRARY_SIZE: () => () => 0,
          GET_MEDIA_IMAGE_URL: () => () => '',
        },
        actions: {
          SEARCH_PLEX_SERVER_HUB: (_, payload) => search(payload),
          FETCH_LIBRARY_CONTENTS: (_, payload) => fetchContents(payload),
          FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE() {},
        },
        mutations: { TOGGLE_SERVER_ENABLED(state) { state.enabled = !state.enabled; } },
      },
    },
  });
  let props = {};
  if (component === PlexSearch) props = { query: 'Missing' };
  if (component === PlexLibrary) props = { machineIdentifier: 'one', sectionId: '1' };
  const wrapper = mount(component, {
    props: options.props || props,
    global: {
      plugins: [store, createVuetify({ components, directives })],
      mocks: { $route: { name: 'AdvancedRoomJoin', query: {} }, $router: { push: vi.fn() } },
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      directives: { intersect: {} },
    },
  });
  return {
    wrapper, store, search, fetchContents, refresh, connect,
  };
};

describe('search recovery', () => {
  it.each([
    [{}, 'No matches'],
    [{ enabled: false }, 'No libraries enabled'],
    [{ available: false }, 'Couldn’t reach your libraries'],
  ])('distinguishes library search state: %s', async (options, title) => {
    const { wrapper } = setup(PlexSearch, options);
    await flushPromises();
    expect(wrapper.text()).toContain(title);
    wrapper.unmount();
  });
  it('retries a failed search without presenting it as no matches', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const { wrapper } = setup(PlexSearch, { search });
    await flushPromises();
    expect(wrapper.text()).toContain('Couldn’t search all libraries');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(search).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('No matches');
    wrapper.unmount();
  });
  it('retains results from healthy servers when another server fails', async () => {
    const search = vi.fn(({ machineIdentifier }) => (machineIdentifier === 'one'
      ? Promise.resolve([{ hubIdentifier: 'movies', title: 'Available movies', Metadata: [{ ratingKey: '1' }] }])
      : Promise.reject(new Error('offline'))));
    const { wrapper } = setup(PlexSearch, { search, ids: ['one', 'two'] });
    await flushPromises();
    expect(wrapper.text()).toContain('Available movies');
    expect(wrapper.text()).toContain('Couldn’t search all libraries');
    wrapper.unmount();
  });
  it('ignores obsolete search responses even if a server ignores abort', async () => {
    const old = deferred();
    const current = deferred();
    const search = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { wrapper } = setup(PlexSearch, { search });
    await wrapper.setProps({ query: 'New query' });
    current.resolve([{ hubIdentifier: 'new', title: 'Current results', Metadata: [{ ratingKey: '2' }] }]);
    await flushPromises();
    old.resolve([{ hubIdentifier: 'old', title: 'Obsolete results', Metadata: [{ ratingKey: '1' }] }]);
    await flushPromises();
    expect(wrapper.text()).toContain('Current results');
    expect(wrapper.text()).not.toContain('Obsolete results');
    expect(wrapper.vm.loading).toBe(false);
    wrapper.unmount();
  });
});

describe('library recovery', () => {
  it('offers inline retry without advancing the failed page', async () => {
    const fetchContents = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const { wrapper } = setup(PlexLibrary, { fetchContents });
    await wrapper.vm.fetchMoreContent();
    expect(wrapper.text()).toContain('Couldn’t load this library');
    expect(wrapper.vm.itemsPerPage).toBe(0);
    await wrapper.findAll('button').find((button) => button.text() === 'Retry').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('This library is empty');
    expect(fetchContents.mock.calls.map(([payload]) => payload.start)).toEqual([0, 0]);
    wrapper.unmount();
  });
  it('clears a letter filter after no matches', async () => {
    const { wrapper, fetchContents } = setup(PlexLibrary);
    await wrapper.vm.setFirstCharacter('Z');
    await flushPromises();
    expect(wrapper.text()).toContain('No matches');
    await wrapper.findAll('button').find((button) => button.text() === 'Clear filters').trigger('click');
    await flushPromises();
    expect(fetchContents.mock.calls.at(-1)[0].firstCharacter).toBe(null);
    expect(wrapper.text()).toContain('This library is empty');
    wrapper.unmount();
  });
  it('discards old library pages when the filter changes', async () => {
    const old = deferred();
    const fetchContents = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
    const { wrapper } = setup(PlexLibrary, { fetchContents });
    const pending = wrapper.vm.fetchMoreContent();
    await wrapper.vm.setFirstCharacter('Z');
    await flushPromises();
    old.resolve([{ ratingKey: 'obsolete' }]);
    await pending;
    expect(wrapper.vm.contents).toEqual([]);
    wrapper.unmount();
  });
});

describe('connection recovery', () => {
  it('names server controls and retries unavailable Plex servers', async () => {
    const { wrapper, refresh } = setup(PlexHome, { server: { ...server, chosenConnection: null } });
    await flushPromises();
    expect(wrapper.text()).toContain('Can’t reach this Plex server');
    expect(wrapper.text()).not.toContain('Try disabling your adblocker');
    expect(wrapper.get('[aria-label="Refresh Plex servers"]').exists()).toBe(true);
    await wrapper.findAll('button').find((button) => button.text() === 'Retry connection').trigger('click');
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[aria-label="Hide libraries from Movie library"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('shows hidden libraries separately from failed connections', async () => {
    const { wrapper } = setup(PlexHome, { enabled: false });
    await flushPromises();
    expect(wrapper.text()).toContain('No libraries enabled');
    expect(wrapper.text()).not.toContain('Can’t reach this Plex server');
    expect(wrapper.get('[aria-label="Show libraries from Movie library"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('blocks malformed custom addresses and unavailable configured services', async () => {
    const { wrapper, store, connect } = setup(AdvancedRoomJoin);
    await flushPromises();
    expect(wrapper.get('[aria-label="Connect to Movie night"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Connect to custom SyncLounge service"]').attributes('disabled')).toBeDefined();
    await wrapper.vm.connect('https://');
    expect(connect).not.toHaveBeenCalled();
    const invalidAddresses = [
      'ftp://example.com', 'https://user:password@example.com', 'https://example.com?token=test',
    ];
    for (const address of invalidAddresses) {
      store.commit('settings/SET_CUSTOM_SERVER_URL', address);
      expect(wrapper.vm.customServerError).not.toBe('');
    }
    store.commit('settings/SET_CUSTOM_SERVER_URL', 'https://example.com/lounge');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="Connect to custom SyncLounge service"]').attributes('disabled')).toBeUndefined();
    await wrapper.vm.connect(store.state.settings.customServerUrl, true);
    store.commit('settings/SET_CUSTOM_SERVER_URL', store.getters.GET_CONFIG.servers[0].url);
    await wrapper.get('[aria-label="Connect to custom SyncLounge service"]').trigger('click');
    await flushPromises();
    expect(connect).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
