# Entrant — public entrant site (SSR)

The public-facing entry site: React Router 7, server-rendered. This is the surface entrants and
spectators use — distinct from the operator product (the Vite SPA in `apps/console`),
which is where a tournament director runs the event. Both talk to the same FastAPI backend.

## Running it locally

This app runs locally as an SSR development server and in the managed Docker Compose
stack used by the entrant evidence suite. The local port map is:

| Surface | Port | Command |
| --- | --- | --- |
| Backend (host uvicorn) | 8600 | `uvicorn core.main:app --port 8600` from `apps/api/src` |
| Operator product (SPA) | 5173 | `npm run dev:scheduler` |
| Public entrant site (SSR) | 5174 | `npm run dev:entrant` |

From the repo root:

```bash
make entrant-dev     # this app alone, on :5174, against a host backend on :8600
make full-dev        # both surfaces at once: operator :5173 + entrant :5174
```

Either way, **start the backend first** — a host `uvicorn core.main:app --port 8600` from
`apps/api/src` with the repo `.venv` active. `make entrant-dev` and `make full-dev`
only launch the frontend surfaces. `make full-dev` backgrounds both processes with `&`,
so run it from a POSIX-compatible shell; on `cmd.exe`, use separate terminals.

For managed Compose evidence, use `make test-e2e` (the Makefile assigns
non-conflicting host ports) or `make test-e2e-rebuild`. Stop the Docker stack first
when switching to host-backed development: see the Docker-vs-host-backend trap in
[docs/how-to/running-locally.md](../../docs/how-to/running-locally.md#running-both-surfaces-locally-operator-product--public-entrant-site).

### Which backend variable is which

The two surfaces read **different** variables, and swapping them fails silently:

| Variable | Read by | Effect |
| --- | --- | --- |
| `API_BASE_URL` | this app's SSR server (`apps/entrant/app/lib/apiFetch.server.ts`) | The API origin. Unset **throws** — every API-backed route 500s. |
| `VITE_API_PROXY_TARGET` | the operator SPA only (`apps/console/vite.config.ts`) | Retargets the SPA's `/api` dev proxy. Does nothing here. |

`make entrant-dev` sets `API_BASE_URL=http://localhost:8600`; `make full-dev` sets that plus
`VITE_API_PROXY_TARGET=http://localhost:8600` for the SPA.

## Tests

```bash
npm --prefix apps/entrant run test:unit    # pure/unit tests (fast feedback)
npm --prefix apps/entrant run test:ssr     # request-level SSR tests
npm --prefix apps/entrant run test:run     # every entrant test
npm --prefix apps/entrant run typecheck     # react-router typegen + tsc
```
