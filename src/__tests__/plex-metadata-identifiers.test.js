import { expect, it, vi } from 'vitest';
import actions from '@/store/modules/plexservers/actions';

const invalidIdentifiers = [
  '../preferences', '..', '.', '1?x=1', '1#x', '1/2', '1\\2', '%2e%2e', {}, -1, NaN, '\ud800',
];

it.each(invalidIdentifiers)('rejects invalid metadata identifier %s before a request', async (ratingKey) => {
  const dispatch = vi.fn();
  const metadata = actions.FETCH_PLEX_METADATA({ dispatch }, { ratingKey, machineIdentifier: 'server' });
  await expect(metadata).rejects.toThrow();
  await expect(actions.CREATE_PLAY_QUEUE({ dispatch }, { ratingKey, machineIdentifier: 'server' })).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
});

it.each(['123', 123, 'episode-2'])('requests one metadata item for a valid identifier %s', async (ratingKey) => {
  const dispatch = vi.fn(async () => ({ MediaContainer: { Metadata: [{ ratingKey }] } }));
  await actions.FETCH_PLEX_METADATA({ dispatch }, { ratingKey, machineIdentifier: 'server' });
  expect(dispatch).toHaveBeenCalledWith('FETCH_PLEX_SERVER', expect.objectContaining({
    path: `/library/metadata/${ratingKey}`,
  }));
});
