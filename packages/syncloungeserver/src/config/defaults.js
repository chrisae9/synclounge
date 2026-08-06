const defaults = {
  port: 8088,
  base_url: '/',
  ping_interval: 10000,
  static_path: null,
  // Trust forwarded client addresses only from a loopback reverse proxy by default.
  trust_proxy: 'loopback',
};

export default defaults;
