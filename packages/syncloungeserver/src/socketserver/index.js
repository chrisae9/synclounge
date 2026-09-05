#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';
import proxyaddr from 'proxy-addr';

import { Server } from 'socket.io';
import { createState } from './state';
import { createActions } from './actions';
import { createEventHandlers } from './handlers';
import { createSocketAuthentication, createReconnectIdentity } from './authentication';
import createAdmission from './admission';

const socketServer = ({
  base_url: baseUrl, static_path: staticPath, port, ping_interval: pingInterval = 10000,
  ping_timeout: pingTimeout = 10000, preStaticInjection, trust_proxy: trustProxy,
  onRoomMediaUpdate, authentication,
  socket_max_connections: maxConnections = 512,
  socket_max_per_ip: maxPerIp = 32,
  socket_max_pending_auth: maxPending = 32,
  socket_attempts_per_minute: attemptsPerMinute = 60,
}) => {
  if (!Number.isFinite(pingInterval) || pingInterval <= 0) {
    throw new TypeError('ping_interval must be a positive number');
  }
  if (!Number.isFinite(pingTimeout) || pingTimeout <= 0) {
    throw new TypeError('ping_timeout must be a positive number');
  }
  if (onRoomMediaUpdate != null && typeof onRoomMediaUpdate !== 'function') {
    throw new TypeError('onRoomMediaUpdate must be a function');
  }

  const authenticate = createSocketAuthentication(authentication);
  const reconnectIdentity = createReconnectIdentity();
  const app = express();
  const server = http.Server(app);
  // Bound transport-only clients, including those that never send namespace auth.
  server.maxConnections = maxConnections * 2;
  const admit = createAdmission({
    maxConnections, maxPerIp, maxPending, attemptsPerMinute,
  });
  const router = express.Router();

  if (trustProxy === true) {
    throw new Error('trust_proxy=true is unsafe; configure a hop count, subnet, or named range');
  }
  app.set('trust proxy', trustProxy);

  app.use(cors());

  app.use(baseUrl, router);

  const normalizedBaseUrl = `/${baseUrl}/`.replace(/\/{2,}/g, '/');
  const socketPath = `${normalizedBaseUrl}socket.io`;

  const socketio = new Server(server, {
    path: socketPath,
    cors: {
      origin: '*',
    },
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    // Use websockets first
    transports: ['websocket', 'polling'],
  });

  socketio.use(async (socket, next) => {
    const { data, handshake } = socket;
    let lease;
    try {
      const address = proxyaddr(socket.request, app.get('trust proxy fn'));
      lease = admit(address);
      // Keep authentication work counted until it settles, even if the peer leaves.
      await authenticate(socket.handshake.auth?.plexToken);
      if (socket.conn.readyState !== 'open') {
        lease.release();
        return;
      }
      lease.authenticated();
      socket.once('disconnect', lease.release);
      socket.conn.once('close', lease.release);
      const session = reconnectIdentity(socket.handshake.auth?.reconnectToken);
      data.reconnectIdentity = session.identity;
      data.reconnectToken = session.token;
      // Do not retain the Plex credential after verification.
      delete handshake.auth?.plexToken;
      next();
    } catch {
      lease?.release();
      delete handshake.auth?.plexToken;
      next(new Error('Not authorized to use this SyncLounge server'));
    } finally {
      delete handshake.auth?.plexToken;
    }
  });
  socketio.on('connection', (socket) => {
    const { data } = socket;
    socket.emit('session', { reconnectToken: data.reconnectToken });
    delete data.reconnectToken;
  });

  const state = createState();
  const actions = createActions(state);
  const attachEventHandlers = createEventHandlers({ state, actions });
  attachEventHandlers({
    server: socketio,
    pingInterval,
    pingTimeout,
    onRoomMediaUpdate,
  });

  router.get('/health', (req, res) => {
    res.json(state.getHealth());
  });

  if (preStaticInjection) {
    // User provided function that does something with the router before the static middleware is
    // added.
    // Useful when overriding static files with a custom result
    preStaticInjection(router);
  }

  // Setup our router
  if (staticPath) {
    console.log('Serving static files at', staticPath);
    router.use(express.static(staticPath));
  } else {
    router.get('/', (req, res) => {
      res.send('You\'ve connected to the SLServer, you\'re probably looking for the webapp.');
    });
  }

  router.ready = new Promise((resolve, reject) => {
    const handleStartupError = (error) => reject(error);
    server.once('error', handleStartupError);
    server.listen(port, () => {
      server.off('error', handleStartupError);
      const address = server.address();
      console.log('SyncLounge Server successfully started on port', address.port);
      console.log('Running with base URL:', baseUrl);
      resolve(address);
    });
  });

  router.close = () => new Promise((resolve, reject) => {
    socketio.close(() => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  router.address = () => server.address();

  // Return router so users can attach more routes if desired
  return router;
};

export default socketServer;
