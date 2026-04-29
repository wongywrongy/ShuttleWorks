# CP-SAT Tournament Scheduler

Single-day inter-school dual / tri-meet scheduler for badminton.
CP-SAT interval model under the hood, drag-to-reschedule Gantt + live
solver HUD on the front. Inline authoring (no modals), public TV
display, schedule import/export, targeted disruption repair, and
warm-start "re-plan from here".

## Tech stack

- **Backend** — Python 3.11 · FastAPI · Google OR-Tools (CP-SAT,
  interval-variable formulation) · SSE for live solver progress
- **Frontend** — React 19 · TypeScript · Vite 7 · Zustand · Tailwind ·
  dnd-kit · Radix UI primitives
- **Deployment** — Docker Compose (nginx → FastAPI)
- **Testing** — pytest (backend, solver) · Playwright (end-to-end)

## Run

### Production (Docker)

```bash
make run        # build + start → http://localhost
make stop
make logs
```

### Development

```bash
make dev        # backend in Docker, Vite dev server on :5173
```

The Vite dev server proxies `/api/*` to the FastAPI container so
front and back share an origin in dev as well as in prod.

### End-to-end tests

```bash
make test-e2e-install   # one-time: Playwright + Chromium
make test-e2e           # boot stack, run specs, tear down
make test-e2e-rebuild   # force Docker image rebuild first
make test-e2e-dev       # run against Vite dev (requires `make dev` running)
```

### Backend / solver unit tests

```bash
cd backend && pytest    # FastAPI HTTP layer
cd src && pytest        # scheduler_core engine + constraints
```

## Layout

```
backend/                FastAPI app + routes (HTTP boundary only)
src/scheduler_core/     CP-SAT engine — domain models, constraint plugins, solver
src/adapters/           Sport-specific adapters (badminton)
src/tests/              Solver unit tests
frontend/src/           React app (shell, tabs, DragGantt, SolverHud, TV display)
e2e/                    Playwright specs + fixtures
docker-compose.yml      nginx frontend → FastAPI backend
Makefile                make targets
```

## Architecture docs

For working in the codebase, start here:

- [`BACKEND.md`](./BACKEND.md) — FastAPI routes, request lifecycle,
  how to add an endpoint or a constraint.
- [`FRONTEND.md`](./FRONTEND.md) — shell + tabs, Zustand store split,
  data flow, theme system, how to add a tab.
- [`src/scheduler_core/README.md`](./src/scheduler_core/README.md) —
  CP-SAT model: variables, constraint plugins, soft penalties.

Each major directory under `frontend/src/` carries its own
`README.md` describing local conventions (`features/`, `hooks/`,
`store/`, `api/`, `utils/`, `components/`).
