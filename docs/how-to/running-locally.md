# Running locally

ShuttleWorks runs as a Docker Compose stack: an nginx-served React frontend in front of a
FastAPI backend that embeds the CP-SAT solver. In **dev mode** the frontend is served by Vite
(with HMR) and proxies `/api/*` to the backend container.

## Prerequisites

- **Docker** with Compose v2 — for the production-shape stack.
- **Node 24+** — only needed for the Vite dev server and the docs site.
- (Backend tests) Python 3.12.

## The two ways to run

The top-level `Makefile` is the only one; SP-REORG-1 folded the former product Makefile into it, so it holds the
product-local targets.

```bash
# From the repo root — the top-level chooser
make scheduler          # build + start → http://localhost (frontend), backend on :8000
make scheduler-dev      # backend in Docker, Vite dev server on :5173 (HMR)
make stop               # stop the stack
make help               # full target list
```

After it is up:

| Surface | URL |
| --- | --- |
| Frontend (prod-shape) | <http://localhost> |
| Frontend (dev, Vite + HMR) | <http://localhost:5173> |
| Backend (FastAPI) | <http://localhost:8000> |
| **Interactive API docs (Swagger UI)** | <http://localhost:8000/docs> |
| Public TV display | `http://localhost/display?token=<display-token>` |

## Tailscale tech demo on a Linux server

For a disposable, production-shaped demo on a headless Linux host, use the
Tailscale-only targets. They detect the host's `100.64.0.0/10` address and bind
the published ports to that address, so the services are reachable by other
tailnet devices without opening them on the LAN or public interfaces.

```bash
make demo-up
make demo-status
```

The launcher prints the exact address, which has this shape:

| Surface | Port |
| --- | --- |
| Operator console | `8090` |
| Public entrant site (`/e/`) | `8091` |
| FastAPI + Swagger (`/docs`) | `8092` |

The demo uses `AUTH_MODE=local`, a separate Compose project, and
`.local-testing/demo/data/`, so it does not share the normal local database.
`make demo-down` stops it. `make demo-reset` stops the stack and moves the old
demo directory to a timestamped archive before creating an empty one. No
Cloudflare Funnel or public tunnel is configured.

The two web surfaces use different demo ports, which are different browser
origins, while nginx still applies the entrant cookie allowlist. This port
layout is for the private tech demo only; production deployments must keep
the operator and entrant surfaces on distinct hostnames as documented in the
self-host deployment guide.

If Tailscale is installed but its address is not discovered automatically, set
`DEMO_TAILSCALE_IP` to the host's `100.x` address for the command. The launcher
rejects any address outside the Tailscale IPv4 range rather than falling back
to a broad bind.

The repository includes checked, resumable BWF historical-finals and companion
timing/format fixtures. Preview validates both files against each other without
touching the database. To load all audited match rows, keep the third-party
files outside the repository and provide their paths:

```bash
git clone https://github.com/SahilMotyar/bwf-match-data /tmp/bwf-match-data
# Save the configured Japan and China daily-result URLs as local HTML files.
make demo-seed-preview \
  DEMO_MATCH_DATA=/tmp/bwf-match-data/matches.csv \
  DEMO_JAPAN_RESULTS=/tmp/japan-open-2026.html \
  DEMO_CHINA_RESULTS=/tmp/china-open-2026.html
make demo-seed-apply \
  DEMO_MATCH_DATA=/tmp/bwf-match-data/matches.csv \
  DEMO_JAPAN_RESULTS=/tmp/japan-open-2026.html \
  DEMO_CHINA_RESULTS=/tmp/china-open-2026.html
make demo-seed-status
```

The full-source apply creates 30 historical bracket workspaces and 4,235
verified results. Japan is complete at 155 rows; China exposes 153 of 155;
Taipei and Korea remain five-finals-only. Every page states its exact scope.
The importer does not synthesize the absent rows or feeder topology. Without
the optional paths the target retains the original 150-finals-only behaviour.
The upstream CSV has no formal redistribution license, so it is consumed from
a local clone and never copied into this repository.
Re-running the same source is a no-op; `make demo-seed-resume` continues an
interrupted run. `make demo-seed-reset` requires the seed key as confirmation
and deletes only workspace IDs recorded in that run's manifest.

In dev, Vite proxies `/api/*` to the FastAPI container, so the front and back share an origin
just as they do in production.

## Running both surfaces locally: operator product + public entrant site

There are now two frontends against one backend: the **operator product** (the Vite SPA above,
`apps/console`) that a tournament director uses, and the **public entrant site**
(`apps/entrant`, React Router 7, SSR) that entrants and spectators use. This recipe
is deliberately **local only** — no nginx, no compose, no tunnel yet.

| Surface | Port | Command |
| --- | --- | --- |
| Backend (host uvicorn) | `:8600` | `uvicorn core.main:app --port 8600` from `apps/api/src` |
| Operator product (SPA) | `:5173` | `npm run dev:scheduler` |
| Public entrant site (SSR) | `:5174` | `npm run dev:entrant` |

```bash
# From the repo root
make entrant-dev        # just the entrant site, on :5174, against a host backend on :8600
make full-dev           # both frontends at once: operator :5173 + entrant :5174
```

Both targets assume a host backend is already running on `:8600` — they only launch frontends.
`make full-dev` backgrounds the first server with `&`, so **run it from Git Bash**; under
`cmd.exe` `&` sequences instead of backgrounding and the operator SPA blocks forever.

**Two backend variables, one per surface — swapping them fails silently.** The entrant SSR server
reads `API_BASE_URL` (`entrant/app/lib/apiFetch.server.ts`, which *throws* when it is unset, so
every API-backed route 500s). `VITE_API_PROXY_TARGET` is read only by the operator SPA's dev proxy
(`apps/console/vite.config.ts`) and does nothing for the entrant app. The Make targets set each on the
surface that reads it. Ports are passed as `--port`; a `PORT` env var is ignored by both dev
servers.

**The trap this exists to warn about.** `apps/console/vite.config.ts` defaults its
`/api` proxy to `:8000`, which is exactly where the **Docker** backend listens. If the Docker
stack is still up when you start a host backend, the browser keeps talking to the *container* — a
possibly weeks-stale baked image, plus its bind-mounted `data/local.db` — while your host
`uvicorn` on `:8600` serves nothing. Backend edits then silently "don't work," with nothing to
point at why. Before running a host backend:

1. `docker ps` — check whether the Docker stack is up.
2. `make stop` — stop it if so.
3. Run the host backend on `:8600`, not `:8000`. Port `8000` sits in a Windows-reserved port
   range, so a host `uvicorn` bound to it dies immediately with `PermissionError`.

See `apps/entrant/README.md` for the entrant app's own copy of this recipe.

## Configuration

Defaults work out of the box. The stack runs in **local mode**: SQLite is the source of
truth, the solve worker runs inside the API process, and requests without a session resolve
to the zero-friction bootstrap identity. Copy
`.env.example` → `.env` (Compose auto-loads it from the repo root) only when you need to remap:

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `btp` | Namespaces containers/networks/volumes — change it to run two stacks side by side. |
| `FRONTEND_HOST_PORT` | `80` | Host port for the nginx frontend. |
| `BACKEND_HOST_PORT` | `8000` | Host port for the FastAPI backend. |

### Cloud mode

Drop a deployment `.env` (for example, copy `infra/compose/.env.selfhost.example`) with
`ENVIRONMENT=cloud` to flip into the multi-tenant cloud runtime:
Postgres instead of SQLite, standalone `python -m worker` containers instead of the embedded
worker, and real accounts instead of the bootstrap identity. It fails closed at startup without
Postgres, `AUTH_MODE=cloud`, `SESSION_COOKIE_SECURE=true`, and SMTP — see
`infra/compose/docker-compose.cloud.yml` and `apps/api/README.md`.

## Tests

```bash
# Backend + solver unit tests — from the repo root
pip install -r apps/api/requirements-dev.txt  # one-time (pulls in pytest + httpx)
pytest

# Frontend unit/component tests — from apps/console/
npm run test:run        # vitest + jsdom + React Testing Library
npx tsc -b              # type gate
npm run build           # build gate

# Entrant tests — from the repo root
npm run test:entrant:unit  # pure/unit tests (fast feedback)
npm run test:entrant:ssr   # request-level SSR tests
npm run test:entrant       # every entrant test

# Local check tiers — from the repo root
make check-fast            # iteration-sized lint, type, unit, and backend checks
make check                 # complete local compatibility gate

# End-to-end (Playwright; maintained owners run serially) — from the repo root
make test-e2e-install   # one-time, downloads browsers
make test-e2e           # entrant evidence only; boots compose stack, then tears down
make test-e2e-rebuild   # entrant evidence only; forces an image rebuild
make full-dev           # operator :5173 + entrant :5174 (backend on :8600)
make test-e2e-dev       # entrant evidence against those dev origins
```

| Workflow | Owner | Runner and prerequisite |
| --- | --- | --- |
| Public entrant layout, IA, CSP and headers | `10-entrant-r11-evidence.spec.ts` | `make test-e2e` on managed compose, or `make test-e2e-dev` after `make full-dev` |
| Operator/Operations interactions, viewer lockout and public display | `interaction-smoke.spec.ts` | CI only, with the prepared harness build and seeded IDs/token |
| Backend state, solving, import and persistence | Backend/unit suites | `make check` and focused backend tests |

## This documentation site

The docs you are reading are a VitePress site rooted at `docs/`. From the repo root:

```bash
npm run docs:dev        # local dev server with hot reload
npm run docs:build      # static build → docs/.vitepress/dist (fails on broken internal links)
npm run docs:preview    # serve the built site
```

`docs:build` deliberately fails on broken internal links — it is the verification gate for the
docs. See [Repo layout](/reference/repo-layout) for how the site is structured.
