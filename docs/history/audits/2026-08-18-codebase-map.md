# ShuttleWorks Codebase Map — High-Level Analysis

**Date:** 2026-08-18 · **Branch:** `feat/p7-public-entrant` (HEAD `248cfc2`, pushed) · **Tracked files:** 1,367

A whole-repo map: every folder, what lives in it, and how the pieces interact. Paths are given as plain code spans (no doc links) so this page never trips the dead-link gate.

---

## 1. Repo top level

| Path | Files | Role |
|---|---|---|
| `products/scheduler/` | 992 | The product: frontend SPA, backend API, entrant SSR site, tests, e2e, simulator, Docker stacks |
| `docs/` | 217 | VitePress documentation site (architecture, ADRs, how-tos, program ledgers, audits) |
| `.agents/skills/` | 54 | Agent skill packs (design/brand kits for AI-assisted work) |
| `scheduler_core/` | 33 | Standalone pip package: domain models + CP-SAT solver engine |
| `packages/design-system/` | 28 | Shared React component/token package `@scheduler/design-system` |
| `archive/tournament-pre-merge/` | 19 | FROZEN pre-merge tournament product; never edited, excluded from pytest |
| `scripts/` | 3 | Repo-level tooling: docs freshness, input-surface audit, codanna server loop |
| `examples/` | 2 | Standalone `scheduler_core` usage examples |
| `.github/workflows/` | 2 | CI (`ci.yml`) + release image publishing (`publish-release.yml`) |
| Root files | ~15 | `Makefile`, `package.json` (npm workspaces), `conftest.py`, `CLAUDE.md`, `CODE_HEALTH.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.jscpd.json`, `.mcp.json`, `skills-lock.json` |

**npm workspaces:** `packages/*`, `products/scheduler/frontend`, `products/scheduler/entrant`.
**Python:** repo `.venv`; `scheduler_core` installed as a real package (site-packages, not sys.path hacks).

---

## 2. The architecture in one page

ShuttleWorks is a **workspace control plane**: the Hub (`/`) lists workspaces; each workspace enables **modules**. Five architectural modules share one anatomy — intake → engine → emit:

```
 Entries ──commit──▶ Meet (engine) ──scheduleFinalized──▶ Operations ──matchStateChanged──▶ Display
   │                    │  CP-SAT (scheduler_core)          │  Plan + Run boards              │ read-only
   └──commit──▶ Bracket (engine) ──drawGenerated──────────▶ │  match state machine            │ public /display/{token}
                        │  same CP-SAT core                 │  idempotent command queue       ▼
                        ◀───(advancement seam deliberately UNWIRED)                     spectator TVs
```

- **Meet** and **Bracket** are ENGINES: roster/config/draw → `scheduler_core` CP-SAT → matches. Both import the same pure, HTTP-free engine; their match *records* stay separate (ADR 0006). Neither lineup nor advancement is a solver constraint — both pre-resolve fully-formed matches and hand them to the solver.
- **Operations** OPERATES matches (Tier-2, always-on, no enable flag): Plan board + live Run surface, canonical state machine `scheduled→called→playing→finished|retired`, idempotent command log.
- **Display** PROJECTS results: read-only polling, public capability-token routes (raw tournament UUIDs are never public keys).
- **Entries** is INTAKE: entrant self-service registrations, operator confirm/commit → roster players.

**Data:** single-store (SQLite local / Postgres cloud), no replication layer — writes never touch the network. Recovery = `tournament_backups` snapshots. The Supabase mirror was removed entirely (ADR 0012).

**Two principals:** operators (cookie sessions, `users`/`auth_sessions`, Argon2id, CSRF header) and entrants (separate cookie + `entrant_sessions` table, no local-bootstrap fallback). `AUTH_MODE=local` resolves credential-less operators to the zero-UUID bootstrap user; `AUTH_MODE=cloud` requires real accounts. Tenancy: orgs own workspaces; every workspace route carries `Depends(require_tournament_access(role))` and answers a uniform **404** to non-members.

---

## 3. Frontend — `products/scheduler/frontend/src` (operator SPA)

React 19 + Vite + Zustand. Sole HTTP boundary is `src/api/client.ts` (one axios `apiClient`).

### Top-level folders

| Folder | Role |
|---|---|
| `api/` | `client.ts` (all backend calls), `dto.ts`/`dto.generated.ts`, `bracketDto.ts`/`bracketClient.tsx`. Only layer that knows HTTP. |
| `app/` | Routing + shell: `App.tsx` (route table, lazy pages), `AppShell.tsx`, `AppSidebar.tsx`, `AuthGuard.tsx`, `AuthedLayout.tsx`, `workspace/ModuleOutlet.tsx` (lazy-loads product modules by active tab). |
| `components/` | Shared cross-product UI: `control-plane/` (BandedTable, DetailDock, PhaseStepper, MatchCard), `status/` (AdvisoryBanner, LockRibbon), `common/` (Modal, UnlockModal), Toast, SolverHud, ConflictBanner, MatchChip, StatusPill, ErrorBoundary. |
| `context/` | `AuthContext.tsx` only — probes `GET /auth/me`; all other state is Zustand. |
| `hooks/` | ~25 data/polling hooks: `useTournamentState`, `useSchedule`, `useAdvisories`, `useSuggestions`, `useProposals`, `useCommandQueue`, `useLiveOperations`, `useMatchStateSync`, `useBracket`, `useLockGuard`, `useAction`, theme/density hooks. Glue between `api/`, `store/`, products. |
| `lib/` | Pure helpers (no React): `commandQueue.ts`/`bracketCommandQueue.ts` (optimistic queues), `pollPolicy.ts`, time formatters, `bracketOccupancy.ts`, `courtClosures.ts`, `xlsxExportShared.ts`, `bracketTabs.ts`. |
| `pages/` | `TournamentPage.tsx` — `/tournaments/:id/*`, syncs URL segment ↔ `uiStore.activeTab`, renders `AppShell`. |
| `platform/` | Foundation layer (see below). Must never import from `products/`, `pages/`, or `app/` (depcruise ERROR). |
| `store/` | Zustand: `tournamentStore` (config/roster/matches/schedule), `matchStateStore` (live state + conflicts), `uiStore` (`AppTab`, solver log), `alertStore`, `preferencesStore` (persisted theme/density), `selectors.ts`. |
| `utils/`, `types/` | Small standalone domain utilities (`constraintChecker`, `matchUtils`, `trafficLight`); ambient types. |

### `platform/` — the foundation layer

- `contracts/moduleContract.ts` — the load-bearing module-ownership spine. Per `ArchModuleId` (`meet`,`bracket`,`operations`,`display`,`entries`): `ownedSegments`, `ownedEndpoints`/`consumedEndpoints` (real `apiClient` method *references* — renames break compilation), `produces`/`consumes` (DTO-name union), `emits`/`reactsTo` (seams). Enforced by `__tests__/moduleContract.test.ts`; never on a runtime path.
- `product-shell/` — `WorkspaceShell.tsx`, `WorkspaceSidebar.tsx`, `workspaceNav.ts` (`buildWorkspaceNav` — single source of truth for the sidebar IA), `types.ts` (`ModuleId`).
- `auth/` — `LoginPage`, `InvitePage`, `passwordPolicy`.
- `domain/` — cross-module logic: `permissions.ts` (`canEdit`), `matchTransitions.ts`, `moduleModel.ts` (`moduleForTab`), `lifecycle.ts`, `workspace.ts`, `overviewPhase.ts`, setup checklist, workspace-identity hooks.
- `settings/` — per-tournament engine config UI (`ConfigSurface`, `EngineConfigForm`) — distinct from `products/settings` (global settings page).

### Products (`src/products/*`)

| Product | Surfaces | Owns / talks to |
|---|---|---|
| `hub/` | `HubPage` (workspace list, `/`), `NewWorkspacePage` + grouping/sort/facets/metrics helpers | Workspace list/summary endpoints. Pre-workspace, not a contract module. |
| `meet/` | `MeetProduct`, `TournamentSetupPage`; `roster/` (RosterTab, PlayerDetailPanel, PositionGrid), `matches/` (MatchesTab, spreadsheet), `exports/` | Segments `roster/matches/setup`; solve-jobs, proposals, advisories, suggestions endpoints; emits `scheduleFinalized`. |
| `bracket/` | `BracketProduct` → roster/draws/matches tabs; `DrawView` + `PanZoomCanvas`; format registry, BWF standings, migration helpers | Segments `bracket-*`; all `/bracket/*` endpoints; emits `drawGenerated`. |
| `operations/` | `UnifiedOpsBoard`/`UnifiedOpsList`, `OpsDetailRail`; `run/` (RunSurface, RunCourtGrid, RunQueue, RunInspector, ScoreEditor), `runtime/` (pure `runMachine`/`runModel`/`runActions`), `plan/` (PlanToolbar, SuggestionsRail, ScheduleDiffView, dialogs) | Segments `schedule/live/bracket-schedule/bracket-live`; match-state + command endpoints; reads bracket for layout; reacts to `scheduleFinalized`, emits `matchStateChanged`. Drives `matchStateStore`. |
| `display/` | `DisplayProduct` (preview), `PublicDisplayPage` (public `/display`); `publicDisplay/` (Courts/Schedule/Standings views, `useDisplaySync`, rotation, tvSizing, freshness), `bracketDisplay/` | Segments `tv/display-config`; token routes `/display/{token}/*`; independent polling; reacts to `matchStateChanged`. |
| `entries/` | `EntriesDesk` (operator confirm/commit) | Segment `entries`; `listEntries/confirmEntry/commitEntries`; commit writes roster players consumed by Meet; public submission lives in the entrant tier, not the SPA. |
| `workspace/` | `WorkspaceOverview`, `VenueScheduleTab`, `DisplayConfig` | The `ws-*` admin nav segments; not a contract module. |
| `settings/` | `GlobalSettingsPage` + tabs (General, PeopleAccess, Sharing, Modules, SyncBackups, DangerZone) | Global `/settings`, cross-workspace. |

### Data flow (client side)

Router (`App.tsx`, lazy + Suspense) → `TournamentPage` → `AppShell` → `WorkspaceShell` (nav from `workspaceNav.ts`) → `ModuleOutlet` (lazy module by `moduleForTab(activeTab)`). Hooks wrap `apiClient` with polling/optimistic patterns and push into Zustand stores. Cross-module effects are (a) store subscriptions, (b) independent polling, or (c) server-side writes picked up on next `/state` read — **there is no client event bus**; `moduleContract.ts` names the edges, it doesn't create them.

### Config/tooling

`vite.config.ts` (`/api` proxy → `VITE_API_PROXY_TARGET`, warmup pre-transforms for lazy modules, manual vendor chunks), `tailwind.config.js` (extends the design-system preset + scans DS package sources), flat `eslint.config.js`, `vitest.config.ts` (jsdom, colocated `__tests__/`, pinned `TZ`), `knip.json`, `nginx.conf` + `security-headers.conf` + `Dockerfile` (prod static hosting).

---

## 4. Backend — `products/scheduler/backend` (FastAPI)

### `app/` — process wiring (routers live in `api/`, not here)

- `main.py` — app factory: lifespan (Alembic upgrade, bootstrap local user, `SuggestionsWorker`, embedded `SolveWorker`), CORS / request-id / CSRF / body-limit / DB-session-close middleware, docs disabled in cloud, all `include_router` calls.
- `config.py` — `Settings`: `database_url`, `environment`, `auth_mode`, `embedded_worker`, cookie-name registries, `OPS_TOKEN`, SMTP; `environment=cloud` refuses to construct without the full secret set.
- `dependencies.py` — the three identity/tenancy seams: `get_current_user`, `get_current_entrant` (separate principal, no bootstrap fallback), `require_tournament_access(min_role)` (non-member → uniform 404; insufficient role → 403; no local-mode bypass).
- Plus: `error_codes`, `exceptions` (Conflict→409, PreconditionFailed→412), `body_limit`, `client_ip`, `form_csrf`, `limits`, `schemas`, `paths`, `time_utils`.

### `api/` — every router

| File | Prefix | Purpose |
|---|---|---|
| `auth.py` | `/auth` | Operator accounts: register/login/reset, cookie sessions |
| `entrants.py` | `/e/account` | Entrant auth: signup/login/logout/whoami |
| `entries.py` | `/tournaments` | Operator Entries desk (confirm/manage) |
| `entries_json.py` / `entries_me.py` / `entries_site.py` | `/e/api*` | Entrant tier JSON: public form data, own entries, public-site projections (draws/seeds/winners/players) |
| `tournaments.py` | `/tournaments` | Workspace CRUD, state blob read/write (ETag/`If-Match`) |
| `schedule.py` | root | Validation + retired sync solve routes (410) |
| `schedule_repair.py` / `schedule_warm_restart.py` | root | Disruption repair / warm-start re-solve (tenant-scoped variants live) |
| `schedule_advisories.py` / `schedule_proposals.py` / `schedule_director.py` / `schedule_suggestions.py` | `/tournaments/{id}/schedule/*` | Advisory pipeline, two-phase proposal commit, director time-axis tools, suggestions inbox |
| `solve_jobs.py` | `/tournaments/{id}/solve-jobs` | Async solve-job resource (enqueue/poll/cancel) |
| `match_state.py` | `/tournaments/{id}/match-states` | Match state machine CRUD |
| `commands.py` | `/tournaments/{id}/commands` | Idempotent operator command log (409 on conflict) |
| `brackets.py` | `/tournaments/{id}/bracket` | Draws/advancement/import-export (one streaming route) |
| `invites.py` | `/invites` | Invite links |
| `workspace_modules.py` | `/tournaments` | Module enable/disable per workspace |
| `display.py` | `/display` (public) + manage | Capability-token spectator plane — the only unauthenticated data plane, GET-only projections |
| `health.py` | `/health*` | Public liveness; ready/deep/metrics gated by `X-ShuttleWorks-Ops-Token` |
| `_validate.py`, `workspace_signals.py`, `entries_public.py` | — | Route-less helpers (fast feasibility check, control-plane signals, projections) |

### `services/`

- Identity: `auth.py`, `entrants.py` (passwords, sessions, throttling).
- Entrant domain: `entries.py`, `entry_fees.py`, `entry_form.py`, `entry_policy.py`, `submissions.py`, `members.py`, `email.py`, `turnstile.py`.
- Live ops: `match_state.py`, `config_lock.py`, `schedule_impact.py`, `conflict_metrics.py`.
- Solve rail: `solve_jobs.py` (DB queue: enqueue/claim/heartbeat/complete/reap — lease ownership checked on completion **and** heartbeat), `solve_worker.py` (loop, embedded or containerized), `solve_runner.py` (subprocess supervisor), `solve_child.py` (one CP-SAT solve, then exit), `suggestions_worker.py` (in-process speculative re-optimizer, 30s cooldown).
- `services/bracket/` — format-engine glue: `adapter.py` (TournamentState → `SchedulingProblem`), `scheduler.py` (`TournamentDriver`), `draw.py`, `advancement.py`, `standings.py` (BWF tie-breaks), `state.py`, `validation.py`, `player_constraints.py`, `response_cache.py`, `io/`; `formats/` = one file per draw type (single/double elimination, round robin, swiss, monrad, compass + shared `_knockout/_segments/_waves`).
- `services/meet/standings.py` — school-vs-school pool standings.
- `services/scheduling/params.py` — `build_schedule_config`: the single place scheduling params become an engine `ScheduleConfig`.

### `repositories/`, `adapters/`, `database/`, `alembic/`

- `repositories/base.py` (Protocols) + `local.py` (`LocalRepository` aggregating per-entity repos: tournament, match, bracket, match-state, command, backup, member, invite, module). One session per request, closed by middleware.
- `adapters/badminton.py` — sport-specific rules feeding the bracket engine.
- `database/models.py` — SQLAlchemy 2.0 ORM + module derivation (`MODULE_IDS`, `CLOUD_ONLY_MODULES=("entries",)`, `derive_modules`, `display_dependency_satisfied`). `database/session.py` — engine/SessionLocal, SQLite WAL + FK pragmas, psycopg3 URL normalization, pool sizing.
- `alembic/` — 26 migrations tracing the arc: single-tenant → membership/orgs → async solve-jobs → users/sessions → display tokens → entries/entrant accounts → backups.

---

## 5. Engine — `scheduler_core/` (pip package)

Pure, HTTP-free. Deps: `ortools`, `pydantic`. Imported by the backend as `scheduler_core.*` (adapters, bracket services, schedule routers, validation).

- `domain/` — `models.py` (courts, slots, matches, players), `tournament.py`, `errors.py`.
- `engine/` — `bridge.py` (SchedulingProblem builder — the seam `params.py` and `bracket/adapter.py` build into), `cpsat_backend.py` (interval-variable CP-SAT formulation), `variables.py`, `config.py` (`ScheduleConfig`), `extraction.py`, `diagnostics.py` (infeasibility), `validation.py`, `warm_start.py`, `repair.py`, `live_ops.py`, `cancel_token.py`, `backends.py`.
- `engine/constraints/` — plugin per constraint, composed via `objective.py`: `availability`, `court_capacity`, `player_no_overlap`, `rest`, `game_proximity`, `freeze_horizon`, `locks_and_pins`, `stay_close`.

---

## 6. Entrant tier — `products/scheduler/entrant` (public SSR site)

React Router 7 SSR (Node), React 19, Tailwind, shared `@scheduler/design-system`. The public-facing entry/spectator site, distinct from the operator SPA. Dev on :5174 against backend :8600.

- **Routes** (`app/routes.ts`, explicit config): `/` discovery, `/signup`, `/login`, `/me/entries`, `/:slug` tournament page, `/:slug/enter`, `/:slug/receipt/:id`, `/:slug/regulations`, `/:slug/players/:key`, `/:slug/draws/:key`, plus health/sitemap/robots. Auth POSTs (`/e/account/*`) are owned by FastAPI directly — nginx splits by path prefix and strips the operator cookie on `/e/`.
- **Backend contact:** `app/lib/apiFetch.server.ts` — reads only, credentials never; headers from a frozen allowlist. Deliberately does NOT reuse the SPA's `client.ts` (per-tab browser state would smear across concurrent entrants in one Node process) — enforced by a depcruise rule (`entrant-no-operator-frontend`). **Writes bypass Node entirely**: browser → nginx → FastAPI.
- **Tests:** per-route render tests + cross-cutting guards (`formCsrf.server`, `noClientFeeRules`, `reservedSlugs`, `noEmDash`, `noTruncation`, `boundaries`, `deployStacks`, `launch-scripts`).
- CI gives it its own job with a server-only-boundary check via real build and a 4.4KB-gzip page-weight budget.

---

## 7. Design system — `packages/design-system`

`components/` (Button, Card, Modal, Select, TextField, Toast, StatusPill, StatusBar, GanttTimeline, CourtMark, Notice, Hint, Separator), `icons/` (curated Phosphor set), `lib/utils.ts` (`cn`, interaction/input style constants), `tokens.css`/`globals.css`/`tailwind-preset.js`, docs (`DESIGN.md`, `DESIGN_COLOR.md`, `MOTION.md`, `BRAND.md`), `scripts/` (`check-classes.mjs`, `check-contrast.mjs`).

Consumed by **both** the operator SPA and the entrant site as `@scheduler/design-system` (components/icons via the barrel; CSS + Tailwind preset via subpaths). The SPA's Tailwind config also scans the DS package sources so classes used only inside shared components still get emitted.

---

## 8. Tests & verification

| Layer | Where | What |
|---|---|---|
| Backend pytest | `products/scheduler/tests/` | ~45 integration/characterization files + `tests/unit/` (63 files, incl. `unit/scheduling/`). `test_tenant_isolation.py` derives all workspace routes from OpenAPI and fails CI on a missing tenancy seam. `conftest.py` puts `backend/` first on sys.path (shadow-package hazard) and provides per-test SQLite + ETag handling. |
| Frontend vitest | colocated `__tests__/` dirs | Component/store/contract tests; `moduleContract.test.ts` pins the module model to the running app. |
| Entrant vitest | `entrant/tests/` | Route renders + boundary/security guards. |
| E2E Playwright | `products/scheduler/e2e/` | Numbered specs 00–99 (`make test-e2e`, boots Docker — NOT in CI). Only `interaction-smoke.spec.ts` is CI-gated (real uvicorn + prod Vite build + error harness; seeds owner and viewer workspaces). `interaction-sweep/` presses every interactive element for audits. |
| Simulator | `products/scheduler/simulator/` | Internal HTTP-only full-workflow tool (`make sim*`, not CI): scenarios (small/full meet, bracket, mixed, entry_states, chaos, demo) + `invariants.py` comparing server read-models against its own shadow ledger. |

---

## 9. Docs site — `docs/` (VitePress)

- `architecture/` — system-overview, backend-structure, data-flow, state-management, workspace-model, scheduling-unification, draw-formats, entrant-tier, operational-scenarios, quality-attributes + `workspace-suite/` ownership/boundary maps and glossary.
- `decisions/` — 12 ADRs: 0001 four-module split · 0002 workspace control plane · 0003 SQLite primary · 0004 CP-SAT engine · 0005 `coming_soon` elimination · 0006 unify scheduling core, don't merge match records · 0007 bracket results via command queue · 0008 shared scoring field set · 0009 universal match contract · 0010 nav model in platform layer · 0011 cross-product boundary policy · 0012 remove Supabase mirror.
- `contracts/` — the seam docs: meet-operations, bracket-operations, operations-display.
- `how-to/` — extension recipes: add-a-module, add-a-surface, add-an-api-endpoint, add-a-cpsat-constraint, wire-a-seam, enable-a-module, deploy, install-local/selfhost, add-a-worker, operations.
- `modules/` — per-module reference (meet, bracket, operations, display, entries, settings).
- `programs/` — internal ledgers (`CLOUD_PROGRESS`, `CONSOLE*`, `ENTRIES`, `FRONTEND`, `P7`, `REFACTOR`, `SEC` + design-plan notes).
- `audits/` — dated audits/reviews + `debt-log.md` (live tech-debt ledger).
- `api/`, `getting-started/`, `tutorials/`, `templates/`, `examples/`, `changes/`, `progress/`, `superpowers/` — API reference, onboarding, walkthroughs, session handoffs.
- Gates: `npm run docs:build` fails on broken internal links; `docs:freshness` (advisory) flags pages lagging their source areas.

---

## 10. Infra: CI, Docker, Makefile, scripts

### CI (`.github/workflows/ci.yml`) — every push/PR, no branch filter (deliberate)

1. **frontend** — eslint, vitest, depcruise, knip (report-only).
2. **entrant** — lint, typecheck, tests, depcruise, server-only boundary via real build, page-weight budget, knip.
3. **backend** — ruff (`F` only, lean by design) + pytest, with a Postgres 16 service for dual-dialect solve-queue tests.
4. **compose-lint** — `docker compose config -q` over all six compose files.
5. **interaction-smoke** — required: real backend + prod Vite build + Playwright, catches "pressing the UI breaks it" bugs.

`publish-release.yml` builds backend/frontend/entrant images to GHCR on `main` pushes and version tags.

### Docker stacks (`products/scheduler/`)

| Compose file | Stack |
|---|---|
| `docker-compose.yml` | Default local dev: backend + frontend, SQLite |
| `.dev.yml` | + Postgres sidecar (exercise the cloud path locally) |
| `.cloud.yml` | SaaS shape: api (migrations owner) + Postgres + N standalone workers |
| `.selfhost.yml` | Production self-host: SPA + API + Postgres + embedded worker + cloudflared (tunnel dials out; no inbound port) |
| `.worker.yml` | Worker-only compute host joining over tailnet |
| `.release.yml` | Pulls prebuilt GHCR images, zero-build startup |

`frontend/nginx.conf` splits `/e/` to the entrant tier, strips the operator cookie on that path, and rate-limits keyed off `CF-Connecting-IP` only when trusted via realip (fail-closed, SP-SEC-1).

### Makefile (root, delegating to `products/scheduler/Makefile`)

`scheduler` / `scheduler-dev` / `scheduler-rebuild` · `entrant-dev` (:5174) · `local-dev` (SPA + entrant together) · `stop/logs/ps/clean` · `test` / `test-e2e` · **`check`** (the full local gate: eslint + `tsc -b` + entrant typecheck + vitest + depcruise + ruff + pytest + advisory docs-freshness) · `sim*` · `generate-api` (regenerate DTOs).

### Scripts

Root `scripts/`: `docs-freshness.mjs`, `audit_input_surface.py` (OpenAPI unbounded-field audit), `codanna-serve.ps1` (code-intel MCP server loop). Frontend: `lucide-to-phosphor.mjs` codemod. Design system: class/contrast checkers.

---

## 11. Cross-cutting interactions (the seam map)

**Request path (backend):** HTTP → middleware (CORS, request-id, CSRF, body-limit) → router in `api/` (auth dep + `require_tournament_access`) → `services/` → `repositories/local.py` (one session per request) → ORM → SQLite/Postgres. Session closed by middleware.

**Solve path (never in-request for the batch solve):** `POST /tournaments/{id}/solve-jobs` → DB-backed queue → worker loop (embedded thread in local mode, `python -m worker` container in cloud) → `solve_runner` spawns a **subprocess** (`solve_child`) → `scheduler_core.engine.cpsat_backend` → client polls the job. Interactive solves (proposals, director, bracket, repair, warm-restart) stay in-request through tenant-scoped routes. `suggestions_worker` re-optimizes speculatively in-process on advisory/commit events.

**Named module seams** (declared in `moduleContract.ts`, pinned by its test):

| Seam | Edge | Mechanism |
|---|---|---|
| Entries → Meet/Bracket | `entriesCommitted` | Server-side roster write, picked up on next `/state` read (no client subscriber) |
| Meet → Operations | `scheduleFinalized` | `tournamentStore.setSchedule` store subscription seeds the live layout |
| Bracket → Operations | `drawGenerated` | Same store/read pattern; results flow BACK via `POST .../commands` (idempotent), not a direct edge |
| Operations → Display | `matchStateChanged` | Display polls match states independently |
| Operations → Bracket advancement | — | **Deliberately UNWIRED**; the contract test pins its absence |

**Frontend ↔ backend boundary:** SPA `apiClient` (cookies + CSRF header) for everything operator-side; entrant SSR reads via credential-less `apiFetch.server.ts` and entrant browsers write straight to FastAPI; spectators read via `/display/{token}/*` only.

**Enforced boundaries:** dependency-cruiser — `platform ↛ products/pages/app` (ERROR), cross-product internals (WARN, ratcheting), `entrant ↛ operator frontend` (ERROR). Backend shadow-package hazard (`frontend/src/app` vs `backend/app`) handled by test sys.path ordering.

---

## 12. Frozen / legacy / internal

- `archive/tournament-pre-merge/` — frozen pre-merge product; excluded from pytest by root `conftest.py`. Never edit.
- `products/scheduler/legacy/` — archived single-container deployment, explicitly marked dead and *actively wrong* (floating ortools version); reference only.
- `products/scheduler/shared/non-scheduling-keys.json` — config-lock allowlist data file.
- `products/scheduler/tools/generate_openapi.py` — OpenAPI schema dump for client generation.
- `.agents/skills/` + `skills-lock.json` — design/brand skill packs for AI-assisted work (`shuttleworks-design` is the product's own UI kit).
- `examples/` — two standalone `scheduler_core` usage scripts.
- `products/scheduler/docs/` — a single product-local smoke note; all real docs live in root `docs/`.
