const test = require('node:test');
const assert = require('node:assert/strict');

// The generated dist module does not exist until build:server runs.
/* eslint-disable import/extensions */
const {
  sanitizePlaybackDiagnostic,
} = require(
  '../packages/syncloungeserver/dist/socketserver/playbackdiagnostics.js',
);
/* eslint-enable import/extensions */

test('sanitizes structured playback diagnostics without accepting unrelated fields', () => {
  const diagnostic = sanitizePlaybackDiagnostic({
    event: 'Buffering Started!',
    clientTimestamp: '2026-08-21T12:00:00.000Z',
    details: { episode: 3, durationMs: 142 },
    browser: { name: 'firefox', os: 'Linux\nforged-log-line' },
    playback: {
      currentTime: 10,
      isCasting: true,
      buffering: false,
      bufferAhead: Number.POSITIVE_INFINITY,
      accessToken: 'nested-secret',
      oversized: Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [index, index])),
    },
    accessToken: 'must-not-be-logged',
  });

  assert.equal(diagnostic.event, 'buffering-started-');
  assert.equal(diagnostic.browser.os, 'Linux forged-log-line');
  assert.deepEqual(diagnostic.details, { episode: 3, durationMs: 142 });
  assert.equal(diagnostic.playback.currentTime, 10);
  assert.equal(diagnostic.playback.isCasting, true);
  assert.equal(diagnostic.playback.buffering, false);
  assert.equal(diagnostic.playback.bufferAhead, null);
  assert.equal(diagnostic.playback.accessToken, undefined);
  assert.equal(diagnostic.playback.oversized, undefined);
  assert.equal(diagnostic.accessToken, undefined);
});

test('enforces string, array, nesting, and allowlist boundaries', () => {
  const diagnostic = sanitizePlaybackDiagnostic({
    event: 'player-error',
    browser: { userAgent: `agent-${'x'.repeat(500)}` },
    details: {
      data: Array.from({ length: 20 }, (_, index) => `value-${index}`),
      nested: { deeper: { still: { deeper: { secret: 'must-not-be-logged' } } } },
    },
    playback: {
      bufferedRanges: Array.from({ length: 20 }, (_, index) => ({
        start: index,
        end: index + 1,
        accessToken: 'must-not-be-logged',
      })),
    },
  });

  assert.equal(diagnostic.browser.userAgent.length, 300);
  assert.equal(diagnostic.details.data.length, 8);
  assert.equal(diagnostic.details.nested, undefined);
  assert.equal(diagnostic.playback.bufferedRanges.length, 8);
  assert.equal(diagnostic.playback.bufferedRanges[0].accessToken, undefined);
  assert.equal(JSON.stringify(diagnostic).includes('must-not-be-logged'), false);
});

test('rejects malformed diagnostics', () => {
  assert.equal(sanitizePlaybackDiagnostic(null), null);
  assert.equal(sanitizePlaybackDiagnostic({ playback: {} }), null);
});

test('accepts only boolean Cast flags and nullable buffering state', () => {
  [true, false, null, 'false', 1, {}, []].forEach((value) => {
    const { playback } = sanitizePlaybackDiagnostic({
      event: 'playback-health', playback: { isCasting: value, buffering: value },
    });
    assert.equal(playback.isCasting, typeof value === 'boolean' ? value : undefined);
    assert.equal(playback.buffering, typeof value === 'boolean' || value === null ? value : undefined);
  });
});
