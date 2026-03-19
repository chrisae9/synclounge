const METADATA_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const METADATA_MAX_SIZE = 10000;

function createCache({ nowFn = Date.now } = {}) {
  const metadataCache = new Map();

  function setMetadata(key, value) {
    // Lazy TTL eviction: purge expired entries on write to bound memory growth
    const now = nowFn();
    for (const [k, v] of metadataCache) {
      if (now - v.cachedAt > METADATA_TTL) {
        metadataCache.delete(k);
      } else {
        break; // oldest entries are first; stop at first non-expired
      }
    }

    // If updating an existing key, delete first so re-set moves it to the end (LRU order)
    if (metadataCache.has(key)) {
      metadataCache.delete(key);
    } else if (metadataCache.size >= METADATA_MAX_SIZE) {
      // Evict oldest entry if at capacity
      const oldestKey = metadataCache.keys().next().value;
      metadataCache.delete(oldestKey);
    }
    metadataCache.set(key, { ...value, cachedAt: now });
  }

  function getMetadata(key) {
    const entry = metadataCache.get(key);
    if (!entry) return null;
    if (nowFn() - entry.cachedAt > METADATA_TTL) {
      metadataCache.delete(key);
      return null;
    }
    return entry;
  }

  return { setMetadata, getMetadata, metadataCache };
}

module.exports = { createCache, METADATA_TTL, METADATA_MAX_SIZE };
