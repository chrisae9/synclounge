import {
  describe, expect, it, vi,
} from 'vitest';
import suppressStationaryMouseMoves from '@/player/suppressStationaryMouseMoves';

describe('Shaka controls mouse handling', () => {
  it('ignores stationary synthetic mousemoves but preserves real movement and touch', () => {
    const originalHandler = vi.fn();
    const controls = { onMouseMove_: originalHandler, onMouseLeave_: vi.fn() };
    const { mouseMoveHandler } = suppressStationaryMouseMoves(controls);
    controls.onMouseMove_ = mouseMoveHandler;

    const firstMove = { type: 'mousemove', screenX: 10, screenY: 20 };
    const duplicateMove = { type: 'mousemove', screenX: 10, screenY: 20 };
    const realMove = { type: 'mousemove', screenX: 11, screenY: 20 };
    const coordinateLessMove = { type: 'mousemove' };
    const touchMove = { type: 'touchmove', screenX: 11, screenY: 20 };

    controls.onMouseMove_(firstMove);
    controls.onMouseMove_(duplicateMove);
    controls.onMouseMove_(realMove);
    controls.onMouseMove_(coordinateLessMove);
    controls.onMouseMove_(touchMove);

    expect(originalHandler.mock.calls.map(([event]) => event)).toEqual([
      firstMove,
      realMove,
      coordinateLessMove,
      touchMove,
    ]);
  });

  it('forwards mousemoves with non-finite coordinates', () => {
    const originalHandler = vi.fn();
    const controls = { onMouseMove_: originalHandler };
    const { mouseMoveHandler } = suppressStationaryMouseMoves(controls);
    controls.onMouseMove_ = mouseMoveHandler;

    const nanMove = { type: 'mousemove', screenX: Number.NaN, screenY: 20 };
    const infiniteMove = { type: 'mousemove', screenX: 10, screenY: Number.POSITIVE_INFINITY };
    controls.onMouseMove_(nanMove);
    controls.onMouseMove_(infiniteMove);

    expect(originalHandler.mock.calls.map(([event]) => event)).toEqual([
      nanMove,
      infiniteMove,
    ]);
  });

  it('forwards the first move after the pointer leaves and re-enters', () => {
    const originalHandler = vi.fn();
    const originalMouseLeaveHandler = vi.fn();
    const controls = {
      onMouseMove_: originalHandler,
      onMouseLeave_: originalMouseLeaveHandler,
    };
    const { mouseMoveHandler, mouseLeaveHandler } = suppressStationaryMouseMoves(controls);
    controls.onMouseMove_ = mouseMoveHandler;
    controls.onMouseLeave_ = mouseLeaveHandler;

    const initialMove = { type: 'mousemove', screenX: 10, screenY: 20 };
    const reentryMove = { type: 'mousemove', screenX: 10, screenY: 20 };
    controls.onMouseMove_(initialMove);
    controls.onMouseLeave_();
    controls.onMouseMove_(reentryMove);

    expect(originalMouseLeaveHandler).toHaveBeenCalledOnce();
    expect(originalHandler.mock.calls.map(([event]) => event)).toEqual([
      initialMove,
      reentryMove,
    ]);
  });
});
