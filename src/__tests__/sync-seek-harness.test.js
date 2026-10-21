/* eslint-disable no-await-in-loop -- Reproduce ordered sync polls and seeded traces. */
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { CAF } from 'caf';
import actions from '@/store/modules/slplayer/actions';
import plexActions from '@/store/modules/plexclients/actions';
import plexGetters from '@/store/modules/plexclients/getters';
import partyActions from '@/store/modules/synclounge/actions';
import { recordSeekIntent } from '@/player/seekIntent';
import isSeekLandingValid from '@/utils/seeklanding';
import incident from '../../test/fixtures/seek-landing-incidents.json';
import { createDecoder, seededRandom } from './helpers/sync-playback-harness';

const runtime = vi.hoisted(() => ({ decoder: null }));
vi.mock('@/player/state', () => ({
  getPlayer: () => runtime.decoder?.getPlayer(),
  getRawPlayer: () => runtime.decoder?.getPlayer(),
  getOverlay: () => null,
  isCasting: () => false,
}));

let context;
let decoder;
const setup = () => {
  decoder = createDecoder();
  runtime.decoder = decoder;
  const state = {
    session: 'original-session', offset: 0, changing: false, masked: false, playerState: 'playing',
  };
  const diagnostics = [];
  const notifications = [];
  context = {
    getters: {
      GET_SRC_URL: 'https://fixture.invalid/stream',
      GET_FORCE_TRANSCODE: true,
      get GET_X_PLEX_SESSION_ID() { return state.session; },
      get GET_OFFSET_MS() { return state.offset; },
      get GET_MASK_PLAYER_STATE() { return state.masked; },
      get GET_PLAYER_STATE() { return state.changing || state.masked ? 'buffering' : state.playerState; },
    },
    rootGetters: { GET_CONFIG: { slplayer_seek_timeout: 15000 } },
    commit: vi.fn((type, value) => {
      if (type === 'SET_SESSION') state.session = value;
      if (type === 'SET_OFFSET_MS') state.offset = value;
      if (type === 'SET_IS_CHANGING_SOURCE') state.changing = value;
      if (type === 'SET_MASK_PLAYER_STATE') state.masked = value;
      if (type === 'SET_PLAYER_STATE') state.playerState = value;
    }),
  };
  const real = new Set([
    'NORMAL_SEEK', 'CHANGE_PLAYER_SRC', 'LOAD_PLAYER_SRC', 'REFRESH_PLAYER_STATE',
    'FETCH_PLAYER_CURRENT_TIME_MS_OR_FALLBACK',
  ]);
  context.dispatch = vi.fn(async (type, payload) => {
    if (real.has(type)) return actions[type](context, payload);
    if (type === 'REPORT_PLAYBACK_DIAGNOSTIC') diagnostics.push(payload);
    if (type === 'DISPLAY_NOTIFICATION') notifications.push(payload);
    if (type === 'PRESS_PLAY') decoder.video.paused = false;
    return undefined;
  });
  const seek = (target, signal) => {
    // eslint-disable-next-line new-cap
    const token = signal ? null : new CAF.cancelToken();
    return actions.NORMAL_SEEK(context, { seekToMs: target, cancelSignal: signal || token.signal });
  };
  return {
    state, diagnostics, notifications, seek,
  };
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  recordSeekIntent();
  setup();
  await actions.CHANGE_PLAYER_SRC({ getters: {}, commit: vi.fn(), dispatch: vi.fn().mockResolvedValue() });
});
afterEach(() => { decoder.finish(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('decoder landing regression harness', () => {
  it('rebases a stream that reports seeked 18 seconds ahead, instead of repeating bad correction seeks', async () => {
    const { seek, diagnostics } = setup();
    const { requestedMs, landedMs } = incident.aheadLanding;
    decoder.setPosition(2600);
    decoder.missMs = landedMs - requestedMs;
    const operation = seek(requestedMs);
    await vi.advanceTimersByTimeAsync(100);
    await operation;
    expect(decoder.loads).toBe(1);
    expect(Math.abs(decoder.video.currentTime * 1000 - requestedMs)).toBeLessThan(300);
    expect(diagnostics).toContainEqual(expect.objectContaining({ event: 'seek-landing-missed' }));
    expect(decoder.listenerCount()).toBe(0);
  });

  it('keeps subsequent real sync polls stable after recovering the recorded landing', async () => {
    const { requestedMs, landedMs, pollIntervalMs } = incident.aheadLanding;
    setup();
    const startedAt = Date.now();
    decoder.setPosition((landedMs + 5000) / 1000);
    decoder.missMs = landedMs - requestedMs;
    Object.assign(context.rootGetters, {
      'synclounge/GET_HOST_USER': { state: 'playing' },
      'synclounge/GET_ADJUSTED_HOST_TIME': () => requestedMs + Date.now() - startedAt,
      'settings/GET_SYNCFLEXIBILITY': 500,
      'settings/GET_SYNCMODE': 'cleanseek',
    });
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation(async (type, payload) => {
      if (type === 'FETCH_TIMELINE_POLL_DATA_CACHE') return actions.FETCH_TIMELINE_POLL_DATA(context);
      if (type === 'SEEK_TO') return plexActions.SEEK_TO(context, payload);
      if (type === 'slplayer/NORMAL_SEEK') return actions.NORMAL_SEEK(context, payload);
      return dispatch(type, payload);
    });
    // eslint-disable-next-line new-cap
    const token = new CAF.cancelToken();
    const syncing = plexActions.SYNC(context, token.signal);
    await vi.advanceTimersByTimeAsync(100);
    await syncing;
    for (let poll = 0; poll < 12; poll += 1) {
      await vi.advanceTimersByTimeAsync(pollIntervalMs);
      await plexActions.SYNC(context, token.signal);
    }
    expect(decoder.loads).toBe(1);
    expect(decoder.seeks).toHaveLength(2);
    expect(Math.abs(decoder.video.currentTime * 1000
      - context.rootGetters['synclounge/GET_ADJUSTED_HOST_TIME']())).toBeLessThan(500);
  });

  it('waits for a late landing even if currentTime initially equals the requested target', async () => {
    const { seek } = setup();
    decoder.delayMs = 900;
    decoder.missMs = 18000;
    let finished = false;
    const operation = seek(80000).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(600);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    await operation;
    expect(decoder.loads).toBe(1);
  });

  it('settles a slow seek without an event, then removes its event waiter', async () => {
    const { seek } = setup();
    decoder.delayMs = 900;
    decoder.emitSeeked = false;
    const operation = seek(80000);
    await vi.advanceTimersByTimeAsync(1100);
    await operation;
    expect(decoder.loads).toBe(0);
    expect(decoder.listenerCount()).toBe(0);
  });

  it('does not load or seek after manual input invalidates pending source recovery', async () => {
    const { seek, state } = setup();
    decoder.missMs = 18000;
    let finishDecision;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => (type === 'SEND_PLEX_DECISION_REQUEST'
      ? new Promise((resolve) => { finishDecision = resolve; }) : dispatch(type, payload)));
    const result = seek(80000).catch((error) => error.name);
    await vi.advanceTimersByTimeAsync(30);
    expect(finishDecision).toBeTypeOf('function');
    recordSeekIntent(true);
    decoder.video.currentTime = 200;
    finishDecision();
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe('AbortError');
    expect(decoder.loads).toBe(0);
    expect(decoder.seeks).toEqual([80000, 200000]);
    expect(state.changing).toBe(false);
    expect(state.session).toBe('original-session');
    expect(context.dispatch).toHaveBeenCalledWith('CHANGE_SUBTITLES', expect.any(Object));
  });

  it('cleans up a source load invalidated by manual input', async () => {
    const { seek, state } = setup();
    decoder.missMs = 18000;
    const { getPlayer } = decoder;
    let finishLoad;
    let unloads = 0;
    decoder.getPlayer = () => ({
      ...getPlayer(),
      unload: async () => { unloads += 1; },
      load: () => new Promise((resolve) => { finishLoad = resolve; }),
    });
    const result = seek(80000).catch((error) => error.name);
    await vi.advanceTimersByTimeAsync(30);
    expect(finishLoad).toBeTypeOf('function');
    recordSeekIntent(true);
    finishLoad();
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe('AbortError');
    expect(unloads).toBe(2);
    expect(state.changing).toBe(false);
  });

  it('recovers a wrong landing even when neither seek emits an event', async () => {
    const { seek } = setup();
    decoder.emitSeeked = false;
    decoder.missMs = 30000;
    const operation = seek(80000).then(() => 'settled', (error) => String(error?.stack || error));
    await vi.advanceTimersByTimeAsync(17000);
    expect(await operation).toBe('settled');
    expect(decoder.loads).toBe(1);
    expect(Math.abs(decoder.video.currentTime * 1000 - 97000)).toBeLessThan(300);
    expect(decoder.listenerCount()).toBe(0);
  });

  it('bounds a recovery decision that never completes and ignores its late result', async () => {
    const { seek, notifications } = setup();
    decoder.missMs = 30000;
    let finishDecision;
    const dispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload) => (type === 'SEND_PLEX_DECISION_REQUEST'
      ? new Promise((resolve) => { finishDecision = resolve; }) : dispatch(type, payload)));
    let finished = false;
    const operation = seek(80000).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(16000);
    expect(finished).toBe(true);
    expect(notifications).toHaveLength(1);
    finishDecision();
    await operation;
    await vi.advanceTimersByTimeAsync(100);
    expect(decoder.loads).toBe(0);
    expect(decoder.listenerCount()).toBe(0);
  });

  it('stops the correction loop if even a fresh stream lands at the wrong position', async () => {
    const { seek, notifications } = setup();
    decoder.setPosition(200);
    decoder.missMs = 30000;
    decoder.reloadMissMs = 30000;
    for (let poll = 0; poll < 12; poll += 1) {
      const operation = seek(100000 + poll * 10000);
      await vi.advanceTimersByTimeAsync(100);
      await operation;
    }
    expect(decoder.loads).toBe(1);
    expect(decoder.seeks.length).toBeLessThanOrEqual(2);
    expect(notifications).toHaveLength(1);
    expect(decoder.listenerCount()).toBe(0);
  });
});

const requestedSeed = process.env.SYNC_FUZZ_SEED;
const seeds = requestedSeed ? [Number(requestedSeed)]
  : [1, 7, 19, 43, 101, 257, 1024, 65537, 20261019, 20261020, 0xdeadbeef, 0xffffffff];
const casesPerSeed = Math.min(200, Math.max(1, Number(process.env.SYNC_FUZZ_CASES) || 30));

describe('seeded sync/decoder fault sequences', () => {
  it.each(seeds)('preserves seek and recovery invariants for seed %s', async (seed) => {
    const random = seededRandom(seed);
    for (let step = 0; step < casesPerSeed; step += 1) {
      decoder.finish();
      recordSeekIntent();
      const { seek, notifications } = setup();
      await actions.CHANGE_PLAYER_SRC({ getters: {}, commit: vi.fn(), dispatch: vi.fn().mockResolvedValue() });
      const target = Math.floor(random() * 5000000) + 10000;
      const fault = Math.floor(random() * 8);
      decoder.video.playbackRate = 0.5 + random() * 1.5;
      decoder.video.paused = random() < 0.5;
      const { paused } = decoder.video;
      decoder.delayMs = 1 + Math.floor(random() * 1400);
      decoder.setPosition((target + 5000) / 1000);
      decoder.missMs = fault === 1 || fault === 2 ? 10000 + Math.floor(random() * 40000) : 0;
      decoder.reloadMissMs = fault === 2 ? decoder.missMs : 0;
      decoder.emitSeeked = fault !== 3 && random() < 0.7;
      const advanceMs = decoder.emitSeeked ? 3500 : 19000;
      // eslint-disable-next-line new-cap
      const token = new CAF.cancelToken();
      const result = seek(target, token.signal).then(() => 'settled', (error) => error?.name || 'cancelled');
      try {
        if (fault === 4) token.abort('Cancelled fuzz operation');
        if (fault === 5) {
          // A deliberate seek arrives while an automatic correction is settling.
          recordSeekIntent(true);
          decoder.video.currentTime = (target + 90000) / 1000;
        }
        if (fault === 6) {
          await actions.CHANGE_PLAYER_SRC({ getters: {}, commit: vi.fn(), dispatch: vi.fn().mockResolvedValue() });
        }
        if (fault === 7) {
          // A newer correction owns the next event; the old completion must be inert.
          const newer = seek(target + 100000, token.signal);
          await vi.advanceTimersByTimeAsync(advanceMs);
          await newer;
        } else await vi.advanceTimersByTimeAsync(advanceMs);
        const outcome = await result;
        if ([4, 5, 6, 7].includes(fault)) {
          expect(['AbortError', 'cancelled']).toContain(outcome);
          expect(decoder.loads).toBe(0);
        } else {
          expect(outcome).toBe('settled');
          expect(decoder.video.paused).toBe(paused);
          expect(decoder.loads).toBe(fault === 1 || fault === 2 ? 1 : 0);
          if (fault === 2) {
            const seeksBefore = decoder.seeks.length;
            for (let poll = 0; poll < 5; poll += 1) await seek(target + poll * 10000, token.signal);
            expect(decoder.seeks).toHaveLength(seeksBefore);
            expect(notifications).toHaveLength(1);
          } else {
            const actual = decoder.video.currentTime * 1000;
            expect(actual).toBeGreaterThanOrEqual(target - 250);
            expect(actual).toBeLessThanOrEqual(target + (paused ? 250 : advanceMs * decoder.video.playbackRate));
            expect(notifications).toHaveLength(0);
          }
        }
        expect(decoder.listenerCount()).toBe(0);
      } catch (error) {
        throw new Error(`SYNC_FUZZ_SEED=${seed} step=${step} fault=${fault}`, { cause: error });
      }
    }
  });
});

describe('seek validation fuzz', () => {
  it('accepts only finite landing positions inside the elapsed playback window', () => {
    const random = seededRandom(43);
    for (let sample = 0; sample < 10000; sample += 1) {
      const target = 10000 + Math.floor(random() * 6000000);
      const elapsedMs = Math.floor(random() * 15000);
      const rate = 0.5 + random() * 1.5;
      const paused = sample % 2 === 0;
      const tolerance = 250;
      const upper = target + (paused ? 0 : elapsedMs * rate) + tolerance;
      const options = {
        target, elapsedMs, rate, paused, tolerance,
      };
      expect(isSeekLandingValid({ ...options, actual: target })).toBe(true);
      expect(isSeekLandingValid({ ...options, actual: upper })).toBe(true);
      expect(isSeekLandingValid({ ...options, actual: upper + 1 })).toBe(false);
      expect(isSeekLandingValid({ ...options, actual: target - tolerance - 1 })).toBe(false);
    }
  });
  const invalidTargets = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1];
  it.each(invalidTargets)('rejects invalid targets without side effects: %s', async (target) => {
    const { seek } = setup();
    await expect(seek(target)).rejects.toThrow('Invalid seek target');
    expect(decoder.seeks).toHaveLength(0);
    expect(context.commit).not.toHaveBeenCalled();
  });
});

it('retries a selected-but-unloaded guest stream after startup cancellation', async () => {
  const { state } = setup();
  const media = { machineIdentifier: 'own-server', ratingKey: 'fixture-movie' };
  state.masked = true;
  state.offset = 231660;
  const controller = new AbortController();
  const normalDispatch = context.dispatch.getMockImplementation();
  let decisionReached = false;
  context.dispatch.mockImplementation((type, payload) => {
    if (type === 'SEND_PLEX_DECISION_REQUEST') {
      decisionReached = true;
      controller.abort();
      return Promise.resolve();
    }
    return normalDispatch(type, payload);
  });
  await expect(actions.CHANGE_PLAYER_SRC(context, { signal: controller.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(decisionReached).toBe(true);
  expect(decoder.loads).toBe(0);
  expect(state.changing).toBe(false);
  expect(state.masked).toBe(true);

  Object.assign(context.getters, {
    GET_HOST_ID: 'host',
    GET_ROOM: 'private-fixture',
    GET_HOST_USER: { media, state: 'playing' },
  });
  Object.assign(context.rootGetters, {
    'settings/GET_AUTOPLAY': true,
    'plexclients/IS_THIS_MEDIA_PLAYING': (candidate) => plexGetters.IS_THIS_MEDIA_PLAYING(
      {},
      { GET_ACTIVE_MEDIA_METADATA: media },
      {},
      { 'slplayer/GET_MASK_PLAYER_STATE': state.masked },
    )(candidate),
  });
  context.dispatch.mockImplementation((type, payload) => {
    if (type === 'plexclients/FETCH_TIMELINE_POLL_DATA_CACHE') {
      return Promise.resolve({ state: 'buffering', time: state.offset });
    }
    if (type === 'plexservers/FIND_BEST_MEDIA_MATCH') return Promise.resolve(media);
    if (type === 'PLAY_MEDIA_AND_SYNC_TIME') return actions.CHANGE_PLAYER_SRC(context);
    return normalDispatch(type, payload);
  });
  await partyActions._SYNC_MEDIA_AND_PLAYER_STATE(context, new AbortController().signal);
  expect(decoder.loads).toBe(1);
  expect(state.masked).toBe(false);
  // Once successfully loaded, an unchanged media update must not reload it again.
  await partyActions._SYNC_MEDIA_AND_PLAYER_STATE(context, new AbortController().signal);
  expect(decoder.loads).toBe(1);
});

it('uses one bounded media retry on ordinary host updates after an interrupted guest startup', async () => {
  const { state } = setup();
  const media = { machineIdentifier: 'fixture-server', ratingKey: 'interrupted-startup' };
  Object.assign(context.getters, { GET_HOST_ID: 'fixture-host', GET_ROOM: 'startup-room', GET_HOST_USER: { media } });
  Object.assign(context.rootGetters, {
    'slplayer/GET_MASK_PLAYER_STATE': true,
    'slplayer/IS_CHANGING_SOURCE': true,
    'settings/GET_AUTOPLAY': true,
  });
  await partyActions.SYNC_PLAYER_STATE(context);
  expect(context.dispatch).not.toHaveBeenCalledWith('SYNC_MEDIA_AND_PLAYER_STATE');
  context.rootGetters['slplayer/IS_CHANGING_SOURCE'] = false;
  await partyActions.SYNC_PLAYER_STATE(context);
  await partyActions.SYNC_PLAYER_STATE(context);
  expect(context.dispatch.mock.calls.filter(([type]) => type === 'SYNC_MEDIA_AND_PLAYER_STATE')).toHaveLength(1);
  expect(state.offset).toBe(0);
});
