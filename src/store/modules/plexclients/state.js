import { slPlayerClientId } from '@/player/constants';

const state = () => ({
  clients: {
    [slPlayerClientId]: {
      provides: 'player',
      clientIdentifier: slPlayerClientId,
      platform: 'Web',
      device: 'Web',
      product: 'SyncLounge',
      name: 'SyncLounge Player',
      lastSeenAt: new Date().toISOString(),
    },
  },

  chosenClientId: slPlayerClientId,
  activeMediaMetadata: null,
  activeServerId: null,
  activePlayQueue: null,
  activePlayQueueMachineIdentifier: null,
});

export default state;
