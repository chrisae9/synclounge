const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createCache, METADATA_TTL, METADATA_MAX_SIZE } = require('../cache');

describe('cache', () => {
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
  });

  describe('FIFO eviction', () => {
    it('evicts oldest entry when cache hits max size', () => {
      const { setMetadata, getMetadata, metadataCache } = createCache();

      // Fill cache to max
      for (let i = 0; i < METADATA_MAX_SIZE; i++) {
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

      for (let i = 0; i < METADATA_MAX_SIZE; i++) {
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
