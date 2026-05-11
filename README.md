# CP-SAT Tournament Scheduler

A single-day inter-school dual / tri-meet scheduler for badminton (and adjacent racquet sports). Built on Google OR-Tools CP-SAT with an interval-variable formulation, it produces optimal court assignments for tournaments where the same players play multiple events back-to-back.

It's designed for the operator running the day from a laptop in the corner of the gym: drag-to-reschedule, live solver progress, public TV display, and a proposal-review-commit pipeline so the schedule never silently changes.

---

## Features

**Scheduling**
- CP-SAT optimisation across courts, slots, players, rest, and game-spacing constraints
- Live SSE solver progress with phase / objective / gap streamed to the UI
- Top-N candidate pool — swap to an alternative without re-solving
- Drag-to-reschedule Gantt with hover-feasibility validation
- Inline match / roster / config authoring (no modal-per-edit)

**Live operations** *(new)*
- **Proposal pipeline** — every change (replan, repair, drag, director action) shows a full impact diff (who's affected, what moves, time deltas, infeasibility warnings) **before** committing. Optimistic-concurrency-locked, atomic swap, rolling 5-entry audit history.
- **Advisories** — 15 s polling surfaces overruns, no-shows, running-behind, start-delay, approaching-blackout. Each one carries a one-click action.
- **Suggestions Inbox** *(new)* — a background re-optimization worker continuously checks for better schedules; matched proposals appear as a one-click "Apply" rail under the advisory bar, so directors don't need to know when to re-plan. Mutations (Undo, Call, Start, Score) never wait on the solver.
- **Director time-axis tools** — delay tournament start, insert lunch break, close / reopen courts (full-day or time-bounded). All flow through the proposal pipeline.
- **Move / postpone single match** — everyday counterpart to the heavier replan flow.
- **Court closures persist** across solves — every generate, replan, and repair routes around closed courts and closed time-windows.

**Display**
- Public TV view (`/display`) with courts / schedule / standings modes, fullscreen, theme-aware
- Operator Live tab with traffic-light status per match, rest indicators, score editor

---

## Quick start

Requires Docker (with Compose v2) and — for dev mode only — Node 20+.

### Production (Docker)

```bash
make run        # build + start → http://localhost
make stop
make logs
make rebuild    # nuclear rebuild when UI changes aren't showing up
```

After `make run`:
- Frontend: <http://localhost>
- Backend:  <http://localhost:8000>
- API docs: <http://localhost:8000/docs>

### Development

```bash
make dev        # backend in Docker, Vite dev server on :5173
```

Vite proxies `/api/*` to the FastAPI container so front and back share an origin in dev too.

### Configuration

Defaults work out of the box. Copy `.env.example` → `.env` only when you need to remap:

| Variable                | Default | Purpose                                                                 |
| ----------------------- | ------- | ----------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`  | `btp`   | Namespaces containers/networks/volumes — change to run two stacks side by side. |
| `FRONTEND_HOST_PORT`    | `80`    | Host port for the nginx frontend.                                       |
| `BACKEND_HOST_PORT`     | `8000`  | Host port for the FastAPI backend.                                      |

Compose auto-loads `.env` from the repo root; no flags needed.

### Tests

```bash
cd src && pytest                   # backend + solver (~170 tests)
make test-e2e-install              # one-time
make test-e2e                      # Playwright end-to-end (boots stack, tears down)
make test-e2e-dev                  # run against `make dev` on :5173
```

---

## Tech stack

- **Backend** — Python 3.11 · FastAPI · Google OR-Tools (CP-SAT) · SSE for solver progress
- **Frontend** — React 19 · TypeScript · Vite · Zustand · Tailwind · dnd-kit · Radix
- **Persistence** — JSON files with atomic writes, SHA-256 integrity, rolling backups
- **Deployment** — Docker Compose (nginx → FastAPI)

---

## Layout

```
backend/                 FastAPI routes + adapters (HTTP boundary)
src/scheduler_core/      CP-SAT engine — domain models, constraint plugins, solver
src/adapters/            Sport-specific adapters (badminton)
src/tests/               Backend + solver tests
frontend/src/            React app (shell, tabs, DragGantt, SolverHud, dialogs, TV)
e2e/                     Playwright specs
docs/                    Smoke walkthroughs, feature guides
```

---

## Documentation

For working in the code:

- [`BACKEND.md`](./BACKEND.md) — FastAPI routes, request lifecycle, how to add an endpoint or a constraint
- [`FRONTEND.md`](./FRONTEND.md) — shell + tabs, Zustand store split, data flow, theme system
- [`src/scheduler_core/README.md`](./src/scheduler_core/README.md) — CP-SAT model: variables, constraint plugins, soft penalties
- [`docs/proposal-pipeline-smoke.md`](./docs/proposal-pipeline-smoke.md) — manual end-to-end walkthrough of the proposal pipeline + director tools

Each major directory under `frontend/src/` (`features/`, `hooks/`, `store/`, `api/`, `utils/`, `components/`) carries its own `README.md` for local conventions.

---

## Status

Works as designed for **a single operator running one tournament from one laptop**. Multi-worker / multi-user / internet-facing deployments need additional work — see the architecture caveats in [`BACKEND.md`](./BACKEND.md).
