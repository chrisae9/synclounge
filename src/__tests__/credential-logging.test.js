import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { PlexAuthError, queryFetch } from '@/utils/fetchutils';
import { getRandomRoomId, randomAlphanumericString } from '@/utils/random';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('credential-safe request errors', () => {
  it('does not log credentials when a Plex request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }));
    let failure;
    try {
      await queryFetch('https://plex.tv/api/v2/user', { 'X-Plex-Token': 'SENTINEL_SECRET' });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PlexAuthError);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SENTINEL_SECRET');
    expect(JSON.stringify(failure)).not.toContain('SENTINEL_SECRET');
    expect(String(failure)).not.toContain('SENTINEL_SECRET');
    expect(warn).toHaveBeenCalledWith('HTTP request failed: 401');
    expect(failure.url).toBe('https://plex.tv/api/v2/user');
  });

  it.each([
    ['https://plex.tv/user#SENTINEL_SECRET', 'https://plex.tv/user'],
    ['invalid?SENTINEL_SECRET', 'invalid'],
    ['', ''],
    [undefined, ''],
  ])('retains only a credential-free diagnostic path for %s', (url, expected) => {
    const error = new PlexAuthError(403, 'Forbidden', url);
    expect(error.url).toBe(expected);
    expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain('SENTINEL_SECRET');
  });
});

describe('room invitation entropy', () => {
  it('creates room codes with at least 128 bits of entropy', () => {
    const room = getRandomRoomId();
    expect(room).toMatch(/^[A-Za-z0-9]{22}$/);
    expect(room.length * Math.log2(62)).toBeGreaterThanOrEqual(128);
  });

  it('rejects the incomplete sampling bucket boundary', () => {
    let calls = 0;
    vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((array) => {
      array.fill(calls === 0 ? 65534 : 1);
      calls += 1;
      return array;
    });
    expect(randomAlphanumericString(1)).toBe('B');
    expect(calls).toBe(2);
  });
});
