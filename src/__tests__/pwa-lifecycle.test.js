import {
  afterEach, expect, it, vi,
} from 'vitest';
import {
  installPwa, pwaState, startPwa, updatePwa, canAutoUpdatePwa,
} from '@/pwa';

let stop;
afterEach(() => { stop?.(); stop = null; });
function setup({ secure = true, standalone = false, ...options } = {}) {
  const display = Object.assign(new EventTarget(), { matches: standalone });
  const win = Object.assign(new EventTarget(), {
    isSecureContext: secure,
    matchMedia: () => display,
    location: { reload: vi.fn() },
  });
  const registration = Object.assign(new EventTarget(), { waiting: null, installing: null });
  const serviceWorker = Object.assign(new EventTarget(), { controller: {}, register: vi.fn(async () => registration) });
  const nav = {
    onLine: true, userAgent: 'test browser', platform: '', maxTouchPoints: 0, serviceWorker,
  };
  stop = startPwa({ window: win, navigator: nav, ...options });
  return {
    win, nav, registration, serviceWorker,
  };
}

it('registers at the app root and never reloads for background activation', async () => {
  const { win, serviceWorker, registration } = setup();
  await Promise.resolve();
  expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).not.toHaveBeenCalled();
  const waiting = { postMessage: vi.fn() };
  registration.waiting = waiting;
  registration.installing = new EventTarget();
  registration.dispatchEvent(new Event('updatefound'));
  registration.installing.dispatchEvent(new Event('statechange'));
  expect(pwaState.updateAvailable).toBe(true);
  expect(waiting.postMessage).not.toHaveBeenCalled();
  expect(updatePwa()).toBe(true);
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' });
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).toHaveBeenCalledTimes(1);
});

it('prompts for install only when explicitly requested, then hides the action after installation', async () => {
  const { win } = setup();
  const prompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  win.dispatchEvent(prompt);
  expect(prompt.defaultPrevented).toBe(true);
  expect(pwaState.canPrompt).toBe(true);
  expect(prompt.prompt).not.toHaveBeenCalled();
  expect(await installPwa()).toBe(true);
  expect(prompt.prompt).toHaveBeenCalledTimes(1);
  expect(await installPwa()).toBe(false);
  win.dispatchEvent(new Event('appinstalled'));
  expect(pwaState.installed).toBe(true);
  expect(pwaState.canPrompt).toBe(false);
});

it('keeps plain HTTP usable and tracks connectivity without a worker', () => {
  const { win, nav, serviceWorker } = setup({ secure: false });
  expect(serviceWorker.register).not.toHaveBeenCalled();
  nav.onLine = false;
  win.dispatchEvent(new Event('offline'));
  expect(pwaState.offline).toBe(true);
  nav.onLine = true;
  win.dispatchEvent(new Event('online'));
  expect(pwaState.offline).toBe(false);
  stop();
  nav.onLine = false;
  win.dispatchEvent(new Event('offline'));
  expect(pwaState.offline).toBe(false);
});

it('recognizes installed standalone windows without prompting again', () => {
  setup({ standalone: true });
  expect(pwaState.installed).toBe(true);
});

it('automatically applies a waiting update on a safe visit after routing is ready', async () => {
  let finishRouting;
  const ready = new Promise((resolve) => { finishRouting = resolve; });
  const { win, registration, serviceWorker } = setup({ ready, canAutoUpdate: () => true });
  const worker = { postMessage: vi.fn() };
  registration.waiting = worker;
  await Promise.resolve();
  expect(worker.postMessage).not.toHaveBeenCalled();
  finishRouting();
  await Promise.resolve();
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'ACTIVATE_UPDATE' });
  win.dispatchEvent(new Event('focus'));
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).toHaveBeenCalledTimes(1);
});

it('keeps updates manual in a room and applies them on returning outside it', async () => {
  let inRoom = true;
  const { win, registration, serviceWorker } = setup({ canAutoUpdate: () => !inRoom });
  registration.waiting = { postMessage: vi.fn() };
  await Promise.resolve();
  expect(registration.waiting.postMessage).not.toHaveBeenCalled();
  win.dispatchEvent(new Event('pageshow'));
  expect(registration.waiting.postMessage).not.toHaveBeenCalled();
  inRoom = false;
  win.dispatchEvent(new Event('pageshow'));
  expect(registration.waiting.postMessage).toHaveBeenCalledTimes(1);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).toHaveBeenCalledTimes(1);
});

it('does not reload if a room join starts while automatic activation is pending', async () => {
  let safe = true;
  const { win, registration, serviceWorker } = setup({ canAutoUpdate: () => safe });
  registration.waiting = { postMessage: vi.fn() };
  await Promise.resolve();
  safe = false;
  registration.waiting = null;
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).not.toHaveBeenCalled();
  expect(pwaState.updateAvailable).toBe(true);
  safe = true;
  win.dispatchEvent(new Event('focus'));
  expect(win.location.reload).toHaveBeenCalledTimes(1);
});

it('does not interrupt an occupied page for an update discovered during use, or after cleanup', async () => {
  const { win, registration } = setup({ canAutoUpdate: () => false });
  await Promise.resolve();
  registration.waiting = { postMessage: vi.fn() };
  registration.installing = new EventTarget();
  registration.dispatchEvent(new Event('updatefound'));
  registration.installing.dispatchEvent(new Event('statechange'));
  expect(registration.waiting.postMessage).not.toHaveBeenCalled();
  stop();
  win.dispatchEvent(new Event('focus'));
  expect(registration.waiting.postMessage).not.toHaveBeenCalled();
});

it('limits automatic updates to idle entry screens, never room or joining routes', () => {
  for (const name of ['RoomCreation', 'SignIn']) {
    expect(canAutoUpdatePwa({ route: { name }, inRoom: false, joiningRoom: false })).toBe(true);
    expect(canAutoUpdatePwa({ route: { name }, inRoom: true })).toBe(false);
    expect(canAutoUpdatePwa({ route: { name }, joiningRoom: true })).toBe(false);
    expect(canAutoUpdatePwa({ route: { name }, authenticating: true })).toBe(false);
  }
  for (const name of ['RoomJoin', 'AdvancedRoomJoin', 'WebPlayer', 'PlexHome', 'SignOut', undefined]) {
    expect(canAutoUpdatePwa({ route: { name } })).toBe(false);
  }
});

it('lets a first worker install without an unnecessary automatic reload', async () => {
  const { win, registration, serviceWorker } = setup({ canAutoUpdate: () => true });
  serviceWorker.controller = null;
  registration.waiting = { postMessage: vi.fn() };
  await Promise.resolve();
  expect(registration.waiting.postMessage).not.toHaveBeenCalled();
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).not.toHaveBeenCalled();
});

it('automatically activates an update whose download finishes on an idle entry screen', async () => {
  const { registration, serviceWorker, win } = setup({ canAutoUpdate: () => true });
  await Promise.resolve();
  registration.installing = new EventTarget();
  registration.dispatchEvent(new Event('updatefound'));
  registration.waiting = { postMessage: vi.fn() };
  registration.installing.dispatchEvent(new Event('statechange'));
  expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' });
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(win.location.reload).toHaveBeenCalledTimes(1);
});
