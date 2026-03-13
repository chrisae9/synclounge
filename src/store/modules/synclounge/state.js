const state = () => ({
  socketId: null,
  server: null,
  room: null,
  users: {},
  hostId: null,
  messagesUserCache: {},
  messages: [],
  isPartyPausingEnabled: null,
  isAutoHostEnabled: null,
  serversHealth: null,
  syncCancelToken: null,
  isInRoom: false,
  upnextTimeoutId: null,

  // This tracks whether the upnext screen was triggered for this playback already.
  // It is reset to false when the player gets out of the upNext time zone (at the end of episode)
  upNextTriggered: false,
  areNotificationsEnabled: null,
  areSoundNotificationsEnabled: null,

  // Join sync guard: prevents local sync dispatches during initial media load
  joinSyncInProgress: false,

  // Host leave grace period: delays host transfer so original host can reconnect
  hostGracePreviousHostUsername: null,
  isHostGracePeriod: false,
  hostGraceTimeoutId: null,
  pendingHostId: null,

  // Periodic sync poll interval ID
  syncPollIntervalId: null,
});

export default state;
