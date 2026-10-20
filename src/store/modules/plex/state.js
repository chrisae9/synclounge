import { getRandomPlexId } from '@/utils/random';

const STORAGE_KEY = 'plex_client_identifier';

// Plex treats each client identifier as a device and notifies server owners about
// every new one, so the identifier must stay stable across tabs and visits.
const getOrCreateClientIdentifier = () => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
      // Adopt the identifier of a tab opened before identifiers were persisted.
      ?? sessionStorage.getItem(STORAGE_KEY);
    if (existing) {
      localStorage.setItem(STORAGE_KEY, existing);
      return existing;
    }
  } catch { /* Storage may be disabled. */ }

  const id = getRandomPlexId();
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* Keep the in-memory identifier. */ }
  return id;
};

const state = () => ({
  user: null,
  areDevicesCached: false,
  deviceFetchPromise: null,
  plexAuthToken: null,
  pendingAuthenticationCount: 0,
  clientIdentifier: getOrCreateClientIdentifier(),
});

export default state;
