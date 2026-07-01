# syntax=docker/dockerfile:1.7
# Docs Dockerfile — the VitePress documentation site, built and served as a
# static bundle. Mirrors the frontend Dockerfile: a node build stage produces
# the static output, then the nginx-unprivileged image serves it.
#
# Build context = repo root (set in products/scheduler/docker-compose.yml).
# That lets `npm ci` resolve the same workspace graph as the developer machine
# and see the root-level VitePress devDependency, and lets stage 1 COPY the
# docs/ tree that the build reads.
#
# Stage 1: build the site with node:20-alpine. Copy the lockfile + each
# workspace's package.json FIRST so `npm ci` lands on its own cacheable layer —
# editing a doc below doesn't bust the install.
# Stage 2: serve the compiled site with nginx-unprivileged (UID 101, port
# 8080). Compose remaps host 8081 -> 8080 so it stays clear of the app (:80)
# and the codanna MCP server (:8080).

FROM node:20-alpine AS builder

WORKDIR /app

# Workspace root files (package.json declares workspaces; root lockfile is
# canonical). VitePress is a root devDependency, installed from here.
COPY package.json package-lock.json ./

# Each workspace's package.json — `npm ci` needs them to resolve the workspace
# graph declared in the root manifest (same reason the frontend image copies
# them). The docs build reads none of their source, only the docs/ tree.
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY products/scheduler/frontend/package.json ./products/scheduler/frontend/package.json

# Install the workspace graph. Cache mount keeps the npm download cache across
# builds; `--no-audit --no-fund` shaves time and produces no CI signal.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# The docs tree is the only source the VitePress build reads.
COPY docs ./docs

# vitepress build docs -> docs/.vitepress/dist. The dead-link checker
# (ignoreDeadLinks in config.mts) runs here too, so a broken internal link
# fails the image build — matching the docs:build CI gate. The footer's
# gitStamp() try/catches a missing .git (excluded by .dockerignore), so no
# repo metadata is needed in the context.
RUN npm run docs:build


# Stage 2 — serve the static site with the non-root nginx image.
FROM nginxinc/nginx-unprivileged:alpine

COPY docs/nginx.conf /etc/nginx/conf.d/default.conf

# nginx-unprivileged already owns /usr/share/nginx/html as UID 101.
COPY --from=builder --chown=101:101 \
    /app/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 8080

# Probe 127.0.0.1 (not `localhost`): in this image `localhost` resolves to
# `::1` (IPv6) first, but nginx listens on IPv4 only, so a `localhost` probe is
# refused and the container reads "unhealthy" even though it serves fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
