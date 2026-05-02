"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "defaultConfig", {
  enumerable: true,
  get: function () {
    return _defaults["default"];
  }
});
Object.defineProperty(exports, "getConfig", {
  enumerable: true,
  get: function () {
    return _config["default"];
  }
});
Object.defineProperty(exports, "socketServer", {
  enumerable: true,
  get: function () {
    return _socketserver["default"];
  }
});
var _config = _interopRequireDefault(require("./config"));
var _defaults = _interopRequireDefault(require("./config/defaults"));
var _socketserver = _interopRequireDefault(require("./socketserver"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }