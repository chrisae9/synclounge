import { expect, it } from 'vitest';
import getAppVersion from '@/utils/appversion';
import packageInfo from '../../package.json';

it.each(['', '  ', '\n\t', null, 0])('uses the packaged version for an unusable build value %j', (value) => {
  expect(getAppVersion(value)).toBe(packageInfo.version);
});
it('normalizes a populated build version', () => {
  expect(getAppVersion(' 6.4.25\n')).toBe('6.4.25');
});
