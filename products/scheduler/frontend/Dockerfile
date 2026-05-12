# Frontend Dockerfile — multi-stage production build with npm workspaces.
#
# Build context = repo root (set in products/scheduler/docker-compose.yml).
# That lets us copy the workspace root (package.json + lockfile) plus the
# shared @scheduler/design-system package so `npm ci` resolves the full
# workspace graph the same way it does on the developer's machine.
#
# Stage 1: build the React app with node:20-alpine.
# Stage 2: serve the compiled assets with the nginx-unprivileged image,
# which runs as UID 101 by default and listens on port 8080 (non-root
# can't bind to <1024). Compose remaps 80:8080 so users still hit
# http://localhost.

FROM node:20-alpine AS builder

WORKDIR /app

# Workspace root files (package.json declares workspaces; root lockfile
# is canonical since Phase 2a consolidated per-product lockfiles).
COPY package.json package-lock.json ./

# Shared design-system package — consumed by the frontend as
# `@scheduler/design-system`. npm symlinks it from node_modules at install
# time, so it MUST be present in the build context.
COPY packages/design-system ./packages/design-system

# This product's frontend source.
COPY products/scheduler/frontend ./products/scheduler/frontend

# Install the workspace graph. We let npm install all workspaces — it's
# only marginally slower than filtering, and avoids the brittleness of
# `npm ci -w` flag combinations on edge cases.
RUN npm ci

# Build args — baked into the static bundle at build time.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build via the workspace runner so paths resolve correctly.
RUN npm run -w products/scheduler/frontend build


# Stage 2 — serve with the non-root nginx image.
FROM nginxinc/nginx-unprivileged:alpine

COPY products/scheduler/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# nginx-unprivileged already owns /usr/share/nginx/html as UID 101.
COPY --from=builder --chown=101:101 \
    /app/products/scheduler/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
