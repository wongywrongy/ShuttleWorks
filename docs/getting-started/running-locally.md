# Running locally

ShuttleWorks runs as a Docker Compose stack: an nginx-served React frontend in front of a
FastAPI backend that embeds the CP-SAT solver. In **dev mode** the frontend is served by Vite
(with HMR) and proxies `/api/*` to the backend container.

## Prerequisites

- **Docker** with Compose v2 — for the production-shape stack.
- **Node 20+** — only needed for the Vite dev server and the docs site.
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

## Configuration

Defaults work out of the box. The stack runs in **local-only mode**: SQLite is the source of
truth, there is no Supabase replication, and a synthetic local-dev user is used. Copy
`.env.example` → `.env` (Compose auto-loads it from the repo root) only when you need to remap:

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `btp` | Namespaces containers/networks/volumes — change it to run two stacks side by side. |
| `FRONTEND_HOST_PORT` | `80` | Host port for the nginx frontend. |
| `BACKEND_HOST_PORT` | `8000` | Host port for the FastAPI backend. |

### Cloud-mirror mode

Drop a `backend/.env` with `ENVIRONMENT=cloud` plus `SUPABASE_URL` and `SUPABASE_ANON_KEY` to
flip into cloud-mirror mode: operator browsers read from Supabase Realtime and the outbox worker
pushes match + bracket writes to Postgres. The director's SQLite stays canonical regardless. The
full production setup (Tauri sidecar, Supabase project, Vercel display) is in
`docs/deploy/cloud.md` on disk.

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
