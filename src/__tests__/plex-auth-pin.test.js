import {
  describe, expect, it,
} from 'vitest';
import parseSavedPlexAuthPin from '@/utils/plexAuthPin';

describe('saved Plex auth PIN parsing', () => {
  it('returns valid PIN state with a safe redirect default', () => {
    expect(parseSavedPlexAuthPin('{"id":1234,"redirect":"/room/test"}')).toEqual({
      id: 1234,
      redirect: '/room/test',
    });
    expect(parseSavedPlexAuthPin('{"id":"1234"}')).toEqual({
      id: '1234',
      redirect: '/',
    });
  });

  it('rejects malformed or incomplete persisted state', () => {
    expect(parseSavedPlexAuthPin('{not-json')).toBeNull();
    expect(parseSavedPlexAuthPin('{"redirect":"/room/test"}')).toBeNull();
    expect(parseSavedPlexAuthPin('{"id":0}')).toBeNull();
    expect(parseSavedPlexAuthPin('{"id":"../../users"}')).toBeNull();
    expect(parseSavedPlexAuthPin('{"id":"9007199254740992"}')).toBeNull();
    expect(parseSavedPlexAuthPin('null')).toBeNull();
  });
});
