import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import state from '@/store/modules/plex/state';

const STORAGE_KEY = 'plex_client_identifier';

describe('Plex client identifier', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses one identifier across tabs and visits', () => {
    const first = state().clientIdentifier;
    sessionStorage.clear();

    expect(state().clientIdentifier).toBe(first);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(first);
  });

  it('adopts an identifier from a tab opened before identifiers were persisted', () => {
    sessionStorage.setItem(STORAGE_KEY, 'legacy-tab-id');

    expect(state().clientIdentifier).toBe('legacy-tab-id');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('legacy-tab-id');
  });

  it('still creates an identifier when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(state().clientIdentifier).toMatch(/^[a-z0-9]+$/i);
  });
});
