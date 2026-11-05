import { describe, expect, it } from 'vitest';
import customFormatDuration from '@/utils/customformatduration';
import PlexLibrary from '@/views/PlexLibrary.vue';

describe('media duration formatting across date-fns upgrades', () => {
  it.each([
    [0, ''],
    [1000, '1 second'],
    [90000, '1 minute 30 seconds'],
    [5400000, '1 hour 30 minutes'],
    [90061000, '1 day 1 hour 1 minute 1 second'],
  ])('formats elapsed %i ms without missing-unit text', (end, expected) => {
    expect(customFormatDuration({ start: 0, end })).toBe(expected);
  });

  it.each([
    [0, ''],
    [60000, '1 min'],
    [3600000, '1 hr'],
    [5400000, '1 hr 30 min'],
  ])('formats library runtime %i ms with omitted zero fields', (end, expected) => {
    expect(PlexLibrary.methods.getDuration(end)).toBe(expected);
  });
});
