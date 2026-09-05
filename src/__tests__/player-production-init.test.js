/* eslint-disable max-classes-per-file -- Models Shaka's Player and Overlay constructors. */
import { expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  attach: vi.fn(async () => {}),
  configure: vi.fn(),
  configureOverlay: vi.fn(),
  installAll: vi.fn(),
}));
// The production distribution deliberately has no shaka.log API.
vi.mock('shaka-player/dist/shaka-player.ui', () => ({
  default: {
    polyfill: { installAll: api.installAll },
    Player: class {
      attach = api.attach;

      configure = api.configure;
    },
    ui: {
      Overlay: class {
        configure = api.configureOverlay;

        getControls() { return {}; }
      },
    },
  },
}));
vi.mock('@/store', () => ({ default: {} }));
vi.mock('@/player/ui', () => ({ default: vi.fn() }));
vi.mock('@/player/suppressStationaryMouseMoves', () => ({ default: () => ({ mouseMoveHandler: vi.fn() }) }));

it('imports and initializes the player with the production Shaka API', async () => {
  const { default: initialize } = await import('@/player/init');
  const mediaElement = document.createElement('video');
  await initialize({
    mediaElement, playerConfig: {}, videoContainer: document.createElement('div'), overlayConfig: {},
  });
  expect(api.installAll).toHaveBeenCalled();
  expect(api.attach).toHaveBeenCalledWith(mediaElement, false);
  expect(api.configureOverlay).toHaveBeenCalledWith({});
});
