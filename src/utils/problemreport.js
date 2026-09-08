// Share the server allowlist so report fields cannot grow accidentally.
// eslint-disable-next-line import/no-relative-packages
import { sanitizePlaybackDiagnostic } from '../../packages/syncloungeserver/src/socketserver/playbackdiagnostics';

const recent = [];

// Reports deliberately omit free-form error messages, URLs, and provider payloads.
// Keep numeric error codes and structured measurements for troubleshooting.
export const safeDiagnostic = (data) => {
  const clean = sanitizePlaybackDiagnostic(data);
  if (!clean) return null;
  if (clean.details) {
    delete clean.details.message;
    delete clean.details.data;
    delete clean.details.name;
  }
  if (clean.playback?.mediaError) delete clean.playback.mediaError.message;
  return clean;
};

export const rememberDiagnostic = (data) => {
  const clean = safeDiagnostic(data);
  if (!clean) return;
  recent.push(clean);
  if (recent.length > 30) recent.shift();
};

export const buildProblemReport = ({
  version, browser, connection, playback, sessions, view,
}) => ({
  reportVersion: 1,
  capturedAt: new Date().toISOString(),
  appVersion: version || 'unknown',
  view,
  browser: {
    name: browser?.name,
    version: browser?.version,
    os: browser?.os,
  },
  online: globalThis.navigator?.onLine,
  standalone: Boolean(globalThis.navigator?.standalone
    || globalThis.matchMedia?.('(display-mode: standalone)').matches),
  connection,
  current: safeDiagnostic({ event: 'problem-report', playback, sessions }),
  recent: recent.map((entry) => structuredClone(entry)),
});

export const formatProblemReport = (report) => [
  'SyncLounge problem report', '', 'What happened: [describe the problem]', '',
  JSON.stringify(report, null, 2),
].join('\n');
