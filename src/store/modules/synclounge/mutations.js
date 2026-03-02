import stateFactory from './state';

export default {
  RESET: (state) => {
    Object.assign(state, stateFactory());
  },

  SET_USERS: (state, value) => {
    state.users = value;
  },

  SET_ROOM: (state, value) => {
    state.room = value;
  },

  SET_IS_PARTY_PAUSING_ENABLED: (state, isEnabled) => {
    state.isPartyPausingEnabled = isEnabled;
  },

  SET_IS_AUTO_HOST_ENABLED: (state, isEnabled) => {
    state.isAutoHostEnabled = isEnabled;
  },

  ADD_MESSAGE(state, msg) {
    state.messages.push(msg);
  },

  CLEAR_MESSAGES(state) {
    state.messages = [];
  },

  SET_SERVERS_HEALTH: (state, healths) => {
    state.serversHealth = healths;
  },

  SET_SERVER: (state, server) => {
    state.server = server;
  },

  SET_SYNC_CANCEL_TOKEN: (state, token) => {
    state.syncCancelToken = token;
  },

  SET_IS_IN_ROOM: (state, isInRoom) => {
    state.isInRoom = isInRoom;
  },

  SET_SOCKET_ID: (state, id) => {
    state.socketId = id;
  },

  SET_USER: (state, { id, data }) => {
    state.users[id] = data;
  },

  SET_MESSAGES_USER_CACHE: (state, value) => {
    state.messagesUserCache = value;
  },

  SET_MESSAGES_USER_CACHE_USER: (state, { id, data }) => {
    state.messagesUserCache[id] = data;
  },

  SET_HOST_ID: (state, hostId) => {
    state.hostId = hostId;
  },

  DELETE_USER: (state, id) => {
    delete state.users[id];
  },

  SET_USER_PLAYER_STATE: (state, {
    id, state: playerState, time, duration, playbackRate,
  }) => {
    if (!state.users[id]) return;
    state.users[id].state = playerState;
    state.users[id].time = time;
    state.users[id].duration = duration;
    state.users[id].playbackRate = playbackRate;
    state.users[id].updatedAt = Date.now();
  },

  SET_USER_MEDIA: (state, { id, media }) => {
    if (!state.users[id]) return;
    state.users[id].media = media;
  },

  SET_USER_SYNC_FLEXIBILITY: (state, { id, syncFlexibility }) => {
    if (!state.users[id]) return;
    state.users[id].syncFlexibility = syncFlexibility;
  },

  SET_UPNEXT_TIMEOUT_ID: (state, id) => {
    state.upnextTimeoutId = id;
  },

  SET_UP_NEXT_TRIGGERED: (state, triggered) => {
    state.upNextTriggered = triggered;
  },

  SET_ARE_NOTIFICATIONS_ENABLED: (state, enabled) => {
    state.areNotificationsEnabled = enabled;
  },

  SET_ARE_SOUND_NOTIFICATIONS_ENABLED: (state, enabled) => {
    state.areSoundNotificationsEnabled = enabled;
  },
};
