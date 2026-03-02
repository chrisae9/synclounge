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
  console.debug('Socket: closing');
  socket.close();
  socket = null;
};

export const emit = ({ eventName, data }) => {
  if (eventName !== 'slPong') {
    console.debug('Socket emit:', eventName);
  }
  socket.emit(eventName, data);
};

export const on = ({ eventName, handler }) => {
  socket.on(eventName, handler);
};

export const waitForEvent = (eventName) => new Promise((resolve, reject) => {
  socket.once(eventName, (resolve));
  socket.once('disconnect', () => {
    console.warn('Socket: disconnected while waiting for:', eventName);
    reject(new Error(`Disconnected while waiting for ${eventName}`));
  });
});

export const isConnected = () => socket?.connected;

export const getId = () => socket?.id;
