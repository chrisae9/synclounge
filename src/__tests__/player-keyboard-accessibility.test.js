import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import WebPlayer from '@/views/WebPlayer.vue';
import { setCurrentTimeMs, setVolume } from '@/player';
import registerButtons from '@/player/ui/buttons';

const factories = vi.hoisted(() => new Map());
vi.mock('@/player/init', () => ({ default: vi.fn() }));
vi.mock('@/player', () => ({
  getControlsOffset: () => 48,
  getCurrentTimeMs: () => 100000,
  setCurrentTimeMs: vi.fn(),
  getVolume: () => 0.5,
  setVolume: vi.fn(),
}));
vi.mock('shaka-player/dist/shaka-player.ui', () => ({
  default: {
    ui: {
      Element: class {
        constructor(parent, controls) {
          this.parent = parent;
          this.controls = controls;
          this.video = { currentTime: 100, duration: 300 };
          this.eventManager = { listen: vi.fn() };
        }
      },
      Controls: { registerElement: (name, factory) => factories.set(name, factory) },
    },
  },
}));

let vm;
beforeEach(() => {
  document.body.innerHTML = '<div id="player"><button>Audio</button></div>';
  document.body.focus();
  vm = {
    $refs: {
      videoPlayerContainer: document.getElementById('player'),
      videoPlayer: { muted: false },
    },
    PLAY_PAUSE_VIDEO: vi.fn(),
    SEND_PARTY_PLAY_PAUSE: vi.fn(),
    UNMUTE_AFTER_AUTOPLAY_BLOCK: vi.fn(),
    isTyping: WebPlayer.methods.isTyping,
  };
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete document.fullscreenElement;
});

const key = (name, options = {}) => {
  const event = new KeyboardEvent('keydown', { key: name, cancelable: true, ...options });
  WebPlayer.methods.onKeyUp.call(vm, event);
  return event;
};
const expectQuiet = () => {
  expect(setCurrentTimeMs).not.toHaveBeenCalled();
  expect(setVolume).not.toHaveBeenCalled();
  expect(vm.PLAY_PAUSE_VIDEO).not.toHaveBeenCalled();
  expect(vm.SEND_PARTY_PLAY_PAUSE).not.toHaveBeenCalled();
  expect(vm.$refs.videoPlayer.muted).toBe(false);
};

describe('player keyboard event ownership', () => {
  it('handles an unclaimed page seek once and prevents its default', () => {
    const event = key('ArrowRight');
    expect(setCurrentTimeMs).toHaveBeenCalledExactlyOnceWith(110000, { userInitiated: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('prevents scrolling when space requests one local and party pause', () => {
    const event = key(' ');
    expect(event.defaultPrevented).toBe(true);
    expect(vm.PLAY_PAUSE_VIDEO).toHaveBeenCalledTimes(1);
    expect(vm.SEND_PARTY_PLAY_PAUSE).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('preserves seekbar Space party command without a local toggle (prevented=%s)', (prevented) => {
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'shaka-seek-bar';
    vm.$refs.videoPlayerContainer.appendChild(seek);
    seek.focus();
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    if (prevented) event.preventDefault();
    WebPlayer.methods.onKeyUp.call(vm, event);
    expect(vm.SEND_PARTY_PLAY_PAUSE).toHaveBeenCalledTimes(1);
    expect(vm.PLAY_PAUSE_VIDEO).not.toHaveBeenCalled();
  });

  it('respects an event already handled by another control', () => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    event.preventDefault();
    WebPlayer.methods.onKeyUp.call(vm, event);
    expectQuiet();
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'repeat', 'isComposing'])('ignores %s commands', (option) => {
    key('ArrowRight', { [option]: true });
    expectQuiet();
  });

  it.each(['button', 'input', 'textarea', 'select', 'a', 'div'])('leaves focused %s controls alone', (tag) => {
    const control = document.createElement(tag);
    control.tabIndex = 0;
    document.body.appendChild(control);
    control.focus();
    ['ArrowRight', 'ArrowUp', ' ', 'm'].forEach((name) => key(name));
    expectQuiet();
  });

  it('leaves contenteditable and textbox interaction alone', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    expect(WebPlayer.methods.isTyping.call(vm)).toBe(true);
    key(' ');
    expectQuiet();
  });

  it('delegates player focus and fullscreen shortcuts to Shaka', () => {
    vm.$refs.videoPlayerContainer.tabIndex = 0;
    vm.$refs.videoPlayerContainer.focus();
    ['m', 'f', 'ArrowRight', ' '].forEach((name) => key(name));
    expectQuiet();
    vm.$refs.videoPlayerContainer.blur();
    expect(document.activeElement).toBe(document.body);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true, value: vm.$refs.videoPlayerContainer,
    });
    ['m', 'f', 'ArrowRight'].forEach((name) => key(name));
    expectQuiet();
    const event = key(' ');
    expect(event.defaultPrevented).toBe(true);
    expect(vm.SEND_PARTY_PLAY_PAUSE).toHaveBeenCalledTimes(1);
    expect(vm.PLAY_PAUSE_VIDEO).not.toHaveBeenCalled();
  });

  it('ignores page keys while an active modal owns interaction', () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true"></div>');
    key('ArrowRight');
    expectQuiet();
  });
});

describe('custom player control accessible names', () => {
  it.each([
    ['close', 'Stop playback'],
    ['forward30', 'Seek forward 30 seconds'],
    ['manual_sync', 'Sync with host'],
    ['next', 'Next item'],
    ['previous', 'Previous item'],
    ['replay10', 'Seek backward 10 seconds'],
  ])('names the %s action and preserves its button element', (name, label) => {
    registerButtons({ getters: {}, watch: () => () => {}, dispatch: vi.fn() });
    const parent = document.createElement('div');
    const control = factories.get(name).create(parent, { getDisplayTime: () => 100 });
    expect(control.button.tagName).toBe('BUTTON');
    expect(control.button.getAttribute('aria-label')).toBe(label);
    expect(control.button.title).toBe(label);
    expect(control.button.textContent).not.toBe('');
  });
});
