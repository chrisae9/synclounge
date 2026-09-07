// Vite-only visual fixture. This is deliberately separate from the production app entry.
import { createApp } from 'vue';
import { createStore } from 'vuex';
import { createMemoryHistory, createRouter } from 'vue-router';
import vuetify from '@/plugins/vuetify';
import '@/assets/css/style.css';
import Preview from './ui-preview.vue';

if (!import.meta.env.DEV) throw new Error('UI preview is available only in development');

const image = (text, background = '#29231d') => `data:image/svg+xml,${encodeURIComponent(
  // SVG is embedded locally so visual fixtures never fetch media.
  // eslint-disable-next-line max-len
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="${background}"/><circle cx="150" cy="170" r="70" fill="#e5a00d"/><path d="m135 135 50 35-50 35z" fill="#17120a"/><text x="150" y="300" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20">${text}</text></svg>`,
)}`;
const users = Object.fromEntries(['Alex', 'Morgan', 'Sam', 'Taylor with a long name'].map((username, i) => [
  `user-${i}`, {
    username,
    thumb: image(username.slice(0, 1), ['#303e52', '#49304b', '#28504b', '#503b27'][i]),
    state: ['playing', 'paused', 'buffering', 'playing'][i],
    time: 360000,
    duration: 7200000,
    updatedAt: Date.now(),
    playbackRate: 1,
    syncFlexibility: 3000,
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
  state: () => ({ isRightSidebarOpen: true }),
  getters: {
    GET_CONFIG: () => ({ servers: [sampleServer], sidebar_time_update_interval: 1000 }),
  },
  mutations: {
    SET_RIGHT_SIDEBAR_OPEN(state, value) { state.isRightSidebarOpen = value; },
    TOGGLE_RIGHT_SIDEBAR_OPEN(state) { state.isRightSidebarOpen = !state.isRightSidebarOpen; },
  },
  modules: {
    settings: {
      namespaced: true,
      state: () => ({ customServerUrl: '' }),
      mutations: { SET_CUSTOM_SERVER_URL(state, value) { state.customServerUrl = value; } },
    },
    plexservers: {
      namespaced: true,
      getters: {
        GET_MEDIA_IMAGE_URL: () => ({ mediaUrl }) => mediaUrl,
        GET_PLEX_SERVER: () => () => ({ name: 'Sample library' }),
      },
    },
    synclounge: {
      namespaced: true,
      state: () => ({
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
        GET_SERVER_HEALTH: () => () => ({ latency: 24, load: 'low' }),
        GET_BEST_SERVER: () => sampleServer.url,
        GET_ROOM: () => 'sample-room',
        GET_SERVER: () => '',
        GET_USERS: (state) => state.users,
        GET_MESSAGES: (state) => state.messages,
        GET_MESSAGES_USER_CACHE_USER: () => (id) => users[id],
        GET_HOST_ID: (state) => state.hostId,
        GET_HOST_USER: (state) => state.users[state.hostId],
        GET_SOCKET_ID: () => 'user-0',
        AM_I_HOST: (state) => state.hostId === 'user-0',
        GET_ADJUSTED_HOST_TIME: () => () => 360000,
        IS_PARTY_PAUSING_ENABLED: (state) => state.pausing,
        IS_AUTO_HOST_ENABLED: (state) => state.autoHost,
      },
      mutations: {
        ADD_MESSAGE(state, text) { state.messages.push({ senderId: 'user-0', time: Date.now(), text }); },
        SET_PAUSING(state, value) { state.pausing = value; },
        SET_AUTO_HOST(state, value) { state.autoHost = value; },
        SET_HOST(state, id) { state.hostId = id; },
        REMOVE_USER(state, id) { delete state.users[id]; },
      },
      actions: {
        FETCH_SERVERS_HEALTH() {},
        DISCONNECT_IF_CONNECTED() {},
        SET_AND_CONNECT_AND_JOIN_ROOM() {},
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
  routes: ['RoomCreation', 'AdvancedRoomJoin', 'PlexHome'].map((name, i) => ({
    path: i ? `/${name}` : '/', name, component: { render: () => null },
  })),
});
const app = createApp(Preview, { poster: image('SAMPLE MOVIE') });
app.use(store).use(router).use(vuetify);
app.directive('chat-scroll', {});
app.mount('#app');
