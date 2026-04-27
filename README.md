# CP-SAT Tournament Scheduler

Single-day inter-school dual/tri-meet scheduler. Drag-to-reschedule Gantt, live
solver HUD, inline authoring. CP-SAT interval model under the hood; everything
else in the UI.

## Tech stack

- **Backend** — Python 3.11 · FastAPI · Google OR-Tools (CP-SAT, interval-variable formulation) · SSE for streaming solver progress
- **Frontend** — React 19 · TypeScript · Vite 7 · Zustand · Tailwind · dnd-kit · Radix UI primitives
- **Deployment** — Docker Compose (nginx → FastAPI)
- **Testing** — pytest (backend) · Playwright (end-to-end)

## Run

### Production (Docker)

```bash
make run        # build + start → http://localhost
make stop
make logs
```

### Development (hybrid)

```bash
make dev        # backend in Docker + Vite dev server on :5173
```

### End-to-end tests

```bash
make test-e2e-install   # one-time: Playwright + Chromium
make test-e2e           # boot stack, run specs, tear down
make test-e2e-rebuild   # force Docker image rebuild first
make test-e2e-dev       # run against Vite dev (needs `make dev` running)
```

### Backend unit tests

```bash
cd backend && pytest
```

## Layout

```
backend/                FastAPI app + routes
src/scheduler_core/     CP-SAT engine (interval model + validator)
frontend/src/           React app (shell, tabs, DragGantt, SolverHud)
e2e/                    Playwright specs + fixtures
docker-compose.yml      nginx frontend → backend
Makefile                make targets
```

## Architecture docs

For working in the codebase, start here:

- [`BACKEND.md`](./BACKEND.md) — FastAPI request lifecycle, route map,
  how to add an endpoint or constraint.
- [`FRONTEND.md`](./FRONTEND.md) — shell + tabs, Zustand store split,
  data flow, theme system, how to add a tab.
- [`src/scheduler_core/README.md`](./src/scheduler_core/README.md) —
  CP-SAT model: variables, hard constraints, soft penalties.

Each major directory under `frontend/src/` has its own `README.md`
covering the local conventions (`features/`, `hooks/`, `store/`,
`api/`, `utils/`, `components/`).
