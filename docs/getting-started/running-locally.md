# Running locally

ShuttleWorks runs as a Docker Compose stack: an nginx-served React frontend in front of a
FastAPI backend that embeds the CP-SAT solver. In **dev mode** the frontend is served by Vite
(with HMR) and proxies `/api/*` to the backend container.

## Prerequisites

- **Docker** with Compose v2 — for the production-shape stack.
- **Node 22+** — only needed for the Vite dev server and the docs site.
- (Backend tests) Python 3.11.

## The two ways to run

The top-level `Makefile` is the chooser most people use; `products/scheduler/Makefile` holds the
product-local targets.

```bash
# From the repo root — the top-level chooser
make scheduler          # build + start → http://localhost (frontend), backend on :8000
make scheduler-dev      # backend in Docker, Vite dev server on :5173 (HMR)
make stop               # stop the stack
make help               # full target list
```

```bash
# From products/scheduler/ — product-local targets
make run                # production-shape: build + start → http://localhost
make dev                # backend in Docker, Vite dev server on :5173
make logs               # tail the stack
make rebuild            # nuclear rebuild when UI changes aren't showing up
make stop
```

After it is up:

| Surface | URL |
| --- | --- |
| Frontend (prod-shape) | <http://localhost> |
| Frontend (dev, Vite + HMR) | <http://localhost:5173> |
| Backend (FastAPI) | <http://localhost:8000> |
| **Interactive API docs (Swagger UI)** | <http://localhost:8000/docs> |
| Public TV display | `http://localhost/display?tournament_id=<id>` |

In dev, Vite proxies `/api/*` to the FastAPI container, so the front and back share an origin
just as they do in production.

## Running both surfaces locally: operator product + public entrant site

There are now two frontends against one backend: the **operator product** (the Vite SPA above,
`products/scheduler/frontend`) that a tournament director uses, and the **public entrant site**
(`products/scheduler/entrant`, React Router 7, SSR) that entrants and spectators use. This recipe
is deliberately **local only** — no nginx, no compose, no tunnel yet.

| Surface | Port | Command |
| --- | --- | --- |
| Backend (host uvicorn) | `:8600` | `uvicorn app.main:app --port 8600` from `products/scheduler/backend` |
| Operator product (SPA) | `:5173` | `npm run dev:scheduler` |
| Public entrant site (SSR) | `:5174` | `npm run dev:entrant` |

```bash
# From the repo root
make entrant-dev        # just the entrant site, on :5174, against a host backend on :8600
make local-dev          # both frontends at once: operator :5173 + entrant :5174
```

Both targets assume a host backend is already running on `:8600` — they only launch frontends.
`make local-dev` backgrounds the first server with `&`, so **run it from Git Bash**; under
`cmd.exe` `&` sequences instead of backgrounding and the operator SPA blocks forever.

**Two backend variables, one per surface — swapping them fails silently.** The entrant SSR server
reads `API_BASE_URL` (`entrant/app/lib/apiFetch.server.ts`, which *throws* when it is unset, so
every API-backed route 500s). `VITE_API_PROXY_TARGET` is read only by the operator SPA's dev proxy
(`frontend/vite.config.ts`) and does nothing for the entrant app. The Make targets set each on the
surface that reads it. Ports are passed as `--port`; a `PORT` env var is ignored by both dev
servers.

**The trap this exists to warn about.** `products/scheduler/frontend/vite.config.ts` defaults its
`/api` proxy to `:8000`, which is exactly where the **Docker** backend listens. If the Docker
stack is still up when you start a host backend, the browser keeps talking to the *container* — a
possibly weeks-stale baked image, plus its bind-mounted `data/local.db` — while your host
`uvicorn` on `:8600` serves nothing. Backend edits then silently "don't work," with nothing to
point at why. Before running a host backend:

1. `docker ps` — check whether the Docker stack is up.
2. `make stop` — stop it if so.
3. Run the host backend on `:8600`, not `:8000`. Port `8000` sits in a Windows-reserved port
   range, so a host `uvicorn` bound to it dies immediately with `PermissionError`.

See `products/scheduler/entrant/README.md` for the entrant app's own copy of this recipe.

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

Drop a `backend/.env` with `ENVIRONMENT=cloud` to flip into the multi-tenant cloud runtime:
Postgres instead of SQLite, standalone `python -m worker` containers instead of the embedded
worker, and real accounts instead of the bootstrap identity. It fails closed at startup without
Postgres, `AUTH_MODE=cloud`, `SESSION_COOKIE_SECURE=true`, and SMTP — see
`products/scheduler/docker-compose.cloud.yml` and `backend/README.md`.

## Tests

```bash
# Backend + solver unit tests — from products/scheduler/
pip install -r backend/requirements-dev.txt    # one-time (pulls in pytest + httpx)
pytest

# Frontend unit/component tests — from products/scheduler/frontend/
npm run test:run        # vitest + jsdom + React Testing Library
npx tsc -b              # type gate
npm run build           # build gate

# End-to-end (Playwright against the compose stack) — from products/scheduler/
make test-e2e-install   # one-time, downloads browsers
make test-e2e           # boots stack, runs specs, tears down
make test-e2e-dev       # run against `make dev` on :5173
```

## This documentation site

The docs you are reading are a VitePress site rooted at `docs/`. From the repo root:

```bash
npm run docs:dev        # local dev server with hot reload
npm run docs:build      # static build → docs/.vitepress/dist (fails on broken internal links)
npm run docs:preview    # serve the built site
```

`docs:build` deliberately fails on broken internal links — it is the verification gate for the
docs. See [Repo layout](/getting-started/repo-layout) for how the site is structured.
