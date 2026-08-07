const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createCache,
  metadataCacheKey,
  roomMetadataCacheKey,
  roomPosterMetadataCacheKey,
  resolveRoomPosterMetadata,
  METADATA_TTL,
  METADATA_MAX_SIZE,
} = require('../cache');

describe('cache', () => {
  describe('metadata keys', () => {
    it('does not collide when identifiers contain the old delimiter', () => {
      assert.notEqual(
        metadataCacheKey('a\0b', 'c'),
        metadataCacheKey('a', 'b\0c'),
      );
    });

    it('keeps room and media namespaces separate', () => {
      assert.notEqual(
        roomMetadataCacheKey('abc'),
        metadataCacheKey('room', 'abc'),
      );
    });

    it('keeps current room previews and revisioned poster snapshots separate', () => {
      assert.notEqual(
        roomMetadataCacheKey('abc'),
        roomPosterMetadataCacheKey('abc', 'revision-1'),
      );
      assert.notEqual(
        roomPosterMetadataCacheKey('abc', 'revision-1'),
        roomPosterMetadataCacheKey('abc', 'revision-2'),
      );
    });

    it('normalizes numeric identifiers for URL lookups', () => {
      assert.equal(metadataCacheKey('machine', 42), metadataCacheKey('machine', '42'));
    });

    it('falls back only to the matching current poster after snapshot eviction', () => {
      const currentCache = createCache();
      const snapshotCache = createCache({ maxSize: 1 });
      const current = {
        title: 'Current movie',
        roomPreviewRevision: 'current-revision',
      };
      currentCache.setMetadata(roomMetadataCacheKey('room-a'), current);
      snapshotCache.setMetadata(
        roomPosterMetadataCacheKey('room-a', 'current-revision'),
        current,
      );
      snapshotCache.setMetadata(
        roomPosterMetadataCacheKey('room-b', 'other-revision'),
        { title: 'Other movie', roomPreviewRevision: 'other-revision' },
      );

      const resolve = (revision) => resolveRoomPosterMetadata({
        room: 'room-a',
        revision,
        getCurrentMetadata: currentCache.getMetadata,
        getSnapshotMetadata: snapshotCache.getMetadata,
      });
      assert.equal(resolve('current-revision').title, 'Current movie');
      assert.equal(resolve('old-revision'), null);
    });
  });

  describe('TTL expiry', () => {
    it('returns entry before TTL expires', () => {
      let now = 1000;
      const { setMetadata, getMetadata } = createCache({ nowFn: () => now });

      setMetadata('key1', { title: 'Test' });
      now += METADATA_TTL - 1; // just before expiry
      const entry = getMetadata('key1');
      assert.ok(entry);
      assert.equal(entry.title, 'Test');
    });

    it('expires entry after TTL', () => {
      let now = 1000;
      const { setMetadata, getMetadata } = createCache({ nowFn: () => now });

      setMetadata('key1', { title: 'Test' });
      now += METADATA_TTL + 1; // just after expiry
      const entry = getMetadata('key1');
      assert.equal(entry, null);
    });

    it('removes expired entry from cache on access', () => {
      let now = 1000;
      const { setMetadata, getMetadata, metadataCache } = createCache({ nowFn: () => now });

      setMetadata('key1', { title: 'Test' });
      assert.equal(metadataCache.size, 1);

      now += METADATA_TTL + 1;
      getMetadata('key1');
      assert.equal(metadataCache.size, 0);
    });

    it('returns null for nonexistent key', () => {
      const { getMetadata } = createCache();
      assert.equal(getMetadata('nope'), null);
    });

    it('deletes an entry explicitly', () => {
      const { setMetadata, getMetadata, deleteMetadata } = createCache();
      setMetadata('key1', { title: 'Test' });

      assert.equal(deleteMetadata('key1'), true);
      assert.equal(getMetadata('key1'), null);
      assert.equal(deleteMetadata('key1'), false);
    });
  });

  describe('FIFO eviction', () => {
    it('rejects invalid cache options', () => {
      assert.throws(() => createCache({ maxSize: 0 }), TypeError);
      assert.throws(() => createCache({ maxSize: 1.5 }), TypeError);
      assert.throws(() => createCache({ ttlMs: -1 }), TypeError);
      assert.throws(() => createCache({ ttlMs: Number.NaN }), TypeError);
    });

    it('supports an independent bounded cache size', () => {
      const { setMetadata, getMetadata, metadataCache } = createCache({ maxSize: 2 });

      setMetadata('first', { title: 'First' });
      setMetadata('second', { title: 'Second' });
      setMetadata('third', { title: 'Third' });

      assert.equal(metadataCache.size, 2);
      assert.equal(getMetadata('first'), null);
      assert.equal(getMetadata('second').title, 'Second');
      assert.equal(getMetadata('third').title, 'Third');
    });

    it('evicts oldest entry when cache hits max size', () => {
      const { setMetadata, getMetadata, metadataCache } = createCache();

      // Fill cache to max
      for (let i = 0; i < METADATA_MAX_SIZE; i += 1) {
        setMetadata(`key${i}`, { title: `Entry ${i}` });
      }
      assert.equal(metadataCache.size, METADATA_MAX_SIZE);

      // Add one more — should evict key0 (oldest)
      setMetadata('overflow', { title: 'Overflow' });
      assert.equal(metadataCache.size, METADATA_MAX_SIZE);
      assert.equal(getMetadata('key0'), null);
      assert.ok(getMetadata('overflow'));
      assert.ok(getMetadata('key1')); // second entry still exists
    });

    it('does not evict when updating an existing key', () => {
      const { setMetadata, getMetadata, metadataCache } = createCache();

      for (let i = 0; i < METADATA_MAX_SIZE; i += 1) {
        setMetadata(`key${i}`, { title: `Entry ${i}` });
      }

      // Update an existing key — should NOT evict anything
      setMetadata('key0', { title: 'Updated' });
      assert.equal(metadataCache.size, METADATA_MAX_SIZE);
      assert.equal(getMetadata('key0').title, 'Updated');
      assert.ok(getMetadata('key1')); // nothing else evicted
    });
  });
});
