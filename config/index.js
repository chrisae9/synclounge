const nconf = require('nconf');
const fs = require('fs');

const defaults = require('./defaults');

const PUBLIC_AUTHENTICATION_KEYS = ['mechanism', 'type', 'authorized'];
const PUBLIC_AUTOJOIN_KEYS = ['server', 'room'];

const omit = (keys, obj) => keys.reduce((a, e) => {
  const { [e]: no, ...rest } = a;
  return rest;
}, obj);

// Doesn't return the keys specified in the blockList
const get = (file, blockList = []) => {
  // Clear out nconf memory in case another dependency used it before
  nconf.reset();

  nconf
    .argv({
      separator: '__',
      parseValues: true,
    })
    .env({
      separator: '__',
      lowerCase: true,
      parseValues: true,
      whitelist: Object.keys(defaults).concat([
        'autojoin__server',
        'autojoin__room',

        'authentication__mechanism',
        'authentication__type',
        'authentication__authorized',

        'default_slplayer_quality',
      ]),
    });

  const configFile = nconf.get('config_file') || file;

  if (configFile) {
    nconf.file({ file: configFile });
  }

  nconf.defaults(defaults);

  // Filter out the weird stuff
  const {
    config_file: no, type, $0: firstArg, _: command, modern, ...config
  } = nconf.get();

  // Remove blockList items
  const filteredConfig = omit(blockList, config);
  return filteredConfig;
};

const pickDefined = (value, keys) => Object.fromEntries(
  keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]),
);

// Return only configuration consumed by the browser. Config files can contain arbitrary
// deployment-only values, so serving the raw nconf object would expose nested secrets.
const getPublic = (config) => {
  const publicConfig = Object.fromEntries(
    Object.keys(defaults)
      .filter((key) => key !== 'authentication' && config[key] !== undefined)
      .map((key) => [key, config[key]]),
  );

  const authentication = pickDefined(config.authentication, PUBLIC_AUTHENTICATION_KEYS);
  if (Object.keys(authentication).length > 0) {
    publicConfig.authentication = authentication;
  }

  const autojoin = pickDefined(config.autojoin, PUBLIC_AUTOJOIN_KEYS);
  if (Object.keys(autojoin).length > 0) {
    publicConfig.autojoin = autojoin;
  }

  if (config.default_slplayer_quality !== undefined) {
    publicConfig.default_slplayer_quality = config.default_slplayer_quality;
  }

  return publicConfig;
};

// Saves the give config json to the specified file
const save = (config, file) => {
  fs.writeFileSync(file, JSON.stringify(config));
};

module.exports = {
  get,
  getPublic,
  save,
};
