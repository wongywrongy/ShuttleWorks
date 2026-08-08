# syntax=docker/dockerfile:1.7
# Entrant tier Dockerfile — the public React Router 7 SSR app (spec §5,
# ruling R8-A). Serves everything under `/e/` that is not `/e/api/` or
# `/e/account/`; nginx (`products/scheduler/frontend/nginx.conf`) does the
# split and strips the operator cookie on the way in.
#
# Build context = repo root, same as the backend and frontend Dockerfiles,
# because `npm ci` needs the root lockfile and this app imports
# `@scheduler/design-system` from the workspace.
#
# ─────────────────────────────────────────────────────────────────────────
# THIS IMAGE RUNS THE BUILT OUTPUT AND MUST NEVER RUN `react-router dev`.
#
# In `development` mode React Router serializes a thrown error's MESSAGE and
# its ABSOLUTE-PATH STACK TRACE into `window.__reactRouterContext`, which is
# rendered into the HTML of a public page — every visitor gets the container
# filesystem layout and whatever an exception happened to say. `npm start`
# (`react-router-serve ./build/server/index.js`) is the production path;
# `@react-router/serve` passes `process.env.NODE_ENV` through as the render
# mode, so `NODE_ENV=production` below is the switch, not decoration.
#
# Two things pin it: `ENV NODE_ENV=production` here, and
# `tests/deployStacks.test.ts`, which reads this file plus every compose
# service that runs it and fails if the command is a dev server or if any of
# them sets NODE_ENV to anything else.
# ─────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app

# Lockfile + every workspace manifest first, so `npm ci` lands on its own
# cacheable layer that source edits do not bust. Same layout as
# products/scheduler/frontend/Dockerfile.
COPY package.json package-lock.json ./
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY products/scheduler/frontend/package.json ./products/scheduler/frontend/package.json
COPY products/scheduler/entrant/package.json ./products/scheduler/entrant/package.json

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# The design system ships as raw .tsx (its exports map points at source), so
# the SSR bundler transpiles it — it has to be present, not just installed.
COPY packages/design-system ./packages/design-system
COPY products/scheduler/entrant ./products/scheduler/entrant

RUN npm run -w products/scheduler/entrant build


FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# node_modules comes across whole rather than pruned. `npm prune --omit=dev`
# on a workspace tree removes packages by a resolution walk that has no test
# here, and the failure it would produce — a missing runtime dependency —
# appears as a crash on first request in a deployed stack, which is a poor
# trade for image size. The runtime deps (react, react-dom, react-router,
# @react-router/node, @react-router/serve) are hoisted to the root
# node_modules, so this is the tree `npm start` resolves against.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/design-system ./packages/design-system
COPY --from=builder --chown=node:node /app/products/scheduler/entrant ./products/scheduler/entrant

USER node
WORKDIR /app/products/scheduler/entrant

# `react-router-serve` defaults to 3000 and honours PORT. nginx proxies to
# `entrant:3000`; changing one without the other is a 502.
EXPOSE 3000

# Probe 127.0.0.1 for the same reason the frontend image does: `localhost`
# resolves to ::1 first and the server binds IPv4. `/e/health` and not `/`:
# the app's basename is `/e/`, so `/` matches no route and answers 404.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/e/health || exit 1

# `npm start` -> `react-router-serve ./build/server/index.js`. NEVER `dev`.
CMD ["npm", "start"]
