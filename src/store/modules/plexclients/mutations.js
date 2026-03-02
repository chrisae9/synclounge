import stateFactory from './state';

export default {
  RESET: (state) => {
    Object.assign(state, stateFactory());
  },

  SET_ACTIVE_MEDIA_METADATA: (state, metadata) => {
    state.activeMediaMetadata = metadata;
  },

  SET_ACTIVE_SERVER_ID: (state, id) => {
    state.activeServerId = id;
  },

  SET_ACTIVE_PLAY_QUEUE: (state, queue) => {
    state.activePlayQueue = queue;
  },

  SET_ACTIVE_PLAY_QUEUE_MACHINE_IDENTIFIER: (state, id) => {
    state.activePlayQueueMachineIdentifier = id;
  },

  INCREMENT_ACTIVE_PLAY_QUEUE_SELECTED_ITEM_OFFSET: (state) => {
    state.activePlayQueue.playQueueSelectedItemOffset += 1;
  },

  DECREMENT_ACTIVE_PLAY_QUEUE_SELECTED_ITEM_OFFSET: (state) => {
    state.activePlayQueue.playQueueSelectedItemOffset -= 1;
  },
};
