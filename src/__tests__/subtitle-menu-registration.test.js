import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import registerAudioSelection from '@/player/ui/menus/audioselection';
import registerSubtitleSelection from '@/player/ui/menus/subtitleselection';

const shakaMocks = vi.hoisted(() => ({
  registerControlElement: vi.fn(),
  registerOverflowElement: vi.fn(),
  SettingsMenu: class {
    constructor(parent, controls, iconText) {
      this.iconText = iconText;
      this.button = document.createElement('button');
      this.menu = document.createElement('div');
      this.backButton = document.createElement('button');
      this.backButton.classList.add('shaka-back-to-overflow-button');
      this.menu.appendChild(this.backButton);
      this.backSpan = document.createElement('span');
      this.nameSpan = document.createElement('span');
      this.currentSelection = document.createElement('span');
      this.eventManager = { listen: vi.fn(), unlisten: vi.fn() };
    }

    release() {}
  },
}));

vi.mock('shaka-player/dist/shaka-player.ui.debug', () => ({
  default: {
    ui: {
      SettingsMenu: shakaMocks.SettingsMenu,
      Controls: {
        registerElement: shakaMocks.registerControlElement,
      },
      OverflowMenu: {
        registerElement: shakaMocks.registerOverflowElement,
      },
    },
  },
}));

describe('subtitle menu registration', () => {
  const store = {
    getters: {
      'slplayer/GET_AUDIO_STREAMS': [{ id: 1, text: 'English' }],
      'slplayer/GET_AUDIO_STREAM_ID': 1,
      'slplayer/GET_SUBTITLE_STREAMS': [
        { id: 0, text: 'None' },
        { id: 2, text: 'English' },
      ],
      'slplayer/GET_SUBTITLE_STREAM_ID': 0,
    },
    watch: vi.fn(() => vi.fn()),
    dispatch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.getters['slplayer/GET_AUDIO_STREAM_ID'] = 1;
    store.getters['slplayer/GET_SUBTITLE_STREAM_ID'] = 0;
  });

  it('registers the subtitle selector for the configured control panel', () => {
    registerSubtitleSelection(store);

    expect(shakaMocks.registerControlElement).toHaveBeenCalledWith(
      'subtitle',
      expect.objectContaining({ create: expect.any(Function) }),
    );

    const factory = shakaMocks.registerControlElement.mock.calls[0][1];
    const selector = factory.create(document.createElement('div'), {});
    expect(selector.iconText).toMatch(/^M200-160/);
    expect(selector.button.ariaLabel).toBe('Subtitles');
    expect(selector.button.classList).toContain('shaka-tooltip-status');
    expect(selector.button.classList).not.toContain('shaka-hidden');
    expect(selector.button.getAttribute('shaka-status')).toBe('None');
    expect(selector.backButton.ariaLabel).toBe('Close');

    const oldOption = selector.menu.querySelector('.explicit-subtitle');
    store.getters['slplayer/GET_SUBTITLE_STREAM_ID'] = 999;
    selector.updateSubtitleSelection();
    expect(selector.eventManager.unlisten).toHaveBeenCalledWith(oldOption, 'click');
    expect(selector.button.getAttribute('shaka-status')).toBe('');

    const overflowParent = document.createElement('div');
    overflowParent.classList.add('shaka-overflow-menu');
    const overflowFactory = shakaMocks.registerOverflowElement.mock.calls[0][1];
    const overflowSelector = overflowFactory.create(overflowParent, {});
    expect(overflowSelector.backButton.ariaLabel).toBe('Back');
  });

  it('registers the audio selector for the configured control panel', () => {
    registerAudioSelection(store);

    expect(shakaMocks.registerControlElement).toHaveBeenCalledWith(
      'audio',
      expect.objectContaining({ create: expect.any(Function) }),
    );

    const factory = shakaMocks.registerControlElement.mock.calls[0][1];
    const selector = factory.create(document.createElement('div'), {});
    expect(selector.iconText).toMatch(/^M480-80/);
    expect(selector.button.ariaLabel).toBe('Audio');
    expect(selector.button.classList).toContain('shaka-tooltip-status');
    expect(selector.button.classList).not.toContain('shaka-hidden');
    expect(selector.button.getAttribute('shaka-status')).toBe('English');
    expect(selector.backButton.ariaLabel).toBe('Close');

    const oldOption = selector.menu.querySelector('.explicit-audio');
    store.getters['slplayer/GET_AUDIO_STREAM_ID'] = 999;
    selector.updateAudioSelection();
    expect(selector.eventManager.unlisten).toHaveBeenCalledWith(oldOption, 'click');
    expect(selector.button.getAttribute('shaka-status')).toBe('');
  });
});
