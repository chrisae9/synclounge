import {
  afterEach, expect, it, vi,
} from 'vitest';
import { setCurrentTimeMs } from '@/player';
import { setPlayer, setOverlay } from '@/player/state';
import { consumeUserSeekIntent, recordSeekIntent } from '@/player/seekIntent';

const setup = (video) => {
  setOverlay(null);
  setPlayer({ getMediaElement: () => video });
};
afterEach(() => { setPlayer(null); setOverlay(null); recordSeekIntent(); });

it('records intent before the media setter and defaults corrections to automatic', () => {
  const received = [];
  setup({
    get currentTime() { return 0; },
    set currentTime(value) { received.push([value, consumeUserSeekIntent()]); },
  });
  setCurrentTimeMs(90000);
  setCurrentTimeMs(91000, { userInitiated: true });
  expect(received).toEqual([[90, false], [91, true]]);
});

it('does not leave manual intent behind after a no-op or failed seek', () => {
  setup({ currentTime: 90 });
  setCurrentTimeMs(90000, { userInitiated: true });
  expect(consumeUserSeekIntent()).toBe(false);
  setup({
    get currentTime() { return 90; },
    set currentTime(value) { throw new Error(`Rejected ${value}`); },
  });
  expect(() => setCurrentTimeMs(95000, { userInitiated: true })).toThrow('Rejected 95');
  expect(consumeUserSeekIntent()).toBe(false);
});

it('distinguishes the manual intro button from automatic intro skipping', async () => {
  const { default: actions } = await import('@/store/modules/slplayer/actions');
  const video = { currentTime: 0 };
  setup(video);
  const ctx = {
    dispatch: vi.fn(),
    commit: vi.fn(),
    rootGetters: { 'plexclients/GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER': { endTimeOffset: 10000 } },
  };
  await actions.SKIP_INTRO(ctx);
  expect(consumeUserSeekIntent()).toBe(true);
  video.currentTime = 0;
  await actions.SKIP_INTRO(ctx, { userInitiated: false });
  expect(consumeUserSeekIntent()).toBe(false);
});

it.each(['SOFT_SEEK', 'NORMAL_SEEK'])('preserves a pending user seek during %s', async (action) => {
  const { default: actions } = await import('@/store/modules/slplayer/actions');
  const video = { currentTime: 90 };
  setup(video);
  recordSeekIntent(true); // Shaka has accepted a user gesture; seeked is still queued.
  const ctx = { state: {}, commit: vi.fn(), dispatch: vi.fn() };
  await actions[action](ctx, action === 'SOFT_SEEK' ? 5000 : { seekToMs: 5000 });
  expect(ctx.commit).not.toHaveBeenCalled();
  setCurrentTimeMs(5000); // Also cover direct automatic setter callers.
  expect(video.currentTime).toBe(90);
  await actions.HANDLE_SEEKED(ctx);
  expect(ctx.dispatch).toHaveBeenCalledWith('synclounge/PROCESS_PLAYER_STATE_UPDATE', {
    noSync: true, userInitiatedSeek: true,
  }, { root: true });
  setCurrentTimeMs(5000); // Automatic correction resumes once manual intent is consumed.
  expect(video.currentTime).toBe(5);
  expect(consumeUserSeekIntent()).toBe(false);
});
