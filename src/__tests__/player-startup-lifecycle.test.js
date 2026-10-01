import {
  afterEach, expect, it, vi,
} from 'vitest';
import { reactive, watch, nextTick } from 'vue';
import { destroy } from '@/player';
import WebPlayer from '@/views/WebPlayer.vue';
import actions from '@/store/modules/slplayer/actions';
import initialize from '@/player/init';

vi.mock('@/player/init', () => ({ default: vi.fn() }));
vi.mock('@/player', () => ({ getControlsOffset: () => 48, destroy: vi.fn(async () => {}) }));
vi.mock('@/socket', () => ({ emit: vi.fn(), isConnected: () => false }));

afterEach(() => vi.clearAllMocks());

const setup = () => {
  const getters = { GET_PLAYER_INITIALIZED_DEFERRED_PROMISE: null, IS_PLAYER_INITIALIZED: false };
  const commit = vi.fn((name, value) => {
    if (name === 'SET_PLAYER_INITIALIZED_DEFERRED_PROMISE') {
      getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE = value;
    }
  });
  const dispatch = vi.fn(async () => {});
  const context = { getters, commit, dispatch };
  const vm = {
    ...WebPlayer.data(),
    $refs: { videoPlayer: {}, videoPlayerContainer: {} },
    playerConfig: {},
    getPlayerUiOptions: () => ({}),
    FAIL_PLAYER_INITIALIZATION: (error) => actions.FAIL_PLAYER_INITIALIZATION(context, error),
    INIT_PLAYER_STATE: vi.fn(async () => {
      getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE?.resolve();
      commit('SET_PLAYER_INITIALIZED_DEFERRED_PROMISE', null);
    }),
    DESTROY_PLAYER_STATE: () => actions.DESTROY_PLAYER_STATE(context),
    onKeyUp: vi.fn(),
    RERENDER_SUBTITLE_CONTAINER: vi.fn(),
  };
  return { context, vm };
};

it('settles failed navigation, rolls back resources and accepts a fresh retry', async () => {
  const { context, vm } = setup();
  const failure = new Error('attach failed');
  initialize.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
  const first = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  const rejected = expect(first).rejects.toBe(failure);
  await WebPlayer.methods.initializePlayer.call(vm);
  await rejected;
  expect(context.getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE).toBeNull();
  expect(context.dispatch).toHaveBeenCalledWith('ROLLBACK_PLAYER_INITIALIZATION');
  expect(vm.startupFailed).toBe(true);
  expect(vm.INIT_PLAYER_STATE).not.toHaveBeenCalled();
  const retry = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  expect(retry).not.toBe(first);
  await WebPlayer.methods.initializePlayer.call(vm);
  await expect(retry).resolves.toBeUndefined();
  expect(vm.startupFailed).toBe(false);
  WebPlayer.beforeUnmount.call(vm);
});

it('rejects pending navigation on route exit and ignores late initialization', async () => {
  const { context, vm } = setup();
  let complete;
  initialize.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const pending = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const mounting = WebPlayer.methods.initializePlayer.call(vm);
  WebPlayer.beforeUnmount.call(vm);
  await rejected;
  expect(context.getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE).toBeNull();
  expect(vm.startupController.signal.aborted).toBe(true);
  expect(context.commit).toHaveBeenCalledWith('plexclients/SET_ACTIVE_MEDIA_METADATA', null, { root: true });
  expect(context.commit).toHaveBeenCalledWith('plexclients/SET_ACTIVE_SERVER_ID', null, { root: true });
  expect(context.commit).toHaveBeenCalledWith('SET_OFFSET_MS', 0);
  complete();
  await mounting;
  expect(vm.INIT_PLAYER_STATE).not.toHaveBeenCalled();
  expect(vm.startupFailed).toBe(false);
});

it('clears the pending request even if rollback fails', async () => {
  const { context } = setup();
  context.dispatch.mockRejectedValueOnce(new Error('cleanup failed'));
  const pending = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  const failure = new Error('setup failed');
  const rejected = expect(pending).rejects.toBe(failure);
  await expect(actions.FAIL_PLAYER_INITIALIZATION(context, failure)).rejects.toThrow('cleanup failed');
  await rejected;
  expect(context.getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE).toBeNull();
});

it('automatically retries a new request received while failed startup is cleaning up', async () => {
  const { context, vm: plain } = setup();
  let finishCleanup;
  context.dispatch.mockImplementationOnce(() => new Promise((resolve) => { finishCleanup = resolve; }));
  const vm = reactive(plain);
  Object.defineProperty(vm, 'GET_PLAYER_INITIALIZED_DEFERRED_PROMISE', {
    get: () => context.getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE,
  });
  vm.initializePlayer = () => WebPlayer.methods.initializePlayer.call(vm);
  const stopWatching = watch(() => vm.startupFailed, (failed) => {
    WebPlayer.watch.startupFailed.call(vm, failed);
  });
  initialize.mockRejectedValueOnce(new Error('attach failed')).mockResolvedValueOnce(undefined);
  const first = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  const firstRejected = expect(first).rejects.toThrow('attach failed');
  const mounting = vm.initializePlayer();
  await firstRejected;
  const retry = actions.NAVIGATE_AND_INITIALIZE_PLAYER(context);
  WebPlayer.watch.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE.call(
    vm,
    context.getters.GET_PLAYER_INITIALIZED_DEFERRED_PROMISE,
  );
  expect(initialize).toHaveBeenCalledTimes(1);
  finishCleanup();
  await mounting;
  await nextTick();
  await expect(retry).resolves.toBeUndefined();
  expect(initialize).toHaveBeenCalledTimes(2);
  stopWatching();
  WebPlayer.beforeUnmount.call(vm);
});

it('old rollback completion cannot mark a newly initialized player uninitialized', async () => {
  let finishDestruction;
  destroy.mockImplementationOnce(() => new Promise((resolve) => { finishDestruction = resolve; }));
  const state = { initialized: true };
  const context = {
    getters: {},
    commit: (name, value) => {
      if (name === 'SET_IS_PLAYER_INITIALIZED') state.initialized = value;
    },
    dispatch: vi.fn(async () => {}),
  };
  const cleanup = actions.ROLLBACK_PLAYER_INITIALIZATION(context);
  await Promise.resolve();
  expect(state.initialized).toBe(false);
  state.initialized = true;
  finishDestruction();
  await cleanup;
  expect(state.initialized).toBe(true);
});
