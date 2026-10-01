import {
  afterEach, expect, it, vi,
} from 'vitest';
import { reactive, watch, nextTick } from 'vue';
import WebPlayer from '@/views/WebPlayer.vue';
import playerActions from '@/store/modules/slplayer/actions';
import plexActions from '@/store/modules/plexclients/actions';
import initialize from '@/player/init';
import { abortable } from '@/utils/cancellation';
import { emit, isConnected } from '@/socket';

vi.mock('@/player/init', () => ({ default: vi.fn() }));
vi.mock('@/player', () => ({
  getControlsOffset: () => 48, setVolume: vi.fn(), destroy: vi.fn(async () => {}),
}));
vi.mock('@/socket', () => ({ emit: vi.fn(), isConnected: vi.fn(() => true) }));

afterEach(() => vi.clearAllMocks());

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const setup = () => {
  const state = reactive({
    pending: null, initialized: false, metadata: null, server: null, shouldPlay: null, playerState: 'buffering',
  });
  const getters = {
    get GET_PLAYER_INITIALIZED_DEFERRED_PROMISE() { return state.pending; },
    get IS_PLAYER_INITIALIZED() { return state.initialized; },
    get GET_SHOULD_PLAY_ON_LOAD() { return state.shouldPlay; },
  };
  const rootGetters = {
    get 'slplayer/IS_PLAYER_INITIALIZED'() { return state.initialized; },
    get 'plexclients/GET_ACTIVE_MEDIA_METADATA'() { return state.metadata; },
    get 'plexclients/GET_ACTIVE_SERVER_ID'() { return state.server; },
    'settings/GET_SLPLAYERVOLUME': 1,
  };
  const commit = vi.fn((name, value) => {
    if (name === 'SET_PLAYER_INITIALIZED_DEFERRED_PROMISE') state.pending = value;
    if (name === 'SET_IS_PLAYER_INITIALIZED') state.initialized = value;
    if (name.endsWith('SET_ACTIVE_MEDIA_METADATA')) state.metadata = value;
    if (name.endsWith('SET_ACTIVE_SERVER_ID')) state.server = value;
    if (name.endsWith('SET_SHOULD_PLAY_ON_LOAD')) state.shouldPlay = value;
    if (name.endsWith('SET_PLAYER_STATE')) state.playerState = value;
  });
  const context = { getters, rootGetters, commit };
  const startupActions = new Set([
    'NAVIGATE_AND_INITIALIZE_PLAYER', 'CANCEL_PLAYER_INITIALIZATION', 'INIT_PLAYER_STATE',
    'FAIL_PLAYER_INITIALIZATION', 'ROLLBACK_PLAYER_INITIALIZATION',
  ]);
  context.dispatch = vi.fn((name, payload) => {
    const local = name.replace(/^slplayer\//, '');
    if (startupActions.has(local)) return playerActions[local](context, payload);
    return Promise.resolve({});
  });
  const vm = reactive({
    ...WebPlayer.data(),
    $refs: { videoPlayer: {}, videoPlayerContainer: {} },
    get GET_PLAYER_INITIALIZED_DEFERRED_PROMISE() { return state.pending; },
    get GET_PLAYER_STATE() { return state.playerState; },
    $router: { push: vi.fn() },
    linkWithRoom: (target) => target,
    getPlayerUiOptions: () => ({}),
    INIT_PLAYER_STATE: (payload) => context.dispatch('INIT_PLAYER_STATE', payload),
    FAIL_PLAYER_INITIALIZATION: (error) => context.dispatch('FAIL_PLAYER_INITIALIZATION', error),
    onKeyUp: vi.fn(),
    RERENDER_SUBTITLE_CONTAINER: vi.fn(),
  });
  vm.initializePlayer = () => WebPlayer.methods.initializePlayer.call(vm);
  const stopPending = watch(() => state.pending, (pending) => {
    WebPlayer.watch.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE.call(vm, pending);
  });
  const stopFailed = watch(() => vm.startupFailed, (failed) => {
    WebPlayer.watch.startupFailed.call(vm, failed);
  });
  const stopState = watch(() => state.playerState, (value) => {
    WebPlayer.watch.GET_PLAYER_STATE.call(vm, value);
  });
  const play = (signal, ratingKey = 'first') => plexActions.PLAY_MEDIA(context, {
    signal, metadata: { ratingKey }, machineIdentifier: 'server', shouldPlay: true,
  });
  const close = () => {
    vm.startupDisposed = true;
    vm.startupController?.abort();
    window.removeEventListener('keydown', vm.onKeyUp);
    window.removeEventListener('resize', vm.RERENDER_SUBTITLE_CONTAINER);
    stopPending();
    stopFailed();
    stopState();
  };
  return {
    state, context, vm, play, close,
  };
};

it('external cancellation aborts attachment, settles navigation and ignores a late attach', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  const attach = deferred();
  initialize.mockImplementationOnce(({ signal }) => abortable(attach.promise, signal));
  const owner = new AbortController();
  const playing = play(owner.signal);
  const rejected = expect(playing).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  const navigation = state.pending.promise;
  const navigationRejected = expect(navigation).rejects.toMatchObject({ name: 'AbortError' });
  const mounting = vm.initializePlayer();
  owner.abort();
  await rejected;
  await navigationRejected;
  await mounting;
  expect(vm.startupController.signal.aborted).toBe(true);
  expect(state.pending).toBeNull();
  expect(state.metadata).toBeNull();
  expect(state.server).toBeNull();
  expect(state.shouldPlay).toBeNull();
  expect(state.playerState).toBe('stopped');
  expect(context.dispatch.mock.calls.filter(([name]) => name === 'synclounge/PUBLISH_CANCELLED_PLAYBACK'))
    .toHaveLength(1);
  expect(vm.$router.push).toHaveBeenCalledExactlyOnceWith({ name: 'PlexHome' });
  attach.resolve();
  await nextTick();
  expect(context.dispatch.mock.calls.some(([name]) => name === 'INIT_PLAYER_STATE')).toBe(false);
  expect(context.dispatch.mock.calls.some(([name]) => name.includes('CHANGE_PLAYER_SRC'))).toBe(false);
  close();
});

it('cancellation before mounting cannot fall back to loading the cancelled metadata', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  initialize.mockResolvedValueOnce(undefined);
  const owner = new AbortController();
  const playing = play(owner.signal);
  const rejected = expect(playing).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  owner.abort();
  await rejected;
  await vm.initializePlayer();
  expect(state.initialized).toBe(true);
  expect(state.metadata).toBeNull();
  expect(context.dispatch.mock.calls.some(([name]) => name.includes('CHANGE_PLAYER_SRC'))).toBe(false);
  expect(context.dispatch.mock.calls.some(([name]) => name.includes('PRESS_PLAY'))).toBe(false);
  close();
});

it('starts an immediate replacement after cancelled attachment finishes cleanup', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  const attach = deferred();
  initialize.mockImplementationOnce(({ signal }) => abortable(attach.promise, signal))
    .mockResolvedValueOnce(undefined);
  const owner = new AbortController();
  const first = play(owner.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  const mounting = vm.initializePlayer();
  owner.abort();
  const second = play(new AbortController().signal, 'second');
  await rejected;
  await mounting;
  await second;
  expect(initialize).toHaveBeenCalledTimes(2);
  expect(state.initialized).toBe(true);
  expect(state.metadata.ratingKey).toBe('second');
  expect(state.pending).toBeNull();
  expect(context.dispatch.mock.calls.filter(([name]) => name === 'slplayer/CHANGE_PLAYER_SRC')).toHaveLength(1);
  expect(vm.$router.push).not.toHaveBeenCalled();
  attach.resolve();
  await nextTick();
  expect(state.initialized).toBe(true);
  close();
});

it('old owner cancellation cannot abort the replacement sharing an attachment', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  const attach = deferred();
  initialize.mockImplementationOnce(({ signal }) => abortable(attach.promise, signal));
  const oldOwner = new AbortController();
  const first = play(oldOwner.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  const mounting = vm.initializePlayer();
  const sharedRequest = state.pending;
  const second = play(new AbortController().signal, 'second');
  await vi.waitFor(() => expect(context.dispatch.mock.calls.filter(
    ([name]) => name === 'slplayer/NAVIGATE_AND_INITIALIZE_PLAYER',
  )).toHaveLength(2));
  oldOwner.abort();
  await rejected;
  expect(state.pending).toBe(sharedRequest);
  expect(vm.startupController.signal.aborted).toBe(false);
  expect(state.metadata.ratingKey).toBe('second');
  attach.resolve();
  await mounting;
  await second;
  expect(initialize).toHaveBeenCalledOnce();
  expect(state.initialized).toBe(true);
  close();
});

it('explicit playback cancellation aborts an owner without an external signal', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  initialize.mockImplementationOnce(({ signal }) => abortable(new Promise(() => {}), signal));
  const playing = play();
  const rejected = expect(playing).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  const mounting = vm.initializePlayer();
  await plexActions.CANCEL_PLAY_MEDIA(context);
  await rejected;
  await mounting;
  expect(state.pending).toBeNull();
  expect(vm.startupController.signal.aborted).toBe(true);
  close();
});

it('an old signal cannot clear newer media while the replacement queue is still pending', async () => {
  const {
    state, context, vm, play, close,
  } = setup();
  const attach = deferred();
  initialize.mockImplementationOnce(({ signal }) => abortable(attach.promise, signal));
  const oldOwner = new AbortController();
  const first = play(oldOwner.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(state.pending).not.toBeNull());
  const mounting = vm.initializePlayer();
  const queue = deferred();
  const originalDispatch = context.dispatch.getMockImplementation();
  context.dispatch.mockImplementation((name, payload) => (
    name === 'plexservers/CREATE_PLAY_QUEUE' ? queue.promise : originalDispatch(name, payload)
  ));
  const second = play(new AbortController().signal, 'second');
  oldOwner.abort();
  await rejected;
  expect(vm.startupController.signal.aborted).toBe(false);
  expect(state.pending).not.toBeNull();
  queue.resolve({});
  await nextTick();
  attach.resolve();
  await mounting;
  await second;
  expect(state.metadata.ratingKey).toBe('second');
  expect(vm.$router.push).not.toHaveBeenCalled();
  close();
});

it('stopping an uninitialized player does not send a timeline for cleared media', async () => {
  const commit = vi.fn();
  const dispatch = vi.fn(async () => {});
  await playerActions.PRESS_STOP({ getters: { IS_PLAYER_INITIALIZED: false }, commit, dispatch });
  expect(dispatch).toHaveBeenCalledWith('plexclients/CANCEL_PLAY_MEDIA', null, { root: true });
  expect(commit).toHaveBeenCalledWith('SET_PLAYER_STATE', 'stopped');
  expect(dispatch).toHaveBeenCalledWith('synclounge/PUBLISH_CANCELLED_PLAYBACK', null, { root: true });
  expect(dispatch).not.toHaveBeenCalledWith('CHANGE_PLAYER_STATE', 'stopped');
});

it('publishes the cancelled room state synchronously with no timeline or automatic sync', async () => {
  vi.stubGlobal('Audio', class AudioMock {});
  const { default: roomActions } = await import('@/store/modules/synclounge/actions');
  const commit = vi.fn();
  const context = {
    getters: { IS_IN_ROOM: true, GET_SOCKET_ID: 'self', GET_USER: () => ({ state: 'buffering' }) },
    commit,
  };
  expect(roomActions.PUBLISH_CANCELLED_PLAYBACK(context)).toBeUndefined();
  expect(commit).toHaveBeenCalledWith('SET_USER_MEDIA', { id: 'self', media: null });
  expect(emit).toHaveBeenCalledExactlyOnceWith({
    eventName: 'mediaUpdate',
    data: {
      media: null, roomPreview: null, state: 'stopped', time: 0, duration: 0, playbackRate: 0, userInitiated: false,
    },
  });
  emit.mockClear();
  isConnected.mockReturnValueOnce(false);
  roomActions.PUBLISH_CANCELLED_PLAYBACK(context);
  roomActions.PUBLISH_CANCELLED_PLAYBACK({ ...context, getters: { ...context.getters, GET_USER: () => null } });
  expect(emit).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('does not duplicate the terminal room update when Stop cancelled a pending startup', async () => {
  const dispatch = vi.fn(async (name) => (name === 'plexclients/CANCEL_PLAY_MEDIA' ? true : undefined));
  await playerActions.PRESS_STOP({ getters: { IS_PLAYER_INITIALIZED: false }, commit: vi.fn(), dispatch });
  expect(dispatch).not.toHaveBeenCalledWith('synclounge/PUBLISH_CANCELLED_PLAYBACK', null, { root: true });
});
