# build environment
FROM --platform=$BUILDPLATFORM node:25-alpine AS build-stage
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache python3 make g++
USER node
COPY --link --chown=1000:1000 package*.json ./
RUN SKIP_BUILD=true npm ci
COPY --link --chown=1000:1000 . .

ARG VERSION

RUN npm run build

# dependency environment
FROM node:25-alpine AS dependency-stage
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache python3 make g++
USER node
COPY --link --chown=1000:1000 package*.json ./
RUN SKIP_BUILD=true npm ci
RUN npm prune --production

# production environment
FROM node:25-alpine AS production-stage
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
RUN apk add --no-cache tini

USER node
COPY --link --chown=1000:1000 server.js cache.js ./
COPY --link --chown=1000:1000 config config
COPY --link --chown=1000:1000 --from=dependency-stage /app/node_modules node_modules
COPY --link --chown=1000:1000 --from=build-stage /app/dist dist

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/server.js"]
