#!/usr/bin/env node
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _express = _interopRequireDefault(require("express"));
var _cors = _interopRequireDefault(require("cors"));
var _http = _interopRequireDefault(require("http"));
var _url = _interopRequireDefault(require("url"));
var _socket = require("socket.io");
var _handlers = _interopRequireDefault(require("./handlers"));
var _state = require("./state");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
const socketServer = ({
  base_url: baseUrl,
  static_path: staticPath,
  port,
  ping_interval: pingInterval,
  preStaticInjection
}) => {
  _http["default"].globalAgent.keepAlive = true;
  const app = (0, _express["default"])();
  const server = _http["default"].Server(app);
  const router = _express["default"].Router();
  app.use((0, _cors["default"])());
  app.use(baseUrl, router);
  const socketio = new _socket.Server(server, {
    path: _url["default"].resolve(baseUrl, 'socket.io'),
    cors: {
      origin: '*'
    },
    serveClient: false,
    // Use websockets first
    transports: ['websocket', 'polling']
  });
  (0, _handlers["default"])({
    server: socketio,
    pingInterval
  });
  router.get('/health', (req, res) => {
    res.json((0, _state.getHealth)());
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
    router.use(_express["default"]["static"](staticPath));
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
var _default = exports["default"] = socketServer;