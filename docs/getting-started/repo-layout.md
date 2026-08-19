# Repo layout

ShuttleWorks is an npm-workspaces monorepo with a Python solver package alongside.

Deployable applications live under `apps/`, shared libraries under `packages/`, and
deployment orchestration under `infra/` — the layout Turborepo, Nx and pnpm workspaces all
converge on. SP-REORG-1 moved the tree here on 2026-08-19; before that everything sat under
`products/scheduler/`, which named a directory rather than a boundary.

```
apps/                          the deployable surfaces
├── console/                   OPERATOR SPA — React 19 + Zustand + Vite
│   ├── src/
│   │   ├── app/               router, AppShell, ModuleOutlet (nav model lives in platform/product-shell)
│   │   ├── products/          one folder per module: hub, meet, bracket, operations, display, settings, workspace, entries
│   │   ├── platform/          cross-module: product-shell, domain (module model), contracts, auth, settings
│   │   ├── components/        shared UI incl. control-plane/ primitives
│   │   └── api / store / hooks / lib …
│   ├── Dockerfile             builds the static bundle; served by nginx (config in infra/nginx/)
│   └── FRONTEND.md            shell + tabs, the store split, theme system
├── entrant/                   PUBLIC tier — React Router 7 SSR, zero client JS (/e/*)
│   ├── app/                   routes/ (explicit route table), components/, lib/
│   ├── scripts/               measure-page-weight.mjs (the blocking 4 KB gate)
│   └── tests/                 vitest, incl. source-scan contracts (no truncation, no em dash, no client fee rules)
└── api/                       FastAPI + persistence + command log
    ├── alembic/               SQLite + Postgres schema migrations
    ├── api/                   route handlers (one APIRouter per resource)
    ├── app/                   app, schemas, error codes, auth deps
    ├── database/              SQLAlchemy models + session
    ├── repositories/          LocalRepository + per-entity sub-repos
    ├── services/              auth, email, match_state, bracket/, suggestions_worker
    └── BACKEND.md             FastAPI routes, request lifecycle, how to add an endpoint

packages/                      shared libraries (npm workspaces + one pip package)
├── design-system/             shared React components + the Tailwind preset
├── scheduler-core/            CP-SAT engine distribution (pure Python, no HTTP, no I/O)
│   └── scheduler_core/        the importable package — domain/, engine/, README.md
└── shared-contract/           data both tiers read (non-scheduling-keys.json)

infra/                         deployment orchestration (Dockerfiles stay with their apps)
├── compose/                   six stacks + their .env.*.example files
└── nginx/                     console.conf · docs.conf · security-headers.conf

tests/
├── backend/                   API + solver tests (pytest; rootdir is the repo root)
└── e2e/                       Playwright specs incl. the required interaction smoke

simulator/                     internal full-workflow HTTP simulator (not in CI)
tools/                         generate_openapi.py · docs-freshness.mjs · audit_input_surface.py · codanna-serve.ps1
legacy/                        sealed pre-merge deployment files (never edited)
archive/
└── tournament-pre-merge/      frozen snapshot of the legacy tournament product
examples/                      engine usage examples (product-agnostic)
docs/                          this VitePress site + the design archive
Makefile                       every target (the former product Makefile folded in)
pyproject.toml                 pytest + ruff config for the whole repo
```

**The import name did not change.** `packages/scheduler-core/` is the kebab-case
*distribution* directory; the package inside it is still `scheduler_core` and every
`import scheduler_core` in the tree is untouched.

## npm workspaces

The root `package.json` declares the workspaces:

```json
"workspaces": ["packages/*", "apps/console", "apps/entrant"]
```

Root scripts (`dev:scheduler`, `build:scheduler`, `docs:dev`, `docs:build`, …) delegate into the
workspace, and the entrant tier has its own pair of each (`dev:entrant`, `build:entrant`,
`lint:entrant`, `typecheck:entrant`, `test:entrant`, `depcruise:entrant`). The frontend has its own
`package.json` (`type: module`); the **repo root is
CommonJS**, which is why the VitePress config is `docs/.vitepress/config.mts` (the `.mts`
extension forces ESM loading regardless of the root package type).

## The three source-of-truth docs

For working in the code, the per-product markdown is the most current authority. This site
consolidates from them; when in doubt, the code and these files win:

- `docs/SCHEDULER.md` — features, dev workflow, the proposal pipeline.
- `apps/api/BACKEND.md` — FastAPI routes, request lifecycle, how to add an endpoint or a constraint.
- `apps/console/FRONTEND.md` — shell + tabs, the Zustand store split, theme system.
- `packages/scheduler-core/scheduler_core/README.md` — engine internals: variables, constraints, soft penalties.

Each major directory under `apps/console/src/` (`store/`, `hooks/`, `api/`, …) also carries its own
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
| `docs/programs/` | Program ledgers — `CLOUD_PROGRESS.md`, `SEC_PROGRESS.md`, `REFACTOR_PROGRESS.md`, `FRONTEND_PROGRESS.md` — each read at session start and updated at session end, plus the `design-plan/` working notes. Moved off the repo root on 2026-08-06 so the root holds only files a tool or convention reads by path. |
| `docs/deploy/cloud.md` | Tombstone. The Supabase-era deployment guide was removed 2026-08-06; use the `how-to/` runbooks. |
| `docs/architectural-roadmap.md` | The historical backend-merge arc roadmap. |

Nothing there is deleted — it is the archive. The one exception is `deploy/cloud.md`, whose
body was removed on 2026-08-06 because it was a runbook for a topology that never existed;
the path survives as a tombstone and the text is in git history. The curated pages here are
the single source of truth going forward.

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

The area → source mapping is the manifest at the top of `tools/docs-freshness.mjs` — **keep it
honest**: when a page starts documenting a new part of the tree, add that path so drift there is
caught. Because the check reads git *history*, it reflects **committed** state — commit `docs/` for
it to track drift (until then every area reads as **NEW**).
