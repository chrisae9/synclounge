/* eslint-disable max-classes-per-file -- Models Shaka's Player and Overlay constructors. */
import {
  afterEach, expect, it, vi,
} from 'vitest';
import { consumeUserSeekIntent } from '@/player/seekIntent';
import {
  getRawPlayer, getOverlay, setControlsCleanup, setOverlay, setPlayer,
} from '@/player/state';

const api = vi.hoisted(() => ({
  attach: vi.fn(async () => {}),
  configure: vi.fn(),
  configureOverlay: vi.fn(),
  installAll: vi.fn(),
  proxyVideo: new EventTarget(),
  isCasting: vi.fn(() => false),
  dispatch: vi.fn(),
  getVideo: vi.fn(),
  destroyPlayer: vi.fn(async () => {}),
  destroyOverlay: vi.fn(async () => {}),
}));
// The production distribution deliberately has no shaka.log API.
vi.mock('shaka-player/dist/shaka-player.ui', () => ({
  default: {
    polyfill: { installAll: api.installAll },
    Player: class {
      attach = api.attach;

      configure = api.configure;

      destroy = api.destroyPlayer;
    },
    ui: {
      Overlay: class {
        configure = api.configureOverlay;

        destroy = api.destroyOverlay;

        getControls() {
          return {
            getCastProxy: () => ({ getVideo: () => api.getVideo() ?? api.proxyVideo, isCasting: api.isCasting }),
          };
        }
      },
    },
  },
}));
vi.mock('@/store', () => ({ default: { dispatch: api.dispatch } }));
vi.mock('@/player/ui', () => ({ default: vi.fn() }));

afterEach(() => {
  setControlsCleanup(null);
  setOverlay(null);
  setPlayer(null);
  vi.clearAllMocks();
  api.isCasting.mockReturnValue(false);
});

it('imports and initializes the player with the production Shaka API', async () => {
  const { default: initialize } = await import('@/player/init');
  const mediaElement = document.createElement('video');
  const videoContainer = document.createElement('div');
  videoContainer.innerHTML = '<input class="shaka-seek-bar">';
  const bar = videoContainer.firstChild;
  await initialize({
    mediaElement, playerConfig: {}, videoContainer, overlayConfig: {},
  });
  expect(api.installAll).toHaveBeenCalled();
  expect(api.attach).toHaveBeenCalledWith(mediaElement, false);
  expect(api.configureOverlay).toHaveBeenCalledWith({});
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).not.toHaveBeenCalled(); // Local Vue listener owns this event.
  api.isCasting.mockReturnValue(true);
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).toHaveBeenCalledExactlyOnceWith('slplayer/HANDLE_SEEKED');
  bar.dispatchEvent(new Event('mousedown', { bubbles: true }));
  // Document capture requires the container to be attached. Mouse filter is local.
  const moved = vi.fn();
  videoContainer.addEventListener('mousemove', moved);
  const move = () => videoContainer.dispatchEvent(new MouseEvent('mousemove', { screenX: 1, screenY: 1 }));
  move();
  move();
  expect(moved).toHaveBeenCalledTimes(1);
  setControlsCleanup(null);
  move();
  expect(moved).toHaveBeenCalledTimes(2);
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).toHaveBeenCalledTimes(1);
});

it('removes installed handlers when Cast setup fails and can retry cleanly', async () => {
  const { default: initialize } = await import('@/player/init');
  const videoContainer = document.createElement('div');
  videoContainer.innerHTML = '<input class="shaka-seek-bar">';
  document.body.appendChild(videoContainer);
  const args = {
    mediaElement: document.createElement('video'), playerConfig: {}, videoContainer, overlayConfig: {},
  };
  api.getVideo.mockImplementationOnce(() => { throw new Error('Cast unavailable'); });
  await expect(initialize(args)).rejects.toThrow('Cast unavailable');
  videoContainer.firstChild.dispatchEvent(new Event('mousedown', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(false);
  const moved = vi.fn();
  videoContainer.addEventListener('mousemove', moved);
  videoContainer.dispatchEvent(new MouseEvent('mousemove', { screenX: 1, screenY: 1 }));
  videoContainer.dispatchEvent(new MouseEvent('mousemove', { screenX: 1, screenY: 1 }));
  expect(moved).toHaveBeenCalledTimes(2);
  await initialize(args);
  api.isCasting.mockReturnValue(true);
  api.proxyVideo.dispatchEvent(new Event('seeked'));
  expect(api.dispatch).toHaveBeenCalledExactlyOnceWith('slplayer/HANDLE_SEEKED');
  videoContainer.remove();
});

it('destroys an unattached player on attach failure, clears globals, then retries', async () => {
  const { default: initialize } = await import('@/player/init');
  const args = {
    mediaElement: document.createElement('video'),
    playerConfig: {},
    videoContainer: document.createElement('div'),
    overlayConfig: {},
  };
  api.attach.mockRejectedValueOnce(new Error('attach failed'));
  await expect(initialize(args)).rejects.toThrow('attach failed');
  expect(api.destroyPlayer).toHaveBeenCalledOnce();
  expect(getRawPlayer()).toBeNull();
  expect(getOverlay()).toBeNull();
  await initialize(args);
  expect(getRawPlayer()).not.toBeNull();
});

it('destroys the overlay after configuration fails', async () => {
  const { default: initialize } = await import('@/player/init');
  api.configureOverlay.mockImplementationOnce(() => { throw new Error('overlay failed'); });
  await expect(initialize({
    mediaElement: document.createElement('video'),
    playerConfig: {},
    videoContainer: document.createElement('div'),
    overlayConfig: {},
  })).rejects.toThrow('overlay failed');
  expect(api.destroyOverlay).toHaveBeenCalledOnce();
  expect(getRawPlayer()).toBeNull();
  expect(getOverlay()).toBeNull();
});

it('cancels a stalled attach without publishing it over a later successful attempt', async () => {
  const { default: initialize } = await import('@/player/init');
  let finishAttach;
  api.attach.mockImplementationOnce(() => new Promise((resolve) => { finishAttach = resolve; }));
  const controller = new AbortController();
  const args = {
    mediaElement: document.createElement('video'),
    playerConfig: {},
    videoContainer: document.createElement('div'),
    overlayConfig: {},
  };
  const attempt = initialize({ ...args, signal: controller.signal });
  const rejected = expect(attempt).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  expect(api.destroyPlayer).toHaveBeenCalledOnce();
  expect(getRawPlayer()).toBeNull();
  await initialize(args);
  const replacement = getRawPlayer();
  finishAttach();
  await Promise.resolve();
  expect(getRawPlayer()).toBe(replacement);
});
