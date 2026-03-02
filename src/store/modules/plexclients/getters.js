export default {
  GET_CHOSEN_CLIENT_ID: (state) => state.chosenClientId,

  GET_PLEX_CLIENT: (state) => (clientIdentifier) => state
    .clients[clientIdentifier],

  GET_CHOSEN_CLIENT: (state) => state.clients[state.chosenClientId],

  GET_ACTIVE_MEDIA_METADATA: (state) => state.activeMediaMetadata,

  GET_ACTIVE_SERVER_ID: (state) => state.activeServerId,

  GET_ACTIVE_MEDIA_POLL_METADATA: (state, getters) => (getters.GET_ACTIVE_MEDIA_METADATA
    ? {
      title: getters.GET_ACTIVE_MEDIA_METADATA.title,
      type: getters.GET_ACTIVE_MEDIA_METADATA.type,
      grandparentTitle: getters.GET_ACTIVE_MEDIA_METADATA.grandparentTitle,
      parentTitle: getters.GET_ACTIVE_MEDIA_METADATA.parentTitle,
      ratingKey: getters.GET_ACTIVE_MEDIA_METADATA.ratingKey,
      machineIdentifier: getters.GET_ACTIVE_MEDIA_METADATA.machineIdentifier,
    }
    : null),

  GET_ACTIVE_PLAY_QUEUE: (state) => state.activePlayQueue,

  GET_ACTIVE_PLAY_QUEUE_MACHINE_IDENTIFIER: (state) => state.activePlayQueueMachineIdentifier,

  GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM: (state, getters) => (getters.GET_ACTIVE_PLAY_QUEUE
    ? getters.GET_ACTIVE_PLAY_QUEUE
      .Metadata[getters.GET_ACTIVE_PLAY_QUEUE.playQueueSelectedItemOffset]
    : null),

  ACTIVE_PLAY_QUEUE_NEXT_ITEM_EXISTS: (state, getters) => (getters.GET_ACTIVE_PLAY_QUEUE
    ? getters.GET_ACTIVE_PLAY_QUEUE.playQueueSelectedItemOffset
      < (getters.GET_ACTIVE_PLAY_QUEUE.size - 1)
    : false),

  ACTIVE_PLAY_QUEUE_PREVIOUS_ITEM_EXISTS: (state, getters) => (getters.GET_ACTIVE_PLAY_QUEUE
    ? getters.GET_ACTIVE_PLAY_QUEUE.playQueueSelectedItemOffset > 0
    : false),

  IS_THIS_MEDIA_PLAYING: (state, getters) => (media) => (getters.GET_ACTIVE_MEDIA_METADATA
    ? getters.GET_ACTIVE_MEDIA_METADATA.machineIdentifier === media.machineIdentifier
      && getters.GET_ACTIVE_MEDIA_METADATA.ratingKey === media.ratingKey
    : false),

  GET_ACTIVE_MEDIA_METADATA_MARKERS: (state, getters) => getters
    .GET_ACTIVE_MEDIA_METADATA?.Marker || [],

  GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER: (state, getters) => getters
    .GET_ACTIVE_MEDIA_METADATA_MARKERS.find((marker) => marker.type === 'intro'),
};
