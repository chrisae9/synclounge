import {
  afterEach, expect, it,
} from 'vitest';
import trackSeekControls from '@/player/trackSeekControls';
import { consumeUserSeekIntent, recordSeekIntent } from '@/player/seekIntent';

let cleanup;
afterEach(() => { cleanup?.(); cleanup = null; document.body.innerHTML = ''; recordSeekIntent(); });

function setup() {
  const container = document.createElement('div');
  container.innerHTML = '<input class="shaka-seek-bar" type="range" max="300">'
    + '<input class="shaka-volume-bar" type="range">'
    + '<div class="shaka-fast-forward-container"><span>0s</span></div>';
  document.body.appendChild(container);
  const video = { currentTime: 90 };
  const player = {
    getMediaElement: () => video,
    getAssetUri: () => 'movie',
    seekRange: () => ({ start: 0, end: 300 }),
  };
  const handlers = {};
  const mediaSession = { setActionHandler: (name, handler) => { handlers[name] = handler; } };
  cleanup = trackSeekControls({
    container, getPlayer: () => player, controls: { getConfig: () => ({ keyboardSeekDistance: 5 }) }, mediaSession,
  });
  return { container, video, handlers };
}

it('marks scrubbing while volume changes do not create a party seek', () => {
  const { container } = setup();
  const seek = container.querySelector('.shaka-seek-bar');
  seek.value = '150';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(true);
  container.querySelector('.shaka-volume-bar').dispatchEvent(new Event('input', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(false);
});

it('handles a user override after automatic synchronization without relying on target proximity', () => {
  const { handlers, video } = setup();
  recordSeekIntent(false);
  handlers.seekto({ seekTime: 150 });
  video.currentTime = 154; // Decoder lands beyond the requested position.
  expect(consumeUserSeekIntent()).toBe(true);
  expect(consumeUserSeekIntent()).toBe(false); // Duplicate/recovery event.
});

it('does not mistake an automatic correction after user input for a party seek', () => {
  setup();
  recordSeekIntent(true);
  recordSeekIntent(false);
  expect(consumeUserSeekIntent()).toBe(false);
});

it('supports system forward/backward and rejects invalid or no-op requests', () => {
  const { handlers, video } = setup();
  handlers.seekforward({ seekOffset: 10 });
  expect(video.currentTime).toBe(100);
  expect(consumeUserSeekIntent()).toBe(true);
  handlers.seekbackward({});
  expect(video.currentTime).toBe(95);
  expect(consumeUserSeekIntent()).toBe(true);
  handlers.seekto({ seekTime: NaN });
  handlers.seekto({ seekTime: 95 });
  expect(consumeUserSeekIntent()).toBe(false);
});

it('tracks handled seek keyboard events, not an unrelated arrow key', () => {
  const { container } = setup();
  container.querySelector('.shaka-seek-bar').focus();
  const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  event.preventDefault(); // Shaka has accepted the seek.
  document.activeElement.dispatchEvent(event);
  expect(consumeUserSeekIntent()).toBe(true);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(false);
});

it('distinguishes a mobile double-tap seek from a single tap', async () => {
  const { container } = setup();
  const target = container.querySelector('.shaka-fast-forward-container');
  target.dispatchEvent(new Event('touchend', { bubbles: true }));
  await Promise.resolve();
  expect(consumeUserSeekIntent()).toBe(false);
  target.dispatchEvent(new Event('touchend', { bubbles: true }));
  target.querySelector('span').textContent = '10s';
  await Promise.resolve();
  expect(consumeUserSeekIntent()).toBe(true);
});

it('cleans up listeners and pending intent when the player is destroyed', () => {
  const { handlers, container } = setup();
  recordSeekIntent(true);
  cleanup();
  expect(consumeUserSeekIntent()).toBe(false);
  expect(Object.values(handlers)).toEqual([null, null, null]);
  container.querySelector('.shaka-seek-bar').dispatchEvent(new Event('input', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(false);
});

it.each(['mouse', 'touch'])('tracks real %s scrubbing through intermediate and final seeks', (kind) => {
  const { container } = setup();
  const bar = container.querySelector('.shaka-seek-bar');
  bar.dispatchEvent(new Event(kind === 'mouse' ? 'mousedown' : 'touchstart', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(true);
  bar.dispatchEvent(new Event(`${kind}move`, { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(true);
  bar.dispatchEvent(new Event(kind === 'mouse' ? 'mouseup' : 'touchend', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(true);
  expect(consumeUserSeekIntent()).toBe(false);
  document.dispatchEvent(new Event(`${kind}move`));
  expect(consumeUserSeekIntent()).toBe(false);
});

it('ignores disabled scrubbing and releases outside the bar', () => {
  const { container } = setup();
  const bar = container.querySelector('.shaka-seek-bar');
  bar.disabled = true;
  bar.dispatchEvent(new Event('mousedown', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(false);
  bar.disabled = false;
  bar.dispatchEvent(new Event('mousedown', { bubbles: true }));
  expect(consumeUserSeekIntent()).toBe(true);
  document.dispatchEvent(new Event('mouseup'));
  expect(consumeUserSeekIntent()).toBe(true);
  document.dispatchEvent(new Event('mousemove'));
  expect(consumeUserSeekIntent()).toBe(false);
});
