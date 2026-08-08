const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// combineurl.mjs uses ESM exports, so we need dynamic import
let combineUrl;
let combineRelativeUrlParts;

describe('combineurl', () => {
  before(async () => {
    // Node ESM resolution requires the extension for this CommonJS dynamic import.
    // eslint-disable-next-line import/extensions
    const mod = await import('../src/utils/combineurl.mjs');
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

    it('normalizes the pathname without treating a query as path text', () => {
      const result = combineUrl('#room', 'http://example.com/base?token=abc');
      assert.equal(result.href, 'http://example.com/base/?token=abc#room');
    });

    it('normalizes the pathname without treating a fragment as path text', () => {
      const result = combineUrl('api', 'http://example.com/base#room');
      assert.equal(result.href, 'http://example.com/base/api');
    });

    it('rejects a malformed base URL', () => {
      assert.throws(() => combineUrl('api', 'not a URL'), TypeError);
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

    it('normalizes duplicate separators between base and path', () => {
      const result = combineRelativeUrlParts('http://example.com///', '///api');
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
