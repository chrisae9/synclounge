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

Only documented browser configuration is returned from `/config.json`; arbitrary keys in a
configuration file remain server-side. `TRUST_PROXY` controls which reverse proxies may supply
client addresses. It defaults to `loopback`, matching the Nginx example below. For a proxy on a
private container network, set it to an explicit hop count or trusted CIDR/named range such as
`uniquelocal`. Do not use `TRUST_PROXY=true`.

## Reverse Proxy (Nginx)

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
