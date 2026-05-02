#!/usr/bin/env node
"use strict";

var _config = _interopRequireDefault(require("./config"));
var _socketserver = _interopRequireDefault(require("./socketserver"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
const parsedConfig = (0, _config["default"])();
(0, _socketserver["default"])(parsedConfig);