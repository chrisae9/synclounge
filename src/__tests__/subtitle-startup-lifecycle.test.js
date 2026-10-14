/* eslint-disable max-classes-per-file -- Minimal parser and renderer test doubles. */
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import actions from '@/store/modules/slplayer/subtitleActions';
import { insertElementBeforeVideo } from '@/player';

const fixtures = vi.hoisted(() => ({ pending: [], renderers: [], signals: [] }));
vi.mock('@/player', () => ({
  insertElementBeforeVideo: vi.fn(),
}));
vi.mock('@/utils/fetchutils', () => ({ makeUrl: () => 'https://fixture.invalid/subtitles' }));
vi.mock('@/utils/streams', () => ({
  default: (url, signal) => { fixtures.signals.push(signal); return {}; },
}));
vi.mock('synclounge-libjass', () => ({
  parser: {
    StreamParser: class {
      constructor() {
        this.ass = Promise.resolve();
        this.minimalASS = new Promise((resolve) => { fixtures.pending.push(resolve); });
      }
    },
  },
  renderers: {
    WebRenderer: class {
      constructor(ass) {
        this._ass = ass;
        this.libjassSubsWrapper = { remove: vi.fn() };
        fixtures.renderers.push(this);
      }
    },
  },
}));

const makeContext = () => {
  const context = {
    getters: { GET_DECISION_AND_START_PARAMS: {}, CAN_DIRECT_PLAY_SUBTITLES: false },
    commit: vi.fn(),
  };
  context.dispatch = vi.fn((type, payload) => {
    if (['PUBLISH_SUBTITLE_SIZE', 'RERENDER_SUBTITLE_CONTAINER', 'GET_OR_MAKE_VIDEO_CLOCK'].includes(type)) {
      return Promise.resolve();
    }
    return actions[type](context, payload);
  });
  return context;
};

beforeEach(async () => {
  await actions.DESTROY_SUBTITLES(makeContext());
  fixtures.pending.length = 0;
  fixtures.renderers.length = 0;
  fixtures.signals.length = 0;
  vi.clearAllMocks();
});

describe('subtitle startup ownership', () => {
  it('cannot overwrite a newer track when the old parser finishes late', async () => {
    const context = makeContext();
    const old = actions.SET_SUBTITLE_URL(context);
    await vi.waitFor(() => expect(fixtures.pending).toHaveLength(1));
    const current = actions.SET_SUBTITLE_URL(context);
    await vi.waitFor(() => expect(fixtures.pending).toHaveLength(2));
    expect(fixtures.signals[0].aborted).toBe(true);
    const selected = { track: 'current' };
    fixtures.pending[1](selected);
    await current;
    fixtures.pending[0]({ track: 'old' });
    await old;
    expect(fixtures.renderers).toHaveLength(1);
    expect(fixtures.renderers[0]._ass).toBe(selected);
    expect(insertElementBeforeVideo).toHaveBeenCalledExactlyOnceWith(
      fixtures.renderers[0].libjassSubsWrapper,
    );
  });

  it('does not create a renderer after subtitles have been destroyed', async () => {
    const context = makeContext();
    const pending = actions.SET_SUBTITLE_URL(context);
    await vi.waitFor(() => expect(fixtures.pending).toHaveLength(1));
    await actions.DESTROY_SUBTITLES(context);
    fixtures.pending[0]({ track: 'late' });
    await pending;
    expect(fixtures.signals[0].aborted).toBe(true);
    expect(fixtures.renderers).toHaveLength(0);
  });

  it('ignores a ready subtitle parser when its video source has been cancelled', async () => {
    const context = makeContext();
    let cancelled = false;
    const ensureCurrent = () => {
      if (cancelled) throw new DOMException('Source cancelled', 'AbortError');
    };
    const pending = actions.SET_SUBTITLE_URL(context, { ensureCurrent });
    await vi.waitFor(() => expect(fixtures.pending).toHaveLength(1));
    cancelled = true;
    fixtures.pending[0]({ track: 'cancelled' });
    await pending;
    expect(fixtures.renderers).toHaveLength(0);
  });

  it('ignores an already-cancelled request without destroying current subtitles', async () => {
    const context = makeContext();
    await actions.SET_SUBTITLE_URL(context, {
      ensureCurrent: () => { throw new DOMException('Source cancelled', 'AbortError'); },
    });
    expect(context.dispatch).not.toHaveBeenCalled();
    expect(fixtures.renderers).toHaveLength(0);
  });

  it('only starts the latest of two simultaneous subtitle requests', async () => {
    const context = makeContext();
    const first = actions.SET_SUBTITLE_URL(context);
    const second = actions.SET_SUBTITLE_URL(context);
    await vi.waitFor(() => expect(fixtures.pending).toHaveLength(1));
    fixtures.pending[0]({ track: 'latest' });
    await Promise.all([first, second]);
    expect(fixtures.renderers).toHaveLength(1);
  });
});
