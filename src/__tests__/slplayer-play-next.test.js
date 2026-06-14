import {
  describe, it, expect, vi,
} from 'vitest';
import slplayerActions from '@/store/modules/slplayer/actions';

vi.mock('@/player', () => ({
  getCurrentTimeMs: vi.fn(() => 0),
  waitForMediaElementEvent: vi.fn(() => Promise.resolve()),
  play: vi.fn(() => Promise.resolve(true)),
  pause: vi.fn(),
  getDurationMs: vi.fn(() => 100000),
  isTimeInBufferedRange: vi.fn(() => true),
  isMediaElementAttached: vi.fn(() => true),
  isPlaying: vi.fn(() => true),
  isPresentationPaused: vi.fn(() => false),
  isBuffering: vi.fn(() => false),
  getVolume: vi.fn(() => 1),
  isPaused: vi.fn(() => false),
  destroy: vi.fn(),
  cancelTrickPlay: vi.fn(),
  load: vi.fn(),
  setPlaybackRate: vi.fn(),
  getPlaybackRate: vi.fn(() => 1),
  setCurrentTimeMs: vi.fn(),
  setVolume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  areControlsShown: vi.fn(() => false),
  getSmallPlayButton: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  getBigPlayButton: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  unload: vi.fn(),
  isCasting: vi.fn(() => false),
  addCastStatusListener: vi.fn(),
  removeCastStatusListener: vi.fn(),
}));

vi.mock('@/utils/random', () => ({
  getRandomPlexId: vi.fn(() => 'mock-id'),
}));

vi.mock('@/utils/fetchutils', () => ({
  fetchJson: vi.fn(),
  queryFetch: vi.fn(),
}));

vi.mock('@/utils/deferredpromise', () => ({
  default: vi.fn(() => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }),
}));

describe('PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM', () => {
  it('starts playback after changing to the selected play queue item', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn();
    const rootGetters = {
      'plexclients/GET_ACTIVE_PLAY_QUEUE_SELECTED_ITEM': {
        title: 'Next Episode',
        viewOffset: 0,
      },
    };

    await slplayerActions.PLAY_ACTIVE_PLAY_QUEUE_SELECTED_ITEM({ dispatch, commit, rootGetters });

    expect(commit).toHaveBeenCalledWith('SET_PLAYER_STATE', 'buffering');
    expect(dispatch).toHaveBeenCalledWith('CHANGE_PLAYER_SRC');
    expect(dispatch).toHaveBeenCalledWith('PRESS_PLAY');
    expect(dispatch.mock.calls.filter(([action]) => action === 'synclounge/PROCESS_MEDIA_UPDATE'))
      .toEqual([
        ['synclounge/PROCESS_MEDIA_UPDATE', true, { root: true }],
        ['synclounge/PROCESS_MEDIA_UPDATE', true, { root: true }],
      ]);

    const actionOrder = (action) => dispatch.mock.invocationCallOrder[
      dispatch.mock.calls.findIndex(([name]) => name === action)
    ];
    expect(actionOrder('CHANGE_PLAYER_SRC')).toBeLessThan(actionOrder('PRESS_PLAY'));
    expect(actionOrder('PRESS_PLAY')).toBeLessThan(
      dispatch.mock.invocationCallOrder[
        dispatch.mock.calls.findLastIndex(([action]) => action === 'synclounge/PROCESS_MEDIA_UPDATE')
      ],
    );
  });
});
