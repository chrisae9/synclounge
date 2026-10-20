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
    details: { episode: 3, durationMs: 142, attempt: 2 },
    browser: { name: 'firefox', os: 'Linux\nforged-log-line' },
    playback: {
      currentTime: 10,
      reportedState: 'buffering',
      sourceChanging: true,
      stateMasked: false,
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
  assert.deepEqual(diagnostic.details, { episode: 3, durationMs: 142, attempt: 2 });
  assert.equal(diagnostic.playback.currentTime, 10);
  assert.equal(diagnostic.playback.reportedState, 'buffering');
  assert.equal(diagnostic.playback.sourceChanging, true);
  assert.equal(diagnostic.playback.stateMasked, false);
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

test('bounds participant health measurements before broadcasting', () => {
  for (const [field, max] of [['bufferAhead', 86400], ['videoWidth', 32768], ['videoHeight', 32768]]) {
    for (const value of [-1, Infinity, '100', max + 1]) {
      assert.equal(sanitizePlaybackDiagnostic({ event: 'health', playback: { [field]: value } }).playback[field], null);
    }
    for (const value of [0, max]) {
      const output = sanitizePlaybackDiagnostic({ event: 'health', playback: { [field]: value } });
      assert.equal(output.playback[field], value);
    }
  }
  for (const value of [-1, Infinity, '100', 1000000001]) {
    assert.equal(sanitizePlaybackDiagnostic({
      event: 'health', playback: { shaka: { streamBandwidth: value } },
    }).playback.shaka.streamBandwidth, null);
  }
  assert.equal(sanitizePlaybackDiagnostic({
    event: 'health', playback: { shaka: { streamBandwidth: 1000000000 } },
  }).playback.shaka.streamBandwidth, 1000000000);
});

test('bounds recovery attempts from untrusted diagnostic payloads', () => {
  for (const attempt of [0, 3]) {
    const result = sanitizePlaybackDiagnostic({ event: 'stream-recovery-start', details: { attempt } });
    assert.equal(result.details.attempt, attempt);
  }
  for (const attempt of [-1, 4, '2', null, true, {}, [], Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = sanitizePlaybackDiagnostic({ event: 'stream-recovery-start', details: { attempt } });
    assert.equal(result.details.attempt, null);
  }
});

test('preserves bounded seek landing evidence without accepting arbitrary details', () => {
  const diagnostic = sanitizePlaybackDiagnostic({
    event: 'seek-landing-missed',
    details: {
      targetTimeMs: 2582387, actualTimeMs: 2600639, elapsedMs: 262, privateValue: 'not-allowed',
    },
  });
  assert.deepEqual(diagnostic.details, { targetTimeMs: 2582387, actualTimeMs: 2600639, elapsedMs: 262 });
});

test('bounds every seek landing timing field for malformed and boundary values', () => {
  for (const value of [-1, NaN, Infinity, 31536000001, '262', 31536000000]) {
    const details = Object.fromEntries(['targetTimeMs', 'actualTimeMs', 'elapsedMs'].map((key) => [key, value]));
    const sanitized = sanitizePlaybackDiagnostic({ event: 'seek-landing-missed', details }).details;
    for (const field of Object.keys(details)) {
      assert.equal(sanitized[field], value === 31536000000 ? value : null);
    }
  }
});
