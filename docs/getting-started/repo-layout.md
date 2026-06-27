# Repo layout

ShuttleWorks is an npm-workspaces monorepo with a Python solver package alongside.

```
scheduler_core/                shared CP-SAT engine (pure Python, no HTTP, no I/O)
├── domain/                    dataclasses + sport-agnostic model
├── engine/                    CP-SAT backend + constraint plugins
└── README.md                  engine docs + plugin contract

products/
└── scheduler/                 the workspace control plane (the only live product)
    ├── backend/               FastAPI + persistence + sync service + command log
    │   ├── alembic/           SQLite + Postgres schema migrations
    │   ├── api/               route handlers (one APIRouter per resource)
    │   ├── app/               app, schemas, error codes, auth deps
    │   ├── database/          SQLAlchemy models + session
    │   ├── repositories/      LocalRepository + per-entity sub-repos
    │   └── services/          match_state, sync_service (outbox), bracket/, suggestions_worker
    ├── frontend/              React 19 + Zustand + Vite
    │   └── src/
    │       ├── app/           router, AppShell, workspace nav model
    │       ├── products/      one folder per module: hub, meet, bracket, operations, display, settings, workspace
    │       ├── platform/      cross-module: product-shell, domain (module model), contracts, auth, settings
    │       ├── components/    shared UI incl. control-plane/ primitives
    │       └── api / store / hooks / lib …
    ├── e2e/                   Playwright specs
    ├── tests/                 backend + solver tests
    ├── docker-compose*.yml    dev / prod-shape stacks
    └── README.md · FRONTEND.md · BACKEND.md   product docs (most current source of truth)

archive/
└── tournament-pre-merge/      frozen snapshot of the legacy tournament product

packages/                      shared design-system workspace
examples/                      engine usage examples (product-agnostic)
docs/                          this VitePress site + the design archive
Makefile                       top-level chooser
```

## npm workspaces

The root `package.json` declares the workspaces:

```json
"workspaces": ["packages/*", "products/scheduler/frontend"]
```

Root scripts (`dev:scheduler`, `build:scheduler`, `docs:dev`, `docs:build`, …) delegate into the
workspace. The frontend has its own `package.json` (`type: module`); the **repo root is
CommonJS**, which is why the VitePress config is `docs/.vitepress/config.mts` (the `.mts`
extension forces ESM loading regardless of the root package type).

## The three source-of-truth docs

For working in the code, the per-product markdown is the most current authority. This site
consolidates from them; when in doubt, the code and these files win:

- `products/scheduler/README.md` — features, dev workflow, the proposal pipeline.
- `products/scheduler/BACKEND.md` — FastAPI routes, request lifecycle, how to add an endpoint or a constraint.
- `products/scheduler/FRONTEND.md` — shell + tabs, the Zustand store split, theme system.
- `scheduler_core/README.md` — engine internals: variables, constraints, soft penalties.

Each major directory under `frontend/src/` (`store/`, `hooks/`, `api/`, …) also carries its own
`README.md` for local conventions.

## Branch strategy

- **`main`** — the default integration branch; PRs target it.
- **`dev/workspace-suite`** — the live branch where the **workspace-suite control-plane redesign**
  (Hub dashboard, workspace + module model, the module dock, redesigned per-workspace Settings,
  and the additive module-contract layer) is built and reviewed. Everything documented here
  reflects this branch.
- The legacy two-product layout (a separate scheduler and a separate bracket app) was folded into
  one product during the **backend-merge arc**; the old bracket product is frozen under
  `archive/tournament-pre-merge/`.

## How this docs site is organised

This site lives in `docs/` and is built by VitePress (`config.mts`, `srcDir: docs/`,
`outDir: docs/.vitepress/dist`). The curated pages are grouped into Getting started,
[Architecture](/architecture/system-overview), [Modules](/modules/meet),
[Module contracts](/contracts/), [API reference](/api/), and [Decisions](/decisions/).

The pre-existing design record stays on disk but is **excluded from the site** (via `srcExclude`)
because it carries GitHub-relative links and implementation scratch:

| On-disk tree | What it holds |
| --- | --- |
| `docs/superpowers/specs/` · `docs/superpowers/plans/` | Per-slice design specs + implementation roadmaps (incl. the workspace-suite redesign and the module-architecture-modernization design). |
| `docs/architecture/workspace-suite/` | Ownership maps, the glossary, import boundaries, the meet design inventory. |
| `docs/tech-stack.md` | The post-merge architecture + data-model reference. |
| `docs/changes/` | Dated decision logs. |
| `docs/audits/` | Historical UI/UX audits + screenshots. |
| `docs/deploy/cloud.md` | Tauri sidecar + Supabase deploy guide. |
| `docs/architectural-roadmap.md` | The historical backend-merge arc roadmap. |

Nothing there is deleted — it is the archive. The curated pages here are the single source of
truth going forward.

## Keeping these docs current

Docs drift. Two mechanisms make drift visible instead of silent.

### 1. Build provenance (in the footer)

Every built page footer shows the commit the site was generated from, e.g.
*"Built from `dev/workspace-suite@ab770ed` · 2026-06-26"*. This is computed at build time from
`git` (three one-off calls in `config.mts`, not per page), so a reader can always see how fresh the
site is.

### 2. The freshness check — `npm run docs:freshness`

This is the "are the docs behind the code?" signal. It compares, **per area**, the last commit that
touched the doc pages against the last commit that touched the source those pages document, using
git history:

```bash
npm run docs:freshness            # summary table (STATUS · AREA · DOCS @ · SOURCE @)
npm run docs:freshness -- --list  # also list the source commits the docs are behind
npm run docs:freshness -- --json  # machine-readable (for CI)
```

Statuses: **CURRENT** (docs at least as new as their source), **BEHIND** (source changed *after* the
docs did — the area likely needs a doc update; `--list` shows exactly which commits), **NEW** (the
docs aren't committed yet), **LOCAL EDITS** (uncommitted doc edits pending). The command **exits 1 if
any area is BEHIND**, so it can gate CI.

The area → source mapping is the manifest at the top of `scripts/docs-freshness.mjs` — **keep it
honest**: when a page starts documenting a new part of the tree, add that path so drift there is
caught. Because the check reads git *history*, it reflects **committed** state — commit `docs/` for
it to track drift (until then every area reads as **NEW**).
