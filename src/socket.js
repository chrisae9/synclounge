let socket = null;

export const open = async (url, options) => {
  // Dynamically import socket.io
  const io = await import('socket.io-client');
  console.debug('Socket: connecting to', url);

  return new Promise(((resolve, reject) => {
    socket = io.connect(url, options);

    socket.once('connect', () => {
      console.debug('Socket: connected, id:', socket.id);
      resolve(socket);
    });

    // TODO: do I need all these events?
    socket.once('connect_error', (err) => {
      console.error('Socket: connect_error:', url, err);
      reject(new Error('connect_error'));
    });

    socket.once('connect_timeout', () => {
      console.error('Socket: connect_timeout:', url);
      reject(new Error('connect_timeout'));
    });
  }));
};

export const close = () => {
  if (!socket) {
    return;
  }
  console.debug('Socket: closing');
  socket.close();
  socket = null;
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

export const waitForEvent = (eventName, timeoutMs) => new Promise((resolve, reject) => {
  if (!socket) {
    reject(new Error('Socket is not initialized'));
    return;
  }

  let timer;
  let onEvent;
  let onDisconnect;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    socket.off(eventName, onEvent);
    socket.off('disconnect', onDisconnect);
  };

  onEvent = (data) => {
    cleanup();
    resolve(data);
  };

  onDisconnect = () => {
    cleanup();
    console.warn('Socket: disconnected while waiting for:', eventName);
    reject(new Error(`Disconnected while waiting for ${eventName}`));
  };

  socket.once(eventName, onEvent);
  socket.once('disconnect', onDisconnect);

  if (timeoutMs != null) {
    timer = setTimeout(() => {
      cleanup();
      console.warn('Socket: timed out waiting for:', eventName);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
  }
});

export const isConnected = () => socket?.connected;

export const getId = () => socket?.id;
