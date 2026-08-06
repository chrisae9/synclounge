#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';

import { Server } from 'socket.io';
import attachEventHandlers from './handlers';

import { getHealth } from './state';

const socketServer = ({
  base_url: baseUrl, static_path: staticPath, port, ping_interval: pingInterval = 10000,
  ping_timeout: pingTimeout = 10000, preStaticInjection, trust_proxy: trustProxy,
}) => {
  if (!Number.isFinite(pingInterval) || pingInterval <= 0) {
    throw new TypeError('ping_interval must be a positive number');
  }
  if (!Number.isFinite(pingTimeout) || pingTimeout <= 0) {
    throw new TypeError('ping_timeout must be a positive number');
  }

  http.globalAgent.keepAlive = true;

  const app = express();
  const server = http.Server(app);
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

  attachEventHandlers({ server: socketio, pingInterval, pingTimeout });

  router.get('/health', (req, res) => {
    res.json(getHealth());
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
