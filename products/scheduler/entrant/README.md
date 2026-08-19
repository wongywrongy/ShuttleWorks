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

Either way, **start the backend first** — a host `uvicorn app.main:app --port 8600` from
`products/scheduler/backend` with the repo `.venv` active. `make entrant-dev` and `make local-dev`
only launch the frontend surfaces. `make local-dev` backgrounds with `&`, so **run it from Git
Bash** (under `cmd.exe` `&` sequences instead of backgrounding and the first server blocks forever).

Stop the Docker stack first: see the Docker-vs-host-backend trap in
[docs/getting-started/running-locally.md](../../../docs/getting-started/running-locally.md#running-both-surfaces-locally-operator-product--public-entrant-site).

### Which backend variable is which

The two surfaces read **different** variables, and swapping them fails silently:

| Variable | Read by | Effect |
| --- | --- | --- |
| `API_BASE_URL` | this app's SSR server (`app/lib/apiFetch.server.ts`) | The API origin. Unset **throws** — every API-backed route 500s. |
| `VITE_API_PROXY_TARGET` | the operator SPA only (`frontend/vite.config.ts`) | Retargets the SPA's `/api` dev proxy. Does nothing here. |

`make entrant-dev` sets `API_BASE_URL=http://localhost:8600`; `make local-dev` sets that plus
`VITE_API_PROXY_TARGET=http://localhost:8600` for the SPA.

## Tests

```bash
npm --prefix products/scheduler/entrant run test:run     # vitest
npm --prefix products/scheduler/entrant run typecheck     # react-router typegen + tsc
```
