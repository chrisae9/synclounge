const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// combineurl.js uses ESM exports, so we need dynamic import
let combineUrl;
let combineRelativeUrlParts;

describe('combineurl', () => {
  before(async () => {
    const mod = await import('../src/utils/combineurl.js');
    combineUrl = mod.combineUrl;
    combineRelativeUrlParts = mod.combineRelativeUrlParts;
  });

  describe('combineUrl', () => {
    it('handles base URL with trailing slash', () => {
      const result = combineUrl('/path', 'http://example.com/');
      assert.equal(result.href, 'http://example.com/path');
    });

    it('handles base URL without trailing slash', () => {
      const result = combineUrl('/path', 'http://example.com');
      assert.equal(result.href, 'http://example.com/path');
    });

    it('handles relative server path', () => {
      const result = combineUrl('api/data', 'http://example.com/base/');
      assert.equal(result.href, 'http://example.com/base/api/data');
    });

    it('handles absolute server URL', () => {
      const result = combineUrl('http://other.com/path', 'http://example.com/');
      assert.equal(result.href, 'http://other.com/path');
    });
  });

  describe('combineRelativeUrlParts', () => {
    it('joins base with trailing slash and path', () => {
      const result = combineRelativeUrlParts('http://example.com/', 'api');
      assert.equal(result, 'http://example.com/api');
    });

    it('adds slash between base and path when missing', () => {
      const result = combineRelativeUrlParts('http://example.com', 'api');
      assert.equal(result, 'http://example.com/api');
    });

    it('handles empty base', () => {
      const result = combineRelativeUrlParts('', 'api');
      assert.equal(result, 'api');
    });

    it('handles empty string base by concatenating path directly', () => {
      const result = combineRelativeUrlParts('', '/api');
      assert.equal(result, '/api');
    });
  });
});
