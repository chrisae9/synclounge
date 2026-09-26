import { describe, it, expect } from 'vitest';
import recommendLowerQuality from '@/utils/qualityrecovery';
import settingsGetters from '@/store/modules/settings/getters';
import mutations from '@/store/modules/slplayer/mutations';

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
  it('offers recovery after the observed 15.5-second empty-buffer stall', () => {
    expect(recommendLowerQuality({
      ...input,
      episodes: [{ at: now, durationMs: 15521 }],
      currentLimit: 10000,
      streamBitrate: 9517000,
    })?.maxVideoBitrate).toBe(4000);
  });
  it('offers recovery for repeated shorter stalls from the observed starvation burst', () => {
    const durations = [68, 141, 1581, 144, 941, 549, 1038, 1048, 104, 1050,
      19, 1088, 824, 84, 1600, 781, 259, 1555, 805, 1142, 164, 1698,
      2039, 750, 232, 1050, 873, 93, 1579];
    const state = { bufferingHistory: [] };
    durations.forEach((durationMs, index) => mutations.RECORD_BUFFERING_EPISODE(state, {
      at: now - (durations.length - index) * 2000, durationMs,
    }));
    expect(recommendLowerQuality({ ...input, episodes: state.bufferingHistory })?.maxVideoBitrate)
      .toBe(4000);
  });
  it('ignores brief pause/seek pulses and bounds recovery history', () => {
    const state = { bufferingHistory: [] };
    for (let index = 0; index < 1000; index += 1) {
      mutations.RECORD_BUFFERING_EPISODE(state, { at: now - 1000 + index, durationMs: 37 });
    }
    expect(state.bufferingHistory).toHaveLength(120);
    expect(state.bufferingHistory[0].at).toBe(now - 120);
    expect(state.bufferingHistory.at(-1).at).toBe(now - 1);
    expect(recommendLowerQuality({ ...input, episodes: state.bufferingHistory })).toBeNull();
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
