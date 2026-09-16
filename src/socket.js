import { finishRecovery } from '@/utils/connectionstatus';
import { rememberDiagnostic } from '@/utils/problemreport';

let socket = null;
let socketRevision = 0;
let cancelOpening = null;

export const close = () => {
  socketRevision += 1;
  cancelOpening?.();
  finishRecovery();
  if (!socket) {
    return;
  }
  console.debug('Socket: closing');
  try {
    socket.close();
  } finally {
    socket = null;
    // Closing synchronously emits disconnect; clear any recovery started by listeners.
    finishRecovery();
  }
};

export const open = async (url, options) => {
  close();
  const revision = socketRevision;
  // Dynamically import socket.io
  const io = await import('socket.io-client');
  if (revision !== socketRevision) {
    throw new DOMException('Socket connection was cancelled', 'AbortError');
  }
  console.debug('Socket: connecting to', url);

  return new Promise(((resolve, reject) => {
    const storageKey = `synclounge:reconnect:${url}:${options.path}`;
    let reconnectToken;
    try { reconnectToken = sessionStorage.getItem(storageKey); } catch { /* Storage may be disabled. */ }
    const client = io.connect(url, {
      ...options,
      auth: (callback) => callback({ ...options.auth, reconnectToken }),
    });
    socket = client;
    let cancel;
    const settle = (error) => {
      if (cancelOpening === cancel) cancelOpening = null;
      if (error) reject(error);
      else resolve(client);
    };
    cancel = () => settle(new DOMException('Socket connection was cancelled', 'AbortError'));
    cancelOpening = cancel;
    client.on('session', (data) => {
      if (socket !== client) return;
      if (typeof data?.reconnectToken !== 'string' || data.reconnectToken.length > 256) return;
      reconnectToken = data.reconnectToken;
      try { sessionStorage.setItem(storageKey, reconnectToken); } catch { /* Keep the in-memory proof. */ }
    });

    client.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      rememberDiagnostic({ event: 'connection-lost', clientTimestamp: new Date().toISOString() });
    });

    client.on('connect', () => {
      rememberDiagnostic({ event: 'connection-established', clientTimestamp: new Date().toISOString() });
    });
    client.once('connect', () => {
      if (socket !== client) return;
      console.debug('Socket: connected, id:', client.id);
      settle();
    });

    // TODO: do I need all these events?
    client.once('connect_error', (err) => {
      rememberDiagnostic({ event: 'connection-error', clientTimestamp: new Date().toISOString() });
      console.error('Socket: connect_error:', url, err);
      settle(new Error('connect_error'));
    });

    client.once('connect_timeout', () => {
      console.error('Socket: connect_timeout:', url);
      settle(new Error('connect_timeout'));
    });
  }));
};

export const emit = ({ eventName, data }) => {
  if (!socket || !socket.connected) {
    console.warn('Socket: cannot emit, not connected:', eventName);
    return;
  }
  if (eventName !== 'slPong') {
    console.debug('Socket emit:', eventName);
  }
  socket.emit(eventName, data);
};

export const on = ({ eventName, handler }) => {
  if (!socket) {
    console.warn('Socket: cannot register listener, socket is null:', eventName);
    return;
  }
  socket.on(eventName, handler);
};

export const off = ({ eventName, handler }) => {
  if (!socket) {
    return;
  }
  if (handler) {
    socket.off(eventName, handler);
  } else {
    socket.removeAllListeners(eventName);
  }
};

export const waitForEvent = (eventName, timeoutMs) => new Promise((resolve, reject) => {
  const pendingSocket = socket;
  if (!pendingSocket) {
    reject(new Error('Socket is not initialized'));
    return;
  }

  let timer;
  let onEvent;
  let onDisconnect;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    pendingSocket.off(eventName, onEvent);
    pendingSocket.off('disconnect', onDisconnect);
  };

  onEvent = (data) => {
    cleanup();
    resolve(data);
  };

  onDisconnect = (reason) => {
    cleanup();
    console.warn('Socket: disconnected while waiting for:', eventName);
    const message = `Disconnected while waiting for ${eventName}`;
    reject(reason === 'io client disconnect'
      ? new DOMException(message, 'AbortError')
      : new Error(message));
  };

  pendingSocket.once(eventName, onEvent);
  pendingSocket.once('disconnect', onDisconnect);

  if (timeoutMs != null) {
    timer = setTimeout(() => {
      cleanup();
      console.warn('Socket: timed out waiting for:', eventName);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
  }
});

export const isConnected = () => socket?.connected;

export const hasSocket = () => socket != null;

export const getId = () => socket?.id;
