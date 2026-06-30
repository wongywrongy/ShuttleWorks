# ShuttleWorks — CP-SAT Tournament Scheduling

One product for inter-school dual / tri-meet operators *and*
bracket-draw tournaments. Runs on the tournament director's laptop
(today via Docker Compose; a Tauri binary is the intended end-state
— see [deploy doc](./docs/deploy/cloud.md)) with SQLite as the
source of truth. Supabase mirrors the live state to operator
browsers on other devices and to a public TV display.

The repo used to ship two products in parallel — a scheduler for
meets and a separate tournament app for brackets. The
backend-merge arc (commits `dd2b154` → `26e9309`, branch `dev2`)
folded the tournament app into the scheduler. The legacy tournament
product is archived at
[`archive/tournament-pre-merge/`](./archive/tournament-pre-merge/);
all live development happens in
[`products/scheduler/`](./products/scheduler).

### Workspaces & modules — the control plane

The product is organised as a **Ubiquiti-style workspace control plane**.
The landing page (`/`) is the **Hub**: a dashboard of every workspace you
operate, each shown with operational signal (health, readiness, attention,
enabled modules). A **workspace** is one event's control plane; inside it
you enable **modules** — installable product systems:

| Module | Role | What it is |
| ------ | ---- | ---------- |
| **Meet** | engine | Single-day inter-school meet — roster, CP-SAT-optimised court assignments, proposal/repair pipeline, live SSE solver progress. **Produces** a schedule. |
| **Bracket** | engine | BWF-conformant single-elimination + round-robin draws — seeding, draw generation, advancement, import/export (JSON / CSV / ICS), schedule-next-round via the shared CP-SAT engine. **Produces** matches. |
| **Operations** | live-ops | The day-of control plane over both engines' matches: a **Plan** board (drag-to-reschedule) and a **Run** surface (live court board, match-state machine, idempotent command queue, inline conflict UX). |
| **Display** | output | Read-only public TV display (live matches / draw / results), fed by Supabase Realtime — no auth. |

Operations is **always-on** (a Tier-2 architectural module, no enable toggle);
Meet, Bracket, and Display are the user-enableable modules. Create a workspace
from a template (Meet Day / Bracket Tournament / Hybrid / Blank) or a **Custom**
module mix. Per-workspace **Settings** cover Overview,
the module catalog, People & Access, Sharing (public display link vs
collaborator invites), and Sync & Backups. A module dock switches the running
module; module status (enabled / available / disabled) drives the chrome and
routing. The design record for this control-plane redesign lives in
[`docs/superpowers/specs/`](./docs/superpowers/specs) (the `2026-06-*` specs).

All modules depend on the shared
[`scheduler_core/`](./scheduler_core) — a pure-Python CP-SAT engine
with no HTTP / no I/O. Build your own product on top by importing
its dataclasses; the scheduler in this repo is the worked example.

---

## Documentation

Full developer docs live in [`docs/`](./docs) — a VitePress site that is the
single source of truth for architecture, module contracts, data flow, and how to
extend the codebase.

```bash
npm run docs:dev     # browse the docs locally (hot reload)
npm run docs:build   # static build; fails on broken internal links (the CI gate)
```

Start here:

| Page | For |
| ---- | --- |
| [Quickstart](./docs/getting-started/quickstart.md) | Running it in a couple of minutes |
| [System overview](./docs/architecture/system-overview.md) | The four-module model (Meet · Bracket · Operations · Display) |
| [Module contracts](./docs/contracts/index.md) | The test-enforced seams between modules |
| [Extending ShuttleWorks](./docs/how-to/index.md) | How to add a module, surface, endpoint, constraint, or seam |
| [Build a module (tutorial)](./docs/tutorials/build-a-module.md) | A guided, build-it-together walkthrough |
| [Data flow](./docs/architecture/data-flow.md) | Seams, the match-state machine, the command pipeline, the outbox |

---

## Quick start

Requires Docker (with Compose v2) for the production-shape stack.
For dev-server mode, also Node 20+.

```bash
make scheduler          # → http://localhost (frontend), backend on :8000
make scheduler-dev      # backend in Docker, Vite dev server on :5173 (HMR)
make stop               # stop the stack
make help               # full target list
```

The Compose stack uses local-only mode by default — SQLite source
of truth, no Supabase replication, synthetic local-dev user. Drop
a `backend/.env` with `ENVIRONMENT=cloud` + `SUPABASE_URL` +
`SUPABASE_ANON_KEY` to flip into cloud-mirror mode (operator
browsers read from Supabase Realtime, the outbox worker pushes
match + bracket writes to Postgres). See
[`docs/deploy/cloud.md`](./docs/deploy/cloud.md) for the full
production setup.

---

## Architecture

```
Director's laptop — Tauri desktop app (today: Docker Compose)
  ├── FastAPI sidecar (uvicorn, local port)
  │     ├── CP-SAT solver (OR-Tools)
  │     ├── SQLite via SQLAlchemy (source of truth)
  │     └── Sync service → Supabase Postgres (background outbox)
  │
  └── Tauri WebView (React frontend)
        ├── Meet · Bracket: roster · configuration · matches (the engines)
        ├── Operations: Plan (court board) · Run (live match control)
        └── Display: read-only public TV view

Operators / assistants — browser on any device
  ├── Read via Supabase Realtime (matches + bracket_* tables), polling fallback
  └── Write via idempotent commands → director's FastAPI
       (meet actions: POST /commands · bracket results: POST /bracket/commands)

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
└── scheduler/                 the workspace control plane (the only live product)
    ├── backend/               FastAPI + state machine + sync service + command log
    │   ├── alembic/           SQLite + Postgres schema migrations (head: j3e7f9a1b5c8)
    │   ├── api/               route handlers — tournaments, workspace_modules, match-states, commands, brackets, …
    │   ├── app/               app + exceptions + constants + auth dependencies
    │   ├── repositories/      LocalRepository + per-entity sub-repos (members, modules, brackets, backups, …)
    │   └── services/          match_state, sync_service (outbox), bracket/ (draws + advancement + I/O)
    ├── frontend/              React 19 + Zustand + IndexedDB command queue
    │   └── src/
    │       ├── products/      per module: hub (the workspace Hub), meet,
    │       │                  bracket, operations (live-ops), display, settings
    │       ├── platform/      cross-module: product-shell (workspace chrome + module dock),
    │       │                  domain (module model), auth, settings
    │       ├── components/    shared UI incl. control-plane/ (MetricStat / HealthDot /
    │       │                  OverflowMenu / SectionCard / EmptyState / Skeleton)
    │       └── api / store / hooks / lib …
    ├── e2e/                   Playwright specs
    ├── tests/                 backend + solver tests (Vitest for frontend in src/)
    ├── docker-compose.yml     dev / prod-shape stack
    ├── Makefile               product-local targets
    └── README.md              product docs

archive/
└── tournament-pre-merge/      frozen snapshot of the legacy tournament product
                               (replaced by the Bracket tab; see ARCHIVED.md)

examples/                      engine usage examples (product-agnostic)
docs/                          project planning artifacts
├── tech-stack.md              post-merge architecture + data model + flows
├── deploy/cloud.md            Tauri sidecar + Supabase deploy guide
├── architectural-roadmap.md   the backend-merge arc roadmap (historical)
├── superpowers/specs|plans/   per-slice design record (incl. the 2026-06 workspace-suite
│                              control-plane redesign: SP-A backend → SP-D Settings/Dock)
├── audits/                    historical UI/UX audit notes + screenshots
└── changes/                   dated decision log
Makefile                       top-level chooser (this is what most people use)
```

---

## Tech stack

- **Engine** — Python 3.11 · Google OR-Tools (CP-SAT) · pure dataclasses
- **Backend** — FastAPI (sync via threadpool) · SQLAlchemy 2.0 · Alembic · SQLite (canonical) · Supabase Postgres (mirror via outbox) · Supabase Auth · SSE for solver progress
- **Frontend** — React 19 · TypeScript · Vite · Zustand · Tailwind · dnd-kit · Radix · IndexedDB command queue · Supabase Realtime (subscribe + polling fallback) · Vitest + jsdom + RTL
- **Shell** — Docker Compose today (`make scheduler`); Tauri packaging is a known follow-up
- **Deployment** — Docker Compose on the director's laptop · Vercel for the public TV display · Supabase project (Auth + Postgres + Realtime)

---

## Working in the code

- [`products/scheduler/README.md`](./products/scheduler/README.md) — scheduler features, dev workflow, proposal pipeline, suggestions inbox
- [`products/scheduler/BACKEND.md`](./products/scheduler/BACKEND.md) — FastAPI routes, request lifecycle, how to add an endpoint or a constraint
- [`products/scheduler/FRONTEND.md`](./products/scheduler/FRONTEND.md) — shell + tabs, store split, theme system
- [`docs/tech-stack.md`](./docs/tech-stack.md) — full architecture + 12-table data model + state machine + command + sync flows + conflict UX
- [`docs/deploy/cloud.md`](./docs/deploy/cloud.md) — Tauri sidecar setup, Supabase migration prerequisites, smoke test, rollback plan
- [`docs/superpowers/specs/`](./docs/superpowers/specs) — per-slice design record, incl. the workspace-suite control-plane redesign (`2026-06-23-workspace-suite-architecture-design.md` → the SP-A…SP-D specs)
- [`docs/architectural-roadmap.md`](./docs/architectural-roadmap.md) — the (historical) backend-merge arc roadmap
- [`docs/changes/`](./docs/changes/) — dated decision log
- [`scheduler_core/README.md`](./scheduler_core/README.md) — engine internals: variables, constraints, soft penalties

---

## Status

The scheduler (meet surface) is production-ready for the documented
operating envelope — Docker Compose stack on the director's laptop
with browser operators on the LAN or via a tunnel, public TV
display via Vercel. Operates correctly even if Supabase is
unreachable for the entire tournament; the cloud mirror catches up
via the outbox when connectivity returns.

The Bracket module is feature-complete (create draws, import/export,
schedule rounds, record results, advance winners) with backend + frontend
test coverage. Bracket result recording now flows through an idempotent
command path (`POST /bracket/commands`), matching the meet surface's
command-queue model. A read-side `subscribeToBracketMatches` Realtime
subscription (to replace the 2.5 s polling fallback) remains a follow-up.

The **workspace-suite control-plane redesign** (Hub dashboard, workspace +
module model, New Workspace builder, redesigned per-workspace Settings, and
the module dock) is built and reviewed on branch `dev/workspace-suite`. The
full design record + per-slice plans are in
[`docs/superpowers/`](./docs/superpowers).

Multi-worker / Postgres-as-primary deployments need additional work
(check-then-write on `matches.version` would need
`SELECT … FOR UPDATE` under multi-worker) — flagged in
[`docs/changes/2026-05-13.md`](./docs/changes/2026-05-13.md).
