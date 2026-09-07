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

export function startPwa({ window: win = window, navigator: nav = navigator, register = true } = {}) {
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
  const checkWaiting = () => { pwaState.updateAvailable = !!registration?.waiting; };
  const onUpdateFound = () => {
    installing?.removeEventListener('statechange', checkWaiting);
    installing = registration.installing;
    installing?.addEventListener('statechange', checkWaiting);
  };
  const onControllerChange = () => {
    if (reloadOnUpdate) {
      reloadOnUpdate = false;
      win.location.reload();
    }
  };
  if (register && win.isSecureContext && nav.serviceWorker) {
    nav.serviceWorker.addEventListener('controllerchange', onControllerChange);
    nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((result) => {
      if (stopped) return;
      registration = result;
      checkWaiting();
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
    standalone.removeEventListener('change', onDisplayMode);
    nav.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    registration?.removeEventListener('updatefound', onUpdateFound);
    installing?.removeEventListener('statechange', checkWaiting);
    installEvent = null;
    registration = null;
    reloadOnUpdate = false;
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
  if (!registration?.waiting) return false;
  reloadOnUpdate = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  return true;
}
