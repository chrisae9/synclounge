import { expect, it, vi } from 'vitest';
import WebPlayer from '@/views/WebPlayer.vue';
import actions from '@/store/modules/slplayer/actions';
import { setPlayer, setOverlay } from '@/player/state';

vi.mock('@/player/init', () => ({ default: vi.fn() }));

it('requests the Shaka 5 big play control required by player event registration', () => {
  const options = WebPlayer.methods.getPlayerUiOptions();
  expect(options.bigButtons).toContain('play_pause');
  expect(options.controlPanelElements).toContain('play_pause');
  expect(options).not.toHaveProperty('addBigPlayButton');
});

it('registers and removes click handlers on both distinct Shaka 5 play controls', () => {
  const container = document.createElement('div');
  container.innerHTML = '<div class="shaka-big-buttons-container">'
    + '<button class="shaka-play-button"></button></div>'
    + '<div class="shaka-controls-button-panel"><button class="shaka-play-button"></button></div>';
  const player = new EventTarget();
  setPlayer(player);
  setOverlay({ getControls: () => ({ getControlsContainer: () => container, getCastProxy: () => null }) });
  const state = {};
  const mapping = {
    SET_BUFFERING_EVENT_LISTENER: 'GET_BUFFERING_EVENT_LISTENER',
    SET_CLICK_EVENT_LISTENER: 'GET_CLICK_EVENT_LISTENER',
    SET_ERROR_EVENT_LISTENER: 'GET_ERROR_EVENT_LISTENER',
  };
  const context = {
    state,
    getters: state,
    commit: (name, value) => {
      if (mapping[name]) state[mapping[name]] = value;
      if (name === 'SET_CAST_STATUS_LISTENER') state.castStatusListener = value;
    },
    dispatch: vi.fn(),
  };
  try {
    actions.REGISTER_PLAYER_EVENTS(context);
    for (const button of container.querySelectorAll('button')) button.click();
    expect(context.dispatch.mock.calls.filter(([name]) => name === 'HANDLE_PLAYER_CLICK')).toHaveLength(2);
    actions.UNREGISTER_PLAYER_EVENTS(context);
    context.dispatch.mockClear();
    for (const button of container.querySelectorAll('button')) button.click();
    expect(context.dispatch).not.toHaveBeenCalled();
  } finally {
    setOverlay(null);
    setPlayer(null);
  }
});
