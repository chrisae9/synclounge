import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { destroy, getDurationMs } from '@/player';

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
});
