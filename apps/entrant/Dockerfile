# syntax=docker/dockerfile:1.7
# Entrant tier Dockerfile — the public React Router 7 SSR app (spec §5,
# ruling R8-A). Serves everything under `/e/` that is not `/e/api/` or
# `/e/account/`; nginx (`apps/console/nginx.conf`) does the
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
# filesystem layout and whatever an exception happened to say. The CMD at the
# bottom of this file (`react-router-serve` against the build) is the
# production path; `@react-router/serve` passes `process.env.NODE_ENV` through
# as the render mode, so `NODE_ENV=production` below is the switch, not
# decoration.
#
# Two things pin it: `ENV NODE_ENV=production` here, and
# `tests/deployStacks.test.ts`, which reads this file plus every compose
# service that runs it and fails if the command is a dev server or if any of
# them sets NODE_ENV to anything else. It asserts on the LAST `ENV NODE_ENV`
# and the LAST `CMD` in this file, because Docker honours the last of each —
# appending a contradicting line is exactly how this protection would be lost.
# ─────────────────────────────────────────────────────────────────────────

ARG SOURCE_REVISION=unknown

FROM node:24-alpine AS builder

WORKDIR /app

# Lockfile + every workspace manifest first, so `npm ci` lands on its own
# cacheable layer that source edits do not bust. Same layout as
# apps/console/Dockerfile.
COPY package.json package-lock.json ./
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY packages/shared-contract/package.json ./packages/shared-contract/package.json
COPY apps/console/package.json ./apps/console/package.json
COPY apps/entrant/package.json ./apps/entrant/package.json

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# The design system ships as raw .tsx (its exports map points at source), so
# the SSR bundler transpiles it — it has to be present, not just installed.
COPY packages/design-system ./packages/design-system
COPY packages/shared-contract ./packages/shared-contract
COPY apps/entrant ./apps/entrant

RUN npm run -w apps/entrant build


# Build a production dependency tree for this workspace only. Copying the
# builder's monorepo-wide node_modules into the runtime also copied unrelated
# console dependencies (including spreadsheet export libraries) into the
# public entrant image. Besides needless image weight, that made an unused
# console transitive vulnerability part of the entrant release artifact.
FROM node:24-alpine AS production-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY packages/shared-contract/package.json ./packages/shared-contract/package.json
COPY apps/console/package.json ./apps/console/package.json
COPY apps/entrant/package.json ./apps/entrant/package.json

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --workspace apps/entrant \
      --include-workspace-root=false --ignore-scripts --no-audit --no-fund


FROM node:24-alpine

ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION

ENV NODE_ENV=production

WORKDIR /app

# Pull fixed runtime libraries from the signed Alpine repository even when
# the immutable Node base digest predates a security update.
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm \
        /usr/local/bin/npx

# Runtime React and the production React Router server packages are hoisted
# at this root from the entrant-scoped production dependency stage. The
# entrant directory below retains the built server/client output.
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/design-system ./packages/design-system
COPY --from=builder --chown=node:node /app/apps/entrant/package.json ./apps/entrant/package.json
COPY --from=builder --chown=node:node /app/apps/entrant/build ./apps/entrant/build

USER node
WORKDIR /app/apps/entrant

# `react-router-serve` defaults to 3000 and honours PORT. nginx proxies to
# `entrant:3000`; changing one without the other is a 502.
EXPOSE 3000

# Probe 127.0.0.1 for the same reason the frontend image does: `localhost`
# resolves to ::1 first and the server binds IPv4. `/e/health` and not `/`:
# the app's basename is `/e/`, so `/` matches no route and answers 404.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/e/health || exit 1

# The server, exec'd directly — NOT `npm start`, and never `dev`.
#
# `npm start` put npm at PID 1 and cost two things. npm does not forward
# SIGTERM to the child, so `react-router-serve` never saw a stop signal and
# every `docker compose down` waited out the full 10s kill timeout. And npm
# wants a writable `$HOME/.npm` for its cache and logs, which `read_only: true`
# + `USER node` does not provide.
#
# Both go away by dropping npm from the runtime: node becomes PID 1 and
# `dist/cli.js` installs its own SIGTERM/SIGINT handlers (`server.close()`).
#
# Production pruning hoists `@react-router/serve` to the root tree. `bin.js`
# (the package's own entry) defaults NODE_ENV=production before requiring the
# CLI, so the render mode is belt-and-braces with the ENV above.
CMD ["node", "/app/node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
