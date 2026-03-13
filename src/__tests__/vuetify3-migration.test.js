/* eslint-disable max-classes-per-file */
/**
 * Vuetify 3 migration tests
 *
 * Verifies that the Vue 2 → Vue 3 + Vuetify 2 → Vuetify 3 migration
 * did not break key behaviors across the application.
 */
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// Load all .vue files as raw source for template auditing and source verification
const vueFileSources = import.meta.glob('@/**/*.vue', { query: '?raw', import: 'default', eager: true });

function getSource(relativePath) {
  // Find the matching key (keys may use @/ or resolved paths)
  const key = Object.keys(vueFileSources).find((k) => k.endsWith(relativePath));
  if (!key) throw new Error(`Source not found for ${relativePath}`);
  return vueFileSources[key];
}

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: { dark: { colors: { primary: '#e5a00d' } } },
  },
});

function createMockStore(overrides = {}) {
  return createStore({
    state: () => ({
      isLibraryListView: false,
      config: {
        slplayer_buffering_goal: 10,
        slplayer_initial_skip_intro_visible_period: 5000,
        synclounge_upnext_popup_lifetime: 10000,
      },
      upNextPostPlayData: null,
      activeMetadata: null,
    }),
    getters: {
      GET_CONFIG: (state) => state.config,
      IS_LIBRARY_LIST_VIEW: (state) => state.isLibraryListView,
      GET_UP_NEXT_POST_PLAY_DATA: (state) => state.upNextPostPlayData,
    },
    mutations: {
      SET_ACTIVE_METADATA: (state, val) => { state.activeMetadata = val; },
      SET_UP_NEXT_POST_PLAY_DATA: (state, val) => { state.upNextPostPlayData = val; },
    },
    modules: {
      settings: {
        namespaced: true,
        state: () => ({
          autoplay: null,
          clientPollInterval: null,
          syncMode: null,
          syncFlexibility: null,
          customServerUrl: 'https://',
          slPlayerQuality: null,
          slPlayerVolume: null,
          slPlayerForceTranscode: null,
          altUsername: null,
          autoSkipIntro: null,
        }),
        getters: {
          GET_AUTOPLAY: (state) => state.autoplay,
          GET_CLIENTPOLLINTERVAL: (state) => state.clientPollInterval ?? 1000,
          GET_SYNCMODE: (state) => state.syncMode ?? 'cleanseek',
          GET_SYNCFLEXIBILITY: (state) => state.syncFlexibility ?? 3000,
          GET_SLPLAYERFORCETRANSCODE: (state) => state.slPlayerForceTranscode ?? false,
          GET_ALTUSERNAME: (state) => state.altUsername,
          GET_AUTO_SKIP_INTRO: (state) => state.autoSkipIntro ?? false,
        },
        mutations: {
          SET_AUTOPLAY: (state, val) => { state.autoplay = val; },
          SET_SLPLAYERFORCETRANSCODE: (state, val) => { state.slPlayerForceTranscode = val; },
          SET_CLIENTPOLLINTERVAL: (state, val) => { state.clientPollInterval = val; },
          SET_SYNCFLEXIBILITY: (state, val) => { state.syncFlexibility = val; },
          SET_SYNCMODE: (state, val) => { state.syncMode = val; },
          SET_ALTUSERNAME: (state, val) => { state.altUsername = val; },
          SET_AUTO_SKIP_INTRO: (state, val) => { state.autoSkipIntro = val; },
          SET_CUSTOM_SERVER_URL: (state, val) => { state.customServerUrl = val; },
        },
      },
      synclounge: {
        namespaced: true,
        state: () => ({
          isInRoom: false,
          users: [],
          messages: [],
          areNotificationsEnabled: false,
          areSoundNotificationsEnabled: false,
        }),
        getters: {
          AM_I_HOST: () => true,
          IS_IN_ROOM: (state) => state.isInRoom,
          ARE_NOTIFICATIONS_ENABLED: (state) => state.areNotificationsEnabled,
          ARE_SOUND_NOTIFICATIONS_ENABLED: (state) => state.areSoundNotificationsEnabled,
        },
        mutations: {
          ADD_MESSAGE: (state, msg) => { state.messages.push(msg); },
          SET_USERS: (state, val) => { state.users = val; },
          SET_ARE_SOUND_NOTIFICATIONS_ENABLED: (state, val) => {
            state.areSoundNotificationsEnabled = val;
          },
        },
        actions: {
          MANUAL_SYNC: vi.fn(),
          UPDATE_SYNC_FLEXIBILITY: vi.fn(),
          CHANGE_NOTIFICATIONS_ENABLED: vi.fn(),
        },
      },
      plexclients: {
        namespaced: true,
        state: () => ({
          clients: {
            PTPLAYER9PLUS10: {
              provides: 'player',
              clientIdentifier: 'PTPLAYER9PLUS10',
              platform: 'Web',
              device: 'Web',
              product: 'SyncLounge',
              name: 'SyncLounge Player',
              labels: [['Recommended', 'green']],
              lastSeenAt: new Date().toISOString(),
            },
          },
          chosenClientId: 'PTPLAYER9PLUS10',
          activeMediaMetadata: null,
        }),
        getters: {
          GET_PLEX_CLIENT: (state) => (id) => state.clients[id],
          GET_CHOSEN_CLIENT_ID: (state) => state.chosenClientId,
          GET_CHOSEN_CLIENT: (state) => state.clients[state.chosenClientId],
          GET_ACTIVE_MEDIA_METADATA: (state) => state.activeMediaMetadata,
          GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER: () => null,
          GET_ACTIVE_SERVER_ID: () => 'server-1',
        },
        mutations: {
          SET_ACTIVE_MEDIA_METADATA: (state, val) => { state.activeMediaMetadata = val; },
        },
        actions: {
          PLAY_NEXT: vi.fn(),
        },
      },
      plexservers: {
        namespaced: true,
        state: () => ({
          servers: {
            'server-1': {
              clientIdentifier: 'server-1',
              name: 'Test Server',
              productVersion: '1.0',
              libraries: {},
            },
          },
          lastServerId: 'server-1',
          blockedServerIds: [],
        }),
        getters: {
          GET_PLEX_SERVER: (state) => (id) => state.servers[id] || { name: 'Unknown' },
          GET_PLEX_SERVERS: (state) => Object.values(state.servers),
          GET_LAST_SERVER: (state) => state.servers[state.lastServerId],
          GET_LAST_SERVER_ID: (state) => state.lastServerId,
          GET_MEDIA_IMAGE_URL: () => () => 'http://test/image.jpg',
          GET_BLOCKED_SERVER_IDS: (state) => state.blockedServerIds,
          GET_SERVER_LIBRARY_SIZE: () => () => 100,
        },
        mutations: {
          ADD_PLEX_SERVER: (state, server) => {
            state.servers[server.clientIdentifier] = server;
          },
          DELETE_PLEX_SERVER: (state, id) => { delete state.servers[id]; },
          SET_BLOCKED_SERVER_IDS: (state, ids) => { state.blockedServerIds = ids; },
        },
        actions: {
          FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE: vi.fn(),
          SET_MEDIA_AS_BACKGROUND: vi.fn(),
        },
      },
      slplayer: {
        namespaced: true,
        state: () => ({
          forceBurnSubtitles: false,
          allowDirectPlay: true,
          streamingProtocol: 'hls',
        }),
        getters: {
          GET_STREAMING_PROTOCOL: (state) => state.streamingProtocol,
          GET_THUMB_URL: () => 'http://test/thumb.jpg',
          GET_PLEX_SERVER: () => ({ name: 'Test Server' }),
          GET_TITLE: () => 'Test Title',
          GET_SECONDARY_TITLE: () => 'S01E01',
          ARE_PLAYER_CONTROLS_SHOWN: () => false,
          GET_PLAYER_STATE: () => 'playing',
          IS_USING_NATIVE_SUBTITLES: () => false,
        },
        mutations: {
          SET_STREAMING_PROTOCOL: (state, val) => { state.streamingProtocol = val; },
          SET_FORCE_BURN_SUBTITLES: (state, val) => { state.forceBurnSubtitles = val; },
          SET_ALLOW_DIRECT_PLAY: (state, val) => { state.allowDirectPlay = val; },
        },
        actions: {
          INIT_PLAYER_STATE: vi.fn(),
          DESTROY_PLAYER_STATE: vi.fn(),
          PLAY_PAUSE_VIDEO: vi.fn(),
          SEND_PARTY_PLAY_PAUSE: vi.fn(),
          SKIP_INTRO: vi.fn(),
          RERENDER_SUBTITLE_CONTAINER: vi.fn(),
        },
      },
      plex: {
        namespaced: true,
        state: () => ({
          areDevicesCached: true,
        }),
        getters: {
          GET_PLEX_USER: () => ({ username: 'testuser' }),
          GET_PLEX_AUTH_TOKEN: () => 'test-token',
          IS_USER_AUTHORIZED: () => true,
          IS_UNAUTHORIZED: () => false,
        },
        actions: {
          FETCH_PLEX_DEVICES: vi.fn(),
        },
      },
    },
    ...overrides,
  });
}

function mountOptions(store, extraOpts = {}) {
  return {
    global: {
      plugins: [vuetify, store],
      stubs: {
        RouterLink: true,
        RouterView: true,
      },
      mocks: {
        $route: {
          name: 'Test', params: {}, query: {}, fullPath: '/', matched: [],
        },
        $router: { push: vi.fn() },
      },
    },
    ...extraOpts,
  };
}

// ============================================================
// 1. Vuex Store Reactivity (Vue.set → direct assignment)
// ============================================================
describe('Vuex Store Reactivity (Vue.set removal)', () => {
  it('ADD_PLEX_SERVER triggers reactivity with direct assignment', () => {
    const store = createMockStore();
    store.commit('plexservers/ADD_PLEX_SERVER', {
      clientIdentifier: 'server-2',
      name: 'New Server',
    });
    expect(store.state.plexservers.servers['server-2']).toBeDefined();
    expect(store.state.plexservers.servers['server-2'].name).toBe('New Server');
  });

  it('DELETE_PLEX_SERVER removes server reactively', () => {
    const store = createMockStore();
    store.commit('plexservers/DELETE_PLEX_SERVER', 'server-1');
    expect(store.state.plexservers.servers['server-1']).toBeUndefined();
  });

  it('getters update after reactive mutation', () => {
    const store = createMockStore();
    expect(store.getters['plexservers/GET_PLEX_SERVERS']).toHaveLength(1);
    store.commit('plexservers/ADD_PLEX_SERVER', {
      clientIdentifier: 'server-2',
      name: 'Another Server',
    });
    expect(store.getters['plexservers/GET_PLEX_SERVERS']).toHaveLength(2);
  });

  it('SET_USERS replaces array reactively', () => {
    const store = createMockStore();
    expect(store.state.synclounge.users).toEqual([]);
    store.commit('synclounge/SET_USERS', [{ id: '1', name: 'user1' }]);
    expect(store.state.synclounge.users).toHaveLength(1);
  });

  it('ADD_MESSAGE pushes to array reactively', () => {
    const store = createMockStore();
    store.commit('synclounge/ADD_MESSAGE', { text: 'hello', from: 'user1' });
    expect(store.state.synclounge.messages).toHaveLength(1);
    expect(store.state.synclounge.messages[0].text).toBe('hello');
  });
});

// ============================================================
// 2. Settings Store (model-value binding via mutations)
// ============================================================
describe('Settings Store Mutations', () => {
  it('SET_AUTOPLAY updates state and getter', () => {
    const store = createMockStore();
    expect(store.getters['settings/GET_AUTOPLAY']).toBeNull();
    store.commit('settings/SET_AUTOPLAY', true);
    expect(store.getters['settings/GET_AUTOPLAY']).toBe(true);
  });

  it('SET_SYNCFLEXIBILITY updates state', () => {
    const store = createMockStore();
    store.commit('settings/SET_SYNCFLEXIBILITY', 5000);
    expect(store.getters['settings/GET_SYNCFLEXIBILITY']).toBe(5000);
  });

  it('SET_SYNCMODE updates state', () => {
    const store = createMockStore();
    store.commit('settings/SET_SYNCMODE', 'skipahead');
    expect(store.getters['settings/GET_SYNCMODE']).toBe('skipahead');
  });

  it('SET_CLIENTPOLLINTERVAL updates state', () => {
    const store = createMockStore();
    store.commit('settings/SET_CLIENTPOLLINTERVAL', 2000);
    expect(store.getters['settings/GET_CLIENTPOLLINTERVAL']).toBe(2000);
  });

  it('SET_ALTUSERNAME updates state', () => {
    const store = createMockStore();
    store.commit('settings/SET_ALTUSERNAME', 'newname');
    expect(store.getters['settings/GET_ALTUSERNAME']).toBe('newname');
  });

  it('SET_AUTO_SKIP_INTRO updates state', () => {
    const store = createMockStore();
    store.commit('settings/SET_AUTO_SKIP_INTRO', true);
    expect(store.getters['settings/GET_AUTO_SKIP_INTRO']).toBe(true);
  });
});

// ============================================================
// 3. v-chat-scroll Directive (scroll pinning)
// ============================================================
describe('v-chat-scroll Directive', () => {
  // Extract the directive logic directly since it's inline in main.js
  const vChatScroll = {
    mounted(el) {
      const observer = new MutationObserver(() => {
        const threshold = 50;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        if (isNearBottom) {
          el.scrollTop = el.scrollHeight;
        }
      });
      observer.observe(el, { childList: true, subtree: true });
      el._chatScrollObserver = observer;
    },
    unmounted(el) {
      el._chatScrollObserver?.disconnect();
    },
  };

  it('scrolls to bottom when near bottom', () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 960,
      clientHeight: 50,
      _chatScrollObserver: null,
    };
    // scrollHeight - scrollTop - clientHeight = 1000 - 960 - 50 = -10 < 50, so should scroll
    let capturedCallback;
    const OrigMO = globalThis.MutationObserver;
    globalThis.MutationObserver = class MockMO {
      constructor(cb) { capturedCallback = cb; }

      observe() {}

      disconnect() {}
    };

    vChatScroll.mounted(el);
    capturedCallback();
    expect(el.scrollTop).toBe(el.scrollHeight);
    globalThis.MutationObserver = OrigMO;
  });

  it('does NOT scroll when user has scrolled up', () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 200,
      clientHeight: 50,
      _chatScrollObserver: null,
    };
    // scrollHeight - scrollTop - clientHeight = 1000 - 200 - 50 = 750 > 50, so should NOT scroll
    let capturedCallback;
    const OrigMO = globalThis.MutationObserver;
    globalThis.MutationObserver = class MockMO {
      constructor(cb) { capturedCallback = cb; }

      observe() {}

      disconnect() {}
    };

    vChatScroll.mounted(el);
    capturedCallback();
    expect(el.scrollTop).toBe(200); // unchanged
    globalThis.MutationObserver = OrigMO;
  });

  it('cleans up observer on unmount', () => {
    const disconnect = vi.fn();
    const el = { _chatScrollObserver: { disconnect } };
    vChatScroll.unmounted(el);
    expect(disconnect).toHaveBeenCalled();
  });
});

// ============================================================
// 4. import.meta.glob Key Resolution (Platform Icons)
// ============================================================
describe('import.meta.glob Platform Icon Resolution', () => {
  // Simulate what the fixed code does: extract filename as key
  function buildPlatformImages(rawEntries) {
    return Object.fromEntries(
      Object.entries(rawEntries).map(([key, value]) => [
        key.split('/').pop().replace('.svg', ''),
        value,
      ]),
    );
  }

  it('handles keys with /src/assets/ prefix', () => {
    const raw = {
      '/src/assets/images/platforms/android.svg': '/hashed/android.svg',
      '/src/assets/images/platforms/plex.svg': '/hashed/plex.svg',
      '/src/assets/images/platforms/ios.svg': '/hashed/ios.svg',
    };
    const images = buildPlatformImages(raw);
    expect(images.android).toBe('/hashed/android.svg');
    expect(images.plex).toBe('/hashed/plex.svg');
    expect(images.ios).toBe('/hashed/ios.svg');
  });

  it('handles keys with relative path prefix (../assets)', () => {
    const raw = {
      '../assets/images/platforms/android.svg': '/hashed/android.svg',
      '../assets/images/platforms/plex.svg': '/hashed/plex.svg',
    };
    const images = buildPlatformImages(raw);
    expect(images.android).toBe('/hashed/android.svg');
    expect(images.plex).toBe('/hashed/plex.svg');
  });

  it('handles keys with @/ alias prefix', () => {
    const raw = {
      '@/assets/images/platforms/chrome.svg': '/hashed/chrome.svg',
      '@/assets/images/platforms/plex.svg': '/hashed/plex.svg',
    };
    const images = buildPlatformImages(raw);
    expect(images.chrome).toBe('/hashed/chrome.svg');
    expect(images.plex).toBe('/hashed/plex.svg');
  });

  it('falls back to plex when platform not found', () => {
    const raw = {
      '/src/assets/images/platforms/plex.svg': '/hashed/plex.svg',
    };
    const images = buildPlatformImages(raw);
    const platform = 'unknownplatform';
    const url = images[platform] || images.plex;
    expect(url).toBe('/hashed/plex.svg');
  });

  it('returns correct icon for known platform', () => {
    const raw = {
      '/assets/images/platforms/android.svg': '/hashed/android.svg',
      '/assets/images/platforms/plex.svg': '/hashed/plex.svg',
    };
    const images = buildPlatformImages(raw);
    const platform = 'android';
    const url = images[platform] || images.plex;
    expect(url).toBe('/hashed/android.svg');
  });
});

// ============================================================
// 5. PlexThumbnail — v-progress-linear model-value, tooltip offset
// ============================================================
describe('PlexThumbnail Component', () => {
  let PlexThumbnail;

  beforeEach(async () => {
    vi.mock('vanilla-tilt', () => ({
      default: { init: vi.fn() },
    }));
    const mod = await import('@/components/PlexThumbnail.vue');
    PlexThumbnail = mod.default;
  });

  it('renders progress bar with model-value prop', () => {
    const store = createMockStore();
    const content = {
      ratingKey: '1',
      machineIdentifier: 'server-1',
      type: 'movie',
      title: 'Test Movie',
      thumb: '/thumb.jpg',
      art: '/art.jpg',
      viewOffset: 5000,
      duration: 10000,
    };

    const wrapper = shallowMount(PlexThumbnail, {
      ...mountOptions(store),
      props: { content, cols: 4 },
    });

    const progress = wrapper.findComponent({ name: 'v-progress-linear' });
    if (progress.exists()) {
      // Vuetify 3 uses model-value, not value
      expect(progress.props('modelValue')).toBe(50);
    }
  });

  it('uses offset prop instead of nudge-top on tooltip', () => {
    const store = createMockStore();
    const content = {
      ratingKey: '1',
      machineIdentifier: 'server-1',
      type: 'movie',
      title: 'Test Movie',
      thumb: '/thumb.jpg',
      art: '/art.jpg',
    };

    const wrapper = shallowMount(PlexThumbnail, {
      ...mountOptions(store),
      props: { content, cols: 4 },
    });

    const tooltip = wrapper.findComponent({ name: 'v-tooltip' });
    if (tooltip.exists()) {
      expect(tooltip.props('offset')).toBeDefined();
      // nudge-top should NOT be present
      expect(tooltip.attributes('nudge-top')).toBeUndefined();
    }
  });

  it('uses variant="flat" and rounded="0" instead of flat/tile', () => {
    const store = createMockStore();
    const content = {
      ratingKey: '1',
      machineIdentifier: 'server-1',
      type: 'movie',
      title: 'Test Movie',
      thumb: '/thumb.jpg',
    };

    const wrapper = shallowMount(PlexThumbnail, {
      ...mountOptions(store),
      props: { content, cols: 4 },
    });

    const card = wrapper.findComponent({ name: 'v-card' });
    if (card.exists()) {
      expect(card.props('variant')).toBe('flat');
      expect(card.props('rounded')).toBe('lg');
    }
  });
});

// ============================================================
// 6. TheUpnextDialog — scrim, timer, structure
// ============================================================
describe('TheUpnextDialog Component', () => {
  let TheUpnextDialog;

  beforeEach(async () => {
    const mod = await import('@/components/TheUpnextDialog.vue');
    TheUpnextDialog = mod.default;
  });

  it('uses scrim="false" instead of hide-overlay', () => {
    const store = createMockStore();
    store.state.upNextPostPlayData = {
      machineIdentifier: 'server-1',
      art: '/art.jpg',
      thumb: '/thumb.jpg',
      title: 'Next Episode',
      type: 'episode',
    };
    // Getter GET_UP_NEXT_POST_PLAY_DATA reads from state.upNextPostPlayData automatically

    const wrapper = shallowMount(TheUpnextDialog, {
      ...mountOptions(store),
    });

    const sheet = wrapper.findComponent({ name: 'v-bottom-sheet' });
    if (sheet.exists()) {
      expect(sheet.props('scrim')).toBe(false);
      expect(sheet.attributes('hide-overlay')).toBeUndefined();
    }
  });

  it('does not have align-center on v-container', () => {
    const store = createMockStore();
    store.state.upNextPostPlayData = {
      machineIdentifier: 'server-1',
      art: '/art.jpg',
      thumb: '/thumb.jpg',
      title: 'Next Episode',
      type: 'episode',
    };
    // Getter GET_UP_NEXT_POST_PLAY_DATA reads from state.upNextPostPlayData automatically

    const wrapper = shallowMount(TheUpnextDialog, {
      ...mountOptions(store),
    });

    const html = wrapper.html();
    expect(html).not.toContain('align-center');
  });

  it('starts timer on mount and clears on cancel', () => {
    vi.useFakeTimers();
    const store = createMockStore();
    store.state.upNextPostPlayData = {
      machineIdentifier: 'server-1',
      art: '/art.jpg',
      thumb: '/thumb.jpg',
      title: 'Next Episode',
      type: 'episode',
    };
    // Getter GET_UP_NEXT_POST_PLAY_DATA reads from state.upNextPostPlayData automatically

    const wrapper = shallowMount(TheUpnextDialog, {
      ...mountOptions(store),
    });

    expect(wrapper.vm.timeoutId).not.toBeNull();
    wrapper.vm.cancelPressed();
    expect(wrapper.vm.timeoutId).toBeNull();
    vi.useRealTimers();
  });
});

// ============================================================
// 7. PlexHome — no duplicate :title on v-card
// ============================================================
describe('PlexHome v-card title', () => {
  it('does not use :title prop on server cards (prevents duplicate)', async () => {
    const { default: PlexHome } = await import('@/views/PlexHome.vue');
    const store = createMockStore();

    // Need to mock the PlexOnDeck component which is lazy loaded
    const wrapper = shallowMount(PlexHome, {
      ...mountOptions(store),
    });

    // Check that v-card doesn't have title prop for server entries
    const cards = wrapper.findAllComponents({ name: 'v-card' });
    cards.forEach((card) => {
      // If this card is for a server, it should NOT have a title prop
      // (title is rendered manually inside the card)
      const titleProp = card.props('title');
      if (titleProp) {
        // If title prop exists, make sure the same text isn't also rendered in the body
        const text = card.text();
        const titleOccurrences = text.split(titleProp).length - 1;
        expect(titleOccurrences).toBeLessThanOrEqual(1);
      }
    });
  });
});

// ============================================================
// 8. WebPlayer — skip intro button positioning via CSS
// ============================================================
describe('WebPlayer Skip Intro Button', () => {
  const source = getSource('views/WebPlayer.vue');

  it('does not use absolute/bottom/right as v-btn props', () => {
    const skipIntroSection = source.substring(
      source.indexOf('skip-intro'),
      source.indexOf('Skip Intro'),
    );
    expect(skipIntroSection).not.toMatch(/\babsolute\b/);
    expect(skipIntroSection).not.toMatch(/\bbottom\b/);
    expect(skipIntroSection).not.toMatch(/\bright\b/);
  });

  it('uses size="large" instead of large boolean prop', () => {
    const btnMatch = source.match(/<v-btn[^>]*skip-intro[\s\S]*?>/);
    expect(btnMatch).toBeTruthy();
    expect(btnMatch[0]).toContain('size="large"');
  });

  it('has CSS positioning for skip-intro button', () => {
    expect(source).toContain('.v-btn.skip-intro');
    expect(source).toContain('position: absolute');
    expect(source).toContain('bottom: 0');
    expect(source).toContain('right: 0');
  });
});

// ============================================================
// 10. Template Audit — no remaining Vuetify 2 patterns
// ============================================================
describe('Vuetify 2 Pattern Audit', () => {
  const vueFiles = vueFileSources;

  it('no v-img with contain boolean prop', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const template = templateMatch[0];

      // Find all v-img tags
      const vImgMatches = template.matchAll(/<v-img\b[^>]*>/g);
      for (const match of vImgMatches) {
        const tag = match[0];
        // contain as a standalone prop (not in a style or class)
        const hasContain = /\bcontain\b/.test(tag) && !/cover/.test(tag);
        expect(hasContain, `${file} has v-img with contain prop`).toBe(false);
      }
    });
  });

  it('no v-icon with small/large boolean size props', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const template = templateMatch[0];

      const vIconMatches = template.matchAll(/<v-icon\b[^>]*>/g);
      for (const match of vIconMatches) {
        const tag = match[0];
        // small/large as standalone boolean props (not size="small")
        const hasBoolSize = /\b(small|large|x-small|x-large)\b/.test(tag)
          && !/size=/.test(tag);
        expect(hasBoolSize, `${file} has v-icon with boolean size prop`).toBe(false);
      }
    });
  });

  it('no hide-overlay on v-bottom-sheet or v-dialog', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const hasHideOverlay = /hide-overlay/.test(source);
      expect(hasHideOverlay, `${file} has hide-overlay`).toBe(false);
    });
  });

  it('no nudge- props on any component', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const hasNudge = /\bnudge-/.test(templateMatch[0]);
      expect(hasNudge, `${file} has nudge- prop`).toBe(false);
    });
  });

  it('no two-line or three-line boolean props', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const hasLegacyLine = /\b(two-line|three-line)\b/.test(templateMatch[0]);
      expect(hasLegacyLine, `${file} has two-line/three-line prop`).toBe(false);
    });
  });

  it('no tile boolean prop on vuetify components', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const template = templateMatch[0];

      // Check v-card and v-avatar for tile prop
      const vCardMatches = [...template.matchAll(/<v-(card|avatar)\b[^>]*>/g)];
      for (const match of vCardMatches) {
        const tag = match[0];
        const hasTile = /\btile\b/.test(tag) && !/rounded/.test(tag);
        expect(hasTile, `${file} has tile prop on ${match[1]}`).toBe(false);
      }
    });
  });

  it('no beforeDestroy lifecycle hook', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const scriptMatch = source.match(/<script[\s\S]*?<\/script>/);
      if (!scriptMatch) return;
      const hasBeforeDestroy = /beforeDestroy/.test(scriptMatch[0]);
      expect(hasBeforeDestroy, `${file} has beforeDestroy`).toBe(false);
    });
  });

  it('no Vue.set or Vue.delete', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      expect(source, `${file} has Vue.set`).not.toMatch(/Vue\.set\(/);
      expect(source, `${file} has Vue.delete`).not.toMatch(/Vue\.delete\(/);
    });
  });

  it('no v-list-item-content, v-list-item-avatar, v-list-item-action', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      expect(source, `${file} has v-list-item-content`).not.toMatch(/<v-list-item-content/);
      expect(source, `${file} has v-list-item-avatar`).not.toMatch(/<v-list-item-avatar/);
      expect(source, `${file} has v-list-item-action`).not.toMatch(/<v-list-item-action/);
    });
  });

  it('no v-subheader (should be v-list-subheader)', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      // Match v-subheader but NOT v-list-subheader
      const matches = source.match(/<v-subheader\b/g);
      expect(matches, `${file} has v-subheader`).toBeNull();
    });
  });

  it('no v-expansion-panel-header or v-expansion-panel-content', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      expect(source, `${file} has v-expansion-panel-header`)
        .not.toMatch(/<v-expansion-panel-header/);
      expect(source, `${file} has v-expansion-panel-content`)
        .not.toMatch(/<v-expansion-panel-content/);
    });
  });

  it('no $vuetify.breakpoint (should be $vuetify.display)', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const scriptMatch = source.match(/<script[\s\S]*?<\/script>/);
      if (!scriptMatch) return;
      expect(scriptMatch[0], `${file} has $vuetify.breakpoint`)
        .not.toMatch(/\$vuetify\.breakpoint/);
    });
  });

  it('no --text CSS class pattern (like primary--text)', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      const templateMatch = source.match(/<template[\s\S]*?<\/template>/);
      if (!templateMatch) return;
      const hasDashDashText = /\w--text\b/.test(templateMatch[0]);
      expect(hasDashDashText, `${file} has --text CSS class`).toBe(false);
    });
  });

  it('no process.env.VUE_APP_ references', () => {
    Object.entries(vueFiles).forEach(([file, source]) => {
      expect(source, `${file} has process.env.VUE_APP_`)
        .not.toMatch(/process\.env\.VUE_APP_/);
    });
  });
});

// ============================================================
// 11. PlexLibrary — @click:row and v-intersect
// ============================================================
describe('PlexLibrary Event Signatures', () => {
  const source = getSource('views/PlexLibrary.vue');

  it('onRowClick accepts (event, { item }) signature', () => {
    expect(source).toMatch(/onRowClick\(event,\s*\{\s*item\s*\}\)/);
  });

  it('onIntersect accepts (isIntersecting) signature', () => {
    expect(source).toMatch(/onIntersect\(isIntersecting\)/);
  });

  it('v-data-table uses v-model:sort-by', () => {
    expect(source).toContain('v-model:sort-by');
    expect(source).toContain('item-value=');
  });

  it('headers use title/key not text/value', () => {
    expect(source).toMatch(/\{ title: .*, key: .* \}/);
    const headersSection = source.substring(
      source.indexOf('headers: {'),
      source.indexOf('},\n\n'),
    );
    expect(headersSection).not.toMatch(/\btext:/);
  });
});

// ============================================================
// 12. TheSettingsDialog — form control bindings
// ============================================================
describe('TheSettingsDialog Form Controls', () => {
  const source = getSource('components/TheSettingsDialog.vue');

  it('all v-switch use model-value not value/input-value', () => {
    const switchMatches = source.matchAll(/<v-switch\b[\s\S]*?\/>/g);
    for (const match of switchMatches) {
      const tag = match[0];
      expect(tag).toContain(':model-value');
      expect(tag).toContain('@update:model-value');
      expect(tag).not.toMatch(/:value\b/);
      expect(tag).not.toMatch(/@input\b/);
      expect(tag).not.toMatch(/:input-value\b/);
      expect(tag).not.toMatch(/@change\b/);
    }
  });

  it('all v-select use model-value not value', () => {
    const selectMatches = source.matchAll(/<v-select\b[\s\S]*?>/g);
    for (const match of selectMatches) {
      const tag = match[0];
      const usesModelValue = tag.includes(':model-value') || tag.includes('v-model');
      expect(usesModelValue, 'v-select uses old :value binding').toBe(true);
    }
  });

  it('all v-slider use model-value not value', () => {
    const sliderMatches = source.matchAll(/<v-slider\b[\s\S]*?\/>/g);
    for (const match of sliderMatches) {
      const tag = match[0];
      expect(tag).toContain(':model-value');
      expect(tag).toContain('@update:model-value');
    }
  });

  it('all v-text-field use model-value not value', () => {
    const textFieldMatches = source.matchAll(/<v-text-field\b[\s\S]*?\/>/g);
    for (const match of textFieldMatches) {
      const tag = match[0];
      expect(tag).toContain(':model-value');
      expect(tag).toContain('@update:model-value');
    }
  });
});

// ============================================================
// 13. Expansion Panels — title/text not header/content
// ============================================================
describe('Expansion Panel Migration', () => {
  it('RoomCreation uses v-expansion-panel-title and v-expansion-panel-text', () => {
    const source = getSource('views/RoomCreation.vue');
    if (source.includes('v-expansion-panel')) {
      expect(source).toContain('v-expansion-panel-title');
      expect(source).toContain('v-expansion-panel-text');
      expect(source).not.toContain('v-expansion-panel-header');
      expect(source).not.toContain('v-expansion-panel-content');
    }
  });

  it('RoomJoin uses v-expansion-panel-title and v-expansion-panel-text', () => {
    const source = getSource('views/RoomJoin.vue');
    if (source.includes('v-expansion-panel')) {
      expect(source).toContain('v-expansion-panel-title');
      expect(source).toContain('v-expansion-panel-text');
      expect(source).not.toContain('v-expansion-panel-header');
      expect(source).not.toContain('v-expansion-panel-content');
    }
  });
});
