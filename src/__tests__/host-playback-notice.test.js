import { expect, it } from 'vitest';
import notice from '@/utils/hostPlaybackNotice';

const host = { state: 'playing', media: { machineIdentifier: 'host-server' } };
it('distinguishes missing server access from no host movie', () => {
  expect(notice(host).title).toContain('Plex account');
  expect(notice(host).text).toContain('share');
  expect(notice(null).title).toBe('No movie is playing in this room');
  expect(notice({ ...host, state: 'stopped' }).title).toBe('No movie is playing in this room');
});
it('distinguishes hidden servers, connectivity and library access', () => {
  expect(notice(host, {}, false).title).toContain('hidden');
  expect(notice(host, {}).title).toContain('Can’t reach');
  expect(notice(host, { chosenConnection: {} }).text).toContain('library access');
});
