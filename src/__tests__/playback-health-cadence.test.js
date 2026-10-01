import {
  afterEach, beforeEach, expect, it, vi,
} from 'vitest';
import actions from '@/store/modules/slplayer/actions';

vi.mock('@/player', () => ({}));
vi.mock('@/socket', () => ({}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const setup = (timeline) => {
  const getters = { GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN: null };
  const dispatch = vi.fn(async (name, payload) => {
    if (name === 'SEND_PLEX_TIMELINE_UPDATE') return timeline(payload);
    return undefined;
  });
  const context = {
    getters,
    dispatch,
    rootGetters: { GET_CONFIG: { slplayer_plex_timeline_update_interval: 1000 } },
    commit: (name, token) => {
      if (name === 'SET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN') {
        getters.GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN = token;
      }
    },
  };
  const calls = (name) => dispatch.mock.calls.filter(([type]) => type === name);
  return { context, calls };
};

it('keeps health reporting when Plex rejects every request', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { context, calls } = setup(async () => { throw new Error('Plex unavailable'); });
  const running = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await vi.advanceTimersByTimeAsync(3000);
  expect(calls('REPORT_PLAYBACK_DIAGNOSTIC')).toHaveLength(3);
  expect(calls('SEND_PLEX_TIMELINE_UPDATE')).toHaveLength(3);
  actions.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await running;
});

it('bounds a hung Plex request while health continues and shutdown stops the cadence', async () => {
  let finish;
  const { context, calls } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const running = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await vi.advanceTimersByTimeAsync(4000);
  expect(calls('REPORT_PLAYBACK_DIAGNOSTIC')).toHaveLength(4);
  expect(calls('SEND_PLEX_TIMELINE_UPDATE')).toHaveLength(1);
  const { signal } = calls('SEND_PLEX_TIMELINE_UPDATE')[0][1];
  actions.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await running;
  expect(signal.aborted).toBe(true);
  finish();
  await vi.advanceTimersByTimeAsync(4000);
  expect(calls('REPORT_PLAYBACK_DIAGNOSTIC')).toHaveLength(4);
  expect(calls('SEND_PLEX_TIMELINE_UPDATE')).toHaveLength(1);
});

it('starting again cancels the preceding cadence without duplicating future reports', async () => {
  const { context, calls } = setup(async () => {});
  const first = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  const previous = context.getters.GET_PLEX_TIMELINE_UPDATER_CANCEL_TOKEN;
  await vi.advanceTimersByTimeAsync(1000);
  const second = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await first;
  expect(previous.signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(calls('REPORT_PLAYBACK_DIAGNOSTIC')).toHaveLength(3);
  actions.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await second;
});

it('a replacement cadence does not overlap an old request that ignores cancellation', async () => {
  let finish;
  const { context, calls } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const first = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await vi.advanceTimersByTimeAsync(1000);
  const second = actions.START_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await first;
  await vi.advanceTimersByTimeAsync(3000);
  expect(calls('REPORT_PLAYBACK_DIAGNOSTIC')).toHaveLength(4);
  expect(calls('SEND_PLEX_TIMELINE_UPDATE')).toHaveLength(1);
  actions.CANCEL_PERIODIC_PLEX_TIMELINE_UPDATE(context);
  await second;
  finish();
  await vi.advanceTimersByTimeAsync(0);
});
