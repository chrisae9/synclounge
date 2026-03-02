import stateFactory from './state';

export default {
  RESET: (state) => {
    Object.assign(state, stateFactory());
  },

  SET_LAST_SERVER_ID: (state, id) => {
    state.lastServerId = id;
  },

  ADD_PLEX_SERVER: (state, server) => {
    state.servers[server.clientIdentifier] = server;
  },

  DELETE_PLEX_SERVER: (state, serverId) => {
    delete state.servers[serverId];
  },

  SET_BLOCKED_SERVER_IDS: (state, blockedIds) => {
    state.blockedServerIds = blockedIds;
  },

  TOGGLE_SERVER_ENABLED: (state, serverId) => {
    const idx = state.blockedServerIds.indexOf(serverId);
    if (idx === -1) {
      state.blockedServerIds.push(serverId);
    } else {
      state.blockedServerIds.splice(idx, 1);
    }
  },
};
