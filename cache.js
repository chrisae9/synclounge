const METADATA_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const METADATA_MAX_SIZE = 10000;

const metadataCacheKey = (machineIdentifier, ratingKey) => JSON.stringify([
  'media',
  String(machineIdentifier),
  String(ratingKey),
]);

const roomMetadataCacheKey = (room) => JSON.stringify(['room', String(room)]);

const roomPosterMetadataCacheKey = (room, revision) => JSON.stringify([
  'room-poster',
  String(room),
  String(revision),
]);

function resolveRoomPosterMetadata({
  room,
  revision,
  getCurrentMetadata,
  getSnapshotMetadata,
}) {
  const snapshot = getSnapshotMetadata(roomPosterMetadataCacheKey(room, revision));
  if (snapshot) return snapshot;

  const current = getCurrentMetadata(roomMetadataCacheKey(room));
  return current?.roomPreviewRevision === String(revision) ? current : null;
}

function createCache({
  nowFn = Date.now,
  ttlMs = METADATA_TTL,
  maxSize = METADATA_MAX_SIZE,
} = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError('Cache TTL must be a positive safe integer');
  }
  if (!Number.isSafeInteger(maxSize) || maxSize <= 0) {
    throw new TypeError('Cache size must be a positive safe integer');
  }
  const metadataCache = new Map();

  function setMetadata(key, value) {
    // Lazy TTL eviction: purge expired entries on write to bound memory growth
    const now = nowFn();
    for (const [k, v] of metadataCache) {
      if (now - v.cachedAt > ttlMs) {
        metadataCache.delete(k);
      } else {
        break; // oldest entries are first; stop at first non-expired
      }
    }

    // If updating an existing key, delete first so re-set moves it to the end (LRU order)
    if (metadataCache.has(key)) {
      metadataCache.delete(key);
    } else if (metadataCache.size >= maxSize) {
      // Evict oldest entry if at capacity
      const oldestKey = metadataCache.keys().next().value;
      metadataCache.delete(oldestKey);
    }
    metadataCache.set(key, { ...value, cachedAt: now });
  }

  function getMetadata(key) {
    const entry = metadataCache.get(key);
    if (!entry) return null;
    if (nowFn() - entry.cachedAt > ttlMs) {
      metadataCache.delete(key);
      return null;
    }
    return entry;
  }

  function deleteMetadata(key) {
    return metadataCache.delete(key);
  }

  return {
    setMetadata,
    getMetadata,
    deleteMetadata,
    metadataCache,
  };
}

module.exports = {
  createCache,
  metadataCacheKey,
  roomMetadataCacheKey,
  roomPosterMetadataCacheKey,
  resolveRoomPosterMetadata,
  METADATA_TTL,
  METADATA_MAX_SIZE,
};
