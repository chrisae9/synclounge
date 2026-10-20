import { describe, it, expect } from 'vitest';
import UserList from '@/components/UserList.vue';
import { seededRandom } from './helpers/sync-playback-harness';

describe('participant timing across Plex servers', () => {
  const media = {
    type: 'episode', title: 'Pilot', grandparentTitle: 'Example', parentIndex: 1, index: 1,
  };
  const context = {
    GET_HOST_USER: { media: { ...media, machineIdentifier: 'host', ratingKey: '1' }, time: 10000 },
    GET_ADJUSTED_HOST_TIME: () => 10000,
    getAdjustedTime: (user) => user.time ?? 8000,
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
    const near = { ...context, getAdjustedTime: (value) => value.time ?? 9600 };
    const boundary = { ...context, getAdjustedTime: (value) => value.time ?? 9500 };
    expect(UserList.methods.driftLabel.call(near, user)).toBe('In sync');
    expect(UserList.methods.driftLabel.call(boundary, user)).toBe('In sync');
  });
  it('normalizes numeric identifiers without treating missing identifiers as a match', () => {
    const numeric = { ...context, GET_HOST_USER: { media: { machineIdentifier: 42, ratingKey: 1 }, time: 10000 } };
    expect(UserList.methods.driftLabel.call(numeric, {
      media: { machineIdentifier: '42', ratingKey: '1' },
    })).toBe('2.0s behind');
    expect(UserList.methods.driftLabel.call({ ...context, GET_HOST_USER: { media: {} } }, {
      media: {},
    })).toBe('Different media');
  });
  it('keeps unknown playback states connecting', () => {
    expect(UserList.methods.readinessLabel.call(context, {}, 'viewer')).toBe('Connecting');
    expect(UserList.methods.readinessLabel.call(context, { media }, 'viewer')).toBe('Connecting');
  });
  it('uses the viewer tolerance for basic and detailed status', () => {
    const basicContext = { ...context, driftLabel: UserList.methods.driftLabel.bind(context) };
    const user = { media: context.GET_HOST_USER.media, state: 'playing', syncFlexibility: 3000 };
    expect(UserList.methods.readinessLabel.call(basicContext, user, 'viewer')).toBe('In sync');
    expect(UserList.methods.readinessLabel.call(basicContext, { ...user, syncFlexibility: 500 }, 'viewer'))
      .toBe('2.0s behind');
    expect(UserList.methods.driftLabel.call(context, user)).toBe('In sync');
  });
});

describe('signed participant status fuzz', () => {
  it('keeps ahead/behind direction and tolerance correct for 1000 seeded timelines', () => {
    const random = seededRandom(20261019);
    for (let sample = 0; sample < 1000; sample += 1) {
      const hostTime = 60000 + Math.floor(random() * 6000000);
      const difference = Math.floor(random() * 60000) - 30000;
      const tolerance = sample % 11 === 0 ? 500 : Math.floor(random() * 5000);
      const media = { machineIdentifier: 'fixture', ratingKey: '1' };
      const nowTimestamp = 100000;
      const hostAge = Math.floor(random() * 900);
      const viewerAge = Math.floor(random() * 900);
      const state = sample % 2 ? 'playing' : 'paused';
      const context = {
        nowTimestamp,
        GET_HOST_USER: {
          media, state: 'playing', time: hostTime - hostAge, updatedAt: nowTimestamp - hostAge, playbackRate: 1,
        },
        GET_HOST_ID: 'host',
        GET_ADJUSTED_HOST_TIME: () => hostTime + Math.floor(random() * 900),
      };
      context.getAdjustedTime = UserList.methods.getAdjustedTime.bind(context);
      context.driftLabel = (user) => UserList.methods.driftLabel.call(context, user);
      const user = {
        media,
        state,
        time: hostTime + difference - (state === 'playing' ? viewerAge : 0),
        updatedAt: nowTimestamp - viewerAge,
        playbackRate: sample % 3 ? 1 : undefined,
        syncFlexibility: sample % 11 === 0 ? undefined : tolerance,
      };
      const trace = JSON.stringify({
        seed: 20261019, sample, difference, tolerance, state, hostAge, viewerAge,
      });
      const label = UserList.methods.readinessLabel.call(context, user, 'viewer');
      if (Math.abs(difference) <= tolerance) expect(label, trace).toContain('In sync');
      else expect(label, trace).toContain(difference > 0 ? 'ahead' : 'behind');
      expect(label.startsWith('Paused'), trace).toBe(user.state === 'paused');
      expect(UserList.methods.getSyncBorderClass.call(context, user), trace)
        .toBe(Math.abs(difference) <= tolerance ? 'border-sync' : 'border-desync');
    }
  });
  it('projects a missing playback rate at normal speed, consistently with the host timeline', () => {
    expect(UserList.methods.getAdjustedTime.call({ nowTimestamp: 2000 }, {
      updatedAt: 1000, time: 5000, state: 'playing',
    })).toBe(6000);
  });
});

it('uses the same fallback tolerance for the readiness label and avatar border', () => {
  const context = {
    GET_HOST_USER: { time: 10000 },
    GET_ADJUSTED_HOST_TIME: () => 10000,
    getAdjustedTime: (user) => user.time ?? 10700,
  };
  [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY].forEach((syncFlexibility) => {
    expect(UserList.methods.getSyncBorderClass.call(context, { syncFlexibility })).toBe('border-desync');
  });
  expect(UserList.methods.getSyncBorderClass.call({ ...context, getAdjustedTime: () => Number.NaN }, {}))
    .toBe('border-error');
});

it('compares host and viewer using one sidebar clock sample', () => {
  const media = { machineIdentifier: 'fixture', ratingKey: '1' };
  const context = {
    nowTimestamp: 1000,
    GET_HOST_ID: 'host',
    GET_HOST_USER: {
      media, state: 'playing', time: 10000, updatedAt: 1000, playbackRate: 1,
    },
    // The live getter is 900ms newer than the sidebar's current render tick.
    GET_ADJUSTED_HOST_TIME: () => 10900,
  };
  context.getAdjustedTime = UserList.methods.getAdjustedTime.bind(context);
  context.driftLabel = (user) => UserList.methods.driftLabel.call(context, user);
  const viewer = { ...context.GET_HOST_USER, syncFlexibility: 500 };
  expect(UserList.methods.readinessLabel.call(context, viewer, 'viewer')).toBe('In sync');
  expect(UserList.methods.getSyncBorderClass.call(context, viewer)).toBe('border-sync');
});
