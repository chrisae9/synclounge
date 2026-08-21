import { describe, expect, it } from 'vitest';

import { buildPlaybackDiagnostics, summarizePlayerError } from '@/utils/playbackdiagnostics';

const makeRanges = (ranges) => ({
  length: ranges.length,
  start: (index) => ranges[index][0],
  end: (index) => ranges[index][1],
});

describe('playback diagnostics', () => {
  it('captures buffered range, frame, and Shaka evidence without URLs or tokens', () => {
    const diagnostics = buildPlaybackDiagnostics({
      mediaElement: {
        currentTime: 25,
        duration: 120,
        paused: false,
        ended: false,
        seeking: false,
        readyState: 3,
        networkState: 2,
        playbackRate: 1,
        videoWidth: 3840,
        videoHeight: 1600,
        buffered: makeRanges([[0, 10], [20, 45.5555]]),
        error: null,
        getVideoPlaybackQuality: () => ({
          totalVideoFrames: 1000,
          droppedVideoFrames: 25,
          corruptedVideoFrames: 1,
        }),
      },
      stats: {
        currentCodecs: 'hev1.2.4.L150.B0',
        estimatedBandwidth: 12345678.91,
        droppedFrames: 25,
      },
    });

    expect(diagnostics.bufferAhead).toBe(20.556);
    expect(diagnostics.bufferedRanges).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 45.556 },
    ]);
    expect(diagnostics.mediaQuality.droppedVideoFrames).toBe(25);
    expect(diagnostics.shaka.estimatedBandwidth).toBe(12345678.91);
  });

  it('returns a bounded error summary', () => {
    expect(summarizePlayerError({
      detail: {
        severity: 2,
        category: 3,
        code: 3016,
        data: ['first', 'second', 'third', 'fourth', 'ignored'],
      },
    })).toEqual({
      name: undefined,
      message: undefined,
      severity: 2,
      category: 3,
      code: 3016,
      data: ['first', 'second', 'third', 'fourth'],
    });
  });

  it('returns an unattached diagnostic when no media element exists', () => {
    expect(buildPlaybackDiagnostics({
      mediaElement: null,
      stats: { estimatedBandwidth: 1234.5678 },
    })).toEqual({
      attached: false,
      shaka: { estimatedBandwidth: 1234.568 },
    });
  });

  it('limits buffered ranges to eight entries', () => {
    const diagnostics = buildPlaybackDiagnostics({
      mediaElement: {
        currentTime: 0,
        duration: 100,
        paused: false,
        ended: false,
        seeking: false,
        readyState: 3,
        networkState: 2,
        playbackRate: 1,
        videoWidth: 1920,
        videoHeight: 1080,
        buffered: makeRanges(Array.from({ length: 12 }, (_, index) => [index, index + 0.5])),
        error: null,
      },
      stats: {},
    });

    expect(diagnostics.bufferedRanges).toHaveLength(8);
    expect(diagnostics.bufferedRanges.at(-1)).toEqual({ start: 7, end: 7.5 });
  });
});
