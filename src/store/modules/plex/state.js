import { getRandomPlexId } from '@/utils/random';

const SESSION_KEY = 'plex_client_identifier';

const getOrCreateClientIdentifier = () => {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = getRandomPlexId();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
};

const state = () => ({
  user: null,
  areDevicesCached: false,
  deviceFetchPromise: null,
  plexAuthToken: null,
  clientIdentifier: getOrCreateClientIdentifier(),
});

export default state;
