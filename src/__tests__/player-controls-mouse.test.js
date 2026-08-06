import {
  describe, expect, it, vi,
} from 'vitest';
import suppressStationaryMouseMoves from '@/player/suppressStationaryMouseMoves';

describe('Shaka controls mouse handling', () => {
  it('ignores stationary synthetic mousemoves but preserves real movement and touch', () => {
    const originalHandler = vi.fn();
    const controls = { onMouseMove_: originalHandler };
    controls.onMouseMove_ = suppressStationaryMouseMoves(controls);

    controls.onMouseMove_({ type: 'mousemove', screenX: 10, screenY: 20 });
    controls.onMouseMove_({ type: 'mousemove', screenX: 10, screenY: 20 });
    controls.onMouseMove_({ type: 'mousemove', screenX: 11, screenY: 20 });
    controls.onMouseMove_({ type: 'touchmove', screenX: 11, screenY: 20 });

    expect(originalHandler).toHaveBeenCalledTimes(3);
  });
});
