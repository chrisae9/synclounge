import { createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';

import actions from './actions';
import state from './state';
import mutations from './mutations';
import getters from './getters';
import modules from './modules';

const persistedState = createPersistedState({
  paths: [
    'isLibraryListView',

    'settings',

    'plex.user',
    'plex.plexAuthToken',
    'plex.areDevicesCached',

    'plexclients.clients',

    'plexservers.servers',
    'plexservers.lastServerId',
    'plexservers.blockedServerIds',

    'synclounge.areNotificationsEnabled',
    'synclounge.areSoundNotificationsEnabled',

    'slplayer.forceBurnSubtitles',
    'slplayer.subtitleSize',
    'slplayer.subtitlePosition',
    'slplayer.subtitleColor',
    'slplayer.allowDirectPlay',
    'slplayer.streamingProtocol',
  ],
});

const store = createStore({
  strict: import.meta.env.MODE !== 'production',
  state,
  mutations,
  actions,
  getters,
  modules,
  plugins: [
    persistedState,
  ],
});

export default store;
