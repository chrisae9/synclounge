import {
  afterEach, expect, it, vi,
} from 'vitest';
import chatScroll from '@/directives/chatScroll';

const setup = () => {
  let mutation; let resize;
  const disconnect = vi.fn();
  const observerMock = (capture) => class {
    constructor(fn) { capture(fn); }

    observe() {}

    disconnect = disconnect;
  };
  vi.stubGlobal('MutationObserver', observerMock((fn) => { mutation = fn; }));
  vi.stubGlobal('ResizeObserver', observerMock((fn) => { resize = fn; }));
  const el = document.createElement('div');
  let height = 1000;
  let viewport = 200;
  Object.defineProperties(el, {
    scrollHeight: { get: () => height }, clientHeight: { get: () => viewport },
  });
  chatScroll.mounted(el);
  return {
    el,
    append: () => { height += 300; mutation(); },
    resize: () => resize(),
    disconnect,
    shrink: () => {
      viewport = 100;
      el.dispatchEvent(new Event('scroll'));
      resize();
    },
  };
};
afterEach(() => vi.unstubAllGlobals());
it('stays pinned after a tall incoming message grows beyond the threshold', () => {
  const { el, append } = setup();
  el.scrollTop = 800;
  el.dispatchEvent(new Event('scroll'));
  append();
  expect(el.scrollTop).toBe(1300);
  chatScroll.unmounted(el);
});
it('preserves a reader scrolling up, then follows after they return to the bottom', () => {
  const { el, append } = setup();
  el.scrollTop = 200; el.dispatchEvent(new Event('scroll'));
  append(); expect(el.scrollTop).toBe(200);
  el.scrollTop = 1100; el.dispatchEvent(new Event('scroll'));
  append(); expect(el.scrollTop).toBe(1600);
  chatScroll.unmounted(el);
});
it('follows layout resizing and disconnects observers/listeners on unmount', () => {
  const { el, resize, disconnect } = setup();
  const remove = vi.spyOn(el, 'removeEventListener');
  resize(); expect(el.scrollTop).toBe(1000);
  chatScroll.unmounted(el);
  expect(disconnect).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
});

it('shows a newly sent own message without moving the reader on unrelated updates', () => {
  const { el } = setup();
  el.scrollTop = 200; el.dispatchEvent(new Event('scroll'));
  chatScroll.updated(el, { value: null, oldValue: null });
  expect(el.scrollTop).toBe(200);
  const own = { senderId: 'me', time: 1 };
  chatScroll.updated(el, { value: own, oldValue: null });
  expect(el.scrollTop).toBe(1000);
  el.scrollTop = 200; el.dispatchEvent(new Event('scroll'));
  chatScroll.updated(el, { value: own, oldValue: own });
  expect(el.scrollTop).toBe(200);
  chatScroll.unmounted(el);
});

it('remains pinned when async participant layout shrinks the chat viewport', () => {
  const { el, shrink } = setup();
  el.scrollTop = 800; el.dispatchEvent(new Event('scroll'));
  shrink();
  expect(el.scrollTop).toBe(1000);
  chatScroll.unmounted(el);
});
