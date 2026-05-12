# Tournament frontend — multi-stage production build with npm workspaces.
#
# Build context = repo root (set in products/tournament/docker-compose.yml).
# That lets us copy the workspace root (package.json + lockfile) plus the
# shared @scheduler/design-system package so `npm ci` resolves the full
# workspace graph.
#
# Multi-stage: build with node, serve the compiled bundle with the
# nginx-unprivileged image (UID 101, listens on 8080).

FROM node:20-alpine AS builder

WORKDIR /app

# Workspace root metadata.
COPY package.json package-lock.json ./

# Shared design-system package (consumed via @scheduler/design-system).
COPY packages/design-system ./packages/design-system

# This product's frontend source.
COPY products/tournament/frontend ./products/tournament/frontend

# Install the workspace graph (root lockfile is canonical post Phase 2a).
RUN npm ci

RUN npm run -w products/tournament/frontend build


FROM nginxinc/nginx-unprivileged:alpine

COPY products/tournament/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 \
    /app/products/tournament/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
