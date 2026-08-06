#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';

import { Server } from 'socket.io';
import attachEventHandlers from './handlers';

import { getHealth } from './state';

const socketServer = ({
  base_url: baseUrl, static_path: staticPath, port, ping_interval: pingInterval,
  preStaticInjection, trust_proxy: trustProxy,
}) => {
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

  attachEventHandlers({ server: socketio, pingInterval });

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

  server.listen(port, () => {
    console.log('SyncLounge Server successfully started on port', port);
    console.log('Running with base URL:', baseUrl);
  });

  // Return router so users can attach more routes if desired
  return router;
};

export default socketServer;
