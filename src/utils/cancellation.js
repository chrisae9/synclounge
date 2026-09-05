export const throwIfAborted = (signal) => {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
};

// Unlike an async function merely receiving a signal, this settles even if the
// underlying dependency ignores cancellation. Callers must still guard side effects.
export const abortable = (promise, signal) => {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Operation cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
    if (signal.aborted) abort();
  });
};
