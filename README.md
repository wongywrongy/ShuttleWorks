# ShuttleWorks — CP-SAT Tournament Scheduling

One product for inter-school dual / tri-meet operators *and*
bracket-draw tournaments. Runs on the tournament director's laptop
via Docker Compose with SQLite as the source of truth, or
self-hosted for a team on Postgres behind a Cloudflare Tunnel — see
the [deploy runbooks](./docs/how-to/deploy.md). Operator browsers on
other devices and the public TV display read live state by polling
the backend.

The repo used to ship two products in parallel — a scheduler for
meets and a separate tournament app for brackets. The
backend-merge arc (commits `dd2b154` → `26e9309`, branch `dev2`)
folded the tournament app into the scheduler. The legacy tournament
product is archived at
[`archive/tournament-pre-merge/`](./archive/tournament-pre-merge/);
all live development happens in
[`apps/`](./apps).

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
| **Display** | output | Read-only public TV display (live matches / draw / results), served over a per-workspace capability-token URL — no auth. |
| **Entries** | intake | Online entry: a public entry page keyed by slug, an operator entry desk, and a re-runnable commit that turns confirmed entries into roster players. **Cloud mode only** — the cloud dependency ends at commit, so event day still runs offline. |

Operations is **always-on** (a Tier-2 architectural module, no enable toggle);
Meet, Bracket, Display and Entries are the user-enableable modules. Create a workspace
from a template (Meet Day / Bracket Tournament / Hybrid / Blank) or a **Custom**
module mix. Per-workspace **Settings** cover Overview,
the module catalog, People & Access, Sharing (public display link vs
collaborator invites), and Sync & Backups. The workspace sidebar switches the
running module; module status (enabled / available / disabled) drives the chrome and
routing. The current module model and its rationale live in the
[system overview](./docs/explanation/architecture/system-overview.md) and
[accepted ADRs](./docs/explanation/decisions/index.md).

### The public tier

Everything above is the **operator console**. A tournament's public face — where a player
finds it, sees the fees and deadlines, and enters it — is a **second frontend**
([`apps/entrant/`](./apps/entrant)) served under `/e/`: React
Router 7, server-rendered with no framework hydration. Its complete HTML is progressively enhanced
by small, same-origin route modules only where interaction needs the browser. Poster and discovery
routes have a blocking 4 KB page-weight budget; the persistent entry journey has an 8 KB budget.
It shares `packages/design-system` with the console and nothing else. See
[the entrant tier](./docs/explanation/architecture/entrant-tier.md).

All modules depend on the shared
[`packages/scheduler-core/`](./packages/scheduler-core) — a pure-Python CP-SAT engine
with no HTTP / no I/O. Build your own product on top by importing
its dataclasses; the scheduler in this repo is the worked example.

---

## Documentation

Full developer docs live in [`docs/`](./docs) — a VitePress site that is the
single source of truth for architecture, module contracts, data flow, and how to
extend the codebase.

```bash
npm run docs:dev     # browse the docs locally (hot reload)
npm run docs:paths   # fail on stale repository paths in live documentation
npm run docs:build   # static build; fails on broken internal links
```

Start here:

| Page | For |
| ---- | --- |
| [Quickstart](./docs/tutorials/quickstart.md) | Running it in a couple of minutes |
| [System overview](./docs/explanation/architecture/system-overview.md) | The five-module model (Entries · Meet · Bracket · Operations · Display) |
| [Module contracts](./docs/reference/contracts/index.md) | The test-enforced seams between modules |
| [Extending ShuttleWorks](./docs/how-to/index.md) | How to add a module, surface, endpoint, constraint, or seam |
| [Build a module (tutorial)](./docs/tutorials/build-a-module.md) | A guided, build-it-together walkthrough |
| [Data flow](./docs/explanation/architecture/data-flow.md) | Seams, the match-state machine, the command pipeline, persistence |
| [Entrant tier](./docs/explanation/architecture/entrant-tier.md) | The public site under `/e/` — and the three constraints it is built within |
| [Debt log](./docs/reference/debt-log.md) | Current known gaps and deferred work |

### Code intelligence (Zed)

Zed provides project search, symbol navigation, and language-server references
without a repository-specific index or MCP server. Open the repository as a Zed
project and use its built-in navigation; the workflow and useful commands are in:
[Code intelligence](./docs/how-to/code-intelligence.md).

---

## Quick start

Requires Docker (with Compose v2) for the production-shape stack.
For dev-server mode, also Node 24+ (the pinned version is in `.node-version`).

```bash
make scheduler          # → http://localhost (console), api on :8000
make scheduler-dev      # api in Docker, Vite dev server on :5173 (HMR)
make stop               # stop the stack
make help               # full target list
```

The Compose stack uses local mode by default — SQLite source of
truth, the solve worker embedded in the API process, and the
zero-friction bootstrap identity (no signup, no email, offline).
Use the matching example under `infra/compose/` when configuring the
multi-tenant cloud runtime (Postgres, standalone worker
containers, real accounts); it fails closed at startup without
Postgres, `AUTH_MODE=cloud`, HTTPS-only cookies, and SMTP. See
[`apps/api/README.md`](./apps/api/README.md).

---

## Architecture

```
Director's host — Docker Compose
  ├── FastAPI service (uvicorn)
  │     ├── CP-SAT solver (OR-Tools)
  │     ├── SQLite via SQLAlchemy (source of truth)
  │     └── Embedded solve worker (async job rail)
  │
  └── nginx-served React console
        ├── Meet · Bracket: roster · configuration · matches (the engines)
        ├── Operations: Plan (court board) · Run (live match control)
        └── Display: read-only public TV view

Operators / assistants — browser on any device
  ├── Read by polling the director's FastAPI
  └── Write via idempotent commands → director's FastAPI
       (meet actions: POST /commands · bracket results: POST /bracket/commands)

Public TV display — browser / projector
  └── Polls /display/{token}/* — a per-workspace capability URL, no auth
```

The director's SQLite is the source of truth, and there is **no
replication layer**: nothing in the write path touches the network, so
the tournament completes cleanly whether or not the internet does.
In-product recovery is `tournament_backups`.

> A Supabase Postgres mirror (`sync_queue` outbox + Realtime) used to sit
> alongside this. It was removed entirely in SP-CLOUD-3 — see
> [ADR 0012](./docs/explanation/decisions/0012-remove-the-supabase-mirror.md).

Full breakdown: [system overview](./docs/explanation/architecture/system-overview.md)
and [data flow](./docs/explanation/architecture/data-flow.md).

---

## Layout

Deployable applications live under `apps/`, shared libraries under `packages/`,
deployment orchestration under `infra/`.

```
apps/
├── console/                   OPERATOR SPA — React 19 + Zustand + IndexedDB command queue
│   └── src/
│       ├── modules/           hub, meet, bracket, operations, display, settings, entries
│       ├── platform/          cross-module: product-shell (workspace chrome + nav model),
│       │                      domain (module model), contracts, auth, settings
│       ├── components/        shared UI incl. control-plane/ (HealthDot /
│       │                      OverflowMenu / SectionCard / EmptyState / Skeleton)
│       └── api / store / hooks / lib …
├── entrant/                   PUBLIC tier — React Router 7 SSR + bounded route modules, under /e/
└── api/                       FastAPI + state machine + command log
    ├── alembic/               SQLite + Postgres schema migrations
    └── src/                   sys.path root: core, db, repositories, shared,
                               workspaces, identity, meet, bracket, operations,
                               display, entries, solve_rail, ops

packages/
├── design-system/             shared React components + the Tailwind preset
├── scheduler-core/            CP-SAT engine distribution (pure Python, no HTTP)
│   └── scheduler_core/        the importable package — domain/, engine/, README.md
└── shared-contract/           data both tiers read (non-scheduling-keys.json)

infra/
├── compose/                   the six stacks + their .env.*.example files
└── nginx/                     http-shared.conf · console.conf · play.conf · docs.conf

tests/
├── backend/                   API + solver tests (pytest)
└── e2e/                       Playwright specs

simulator/                     internal full-workflow HTTP simulator (not in CI)
tools/                         OpenAPI, documentation, and audit tooling
legacy/                        sealed pre-merge deployment files (never edited)

archive/
└── tournament-pre-merge/      frozen snapshot of the legacy tournament product
                               (replaced by the Bracket tab; see ARCHIVED.md)

examples/                      engine usage examples (product-agnostic)
docs/                          current VitePress site: tutorials, how-to,
                               reference, explanation, examples, templates
Makefile                       every target (the former product Makefile folded in)
pyproject.toml                 pytest + ruff config for the whole repo
```

---

## Tech stack

- **Engine** — Python 3.12 · Google OR-Tools (CP-SAT) · pure dataclasses
- **Backend** — FastAPI (sync via threadpool) · SQLAlchemy 2.0 · Alembic · single store: SQLite (local mode) or Postgres 16 (cloud mode) · cookie sessions + Argon2id · DB-backed solve-job queue · SSE for bracket solver progress
- **Frontend** — React 19 · TypeScript · Vite · Zustand · Tailwind · dnd-kit · Radix · IndexedDB command queue · polling (no push channel by design) · Vitest + jsdom + RTL
- **Shell** — Docker Compose (`make scheduler`); Tauri packaging is a known follow-up
- **Deployment** — Docker Compose. Local: one container set on the director's laptop. Cloud: self-hosted SPA + API + Postgres + worker behind a Cloudflare Tunnel, optionally with remote worker hosts over a tailnet

---

## Working in the code

- [`apps/api/README.md`](./apps/api/README.md) — FastAPI routes, auth/tenancy, and request lifecycle
- [`apps/console/FRONTEND.md`](./apps/console/FRONTEND.md) — shell + tabs, store split, theme system
- **Deploying?** [`docs/how-to/install-local.md`](./docs/how-to/install-local.md) (one machine) or [`docs/how-to/install-selfhost.md`](./docs/how-to/install-selfhost.md) (cloud, Cloudflare Tunnel) — plus [`add-a-worker.md`](./docs/how-to/add-a-worker.md) for a second compute host.
- [`packages/scheduler-core/scheduler_core/README.md`](./packages/scheduler-core/scheduler_core/README.md) — engine internals: variables, constraints, soft penalties

---

## Status

The scheduler (meet surface) is production-ready for the documented
operating envelope — Docker Compose stack on the director's laptop
with browser operators on the LAN or via a tunnel and public TV display over
its capability-token URL. Nothing in the local write path depends on the
network, and in-product backups provide recovery.

The Bracket module is feature-complete (create draws, import/export,
schedule rounds, record results, advance winners) with backend + frontend
test coverage. Bracket result recording now flows through an idempotent
command path (`POST /bracket/commands`), matching the meet surface's
command-queue model. Read surfaces deliberately use bounded polling.

The workspace control plane, module model, Settings surface, and current
navigation shell are shipped on the main product line.

Multi-worker / Postgres-as-primary deployments need additional work
(check-then-write on `matches.version` would need
`SELECT … FOR UPDATE` under multi-worker) — tracked in the
[debt log](./docs/reference/debt-log.md).
