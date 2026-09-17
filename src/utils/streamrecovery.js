/* eslint-disable no-await-in-loop -- Recovery attempts must run sequentially. */
import { abortable, throwIfAborted } from './cancellation';

const wait = (ms, signal) => new Promise((resolve, reject) => {
  let timer;
  const abort = () => {
    clearTimeout(timer);
    reject(new DOMException('Recovery cancelled', 'AbortError'));
  };
  timer = setTimeout(() => {
    signal.removeEventListener('abort', abort);
    resolve();
  }, ms);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
});

// Share concurrent errors and bound restarts even when each load succeeds briefly.
export default function createStreamRecovery({ maxAttempts = 3, windowMs = 60000, delayMs = 1000 } = {}) {
  let active = null;
  let attempts = 0;
  let lastErrorAt = null;
  let notified = false;
  return {
    cancel() {
      active?.controller.abort();
      active = null;
      attempts = 0;
      lastErrorAt = null;
      notified = false;
    },
    run(task, exhausted) {
      const now = Date.now();
      if (lastErrorAt !== null && now - lastErrorAt >= windowMs && !active) {
        attempts = 0;
        notified = false;
      }
      lastErrorAt = now;
      if (active) return active.promise;
      const operation = { controller: new AbortController() };
      active = operation;
      const { signal } = operation.controller;
      operation.promise = (async () => {
        // Defer callbacks until the operation and its shared promise are installed.
        await Promise.resolve();
        try {
          while (attempts < maxAttempts) {
            throwIfAborted(signal);
            const delay = delayMs * (2 ** attempts);
            attempts += 1;
            await wait(delay, signal);
            try {
              await abortable(task(signal, attempts), signal);
              throwIfAborted(signal);
              return 'recovered';
            } catch (error) {
              if (error.name === 'AbortError') throw error;
            }
          }
          throwIfAborted(signal);
          if (!notified) {
            notified = true;
            await exhausted(signal);
          }
          throwIfAborted(signal);
          return 'exhausted';
        } catch (error) {
          if (error.name !== 'AbortError') throw error;
          return 'cancelled';
        } finally {
          if (active === operation) active = null;
        }
      })();
      return operation.promise;
    },
  };
}

// Shaka's load promise may settle before the first usable frame arrives.
export const waitForVideoReady = (video, signal, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (!video) { reject(new Error('Player was removed')); return; }
  let timer;
  let check;
  let cancel;
  const cleanup = () => {
    clearTimeout(timer);
    video.removeEventListener('canplay', check);
    video.removeEventListener('seeked', check);
    signal?.removeEventListener('abort', cancel);
  };
  const finish = (error) => { cleanup(); if (error) reject(error); else resolve(); };
  cancel = () => finish(new DOMException('Recovery cancelled', 'AbortError'));
  check = () => {
    if (signal?.aborted) cancel();
    else if (video.readyState >= 2 && !video.seeking) finish();
  };
  video.addEventListener('canplay', check);
  video.addEventListener('seeked', check);
  signal?.addEventListener('abort', cancel, { once: true });
  timer = setTimeout(() => finish(new Error('Playback did not become ready')), timeoutMs);
  check();
});
