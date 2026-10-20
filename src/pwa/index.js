import { reactive } from 'vue';

export const pwaState = reactive({
  offline: false,
  installed: false,
  canPrompt: false,
  updateAvailable: false,
  secure: true,
  ios: false,
});

let installEvent;
let registration;
let reloadOnUpdate = false;
let automaticUpdate = false;
let pendingReload = false;
let reloadApp;

export const canAutoUpdatePwa = ({
  inRoom, joiningRoom, authenticating, route,
}) => !inRoom && !joiningRoom && !authenticating
  && ['RoomCreation', 'SignIn'].includes(route?.name);

export function startPwa({
  window: win = window, navigator: nav = navigator, register = true,
  ready = Promise.resolve(), canAutoUpdate = () => false,
} = {}) {
  pwaState.canPrompt = false;
  pwaState.updateAvailable = false;
  const standalone = win.matchMedia('(display-mode: standalone)');
  pwaState.installed = standalone.matches || nav.standalone === true;
  pwaState.offline = !nav.onLine;
  pwaState.secure = win.isSecureContext;
  pwaState.ios = /iPad|iPhone|iPod/.test(nav.userAgent)
    || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const onConnection = () => { pwaState.offline = !nav.onLine; };
  const onPrompt = (event) => {
    event.preventDefault();
    installEvent = event;
    pwaState.canPrompt = true;
  };
  const onInstalled = () => {
    pwaState.installed = true;
    pwaState.canPrompt = false;
    installEvent = null;
  };
  const onDisplayMode = () => { pwaState.installed = standalone.matches || nav.standalone === true; };
  win.addEventListener('online', onConnection);
  win.addEventListener('offline', onConnection);
  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  standalone.addEventListener('change', onDisplayMode);

  let stopped = false;
  let installing;
  let autoReady = false;
  reloadApp = () => win.location.reload();
  const checkWaiting = (allowAutomatic = false) => {
    pwaState.updateAvailable = !!registration?.waiting || pendingReload;
    if (!allowAutomatic || !autoReady || stopped || !nav.onLine || win.document?.hidden || !canAutoUpdate()) return;
    if (pendingReload) {
      pendingReload = false;
      reloadApp();
    } else if (registration?.waiting && nav.serviceWorker?.controller && !reloadOnUpdate) {
      automaticUpdate = true;
      reloadOnUpdate = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
  };
  // Installation may finish after entry; recheck the actual route and join state.
  const onInstallingState = () => checkWaiting(true);
  const onUpdateFound = () => {
    installing?.removeEventListener('statechange', onInstallingState);
    installing = registration.installing;
    installing?.addEventListener('statechange', onInstallingState);
  };
  const onControllerChange = () => {
    if (reloadOnUpdate) {
      reloadOnUpdate = false;
      if (automaticUpdate && !canAutoUpdate()) {
        pendingReload = true;
        pwaState.updateAvailable = true;
      } else reloadApp();
      automaticUpdate = false;
    }
  };
  const onResume = () => {
    if (win.document?.hidden) return;
    checkWaiting(true);
    registration?.update?.().then(() => checkWaiting(true)).catch(() => {});
  };
  win.addEventListener('pageshow', onResume);
  win.addEventListener('focus', onResume);
  win.document?.addEventListener('visibilitychange', onResume);
  Promise.resolve(ready).then(() => {
    if (stopped) return;
    autoReady = true;
    checkWaiting(true);
  }).catch(() => {});
  if (register && win.isSecureContext && nav.serviceWorker) {
    nav.serviceWorker.addEventListener('controllerchange', onControllerChange);
    nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((result) => {
      if (stopped) return;
      registration = result;
      checkWaiting(true);
      registration.addEventListener('updatefound', onUpdateFound);
      onUpdateFound();
    }).catch((error) => console.debug('Offline support could not be registered:', error));
  }
  return () => {
    stopped = true;
    win.removeEventListener('online', onConnection);
    win.removeEventListener('offline', onConnection);
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
    win.removeEventListener('pageshow', onResume);
    win.removeEventListener('focus', onResume);
    win.document?.removeEventListener('visibilitychange', onResume);
    standalone.removeEventListener('change', onDisplayMode);
    nav.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    registration?.removeEventListener('updatefound', onUpdateFound);
    installing?.removeEventListener('statechange', onInstallingState);
    installEvent = null;
    registration = null;
    reloadOnUpdate = false;
    automaticUpdate = false;
    pendingReload = false;
    reloadApp = null;
  };
}

export async function installPwa() {
  if (!installEvent) return false;
  const event = installEvent;
  installEvent = null;
  pwaState.canPrompt = false;
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

export function updatePwa() {
  if (pendingReload && reloadApp) {
    pendingReload = false;
    reloadApp();
    return true;
  }
  if (!registration?.waiting) return false;
  automaticUpdate = false;
  reloadOnUpdate = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  return true;
}
