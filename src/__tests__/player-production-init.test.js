/* eslint-disable max-classes-per-file -- Models Shaka's Player and Overlay constructors. */
import { expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  attach: vi.fn(async () => {}),
  configure: vi.fn(),
  configureOverlay: vi.fn(),
  installAll: vi.fn(),
  proxyVideo: new EventTarget(),
  isCasting: vi.fn(() => false),
  dispatch: vi.fn(),
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

        getControls() {
          return {
            getCastProxy: () => ({ getVideo: () => api.proxyVideo, isCasting: api.isCasting }),
          };
        }
      },
    },
  },
}));
vi.mock('@/store', () => ({ default: { dispatch: api.dispatch } }));
vi.mock('@/player/ui', () => ({ default: vi.fn() }));

it('imports and initializes the player with the production Shaka API', async () => {
  const { default: initialize } = await import('@/player/init');
  const mediaElement = document.createElement('video');
  await initialize({
    mediaElement, playerConfig: {}, videoContainer: document.createElement('div'), overlayConfig: {},
  });
  expect(api.installAll).toHaveBeenCalled();
  expect(api.attach).toHaveBeenCalledWith(mediaElement, false);
  expect(api.configureOverlay).toHaveBeenCalledWith({});
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).not.toHaveBeenCalled(); // Local Vue listener owns this event.
  api.isCasting.mockReturnValue(true);
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).toHaveBeenCalledExactlyOnceWith('slplayer/HANDLE_SEEKED');
  const { setControlsCleanup } = await import('@/player/state');
  setControlsCleanup(null);
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).toHaveBeenCalledTimes(1);
});
