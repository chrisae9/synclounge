import { describe, it, expect } from 'vitest';
import recommendLowerQuality from '@/utils/qualityrecovery';
import settingsGetters from '@/store/modules/settings/getters';

const now = 200000;
const input = {
  now,
  episodes: [1, 2, 3].map((i) => ({ at: now - i * 10000, durationMs: 4000 })),
  currentLimit: 8000,
  streamBitrate: 8000000,
  bufferAhead: 1,
};

describe('quality recovery advice', () => {
  it('suggests a lower cap after repeated substantial buffering', () => {
    expect(recommendLowerQuality(input).maxVideoBitrate).toBe(4000);
  });
  it('does not react to one stall, old stalls, healthy buffers or unknown bitrate', () => {
    expect(recommendLowerQuality({ ...input, episodes: input.episodes.slice(0, 1) })).toBeNull();
    expect(recommendLowerQuality({ ...input, now: now + 200000 })).toBeNull();
    expect(recommendLowerQuality({ ...input, bufferAhead: 12 })).toBeNull();
    expect(recommendLowerQuality({ ...input, currentLimit: null, streamBitrate: null })).toBeNull();
  });
  it('never increases quality or falls below the useful recovery floor', () => {
    expect(recommendLowerQuality({ ...input, currentLimit: 720 })).toBeNull();
  });
});

describe('effective room synchronization', () => {
  it('uses the host preset without overwriting the saved personal preference', () => {
    const state = { syncFlexibility: 1500 };
    const effective = (room) => settingsGetters.GET_SYNCFLEXIBILITY(state, {}, { synclounge: room }, {});
    expect(effective({ isInRoom: true, syncPreset: 'relaxed' })).toBe(7000);
    expect(effective({ isInRoom: true, syncPreset: 'strict' })).toBe(500);
    expect(effective({ isInRoom: false, syncPreset: 'relaxed' })).toBe(1500);
    expect(effective({ isInRoom: true, syncPreset: 'personal' })).toBe(1500);
    expect(state.syncFlexibility).toBe(1500);
  });
});
