const defaults = {
  port: 8088,
  base_url: '/',
  ping_interval: 10000,
  static_path: null,
  // Canonical externally reachable origin used for absolute Open Graph URLs.
  public_origin: '',
  // Trust forwarded client addresses only from a loopback reverse proxy by default.
  trust_proxy: 'loopback',
};

export default defaults;
