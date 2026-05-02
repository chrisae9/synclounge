"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _nconf = _interopRequireDefault(require("nconf"));
var _defaults = _interopRequireDefault(require("./defaults"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
const get = () => {
  _nconf["default"].reset();
  _nconf["default"].argv({
    separator: '__',
    parseValues: true
  }).env({
    separator: '__',
    lowerCase: true,
    parseValues: true
  }).defaults(_defaults["default"]);
  return _nconf["default"].get();
};
var _default = exports["default"] = get;