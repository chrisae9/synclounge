import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import createPersistedState from '../store/persistedState';
import compareTwoStrings from '../utils/compareTwoStrings';

describe('compareTwoStrings', () => {
  it('preserves the media scoring similarity behavior', () => {
    expect(compareTwoStrings('healed', 'sealed')).toBe(0.8);
    expect(compareTwoStrings('hello world', 'helloworld')).toBe(1);
    expect(compareTwoStrings('a', 'b')).toBe(0);
    expect(compareTwoStrings('', '')).toBe(1);
  });
});

describe('createPersistedState', () => {
  it('restores and saves only configured paths', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        settings: { theme: 'dark' },
        plex: { user: { id: 'saved-user' }, ignored: 'discard me' },
        ignored: true,
      })),
      setItem: vi.fn(),
    };
    let subscriber;
    const store = {
      state: {
        settings: { theme: 'light', density: 'comfortable' },
        plex: { user: null, ignored: 'keep me' },
        ignored: false,
      },
      replaceState: vi.fn((state) => {
        store.state = state;
      }),
      subscribe: vi.fn((callback) => {
        subscriber = callback;
      }),
    };

    createPersistedState({
      paths: ['settings', 'plex.user'],
      storage,
    })(store);

    expect(store.state).toEqual({
      settings: { theme: 'dark', density: 'comfortable' },
      plex: { user: { id: 'saved-user' }, ignored: 'keep me' },
      ignored: false,
    });

    store.state.settings.theme = 'contrast';
    subscriber({}, store.state);

    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
      settings: { theme: 'contrast', density: 'comfortable' },
      plex: { user: { id: 'saved-user' } },
    });
  });

  it('ignores malformed stored JSON', () => {
    const store = {
      state: { settings: { theme: 'light' } },
      replaceState: vi.fn(),
      subscribe: vi.fn(),
    };

    createPersistedState({
      paths: ['settings'],
      storage: {
        getItem: () => '{not-json',
        setItem: vi.fn(),
      },
    })(store);

    expect(store.replaceState).not.toHaveBeenCalled();
    expect(store.subscribe).toHaveBeenCalledOnce();
  });
});
