import {
  beforeEach, expect, it, vi,
} from 'vitest';
import actions from '@/store/modules/slplayer/actions';
import WebPlayer from '@/views/WebPlayer.vue';

const smallButton = vi.hoisted(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
const media = vi.hoisted(() => ({ muted: true, volume: 0 }));
vi.mock('@/player', () => ({
  getMediaElement: () => media,
  getSmallPlayButton: () => smallButton,
  getBigPlayButton: () => null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addCastStatusListener: vi.fn(),
  removeCastStatusListener: vi.fn(),
}));
vi.mock('@/socket', () => ({ emit: vi.fn(), isConnected: () => false }));
beforeEach(() => { media.muted = true; media.volume = 0; });
it('removes central play while preserving toolbar play', () => {
  const config = WebPlayer.methods.getPlayerUiOptions();
  expect(config.bigButtons).toEqual([]);
  expect(config.controlPanelElements).toContain('play_pause');
});
it('restores audible volume on explicit unmute and retries local playback', async () => {
  const commit = vi.fn(); const dispatch = vi.fn();
  await actions.UNMUTE_AFTER_AUTOPLAY_BLOCK({ commit, dispatch });
  expect(media.muted).toBe(false);
  expect(media.volume).toBe(1);
  expect(commit).toHaveBeenCalledWith('SET_AUTOPLAY_BLOCKED', false);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith('PRESS_PLAY');
});
it('preserves a nonzero preferred volume on unmute', async () => {
  media.volume = 0.25;
  await actions.UNMUTE_AFTER_AUTOPLAY_BLOCK({ commit: vi.fn(), dispatch: vi.fn() });
  expect(media.volume).toBe(0.25);
});

it('registers and cleans up controls with no central play button', () => {
  const dispatch = vi.fn();
  const commit = vi.fn();
  actions.REGISTER_PLAYER_EVENTS({ commit, dispatch });
  const click = commit.mock.calls.find(([name]) => name === 'SET_CLICK_EVENT_LISTENER')[1];
  expect(smallButton.addEventListener).toHaveBeenCalledWith('click', click);
  actions.UNREGISTER_PLAYER_EVENTS({ state: {}, getters: { GET_CLICK_EVENT_LISTENER: click }, commit });
  expect(smallButton.removeEventListener).toHaveBeenCalledWith('click', click);
});
