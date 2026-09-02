# syntax=docker/dockerfile:1.7
# Frontend Dockerfile — multi-stage production build with npm workspaces.
#
# Build context = repo root (set in infra/compose/docker-compose.yml).
# That lets us copy the workspace root (package.json + lockfile) plus the
# shared @scheduler/design-system package so `npm ci` resolves the full
# workspace graph the same way it does on the developer's machine.
#
# Stage 1: build the React app with node:24-alpine. We copy lockfile +
# every workspace's package.json FIRST so `npm ci` lands on its own
# cacheable layer — source edits below don't bust it.
#
# 24, not 20: `vite.config.ts` imports `rollup-plugin-visualizer`, whose
# `engines.node` is `>=22` with no `^20` branch at all, so this image was
# building the production bundle on an engine its own build plugin excludes.
# Nothing caught it — CI runs node 24 (`.github/workflows/ci.yml`) and never
# builds this image, so the two drifted apart silently while the shared root
# lockfile moved on. `entrant/tests/deployStacks.test.ts` now pins every app
# image's node major to CI's.
#
# Stage 2: serve the compiled assets with the nginx-unprivileged image,
# which runs as UID 101 by default and listens on port 8080 (non-root
# can't bind to <1024). Compose remaps 80:8080 so users still hit
# http://localhost.

ARG SOURCE_REVISION=unknown

FROM node:24-alpine AS builder

WORKDIR /app

# Workspace root files (package.json declares workspaces; root lockfile
# is canonical since Phase 2a consolidated per-product lockfiles).
COPY package.json package-lock.json ./

# Each workspace's package.json — required by `npm ci` to resolve the
# workspace graph. Source files come later so editing a .tsx doesn't
# invalidate the install layer.
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY packages/shared-contract/package.json ./packages/shared-contract/package.json
COPY apps/console/package.json ./apps/console/package.json

# Install the workspace graph. Cache mount keeps the npm download cache
# across builds; the cache mount itself is not part of the final layer.
# `--no-audit --no-fund` shaves 10-15 s off cold installs and produces
# no signal in CI — the audit runs on the dev machine, not the build.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# Now copy the full source for the workspaces we actually build.
COPY packages/design-system ./packages/design-system
COPY packages/shared-contract ./packages/shared-contract
COPY apps/console ./apps/console

# Build args — baked into the static bundle at build time.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_ERROR_HARNESS=
ENV VITE_ERROR_HARNESS=$VITE_ERROR_HARNESS

# Build via the workspace runner so paths resolve correctly.
RUN npm run -w apps/console build


# Stage 2 — serve with the non-root nginx image.
FROM nginxinc/nginx-unprivileged:alpine

ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION

# The base image defaults to UID 101. Temporarily elevate only for the signed
# package update and removal of its stock server block, then restore it.
USER root

# The base image ships its own `conf.d/default.conf` with a `server { listen
# 8080; server_name localhost; }`. Until SP-HOST-1 our config REPLACED that
# file; now that the tier configs have their own names it would survive
# alongside them, and nginx would parse a second server block on 8080 with
# the same server_name — "conflicting server name … ignored", a warning, not
# an error, so the container starts and serves the stock welcome page from
# whichever block won. Delete it rather than depend on parse order.
RUN apk upgrade --no-cache \
    && rm -f /etc/nginx/conf.d/default.conf

USER 101

# One container, TWO tiers, two ports (SP-HOST-1 D-1/D-2).
#
#   8080 — the operator console + /api/, published as `app.<domain>` behind
#          Cloudflare Access.
#   8081 — the public entrant site (/e/*), published as `play.<domain>` with
#          no Access policy at all.
#
# Two ports so the tunnel can make them two HOSTNAMES, and two hostnames so
# the browser makes them two ORIGINS — which is the boundary the program
# exists to create. The tunnel does the hostname routing, so no hostname
# appears in any conf file and none has to be templated in at build time
# (invariant I1).
#
# Three files rather than two server blocks in one: a `map` may be declared
# once, and `apps/entrant/tests/helpers/nginxConf.ts` models a conf file
# without tracking which `server {}` encloses a location — two blocks in one
# file would merge the tiers into one model and leave every ingress assertion
# green while describing a config that does not exist.
#
# The numeric prefixes are read-order only; nginx resolves map variables and
# shared-memory zones after parsing the whole configuration.
COPY infra/nginx/http-shared.conf /etc/nginx/conf.d/00-shared.conf
COPY infra/nginx/console.conf /etc/nginx/conf.d/10-console.conf
COPY infra/nginx/play.conf /etc/nginx/conf.d/20-play.conf
# Security headers live in a snippet because nginx drops inherited
# add_header directives in any location that declares one of its own, so the
# list has to be repeated per location — see SEC-02 in the snippet's header.
# One snippet serves both tiers; the three directives that differ are maps on
# $server_port declared in http-shared.conf.
COPY infra/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# nginx-unprivileged already owns /usr/share/nginx/html as UID 101.
COPY --from=builder --chown=101:101 \
    /app/apps/console/dist /usr/share/nginx/html

EXPOSE 8080 8081

# Probe 127.0.0.1 (not `localhost`): in this image `localhost` resolves to
# `::1` (IPv6) first, but nginx listens on IPv4 only, so a `localhost` probe is
# refused and the container reads "unhealthy" even though it serves fine over
# the IPv4 port map. 127.0.0.1 pins the check to the stack nginx actually binds.
#
# 8080 ONLY, deliberately, now that the container also listens on 8081. Every
# path on the public tier either proxies to the `entrant` node service or
# redirects into one that does, so a probe there would make this container's
# health a function of the PUBLIC tier's — and the compose files already
# record what that costs: `depends_on: entrant: service_healthy` once put the
# whole origin, console and /api/ included, behind the health of the entrant
# app, so a sick entrant took the console down with it. nginx binds both
# listeners in the same process; if it is answering on 8080 it is listening on
# 8081.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
