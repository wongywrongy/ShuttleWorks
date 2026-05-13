# CP-SAT Tournament Scheduling — Monorepo

Two products sharing one CP-SAT engine. The scheduler runs as a Tauri
sidecar on the tournament director's laptop with SQLite as the source
of truth; Supabase mirrors the live match state to operator browsers
on other devices and to a public TV display.

| Product | Dev port | What it does |
| ------- | -------- | ------------ |
| **[Scheduler](./products/scheduler)** | <http://localhost> | Single-day inter-school dual / tri-meet operator cockpit. CP-SAT-optimised court assignments, drag-to-reschedule, proposal/repair pipeline, live SSE solver progress, idempotent command queue for browser operators, Supabase Realtime for the TV display, inline conflict UX. |
| **[Tournament](./products/tournament)** | <http://localhost:5174> | Bracket draws + multi-event tournament management: BWF-conformant single-elimination, round robin, import/export, live advancement. |

Both depend on the shared [`scheduler_core/`](./scheduler_core) — a
pure-Python CP-SAT engine with no HTTP / no I/O. Build your own
product on top by importing its dataclasses; the two products in
this repo are the worked examples.

---

## Quick start

Requires Docker (with Compose v2) for the dev stack. For dev-server
modes, also Node 20+.

```bash
make scheduler          # → http://localhost   (frontend), backend on :8000
make tournament         # → http://localhost:5174 (backend on :8765)
make both               # run them side-by-side on one Docker daemon
make stop               # stop both
make help               # full target list
```

Each product is namespaced (Compose project + host ports) so
`make both` just works on one machine.

For the scheduler's production deployment shape (Tauri sidecar on the
director's laptop + Supabase project for auth/replication + Vercel
for the public TV view), see [`docs/deploy/cloud.md`](./docs/deploy/cloud.md).

---

## Architecture (scheduler)

```
Director's laptop — Tauri desktop app
  ├── FastAPI sidecar (uvicorn, local port)
  │     ├── CP-SAT solver (OR-Tools)
  │     ├── SQLite via SQLAlchemy (source of truth)
  │     └── Sync service → Supabase Postgres (background outbox)
  │
  └── Tauri WebView (React frontend)

Operators / assistants — browser on any device
  ├── Read via Supabase Realtime
  └── Write via idempotent POST /commands → director's FastAPI

Public TV display — Vercel
  └── Reads Supabase Realtime (no auth required)

Supabase
  ├── Auth (identity for all users)
  ├── Postgres (cloud mirror of SQLite, not primary)
  └── Realtime (broadcasts writes to operators + TV)
```

The director's SQLite is the source of truth. Supabase is a mirror
populated by an outbox-pattern replicator; the tournament can
complete cleanly even if Supabase is unreachable for the entire day.

Full breakdown: [`docs/tech-stack.md`](./docs/tech-stack.md).

---

## Layout

```
scheduler_core/                shared CP-SAT engine (pure Python, no HTTP)
├── domain/                    dataclasses + sport-agnostic model
├── engine/                    CP-SAT backend + constraint plugins
└── README.md                  engine docs + plugin contract

products/
├── scheduler/                 day-of operator cockpit
│   ├── backend/               FastAPI + state machine + sync service + command log
│   │   ├── alembic/           SQLite + Postgres schema migrations
│   │   ├── api/               route handlers (commands, match-states, schedule, ...)
│   │   ├── app/               app + exceptions + constants + auth dependencies
│   │   ├── repositories/      LocalRepository + per-entity sub-repos
│   │   └── services/          match_state (transitions), sync_service (outbox)
│   ├── frontend/              React 19 + Zustand + IndexedDB command queue
│   │   └── src/lib/           commandQueue, realtime, supabase client
│   ├── e2e/                   Playwright specs
│   ├── tests/                 backend + solver tests (Vitest for frontend in src/)
│   ├── docker-compose.yml     dev stack
│   ├── Makefile               product-local targets
│   └── README.md              product docs
│
└── tournament/                bracket-draws tool (prototype)
    ├── backend/               FastAPI for events + draws
    ├── frontend/              React + Tailwind UI
    ├── tournament/            draw + advancement + format modules
    ├── docker-compose.yml     dev stack
    ├── Makefile               product-local targets
    └── README.md              product docs

examples/                      engine usage examples (product-agnostic)
docs/                          shared project planning artifacts
├── tech-stack.md              post-arc architecture + data model + flows
├── deploy/cloud.md            Tauri sidecar + Supabase deploy guide
└── changes/                   dated decision log
Makefile                       top-level chooser (this is what most people use)
```

---

## Tech stack

- **Engine** — Python 3.11 · Google OR-Tools (CP-SAT) · pure dataclasses
- **Scheduler backend** — FastAPI (sync via threadpool) · SQLAlchemy 2.0 · Alembic · SQLite (canonical) · Supabase Postgres (mirror via outbox) · Supabase Auth · SSE for solver progress
- **Scheduler frontend** — React 19 · TypeScript · Vite · Zustand · Tailwind · dnd-kit · Radix · IndexedDB command queue · Supabase Realtime (subscribe + polling fallback) · Vitest + jsdom + RTL
- **Scheduler shell** — Tauri (production); Docker Compose (dev)
- **Tournament** — FastAPI · React · TypeScript · Vite · Tailwind (unchanged from initial)
- **Deployment** — Tauri sidecar on the director's laptop (scheduler production) · Vercel for the public TV display · Supabase project (Auth + Postgres + Realtime). Docker Compose still works for local dev.

---

## Working in the code

For a deeper read of either product:

- [`products/scheduler/README.md`](./products/scheduler/README.md) — scheduler features, dev workflow, proposal pipeline, suggestions inbox
- [`products/scheduler/BACKEND.md`](./products/scheduler/BACKEND.md) — FastAPI routes, request lifecycle, how to add an endpoint or a constraint
- [`products/scheduler/FRONTEND.md`](./products/scheduler/FRONTEND.md) — shell + tabs, store split, theme system
- [`docs/tech-stack.md`](./docs/tech-stack.md) — full architecture + 8-table data model + state machine + command + sync flows + conflict UX
- [`docs/deploy/cloud.md`](./docs/deploy/cloud.md) — Tauri sidecar setup, Supabase migration prerequisites, post-arc smoke test, rollback plan
- [`docs/changes/`](./docs/changes/) — dated decision log; the 2026-05-13 entry covers the cloud-prep + architecture-adjustment arcs end-to-end
- [`products/tournament/README.md`](./products/tournament/README.md) — bracket draws, multi-event
- [`products/tournament/USAGE.md`](./products/tournament/USAGE.md) — using the shared engine from your own code
- [`scheduler_core/README.md`](./scheduler_core/README.md) — engine internals: variables, constraints, soft penalties

---

## Status

The scheduler is production-ready for the documented operating
envelope — Tauri sidecar on the director's laptop with browser
operators on the LAN or via a tunnel, public TV display via Vercel.
Operates correctly even if Supabase is unreachable for the entire
tournament; the cloud mirror catches up via the outbox when
connectivity returns.

Multi-worker / Postgres-as-primary deployments need additional work
(check-then-write on `matches.version` would need
`SELECT … FOR UPDATE` under multi-worker) — flagged in
[`docs/changes/2026-05-13.md`](./docs/changes/2026-05-13.md).

The tournament product remains a prototype; see its README for
status and roadmap.
