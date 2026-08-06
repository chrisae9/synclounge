import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import actions from '@/store/modules/plex/actions';

const fetchMocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock('@/utils/fetchutils', () => ({
  fetchJson: fetchMocks.fetchJson,
  queryFetch: vi.fn(),
  PlexAuthError: class PlexAuthError extends Error {},
}));

describe('Plex device refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes servers that are absent from the Plex resources response', async () => {
    fetchMocks.fetchJson.mockResolvedValue([{
      name: 'Current server',
      provides: ['server'],
      connections: [{ uri: 'https://current.example' }],
      accessToken: 'token',
      clientIdentifier: 'current-server',
    }]);
    const commit = vi.fn();
    const dispatch = vi.fn((type) => {
      if (type === 'FIND_WORKING_CONNECTION_PREFERRED') {
        return Promise.resolve({ uri: 'https://current.example' });
      }
      if (type === 'plexservers/FETCH_ALL_LIBRARIES') return Promise.resolve([]);
      return Promise.resolve();
    });

    await actions._FETCH_PLEX_DEVICES({
      state: { areDevicesCached: true },
      commit,
      dispatch,
      getters: { GET_PLEX_BASE_PARAMS: vi.fn(() => ({})) },
      rootGetters: {
        'plexservers/GET_PLEX_SERVER_IDS': ['current-server', 'stale-server'],
      },
    });

    expect(commit).toHaveBeenCalledWith(
      'plexservers/DELETE_PLEX_SERVER',
      'stale-server',
      { root: true },
    );
    expect(commit).not.toHaveBeenCalledWith(
      'plexservers/DELETE_PLEX_SERVER',
      'current-server',
      { root: true },
    );
  });

  it('retains a cached server when refreshing its connection fails', async () => {
    fetchMocks.fetchJson.mockResolvedValue([{
      name: 'Temporarily unavailable server',
      provides: ['server'],
      connections: [{ uri: 'https://current.example' }],
      accessToken: 'token',
      clientIdentifier: 'current-server',
    }]);
    const commit = vi.fn();
    const dispatch = vi.fn((type) => {
      if (type === 'FIND_WORKING_CONNECTION_PREFERRED') {
        return Promise.reject(new Error('temporary connection failure'));
      }
      return Promise.resolve();
    });

    await actions._FETCH_PLEX_DEVICES({
      state: { areDevicesCached: true },
      commit,
      dispatch,
      getters: { GET_PLEX_BASE_PARAMS: vi.fn(() => ({})) },
      rootGetters: {
        'plexservers/GET_PLEX_SERVER_IDS': ['current-server'],
      },
    });

    expect(commit).not.toHaveBeenCalledWith(
      'plexservers/DELETE_PLEX_SERVER',
      'current-server',
      { root: true },
    );
  });
});
