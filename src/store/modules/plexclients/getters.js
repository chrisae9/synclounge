const MAX_PREVIEW_STRING_LENGTH = 500;
const MAX_PREVIEW_POSTER_URL_LENGTH = 2048;
const MAX_PREVIEW_YEAR = 9999;
const MAX_PREVIEW_INDEX = 999_999_999_999;

const isPreviewIdentifier = (value) => {
  if (Number.isSafeInteger(value)) return value >= 0;
  if (typeof value !== 'string' || value.length === 0
    || value.length > MAX_PREVIEW_STRING_LENGTH) return false;
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
};

const boundedPreviewString = (value) => (
  typeof value === 'string' && value.length <= MAX_PREVIEW_STRING_LENGTH
    ? value
    : undefined
);

const boundedPreviewYear = (value) => (
  (Number.isSafeInteger(value) && value >= 0 && value <= MAX_PREVIEW_YEAR)
    || (typeof value === 'string' && /^\d{1,4}$/.test(value))
    ? value
    : undefined
);

const boundedPreviewIndex = (value) => (
  (Number.isSafeInteger(value) && value >= 0 && value <= MAX_PREVIEW_INDEX)
    || (typeof value === 'string' && /^\d{1,12}$/.test(value))
    ? value
    : undefined
);

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
      parentIndex: getters.GET_ACTIVE_MEDIA_METADATA.parentIndex,
      index: getters.GET_ACTIVE_MEDIA_METADATA.index,
    }
    : null),

  GET_ACTIVE_MEDIA_ROOM_PREVIEW: (state, getters, rootState, rootGetters) => {
    const metadata = getters.GET_ACTIVE_MEDIA_METADATA;
    if (!metadata) return null;
    if (!isPreviewIdentifier(metadata.machineIdentifier)
      || !isPreviewIdentifier(metadata.ratingKey)) return null;

    let posterUrl;
    try {
      posterUrl = rootGetters['plexservers/GET_MEDIA_IMAGE_URL']({
        machineIdentifier: metadata.machineIdentifier,
        mediaUrl: metadata.thumb,
        width: 600,
        height: 900,
      });
    } catch {
      posterUrl = undefined;
    }
    if (posterUrl != null
      && (typeof posterUrl !== 'string' || posterUrl.length > MAX_PREVIEW_POSTER_URL_LENGTH)) {
      posterUrl = undefined;
    }

    return {
      title: boundedPreviewString(metadata.title),
      year: boundedPreviewYear(metadata.year),
      summary: boundedPreviewString(metadata.summary),
      type: boundedPreviewString(metadata.type),
      posterUrl,
      machineIdentifier: metadata.machineIdentifier,
      ratingKey: metadata.ratingKey,
      grandparentTitle: boundedPreviewString(metadata.grandparentTitle),
      parentIndex: boundedPreviewIndex(metadata.parentIndex),
      index: boundedPreviewIndex(metadata.index),
    };
  },

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
