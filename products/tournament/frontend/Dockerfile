# syntax=docker/dockerfile:1.7
# Tournament frontend — multi-stage production build with npm workspaces.
#
# Build context = repo root (set in products/tournament/docker-compose.yml).
# That lets us copy the workspace root (package.json + lockfile) plus the
# shared @scheduler/design-system package so `npm ci` resolves the full
# workspace graph.
#
# Multi-stage: build with node, serve the compiled bundle with the
# nginx-unprivileged image (UID 101, listens on 8080). The workspace
# package.json files come BEFORE source so `npm ci` lives on a cached
# layer that survives source-only edits.

FROM node:20-alpine AS builder

WORKDIR /app

# Workspace root metadata.
COPY package.json package-lock.json ./

# Each workspace's package.json — enough for `npm ci` to resolve the
# graph. Source comes later so editing a .tsx doesn't bust this layer.
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY products/tournament/frontend/package.json ./products/tournament/frontend/package.json

# Install the workspace graph. Cache mount keeps the npm download cache
# across builds without bloating the final image.
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

# Full source for the workspaces we actually build.
COPY packages/design-system ./packages/design-system
COPY products/tournament/frontend ./products/tournament/frontend

RUN npm run -w products/tournament/frontend build


FROM nginxinc/nginx-unprivileged:alpine

COPY products/tournament/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 \
    /app/products/tournament/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
