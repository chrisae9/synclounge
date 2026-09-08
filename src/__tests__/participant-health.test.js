import { describe, it, expect } from 'vitest';
import UserList from '@/components/UserList.vue';

describe('participant timing across Plex servers', () => {
  const media = {
    type: 'episode', title: 'Pilot', grandparentTitle: 'Example', parentIndex: 1, index: 1,
  };
  const context = {
    GET_HOST_USER: { media: { ...media, machineIdentifier: 'host', ratingKey: '1' } },
    GET_ADJUSTED_HOST_TIME: () => 10000,
    getAdjustedTime: () => 8000,
  };
  it('shows estimated drift for a matching episode on another server', () => {
    expect(UserList.methods.driftLabel.call(context, {
      media: { ...media, machineIdentifier: 'friend', ratingKey: '99' },
    })).toBe('2.0s behind (estimated)');
  });
  it('does not compare identically named episodes from different series', () => {
    expect(UserList.methods.driftLabel.call(context, {
      media: {
        ...media, machineIdentifier: 'friend', ratingKey: '99', grandparentTitle: 'Other',
      },
    })).toBe('Different media');
  });
});
