# syntax=docker/dockerfile:1.7
# Frontend Dockerfile — multi-stage production build with npm workspaces.
#
# Build context = repo root (set in products/scheduler/docker-compose.yml).
# That lets us copy the workspace root (package.json + lockfile) plus the
# shared @scheduler/design-system package so `npm ci` resolves the full
# workspace graph the same way it does on the developer's machine.
#
# Stage 1: build the React app with node:20-alpine. We copy lockfile +
# every workspace's package.json FIRST so `npm ci` lands on its own
# cacheable layer — source edits below don't bust it.
# Stage 2: serve the compiled assets with the nginx-unprivileged image,
# which runs as UID 101 by default and listens on port 8080 (non-root
# can't bind to <1024). Compose remaps 80:8080 so users still hit
# http://localhost.

FROM node:20-alpine AS builder

WORKDIR /app

# Workspace root files (package.json declares workspaces; root lockfile
# is canonical since Phase 2a consolidated per-product lockfiles).
COPY package.json package-lock.json ./

# Each workspace's package.json — required by `npm ci` to resolve the
# workspace graph. Source files come later so editing a .tsx doesn't
# invalidate the install layer.
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY products/scheduler/frontend/package.json ./products/scheduler/frontend/package.json

# Install the workspace graph. Cache mount keeps the npm download cache
# across builds; the cache mount itself is not part of the final layer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

# Now copy the full source for the workspaces we actually build.
COPY packages/design-system ./packages/design-system
COPY products/scheduler/frontend ./products/scheduler/frontend

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
