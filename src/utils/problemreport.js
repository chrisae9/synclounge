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

export const captureMobileEnvironment = () => {
  const viewport = globalThis.visualViewport;
  const root = globalThis.document?.documentElement;
  const style = root && globalThis.getComputedStyle?.(root);
  return {
    visibility: globalThis.document?.visibilityState,
    viewport: {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      visualWidth: viewport?.width,
      visualHeight: viewport?.height,
      offsetTop: viewport?.offsetTop,
      offsetLeft: viewport?.offsetLeft,
      scale: viewport?.scale,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
    screen: {
      width: globalThis.screen?.width,
      height: globalThis.screen?.height,
      orientation: globalThis.screen?.orientation?.type,
    },
    safeArea: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((edge) => [
      edge, style?.getPropertyValue(`--sl-safe-${edge}`).trim() || '0px',
    ])),
    capabilities: {
      pictureInPicture: Boolean(globalThis.document?.pictureInPictureEnabled),
      visualViewport: Boolean(viewport),
    },
  };
};

export const buildProblemReport = ({
  version, browser, connection, playback, sessions, view,
}) => ({
  reportVersion: 2,
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
  environment: captureMobileEnvironment(),
  connection,
  current: safeDiagnostic({ event: 'problem-report', playback, sessions }),
  recent: recent.map((entry) => structuredClone(entry)),
});

export const formatProblemReport = (report) => [
  'SyncLounge problem report', '', 'What happened: [describe the problem]', '',
  JSON.stringify(report, null, 2),
].join('\n');
