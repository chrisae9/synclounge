/* eslint-disable no-await-in-loop -- Advance each sequential retry independently. */
import {
  beforeEach, afterEach, it, expect, vi,
} from 'vitest';
import createStreamRecovery, { waitForVideoReady } from '@/utils/streamrecovery';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

it('shares errors and retries with exponential backoff up to the limit', async () => {
  const recovery = createStreamRecovery();
  const task = vi.fn().mockRejectedValue(new Error('offline'));
  const exhausted = vi.fn();
  const pending = recovery.run(task, exhausted);
  expect(recovery.run(task, exhausted)).toBe(pending);
  await vi.advanceTimersByTimeAsync(999);
  expect(task).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(task).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await pending).toBe('exhausted');
  expect(task).toHaveBeenCalledTimes(3);
  await recovery.run(task, exhausted);
  expect(exhausted).toHaveBeenCalledTimes(1);
});

it('bounds successful restarts during an error burst and resets after a quiet minute', async () => {
  const recovery = createStreamRecovery();
  const task = vi.fn();
  const exhausted = vi.fn();
  for (let i = 0; i < 5; i += 1) {
    const pending = recovery.run(task, exhausted);
    await vi.runAllTimersAsync();
    await pending;
  }
  expect(task).toHaveBeenCalledTimes(3);
  expect(exhausted).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  const next = recovery.run(task, exhausted);
  await vi.runAllTimersAsync();
  expect(await next).toBe('recovered');
  expect(task).toHaveBeenCalledTimes(4);
});

it('cancels backoff before starting any request', async () => {
  const recovery = createStreamRecovery();
  const task = vi.fn();
  const pending = recovery.run(task, vi.fn());
  await vi.advanceTimersByTimeAsync(100);
  recovery.cancel();
  expect(await pending).toBe('cancelled');
  await vi.runAllTimersAsync();
  expect(task).not.toHaveBeenCalled();
});

it('settles cancellation of an uncooperative request and protects its replacement', async () => {
  const recovery = createStreamRecovery();
  let finish;
  const first = recovery.run(() => new Promise((resolve) => { finish = resolve; }), vi.fn());
  await vi.advanceTimersByTimeAsync(1000);
  recovery.cancel();
  const secondTask = vi.fn();
  const second = recovery.run(secondTask, vi.fn());
  expect(await first).toBe('cancelled');
  finish();
  expect(recovery.run(vi.fn(), vi.fn())).toBe(second);
  await vi.runAllTimersAsync();
  expect(await second).toBe('recovered');
  expect(secondTask).toHaveBeenCalledTimes(1);
});

it('requires a usable frame after a source reload and seek', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0, seeking: true });
  const done = vi.fn();
  const pending = waitForVideoReady(video).then(done);
  video.dispatchEvent(new Event('canplay'));
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  video.readyState = 4;
  video.seeking = false;
  video.dispatchEvent(new Event('seeked'));
  await pending;
  expect(done).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds an empty video wait and cancels its timer on departure', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0 });
  const first = waitForVideoReady(video);
  const failed = expect(first).rejects.toThrow('Playback did not become ready');
  await vi.advanceTimersByTimeAsync(15000);
  await failed;
  const controller = new AbortController();
  const second = waitForVideoReady(video, controller.signal);
  controller.abort();
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
});
