# Entrant — public entrant site (SSR)

The public-facing entry site: React Router 7, server-rendered. This is the surface entrants and
spectators use — distinct from the operator product (the Vite SPA in `products/scheduler/frontend`),
which is where a tournament director runs the event. Both talk to the same FastAPI backend.

## Running it locally

This app is **local-dev only** for now — no nginx, no compose, no tunnel (those land later, see
`docs/programs/CLOUD_PROGRESS.md`). The port map, kept consistent everywhere it's documented:

| Surface | Port | Command |
| --- | --- | --- |
| Backend (host uvicorn) | 8600 | `uvicorn app.main:app --port 8600` from `products/scheduler/backend` |
| Operator product (SPA) | 5173 | `npm run dev:scheduler` |
| Public entrant site (SSR) | 5174 | `npm run dev:entrant` |

From the repo root:

```bash
make entrant-dev     # this app alone, on :5174, against a host backend on :8600
make local-dev       # both surfaces at once: operator :5173 + entrant :5174
```

Either way, **start the backend first** — a host `uvicorn` on :8600 (see below). `make entrant-dev`
and `make local-dev` only launch the frontend surfaces.

### The trap: Docker vs. host backend

`products/scheduler/frontend/vite.config.ts` defaults its `/api` proxy to `:8000` — exactly where
the **Docker** backend listens. If the Docker stack is still up when you start a host backend, the
browser keeps talking to the *container* (a possibly weeks-stale baked image, plus its
bind-mounted `data/local.db`), while your host `uvicorn` on `:8600` serves nothing at all. Backend
edits then silently "don't work," with no error to point at why.

Before running a host backend:

1. `docker ps` — check whether the Docker stack is up.
2. `make stop` — stop it if so.
3. Run the host backend on **`:8600`**, not `:8000`. Port 8000 sits in a Windows-reserved port
   range; a host `uvicorn` bound to it dies immediately with `PermissionError`.

```bash
# from products/scheduler/backend, with the repo .venv active
uvicorn app.main:app --port 8600
```

Then point the frontend proxy at it — `make entrant-dev` / `make local-dev` already set
`VITE_API_PROXY_TARGET=http://localhost:8600` for you.

## Tests

```bash
npm --prefix products/scheduler/entrant run test:run     # vitest
npm --prefix products/scheduler/entrant run typecheck     # react-router typegen + tsc
```
