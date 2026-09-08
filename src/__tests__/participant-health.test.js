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
  it('handles missing media and the half-second drift boundary', () => {
    expect(UserList.methods.driftLabel.call(context, {})).toBe('Timing unavailable');
    const user = { media: context.GET_HOST_USER.media };
    expect(UserList.methods.driftLabel.call({ ...context, getAdjustedTime: () => 9600 }, user)).toBe('In sync');
    expect(UserList.methods.driftLabel.call({ ...context, getAdjustedTime: () => 9500 }, user)).toBe('0.5s behind');
  });
  it('normalizes numeric identifiers without treating missing identifiers as a match', () => {
    const numeric = { ...context, GET_HOST_USER: { media: { machineIdentifier: 42, ratingKey: 1 } } };
    expect(UserList.methods.driftLabel.call(numeric, {
      media: { machineIdentifier: '42', ratingKey: '1' },
    })).toBe('2.0s behind');
    expect(UserList.methods.driftLabel.call({ ...context, GET_HOST_USER: { media: {} } }, {
      media: {},
    })).toBe('Different media');
  });
});
