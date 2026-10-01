import {
  afterEach, describe, expect, it, vi,
} from 'vitest';

const capture = vi.hoisted(() => ({ factory: null, click: null, connected: true }));
vi.mock('shaka-player/dist/shaka-player.ui', () => ({
  default: {
    ui: {
      Element: class {
        constructor(parent) {
          this.parent = parent;
          this.eventManager = { listen: (button, event, handler) => { capture.click = handler; } };
        }
      },
      Controls: { registerElement: (name, factory) => { capture.factory = factory; } },
    },
  },
}));
vi.mock('@/socket', () => ({
  emit: vi.fn(),
  isConnected: () => capture.connected,
  hasSocket: () => true,
  open: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  waitForEvent: vi.fn(),
}));

afterEach(() => { capture.connected = true; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(sync = async () => {}) {
  vi.stubGlobal('Audio', function AudioMock() { this.play = vi.fn(); });
  const actions = (await import('@/store/modules/synclounge/actions')).default;
  const register = (await import('@/player/ui/buttons/manualsyncbutton')).default;
  const getters = {
    'synclounge/AM_I_HOST': false,
    IS_IN_ROOM: true,
    GET_HOST_USER: { state: 'playing', time: 10000, updatedAt: Date.now() },
  };
  const context = {
    getters,
    commit: (type, value) => {
      if (type === 'SET_SYNC_CANCEL_TOKEN') getters.GET_SYNC_CANCEL_TOKEN = value;
    },
    dispatch: vi.fn(async (type, payload) => {
      if (type === 'CANCEL_IN_PROGRESS_SYNC') return actions.CANCEL_IN_PROGRESS_SYNC(context);
      if (type === 'plexclients/SYNC') return sync(payload);
      return undefined;
    }),
  };
  const store = {
    getters,
    watch: () => () => {},
    dispatch: vi.fn((type, payload) => {
      if (type === 'synclounge/MANUAL_SYNC') return actions.MANUAL_SYNC(context, payload);
      return undefined;
    }),
  };
  register(store);
  capture.factory.create(document.createElement('div'), {});
  return { actions, context, store };
}

const feedback = (context) => context.dispatch.mock.calls
  .filter(([type]) => type === 'DISPLAY_NOTIFICATION').map(([, payload]) => payload);

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe('manual sync outcomes and real player button feedback', () => {
  it('reports completed success through the player button', async () => {
    const { context, store } = await setup();
    await capture.click();
    expect(store.dispatch).toHaveBeenCalledWith('synclounge/MANUAL_SYNC', { notify: true });
    expect(feedback(context)).toEqual([{ text: 'Synced', color: 'success' }]);
    expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeNull();
  });

  it('reports failure instead of green success when Plex sync rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { context } = await setup(async () => { throw new Error('Unreachable Plex'); });
    await capture.click();
    expect(feedback(context)).toEqual([{ text: 'Could not sync. Please try again.', color: 'error' }]);
    expect(context.dispatch).not.toHaveBeenCalledWith('PROCESS_PLAYER_STATE_UPDATE', true);
    expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeNull();
  });

  it('returns failure and clears the token without unsolicited feedback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { actions, context } = await setup(async () => { throw new Error('Unreachable Plex'); });
    await expect(actions.MANUAL_SYNC(context)).resolves.toEqual({ status: 'failure' });
    expect(feedback(context)).toEqual([]);
    expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeNull();
  });

  it('clears its own aborted token and suppresses rejected cancellation feedback', async () => {
    const { actions, context } = await setup(async () => {
      context.getters.GET_SYNC_CANCEL_TOKEN.abort('Cancelled');
      throw new Error('Cancelled request');
    });
    await expect(actions.MANUAL_SYNC(context, { notify: true })).resolves.toEqual({ status: 'cancelled' });
    expect(feedback(context)).toEqual([]);
    expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeNull();
  });

  it.each([
    ['absent host', (context) => { Object.assign(context.getters, { GET_HOST_USER: null }); }],
    ['stopped host', (context) => { Object.assign(context.getters.GET_HOST_USER, { state: 'stopped' }); }],
    ['invalid timeline', (context) => { Object.assign(context.getters.GET_HOST_USER, { time: NaN }); }],
    ['missing timestamp', (context) => { Object.assign(context.getters.GET_HOST_USER, { updatedAt: undefined }); }],
    ['left room', (context) => { Object.assign(context.getters, { IS_IN_ROOM: false }); }],
    ['disconnected socket', () => { capture.connected = false; }],
  ])('fails before syncing with %s', async (name, invalidate) => {
    const { actions, context } = await setup();
    invalidate(context);
    await expect(actions.MANUAL_SYNC(context, { notify: true })).resolves.toEqual({ status: 'failure' });
    expect(context.dispatch.mock.calls.some(([type]) => type === 'plexclients/SYNC')).toBe(false);
    expect(feedback(context)).toHaveLength(1);
    expect(feedback(context)[0].color).toBe('error');
    expect(feedback(context)[0].text).toMatch(/Reconnect|Wait for the host/);
  });

  it.each(['host', 'room', 'socket'])('does not announce success when %s disappears during sync', async (lost) => {
    const { actions, context } = await setup(async () => {
      if (lost === 'host') context.getters.GET_HOST_USER = null;
      if (lost === 'room') context.getters.IS_IN_ROOM = false;
      if (lost === 'socket') capture.connected = false;
    });
    await expect(actions.MANUAL_SYNC(context, { notify: true })).resolves.toEqual({ status: 'failure' });
    expect(feedback(context)[0].color).toBe('error');
    expect(context.dispatch).not.toHaveBeenCalledWith('PROCESS_PLAYER_STATE_UPDATE', true);
    expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeNull();
  });

  it('checks host playback again after the awaited timeline refresh', async () => {
    const { actions, context } = await setup();
    const originalDispatch = context.dispatch.getMockImplementation();
    context.dispatch.mockImplementation((type, payload, options) => {
      if (type === 'PROCESS_PLAYER_STATE_UPDATE') context.getters.GET_HOST_USER.state = 'stopped';
      return originalDispatch(type, payload, options);
    });
    await expect(actions.MANUAL_SYNC(context, { notify: true })).resolves.toEqual({ status: 'failure' });
    expect(feedback(context)).toEqual([{
      text: 'Wait for the host to start playback, then try syncing again.', color: 'error',
    }]);
  });

  it('keeps an unavailable automatic sync quiet', async () => {
    const { actions, context } = await setup();
    context.getters.GET_HOST_USER = null;
    await expect(actions.MANUAL_SYNC(context)).resolves.toEqual({ status: 'failure' });
    expect(feedback(context)).toEqual([]);
  });

  it('returns outcomes while automatic force-sync messages remain quiet', async () => {
    const { actions, context } = await setup();
    await expect(actions.MANUAL_SYNC(context)).resolves.toEqual({ status: 'success' });
    context.dispatch.mockImplementation(async (type, payload) => {
      if (type === 'MANUAL_SYNC') return actions.MANUAL_SYNC(context, payload);
      if (type === 'CANCEL_IN_PROGRESS_SYNC') return actions.CANCEL_IN_PROGRESS_SYNC(context);
      return undefined;
    });
    await actions.ADD_MESSAGE_AND_CACHE_AND_NOTIFY(context, { text: '!forcesync' });
    expect(feedback(context)).toEqual([]);
  });

  it('keeps cancellation silent even if the underlying request later resolves', async () => {
    const pending = deferred();
    const { actions, context } = await setup(() => pending.promise);
    const request = actions.MANUAL_SYNC(context, { notify: true });
    await vi.waitFor(() => expect(context.getters.GET_SYNC_CANCEL_TOKEN).toBeTruthy());
    await actions.CANCEL_IN_PROGRESS_SYNC(context);
    pending.resolve();
    await expect(request).resolves.toEqual({ status: 'cancelled' });
    expect(feedback(context)).toEqual([]);
  });

  it('suppresses an older success after a newer request supersedes it during state refresh', async () => {
    const refreshing = deferred();
    const { actions, context } = await setup();
    const originalDispatch = context.dispatch.getMockImplementation();
    let refreshCount = 0;
    context.dispatch.mockImplementation((type, payload, options) => {
      if (type === 'PROCESS_PLAYER_STATE_UPDATE') {
        refreshCount += 1;
        if (refreshCount === 1) return refreshing.promise;
      }
      return originalDispatch(type, payload, options);
    });
    const older = actions.MANUAL_SYNC(context, { notify: true });
    await vi.waitFor(() => expect(refreshCount).toBe(1));
    await expect(actions.MANUAL_SYNC(context, { notify: true })).resolves.toEqual({ status: 'success' });
    refreshing.resolve();
    await expect(older).resolves.toEqual({ status: 'cancelled' });
    expect(feedback(context)).toEqual([{ text: 'Synced', color: 'success' }]);
  });

  it('does not start a stale request when simultaneous requests await cancellation', async () => {
    const { actions, context } = await setup();
    const older = actions.MANUAL_SYNC(context, { notify: true });
    const newer = actions.MANUAL_SYNC(context, { notify: true });
    await expect(older).resolves.toEqual({ status: 'cancelled' });
    await expect(newer).resolves.toEqual({ status: 'success' });
    expect(context.dispatch.mock.calls.filter(([type]) => type === 'plexclients/SYNC')).toHaveLength(1);
    expect(feedback(context)).toEqual([{ text: 'Synced', color: 'success' }]);
  });
});
