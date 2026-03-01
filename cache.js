const METADATA_TTL = 24 * 60 * 60 * 1000; // 24 hours
const METADATA_MAX_SIZE = 10000;

function createCache({ nowFn = Date.now } = {}) {
  const metadataCache = new Map();

  function setMetadata(key, value) {
    // Evict oldest entries if at capacity
    if (metadataCache.size >= METADATA_MAX_SIZE && !metadataCache.has(key)) {
      const oldestKey = metadataCache.keys().next().value;
      metadataCache.delete(oldestKey);
    }
    metadataCache.set(key, { ...value, cachedAt: nowFn() });
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
