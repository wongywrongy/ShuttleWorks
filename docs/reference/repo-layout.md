# Repo layout

ShuttleWorks is an npm-workspaces monorepo with a Python solver package alongside.

Deployable applications live under `apps/`, shared libraries under `packages/`, and
deployment orchestration under `infra/` — the layout Turborepo, Nx and pnpm workspaces all
converge on. SP-REORG-1 moved the tree here on 2026-08-19; the former nested product directory
named a directory rather than a boundary.

```
apps/                          the deployable surfaces
├── console/                   OPERATOR SPA — React 19 + Zustand + Vite
│   ├── src/
│   │   ├── app/               router, AppShell, ModuleOutlet (nav model lives in platform/product-shell)
│   │   ├── modules/           one folder per module: hub, meet, bracket, operations, display, settings, workspace, entries
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
    ├── src/                   sys.path root (not a package)
    │   ├── core / shared      composition kernel and cross-domain logic
    │   ├── db / repositories  SQLAlchemy models, sessions, persistence facade
    │   └── workspaces / identity / meet / bracket / operations / display /
    │       entries / solve_rail / ops  domain routers and services
    └── README.md              routes, auth/tenancy, request lifecycle

packages/                      shared libraries (npm workspaces + one pip package)
├── design-system/             shared React components + the Tailwind preset
├── scheduler-core/            CP-SAT engine distribution (pure Python, no HTTP, no I/O)
│   └── scheduler_core/        the importable package — domain/, engine/, README.md
└── shared-contract/           data both tiers read (non-scheduling-keys.json)

infra/                         deployment orchestration (Dockerfiles stay with their apps)
├── compose/                   six stacks + their .env.*.example files
└── nginx/                     http-shared.conf · console.conf · play.conf · docs.conf · security-headers.conf

tests/
├── backend/                   API + solver tests (pytest; rootdir is the repo root)
└── e2e/                       Playwright specs incl. the required interaction smoke

simulator/                     internal full-workflow HTTP simulator (not in CI)
tools/                         OpenAPI, documentation, and audit tooling
legacy/                        sealed pre-merge deployment files (never edited)
archive/
└── tournament-pre-merge/      frozen snapshot of the legacy tournament product
examples/                      engine usage examples (product-agnostic)
docs/                          current VitePress documentation
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

## Source-of-truth docs

For working in the code, the per-product markdown is the most current authority. This site
consolidates from them; when in doubt, the code and these files win:

- `apps/api/README.md` — FastAPI routes, auth/tenancy, and request lifecycle.
- `apps/console/FRONTEND.md` — shell + tabs, the Zustand store split, theme system.
- `packages/scheduler-core/scheduler_core/README.md` — engine internals: variables, constraints, soft penalties.

Each major directory under `apps/console/src/` (`apps/console/src/store/`,
`apps/console/src/hooks/`, `apps/console/src/api/`, …) also carries its own
`README.md` for local conventions.

## Branch strategy

- **`main`** is the default integration branch; short-lived `<type>/<slug>`
  branches target it through PRs.
- The legacy two-product layout (a separate scheduler and a separate bracket app) was folded into
  one product during the **backend-merge arc**; the old bracket product is frozen under
  `archive/tournament-pre-merge/`.

## How this docs site is organised

This site lives in `docs/` and is built by VitePress (`config.mts`, `srcDir: docs/`,
`outDir: docs/.vitepress/dist`). The curated pages are grouped into Getting started,
[Architecture](/explanation/architecture/system-overview), [Modules](/reference/modules/meet),
[Module contracts](/reference/contracts/), [API reference](/reference/api/), and [Decisions](/explanation/decisions/).

Current architecture, decisions, contracts, and open debt live in the built
quadrants. Historical plans, audits, and dated logs were distilled and removed
from HEAD; Git history retains their provenance without leaving competing
current documentation in the tree.

## Keeping these docs current

Docs drift. Three mechanisms make drift visible instead of silent.

### 1. Repository path check — `npm run docs:paths`

The path checker scans live Markdown and fails when a repository-relative code
path no longer exists. It is independent of Git timestamps and runs in local
and CI gates.

### 2. Build provenance (in the footer)

Every built page footer shows the branch and commit the site was generated from.
This is computed at build time from
`git` (three one-off calls in `config.mts`, not per page), so a reader can always see how fresh the
site is.

### 3. The freshness check — `npm run docs:freshness`

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
