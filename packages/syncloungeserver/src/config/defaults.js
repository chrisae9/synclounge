const defaults = Object.freeze({
  port: 8088,
  base_url: '/',
  ping_interval: 10000,
  ping_timeout: 10000,
  static_path: null,
  // Canonical externally reachable origin used for absolute Open Graph URLs.
  public_origin: '',
  // Trust forwarded client addresses only from a loopback reverse proxy by default.
  trust_proxy: 'loopback',
  socket_max_connections: 512,
  socket_max_per_ip: 32,
  socket_max_pending_auth: 32,
  socket_attempts_per_minute: 60,
});

export default defaults;
