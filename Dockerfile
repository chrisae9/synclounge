# build environment
FROM --platform=$BUILDPLATFORM node:24-alpine AS build-stage
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache python3 make g++
USER node
COPY --link --chown=1000:1000 package*.json ./
COPY --link --chown=1000:1000 packages packages
RUN SKIP_BUILD=true npm ci
COPY --link --chown=1000:1000 . .

ARG VERSION

RUN npm run build

# dependency environment
FROM node:24-alpine AS dependency-stage
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache python3 make g++
USER node
COPY --link --chown=1000:1000 package*.json ./
COPY --link --chown=1000:1000 packages packages
RUN SKIP_BUILD=true npm ci
RUN npm prune --production

# production environment
FROM node:24-alpine AS production-stage
ENV NODE_ENV=production
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache tini

USER node
COPY --link --chown=1000:1000 server.js cache.js poster-proxy.js request-abort.js ./
COPY --link --chown=1000:1000 config config
COPY --link --chown=1000:1000 packages packages
COPY --link --chown=1000:1000 --from=dependency-stage /app/node_modules node_modules
COPY --link --chown=1000:1000 --from=build-stage /app/packages/syncloungeserver/dist packages/syncloungeserver/dist
COPY --link --chown=1000:1000 --from=build-stage /app/dist dist

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --output-document=- "http://127.0.0.1:${PORT:-8088}/health" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/server.js"]
