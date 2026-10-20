// Vite-only visual fixture. This is deliberately separate from the production app entry.
import { createApp } from 'vue';
import { createStore } from 'vuex';
import { createMemoryHistory, createRouter } from 'vue-router';
import vuetify from '@/plugins/vuetify';
import '@/assets/css/style.css';
import 'shaka-player/dist/controls.css';
import '@/assets/css/player-menu.css';
import settings from '@/store/modules/settings';
import Preview from './ui-preview.vue';
import seekIncident from './seek-landing-incidents.json';

if (!import.meta.env.DEV) throw new Error('UI preview is available only in development');

const previewScenario = new URLSearchParams(globalThis.location.search).get('scenario') || 'empty';

const image = (text, background = '#29231d') => `data:image/svg+xml,${encodeURIComponent(
  // SVG is embedded locally so visual fixtures never fetch media.
  // eslint-disable-next-line max-len
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="${background}"/><circle cx="150" cy="170" r="70" fill="#e5a00d"/><path d="m135 135 50 35-50 35z" fill="#17120a"/><text x="150" y="300" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20">${text}</text></svg>`,
)}`;
const participantNames = ['Alex', 'Morgan', 'Sam', 'Taylor with a long name', 'Jordan', 'Riley'];
const users = Object.fromEntries(participantNames.map((username, i) => [
  `user-${i}`, {
    username,
    thumb: image(username.slice(0, 1), ['#303e52', '#49304b', '#28504b', '#503b27'][i % 4]),
    state: ['playing', 'paused', 'buffering', 'playing', 'playing', 'playing'][i],
    time: seekIncident.aheadStatus.hostMs + ([0, 0, 0, 7000, -2000, 0][i]),
    duration: 7200000,
    updatedAt: Date.now(),
    playbackRate: 1,
    health: {
      updatedAt: Date.now(), height: 1080, bitrate: 8000000, bufferAhead: 20, bufferingCount: 2,
    },
    syncFlexibility: seekIncident.aheadStatus.toleranceMs,
    playerProduct: 'Fixture browser',
    media: { type: 'movie', title: 'The Last Light Beyond the Horizon', machineIdentifier: 'sample' },
  },
]));
const sampleServer = {
  url: 'https://fixture.invalid',
  name: 'Movie night',
  location: 'Sample region',
  image: image('SAMPLE SERVER'),
};
const store = createStore({
  state: () => ({
    isLeftSidebarOpen: false, isRightSidebarOpen: true, previewMetadata: null, scenario: previewScenario, upNext: null,
  }),
  getters: {
    GET_ACTIVE_METADATA: (state) => state.previewMetadata,
    GET_UP_NEXT_POST_PLAY_DATA: (state) => state.upNext,
    IS_LIBRARY_LIST_VIEW: () => false,
    GET_CONFIG: () => ({
      servers: [sampleServer],
      sidebar_time_update_interval: 1000,
      synclounge_upnext_popup_lifetime: 30000,
    }),
  },
  mutations: {
    SET_ACTIVE_METADATA(state, value) { state.previewMetadata = value; },
    SET_SCENARIO(state, value) { state.scenario = value; },
    SET_UP_NEXT_POST_PLAY_DATA(state, value) { state.upNext = value; },
    SET_LEFT_SIDEBAR_OPEN(state, value) { state.isLeftSidebarOpen = value; },
    SET_PREVIEW_METADATA(state, value) { state.previewMetadata = value; },
    SET_RIGHT_SIDEBAR_OPEN(state, value) { state.isRightSidebarOpen = value; },
    TOGGLE_RIGHT_SIDEBAR_OPEN(state) { state.isRightSidebarOpen = !state.isRightSidebarOpen; },
  },
  modules: {
    settings,
    plex: {
      namespaced: true,
      getters: { GET_PLEX_USER: () => null, GET_PLEX_AUTH_TOKEN: () => null },
      actions: {
        FETCH_PLEX_DEVICES() {},
        FETCH_PLEX_INIT_AUTH: ({ rootState }) => {
          if (rootState.scenario === 'failure') throw new Error('Sample unavailable sign-in');
          return { id: 'sample', code: 'sample' };
        },
      },
    },
    plexclients: { namespaced: true, actions: { PLAY_NEXT() {} } },
    slplayer: {
      namespaced: true,
      state: { allowDirectPlay: true, forceBurnSubtitles: false },
      getters: { GET_STREAMING_PROTOCOL: () => 'hls' },
    },
    plexservers: {
      namespaced: true,
      getters: {
        GET_MEDIA_IMAGE_URL: () => ({ mediaUrl }) => mediaUrl,
        GET_PLEX_SERVER: () => () => ({
          name: 'Sample library',
          chosenConnection: { uri: 'https://fixture.invalid' },
          libraries: { 1: { title: 'Movies', type: 'movie' } },
        }),
        GET_SERVER_LIBRARY_SIZE: () => () => 0,
        GET_LAST_SERVER_ID: () => 'sample',
        GET_LAST_SERVER: () => ({ name: 'Sample library' }),
        GET_PLEX_SERVERS: (state, getters, rootState) => [{
          clientIdentifier: 'sample',
          name: 'Sample library',
          productVersion: '1.0',
          owned: true,
          chosenConnection: rootState.scenario === 'failure' ? null : {},
        }],
        GET_ENABLED_PLEX_SERVER_IDS: (state, getters, rootState) => (
          rootState.scenario === 'disabled' ? [] : ['sample']
        ),
        IS_PLEX_SERVER_ENABLED: (state, getters, rootState) => () => rootState.scenario !== 'disabled',
        GET_BLOCKED_SERVER_IDS: () => [],
      },
      actions: {
        FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE() {},
        FETCH_PLEX_SERVER_ON_DECK: () => [],
        FETCH_LIBRARY_CONTENTS: ({ rootState }) => {
          if (rootState.scenario === 'failure') throw new Error('Sample failed connection');
          return [];
        },
        SEARCH_PLEX_SERVER_HUB: ({ rootState }) => {
          if (rootState.scenario === 'failure') throw new Error('Sample failed connection');
          return [];
        },
      },
      mutations: { TOGGLE_SERVER_ENABLED() {} },
    },
    synclounge: {
      namespaced: true,
      state: () => ({
        syncPreset: 'balanced',
        pausing: true,
        autoHost: false,
        hostId: 'user-0',
        users,
        messages: [
          { senderId: 'user-0', time: Date.now() - 60000, text: 'Everyone ready for movie night?' },
          { senderId: 'user-1', time: Date.now() - 45000, text: 'Ready! I brought the popcorn.' },
          {
            senderId: 'user-3',
            time: Date.now() - 30000,
            text: 'This is a longer sample message to check wrapping on a narrow phone screen.',
          },
        ],
      }),
      getters: {
        GET_SERVERS_HEALTH: () => ({ [sampleServer.url]: { latency: 24, load: 'low' } }),
        GET_SERVER_HEALTH: (state, getters, rootState) => () => (rootState.scenario === 'failure'
          ? null : { latency: 24, load: 'low' }),
        ARE_NOTIFICATIONS_ENABLED: () => false,
        ARE_SOUND_NOTIFICATIONS_ENABLED: () => false,
        GET_BEST_SERVER: () => sampleServer.url,
        IS_IN_ROOM: () => true,
        GET_ROOM: () => 'sample-room',
        GET_SERVER: () => '',
        GET_USERS: (state) => state.users,
        GET_MESSAGES: (state) => state.messages,
        GET_MESSAGES_USER_CACHE_USER: () => (id) => users[id],
        GET_HOST_ID: (state) => state.hostId,
        GET_HOST_USER: (state) => state.users[state.hostId],
        GET_SOCKET_ID: () => 'user-0',
        AM_I_HOST: (state) => state.hostId === 'user-0',
        GET_ADJUSTED_HOST_TIME: (state) => () => {
          const host = state.users[state.hostId];
          return host.state === 'playing' ? host.time + Date.now() - host.updatedAt : host.time;
        },
        IS_PARTY_PAUSING_ENABLED: (state) => state.pausing,
        IS_AUTO_HOST_ENABLED: (state) => state.autoHost,
      },
      mutations: {
        SET_PREVIEW_HOST(state, id) { state.hostId = id; },
        SET_PREVIEW_MESSAGES(state, messages) { state.messages = messages; },
        ADD_MESSAGE(state, text) { state.messages.push({ senderId: 'user-0', time: Date.now(), text }); },
        SET_SYNC_PRESET(state, value) { state.syncPreset = value; },
        SET_PAUSING(state, value) { state.pausing = value; },
        SET_AUTO_HOST(state, value) { state.autoHost = value; },
        SET_HOST(state, id) { state.hostId = id; },
        REMOVE_USER(state, id) { delete state.users[id]; },
      },
      actions: {
        FETCH_SERVERS_HEALTH() {},
        DISCONNECT_IF_CONNECTED() {},
        SET_AND_CONNECT_AND_JOIN_ROOM() {},
        SEND_SYNC_PRESET({ commit }, value) { commit('SET_SYNC_PRESET', value); },
        SEND_MESSAGE({ commit }, text) { commit('ADD_MESSAGE', text); },
        SEND_SET_PARTY_PAUSING_ENABLED({ commit }, value) { commit('SET_PAUSING', value); },
        SEND_SET_AUTO_HOST_ENABLED({ commit }, value) { commit('SET_AUTO_HOST', value); },
        TRANSFER_HOST({ commit }, id) { commit('SET_HOST', id); },
        KICK_USER({ commit }, id) { commit('REMOVE_USER', id); },
        sendPartyPause() {},
        DISCONNECT_AND_NAVIGATE_HOME({ commit }) { commit('SET_RIGHT_SIDEBAR_OPEN', false, { root: true }); },
      },
    },
  },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    'RoomCreation', 'AdvancedRoomJoin', 'PlexHome', 'PlexServer', 'PlexLibrary', 'PlexMedia', 'PlexSearch',
  ].map((name, i) => ({
    path: i ? `/${name}` : '/', name, component: { render: () => null },
  })),
});
const app = createApp(Preview, { poster: image('SAMPLE MOVIE') });
app.use(store).use(router).use(vuetify);
app.directive('chat-scroll', {});
app.mount('#app');
