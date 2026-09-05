import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  destroy, getDurationMs, load, unload,
} from '@/player';

const playerState = vi.hoisted(() => ({
  overlay: null,
  player: null,
}));

vi.mock('@/player/state', () => ({
  getPlayer: () => playerState.player,
  getRawPlayer: () => playerState.player,
  setPlayer: (player) => { playerState.player = player; },
  getOverlay: () => playerState.overlay,
  setOverlay: (overlay) => { playerState.overlay = overlay; },
  setControlsCleanup: vi.fn(),
  isCasting: vi.fn(() => false),
}));

describe('player duration cache', () => {
  beforeEach(() => {
    playerState.overlay = null;
    playerState.player = null;
  });

  it('clears the previous media duration when the player is destroyed', async () => {
    const mediaElement = { duration: 12 };
    playerState.player = { getMediaElement: () => mediaElement };
    expect(getDurationMs()).toBe(12000);

    mediaElement.duration = Number.NaN;
    expect(getDurationMs()).toBe(12000);

    await destroy();
    playerState.player = { getMediaElement: () => mediaElement };
    expect(getDurationMs()).toBe(0);
  });

  it.each([
    ['load', load],
    ['unload', unload],
  ])('clears the previous media duration before %s', async (_name, changeSource) => {
    const mediaElement = { duration: 12 };
    playerState.player = {
      getMediaElement: () => mediaElement,
      load: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    expect(getDurationMs()).toBe(12000);

    mediaElement.duration = Number.NaN;
    await changeSource('next-source');

    expect(getDurationMs()).toBe(0);
  });
});
