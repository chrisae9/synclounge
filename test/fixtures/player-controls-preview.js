import shaka from 'shaka-player/dist/shaka-player.ui';
import { createStore } from 'vuex';
import 'shaka-player/dist/controls.css';
import '@/assets/css/player-menu.css';
import closeButton from '@/player/ui/buttons/closebutton';
import audioSelection from '@/player/ui/menus/audioselection';
import subtitleSelection from '@/player/ui/menus/subtitleselection';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const store = createStore({
  actions: {
    'slplayer/PRESS_STOP': () => {
      globalThis.document.querySelector('#result').textContent = 'PASS: Stop playback received the click.';
    },
  },
  getters: {
    'slplayer/GET_AUDIO_STREAMS': () => [{ id: 1, text: 'English (EAC3 5.1)' }],
    'slplayer/GET_AUDIO_STREAM_ID': () => 1,
    'slplayer/GET_SUBTITLE_STREAMS': () => [{ id: 0, text: 'None' }, { id: 2, text: 'English' }],
    'slplayer/GET_SUBTITLE_STREAM_ID': () => 2,
  },
});
closeButton(store);
audioSelection(store);
subtitleSelection(store);
const container = globalThis.document.querySelector('#player');
const video = container.querySelector('video');
const player = new shaka.Player();
await player.attach(video);
const ui = new shaka.ui.Overlay(player, container, video);
ui.configure({
  controlPanelElements: [
    'play_pause', 'time_and_duration', 'spacer', 'close', 'audio', 'subtitle', 'overflow_menu', 'fullscreen',
  ],
  overflowMenuButtons: ['quality', 'picture_in_picture'],
});
const panelLabels = [...container.querySelectorAll('.shaka-controls-button-panel .shaka-overflow-menu-only')];
const hidden = panelLabels.length >= 2
  && panelLabels.every((label) => globalThis.getComputedStyle(label).display === 'none');
globalThis.document.querySelector('#result').textContent = hidden
  ? 'PASS: audio/subtitle labels stay hidden in the actual control bar.'
  : 'FAIL: overflow labels leaked into the control bar.';
