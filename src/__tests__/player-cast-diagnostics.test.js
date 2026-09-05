import { expect, it, vi } from 'vitest';
import { getPlaybackDiagnostics } from '@/player';

const state = vi.hoisted(() => ({ local: null, remote: null }));
vi.mock('@/player/state', () => ({
  getPlayer: () => state.remote,
  getRawPlayer: () => state.local,
  getOverlay: vi.fn(),
  setPlayer: vi.fn(),
  setOverlay: vi.fn(),
  setControlsCleanup: vi.fn(),
  isCasting: () => true,
}));

it('reports the Cast receiver timeline and buffer instead of the idle sender video', () => {
  state.local = { getMediaElement: () => ({ currentTime: 0, paused: true }) };
  state.remote = {
    getMediaElement: () => ({
      currentTime: 125,
      paused: false,
      duration: 300,
      buffered: { length: 1, start: () => 120, end: () => 150 },
    }),
    isBuffering: () => false,
    getStats: () => ({ decodedFrames: 2500 }),
  };
  const result = getPlaybackDiagnostics();
  expect(result.currentTime).toBe(125);
  expect(result.bufferAhead).toBe(25);
  expect(result.paused).toBe(false);
  expect(result.isCasting).toBe(true);
  expect(result.buffering).toBe(false);
  expect(result.mediaQuality).toBeNull();
  expect(result.shaka.decodedFrames).toBe(2500);
});

const detachedPlayers = [null, { getMediaElement: () => null, isBuffering: () => undefined }];
it.each(detachedPlayers)('reports detached playback without an active media element', (player) => {
  state.remote = player;
  expect(getPlaybackDiagnostics()).toEqual({
    attached: false, shaka: {}, isCasting: true, buffering: null,
  });
});

it('reports an empty receiver buffer without local video measurements', () => {
  state.remote = {
    getMediaElement: () => ({ currentTime: 125, paused: false, buffered: { length: 0 } }),
    isBuffering: () => true,
  };
  expect(getPlaybackDiagnostics()).toMatchObject({
    currentTime: 125,
    bufferAhead: 0,
    bufferedRanges: [],
    buffering: true,
    mediaQuality: null,
    shaka: {},
  });
});
