![SyncLounge](src/assets/images/logos/logo-long-dark.png)

# SyncLounge

[![CI](https://github.com/chrisae9/synclounge/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisae9/synclounge/actions/workflows/ci.yml)
[![CodeQL](https://github.com/chrisae9/synclounge/actions/workflows/codeql.yml/badge.svg)](https://github.com/chrisae9/synclounge/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/chrisae9/synclounge)](https://github.com/chrisae9/synclounge/releases/latest)

SyncLounge is a tool to sync [Plex](https://plex.tv) content across multiple players in multiple locations. Watch movies and TV shows together with friends and family, no matter where they are.

This is a continuation of the original [SyncLounge](https://github.com/synclounge/synclounge) project, modernized with Vue 3, Vuetify 3, and Vite.

## What's Different

This fork has been substantially reworked from the original:

- **Vue 3 + Vuetify 3 + Vite** — Migrated from Vue 2/Vuetify 2/Webpack
- **Built-in web player only** — External Plex client control has been removed (it no longer works reliably with modern Plex)
- **Chromecast support** — Cast content to Chromecast devices ($5 Google Cast developer registration required)
- **Discord/social previews** — Share links generate rich OpenGraph embeds with poster images and metadata
- **MKV direct play** — Properly handles MKV containers that Plex repackages as MP4
- **Subtitle fixes** — Fixed libjass subtitle rendering in Vite's ESM strict mode
- **Mobile-friendly** — Responsive layout improvements for small screens
- **Library browsing** — Sort, filter, and A-Z index for library content; lazy loading with skeleton placeholders
- **Server management** — Enable/disable servers with visibility toggles; all servers searchable by default

## How It Works

SyncLounge keeps multiple viewing sessions in sync using a WebSocket server as a relay between clients. Users join a room, and the host controls playback — play, pause, seek, and content changes are synced to everyone in the room. If the host plays something new, SyncLounge searches each user's available Plex servers for a matching copy.

## Features

- Synchronized playback across the internet
- Built-in web player optimized for sync accuracy
- Chromecast casting support
- Autoplay — automatically finds matching content across your Plex servers
- Library browsing with sorting, filtering, and A-Z quick navigation
- Search across all connected Plex servers
- Chat with room members
- Optional Plex user and server authorization allowlists
- Shareable invite links with rich social previews
- Configurable sync flexibility and sync method (clean seek / skip ahead)

## Running

### Docker

```sh
docker run -p 8088:8088 ghcr.io/chrisae9/synclounge:latest
```

### Docker Compose

```yaml
services:
  synclounge:
    image: ghcr.io/chrisae9/synclounge:latest
    ports:
      - 8088:8088
    restart: unless-stopped
```

Development builds are published separately as `ghcr.io/chrisae9/synclounge:dev`. Every development build also has an immutable `dev-<commit SHA>` tag. These images may be unstable and never replace `latest`.

### Node.js

```sh
SKIP_BUILD=true npm ci
npm run build
node server.js
```

Listens on port 8088 by default. The documented deployment serves SyncLounge at the root of a hostname; path-prefix deployments require additional asset-base configuration and are not currently supported by the published image.

## Configuration

Configuration can be set via environment variables matching the keys in [`config/defaults.js`](config/defaults.js). Nested objects and arrays are passed as JSON strings:

```sh
AUTHENTICATION='{"mechanism":"plex","type":["server"],"authorized":["MACHINE_ID"]}'
SERVERS='[{"name":"My Server","location":"Mothership","url":"https://myserver.com"}]'
```

`AUTHENTICATION` is enforced on socket connections using the signed-in user's Plex
account or accessible server IDs. Invalid restrictions fail startup; rejected or unavailable
Plex verification denies the connection. Restricted deployments must serve the web app and
socket endpoint from the same origin: the browser sends its Plex credential only to its
own origin. Unrestricted deployments keep `mechanism: "none"`.

Host recovery uses a server-issued reconnect proof stored per browser tab. Reloading that
tab preserves its identity; clearing session storage or restarting the server starts a new
identity and lets the usual host election proceed.

Only documented browser configuration is returned from `/config.json`; arbitrary keys in a
configuration file remain server-side. `TRUST_PROXY` controls which reverse proxies may supply
client addresses. It defaults to `loopback`, matching the Nginx example below. For a proxy on a
private container network, prefer an explicit hop count or the proxy's exact CIDR. A named range
such as `uniquelocal` is safe only when the application is directly reachable by that reverse
proxy; other clients on the trusted network could otherwise spoof `X-Forwarded-For` and bypass
per-IP limits. Do not use `TRUST_PROXY=true`. Set `PUBLIC_ORIGIN` to the externally reachable
HTTP(S) origin (for example, `https://synclounge.example.com`) to enable absolute poster URLs in
Open Graph previews. Incoming `Host` headers are never used to construct those URLs.

## Reverse Proxy (Nginx)

Socket admission defaults to 512 clients overall, 32 clients per IP, 32 pending Plex
authentication requests, and 60 connection attempts per IP per minute. Override with
`SOCKET_MAX_CONNECTIONS`, `SOCKET_MAX_PER_IP`, `SOCKET_MAX_PENDING_AUTH`, and
`SOCKET_ATTEMPTS_PER_MINUTE` (positive integers). Transport-only TCP clients are capped
at twice `SOCKET_MAX_CONNECTIONS`. Set `TRUST_PROXY` correctly so a reverse proxy does
not make all users share one IP allowance. Limits apply separately to each server process.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}

server {
    listen 443 ssl http2;
    server_name synclounge.example.com;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_socket_keepalive on;
        proxy_redirect off;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

## Development

```sh
SKIP_BUILD=true npm ci
npm run serve   # Vite dev server with HMR
npm run build   # Production build to dist/
npm test        # Run tests
```

Pull requests target `dev`; `main` is reserved for stable release promotions. See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete verification and review contract.

## Chromecast

Chromecast support requires a [Google Cast developer registration](https://cast.google.com/publish/) ($5 one-time fee) and a published receiver app. The receiver app ID is configured in the SyncLounge settings.

## Credits

Originally created by [samcm](https://github.com/samcm), [ttshivers](https://github.com/ttshivers), and [contributors](https://github.com/synclounge/synclounge/graphs/contributors).

Continued by [chrisae9](https://github.com/chrisae9).

## License

MIT License. See [LICENSE](LICENSE).

SyncLounge is in no way affiliated with Plex Inc.
