import { describe, expect, it } from 'vitest';
import plexGetters from '@/store/modules/plex/getters';

const resolveGetters = (browser) => {
  const rootGetters = { GET_BROWSER: browser };
  const rootState = { version: '1.0.0' };
  const getters = {};
  Object.entries(plexGetters).forEach(([name, getter]) => {
    Object.defineProperty(getters, name, {
      get: () => getter({}, getters, rootState, rootGetters),
    });
  });
  return getters;
};

describe('Plex device headers', () => {
  it('names the app as the device and the browser as the platform', () => {
    const params = resolveGetters({ name: 'firefox', version: '130.0.0', os: 'Windows 10' })
      .GET_PLEX_INITIAL_AUTH_PARAMS;

    expect(params['X-Plex-Device-Name']).toBe('SyncLounge');
    expect(params['X-Plex-Platform']).toBe('Firefox');
  });

  it('registers the same device name when signing in', () => {
    const authUrl = resolveGetters({ name: 'chrome', version: '130.0.0', os: 'Mac OS' })
      .GET_PLEX_AUTH_URL('code');

    expect(authUrl).toContain(`${encodeURIComponent('context[device][name]')}=SyncLounge`);
    expect(authUrl).toContain(`${encodeURIComponent('context[device][platform]')}=Chrome`);
  });
});
