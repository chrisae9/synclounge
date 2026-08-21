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
    playback: { currentTimeSeconds: 10, broken: Number.POSITIVE_INFINITY },
    accessToken: 'must-not-be-logged',
  });

  assert.equal(diagnostic.event, 'buffering-started-');
  assert.equal(diagnostic.browser.os, 'Linux forged-log-line');
  assert.deepEqual(diagnostic.details, { episode: 3, durationMs: 142 });
  assert.equal(diagnostic.playback.broken, null);
  assert.equal(diagnostic.accessToken, undefined);
});

test('rejects malformed diagnostics', () => {
  assert.equal(sanitizePlaybackDiagnostic(null), null);
  assert.equal(sanitizePlaybackDiagnostic({ playback: {} }), null);
});
