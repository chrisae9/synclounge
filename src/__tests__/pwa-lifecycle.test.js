import {
  afterEach, expect, it, vi,
} from 'vitest';
import {
  installPwa, pwaState, startPwa, updatePwa,
} from '@/pwa';

let stop;
afterEach(() => { stop?.(); stop = null; });
function setup({ secure = true, standalone = false } = {}) {
  const display = Object.assign(new EventTarget(), { matches: standalone });
  const win = Object.assign(new EventTarget(), {
    isSecureContext: secure,
    matchMedia: () => display,
    location: { reload: vi.fn() },
  });
  const registration = Object.assign(new EventTarget(), { waiting: null, installing: null });
  const serviceWorker = Object.assign(new EventTarget(), { register: vi.fn(async () => registration) });
  const nav = {
    onLine: true, userAgent: 'test browser', platform: '', maxTouchPoints: 0, serviceWorker,
  };
  stop = startPwa({ window: win, navigator: nav });
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
