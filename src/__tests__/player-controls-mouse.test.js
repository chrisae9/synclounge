import {
  describe, expect, it, vi,
} from 'vitest';
import suppressStationaryMouseMoves from '@/player/suppressStationaryMouseMoves';

const move = (screenX, screenY) => new MouseEvent('mousemove', { screenX, screenY, bubbles: true });

describe('Shaka controls mouse handling', () => {
  it('ignores stationary synthetic moves but preserves real movement and touch', () => {
    const container = document.createElement('div');
    const cleanup = suppressStationaryMouseMoves(container);
    const handler = vi.fn();
    container.addEventListener('mousemove', handler);
    container.addEventListener('touchmove', handler);
    const first = move(10, 20);
    const real = move(11, 20);
    const touch = new Event('touchmove');
    const unknown = new Event('mousemove');
    [first, move(10, 20), real, touch, unknown].forEach((event) => container.dispatchEvent(event));
    expect(handler.mock.calls.map(([event]) => event)).toEqual([first, real, touch, unknown]);
    cleanup();
    container.dispatchEvent(move(11, 20));
    expect(handler).toHaveBeenCalledTimes(5);
  });

  it('forwards moves with non-finite coordinates', () => {
    const container = document.createElement('div');
    const cleanup = suppressStationaryMouseMoves(container);
    const handler = vi.fn();
    container.addEventListener('mousemove', handler);
    for (const screenX of [NaN, Infinity]) {
      const event = new Event('mousemove');
      Object.defineProperties(event, { screenX: { value: screenX }, screenY: { value: 20 } });
      container.dispatchEvent(event);
    }
    expect(handler).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('forwards the first move after the pointer leaves and re-enters', () => {
    const container = document.createElement('div');
    const cleanup = suppressStationaryMouseMoves(container);
    const handler = vi.fn();
    container.addEventListener('mousemove', handler);
    container.dispatchEvent(move(10, 20));
    container.dispatchEvent(new Event('mouseleave'));
    container.dispatchEvent(move(10, 20));
    expect(handler).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
