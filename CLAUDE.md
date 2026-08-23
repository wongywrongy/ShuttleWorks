# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ShuttleWorks

Monorepo: a CP-SAT scheduling product (meets + bracket draws) plus a shared design system.
- `apps/console` — React + Vite + Zustand (the app).
- `apps/api` — FastAPI + SQLAlchemy. Source lives under `apps/api/src/`, which is a **sys.path root, not a package**: imports read `from meet.schedule import ...`. One package per domain (`core shared db repositories workspaces identity meet bracket operations display entries solve_rail ops`), each owning its routers AND its services.
- `packages/scheduler-core/scheduler_core/` — pip-installed CP-SAT engine (domain models, solver). Imported as `scheduler_core.*` (the kebab-case folder is the distribution; the import name is unchanged).
- `apps/entrant` — React Router 7 SSR public tier, zero client JS, served under `/e/`.
- `packages/design-system` — shared React components.
- `packages/shared-contract/` — data both tiers read (`non-scheduling-keys.json`).
- `infra/compose` + `infra/nginx` — the six deployment stacks and the three server configs. Dockerfiles stay with their apps.
- `tests/backend`, `tests/e2e`, `simulator/`, `tools/` — top level; none of them belongs to one app.
- `archive/` — FROZEN pre-merge tournament product. Never edit.

## Commands
- Frontend tests: `npm --prefix apps/console run test:run`  (vitest)
- Frontend lint: `npm run lint:scheduler` (the npm script names still say `scheduler`; only the workspace paths moved)
- Backend tests: `pytest`  (rootdir is the repo root; needs the repo .venv active)
- Architecture boundaries: `npm run depcruise` (console/entrant) + `cd apps/api/src && lint-imports --config ../.importlinter` (the API's 15 import contracts)
- Python lint: `ruff check apps/api tests/backend tests/e2e simulator tools packages/scheduler-core`
- All local checks at once: `make check` — **both tiers**: console (eslint, `tsc -b`, vitest, depcruise), entrant (eslint, `typecheck:entrant`, vitest, depcruise), then ruff, **import-linter**, pytest. The type gates were added 2026-08-10 (`make check` ran no build, so it structurally could not catch a TypeScript error that CI fails on); the entrant tier's lint/test/depcruise were added 2026-08-22 for the same reason — CI's `entrant` job had run them since the tier shipped, so a regression there was invisible locally.
- Regenerate console DTOs after API schema changes: `make generate-api` (root target; then reconcile `apps/console/src/api/dto.ts` by hand)
- Run the app: `make scheduler` (Docker; console :80, api :8000) or `make scheduler-dev` (Vite :5173 + HMR); `make stop`. Where host :8000 and :80 are taken (both are on this Windows box), prefix `BACKEND_HOST_PORT=8600 FRONTEND_HOST_PORT=8090`.
- Single frontend test: `npm --prefix apps/console run test:run -- src/path/x.test.ts` (filter with `-t "name"`). Type gate `tsc -b` runs inside `build`.
- Single backend test: `pytest tests/backend/unit/test_x.py::test_name` (or `pytest -k name`). rootdir is the repo root; async tests are opt-in (`asyncio_mode = strict`).
- Docs: `npm run docs:dev` to browse; `npm run docs:build` is a gate (fails on broken internal links); `npm run docs:freshness` flags docs lagging the code.

### Running the backend locally without Docker (Windows)
- **TRAP: if the Docker stack is (still) up, Vite proxies to the CONTAINER, not your host backend.** `vite.config.ts` defaults the `/api` proxy to `:8000` — exactly where `shuttleworks-local-backend-1` listens — so without `VITE_API_PROXY_TARGET` every browser call hits the container's *baked image* (possibly weeks stale) and its bind-mounted `data/local.db`, while your host uvicorn (`:8600`, CWD-relative `apps/api/src/local.db`) serves nothing. Backend code changes then silently "don't work" in the browser. Check `docker ps` first; `make stop` the stack, run the host backend with `DATABASE_URL` pointed at `data/local.db` (absolute URL) to keep the same data, and start Vite with `VITE_API_PROXY_TARGET=http://localhost:8600`.
- `uvicorn core.main:app --port 8600` from `apps/api/src` using the repo `.venv\Scripts\python.exe`. Auto-runs Alembic + seeds a synthetic local-dev user (no auth). **Port 8000 is unusable** — it's in a Windows reserved range, so uvicorn dies with `PermissionError` binding it.
- Point Vite at it: `VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev`.
- **The Vite dev proxy buffers `text/event-stream`** — SSE solver-progress UIs stall through `:5173` *in dev only* (fine direct-to-backend and in prod). Not a defect.

## Architecture — the module model
ShuttleWorks is a **workspace control plane**, not a stack of apps: the Hub (`/`) lists workspaces; each workspace enables **modules**. Four architectural modules share one anatomy — intake → engine → emit:
- **Meet** & **Bracket** are ENGINES (roster/config/draw → CP-SAT in `packages/scheduler-core/` → matches). Both import the same pure, HTTP-free engine; their match *records* stay separate (non-merged — ADR 0006). Non-obvious: **neither Meet lineup nor Bracket advancement is a CP-SAT constraint** — both pre-resolve fully-formed matches and hand them to the same solver + plugins. Scheduling params become a `ScheduleConfig` in one place — `apps/api/src/shared/scheduling/params.py` (`build_schedule_config`); constraints are plugins in `packages/scheduler-core/scheduler_core/engine/constraints/`.
- **Operations** OPERATES matches: a Plan board + a live **Run** surface (`apps/console/src/modules/operations/run/` + `runtime/`) governed by an Operations-owned match-state machine (canonical `scheduled→called→playing→finished|retired`) and an idempotent command queue. It is **Tier-2** — always-on, no enable flag, `ArchModuleId = ModuleId | 'operations'`, no `workspace_modules` row.
- **Display** PROJECTS results (read-only poll). Since SP-CLOUD-2 it owns the public capability-token routes `/display/{token}/*` (strict projection; raw tournament UUIDs are never public keys).

**The module contract is load-bearing.** `src/platform/contracts/moduleContract.ts` declares, per module, what it owns/produces/consumes (segments, `apiClient` endpoints by *reference*, DTOs, seam edges); its test (`__tests__/moduleContract.test.ts`) holds those declarations to the running app. Adding a module touches that contract + its test baselines AND `ModuleId`, backend `MODULE_IDS`/`derive_modules`, `AppTab`, `buildWorkspaceNav`, `moduleModel.ts` (`MODULE_ORDER`/`MODULE_LABELS`/`moduleForTab`), and `ModuleOutlet`.

**The API has the same contract, machine-checked since SP-REORG-1 Phase 2.** `apps/api/.importlinter` holds fifteen contracts: persistence direction (nothing under `db`/`repositories` reaches up), the shared kernel's direction, `scheduler_core` purity, `shared/` names no domain, per-domain independence, and the **pinned absence** of Operations→Bracket — the backend twin of the console contract test. Run `cd apps/api/src && lint-imports --config ../.importlinter`; it is in `make check` and blocking in CI. The domain contracts judge DIRECT imports only (everything reaches the kernel; that is what a kernel is for). Every allowance is marked `DEBT(REORG-1)` and explained in that file — there are no unexplained ignores. Phase 3 gave the five cross-domain modules real homes (ruling R1): sport rules and the ScheduleConfig seam to `shared/`, SMTP and the abuse throttle to `core/`, Turnstile to `identity/` — so no domain owns code two others import.

**Seams** (named cross-module edges): Meet→Operations `scheduleFinalized`, Bracket→Operations `drawGenerated`, Operations→Display `matchStateChanged`; Operations→Bracket *advancement* is deliberately UNWIRED (the contract test pins it). Bracket result recording flows through the command path `POST /bracket/commands` (idempotent), not the legacy `/bracket/results`.

**Data:** single-store — SQLite on the director's laptop in local mode, Postgres in cloud mode. **There is no replication layer**: nothing in the write path touches the network, so an event completes with the internet down all day. In-product recovery is `tournament_backups` (list/create/restore snapshots). The Supabase mirror (`sync_queue` outbox + Realtime) was **removed entirely** in SP-CLOUD-3 — Supabase is absent from the product; if you meet it in an old doc or commit, it no longer exists (ADR 0012).

**Cloud runtime & auth (SP-CLOUD, 2026-08):**
- The meet batch solve is an **async job** (`POST /tournaments/{id}/solve-jobs`, idempotency keys, worker subprocess with pinned determinism; old `/schedule` routes answer 410). One worker loop runs embedded (local) or as `python -m worker` containers. Interactive solves (proposals/director/bracket) stay in-request by design — but only through **tenant-scoped** routes: the untenanted `POST /schedule/repair` and `/schedule/warm-restart` also answer 410 (the engines behind them are very much alive, reached via `/tournaments/{id}/schedule/proposals[/warm-restart]`).
- Deployment stacks, each with its own `.env.*.example` next to it: `docker-compose.yml` (default dev, project `shuttleworks-local`), `.dev.yml` (+ Postgres, `make dev-postgres`), `.cloud.yml` (smoke stack, deliberately `ENVIRONMENT=local`), `.selfhost.yml` (production: SPA + API + Postgres + cloudflared — the tunnel points at `frontend:8080`, and `api` carries a `backend` network alias so one `nginx.conf` serves every stack), `.worker.yml` (remote compute host). CI lints all six with `docker compose config`.
- Lease ownership is checked on **both** lease-mutating writes — completion *and* heartbeat. A worker that lost its lease must not extend it; see `apps/api/src/solve_rail/solve_jobs.py` and `tests/backend/unit/test_lease_recovery.py`.
- `/health` is public liveness (dependency-free on purpose). `/health/ready|deep|metrics` carry operational detail and require `X-ShuttleWorks-Ops-Token`; `OPS_TOKEN` is blank (guard off) in local mode and **required** by the cloud API profile. Do not rely on ingress to hide them — a tunnel publishes a hostname, not a route list.
- Identity: cookie sessions (`users`/`auth_sessions`, Argon2id, CSRF header `X-ShuttleWorks-CSRF: 1` on cookie-carrying writes). `AUTH_MODE=local` (default) resolves credential-less requests to the zero-UUID bootstrap operator — the solo flow stays zero-friction and offline; `AUTH_MODE=cloud` requires real accounts.
- Tenancy: orgs own workspaces (`tournaments.org_id`); membership in `tournament_members` (FK to `users`). **Every workspace route needs a path param named exactly `tournament_id` + `Depends(require_tournament_access(role))`, which answers a uniform 404 to non-members** — `tests/backend/test_tenant_isolation.py` derives all such routes from OpenAPI and fails CI on a missing seam. See `apps/api/README.md` ("Auth & tenancy") and `docs/how-to/add-an-api-endpoint.md`.
- Ledger: `docs/history/programs/CLOUD_PROGRESS.md`. Current snapshot: `docs/history/audits/08-state-of-codebase.md`.

The authoritative deeper reference is the VitePress docs site (`docs/`), organised in **Diataxis quadrants** since SP-REORG-1 Phase 5: `tutorials/` (learning), `how-to/` (task), `reference/` (lookup — modules, contracts, api, glossary, repo-layout, **debt-log**), `explanation/` (understanding — `architecture/`, `decisions/`). Anything that cannot name a quadrant is `history/`, which is excluded from the built site and never rewritten. Start at `explanation/architecture/system-overview`, `explanation/architecture/data-flow`, `reference/contracts/`, and the `how-to/` guides. `docs/README.md` states the rule.

## Code navigation — codanna first
Before grep/Read on anything in `apps/` or `packages/`, use codanna:
1. `codanna mcp semantic_search_with_context query:"..." limit:5` — start here for "where is X" / "how does X work". Use specific technical terms, not vague phrases.
2. Read only the returned line range (`limit = end_line - start_line + 1`), not the whole file.
3. `codanna retrieve describe symbol_id:N` — full signature, docs, calls, callers.
4. `codanna retrieve callers <symbol>` / `codanna retrieve calls <symbol>` — trace usage before changing or removing anything.

Fall back to grep/Read for non-indexed files (markdown, YAML, config) or when semantic search returns nothing above ~0.6 relevance.

**One-time setup** (the index is per-machine; `.codanna/` is gitignored): install codanna **0.9.22**, add `~/.local/bin` to PATH, then from the repo root run `codanna index apps/api/src apps/console/src apps/entrant/app packages/design-system packages/scheduler-core`. On Windows set `parallelism = 4` + `tantivy_heap_mb = 25` in `.codanna/settings.toml` and keep `index_path` outside any OneDrive-synced folder (Defender locks Tantivy writes otherwise). Re-index after large pulls with `codanna index`.

**The MCP server runs in HTTP mode** (`.mcp.json` → `http://127.0.0.1:8080/mcp`) so multiple CLIs share one index. **It must be running or no CLI connects** — simplest is the self-healing `.	oolsdanna-serve.ps1` (a restart loop around `codanna serve --http --watch`; leave the terminal open), or run that command bare. If codanna tools fail with `ConnectionRefused at …:8080/mcp` the server is down; a CLI still on the pre-switch stdio config instead shows `-32000` and needs a restart. Then per session run `/mcp` → authorize `codanna` (browser approval). codanna's OAuth keys are **in-memory** (nothing persisted under `~/.codanna`), so a cached token dies whenever the server restarts → re-auth ≈once per reboot is the floor (0.9.22 has no on-disk OAuth persistence and no no-auth HTTP mode). If re-auth is *more* frequent, the Scheduled Task is probably not registered (`Get-ScheduledTaskInfo -TaskName codanna-http-mcp`) so the server dies with its terminal; an on-click auth error in `/mcp` is a stale cred → `claude mcp logout codanna`, then re-auth. Keep it always-on with a per-user logon Scheduled Task (`codanna-http-mcp`) — reproducible snippet + troubleshooting live in the docs at `getting-started/code-intelligence`. Don't fall back to stdio `serve`: it takes an exclusive per-index `serve.lock`, so a second concurrent CLI's server dies with `-32000`; HTTP excludes via port binding, no lock.

## Architecture boundaries (enforced by dependency-cruiser)
- `apps/console/src/platform/` is the foundation layer — it must NOT import from `modules/` or `pages/` (**ERROR**, clean), nor from `app/` (**ERROR** since the `workspaceNav` relocation, clean — the nav model now lives in `platform/product-shell/`).
- Feature modules under `apps/console/src/modules/{meet,bracket,operations,display,hub,settings,workspace,entries}/` must NOT import each other's internals. **A NEW cross-module edge is an ERROR** since SP-REORG-1 Phase 4; the 16 that predate the ratchet are enumerated by source in `KNOWN_CROSS_MODULE` (`apps/console/.dependency-cruiser.cjs`) and warn. Retiring a cluster = fix its edges, delete its line — the list only shortens. ADR 0011 + ADR 0013. Shared code lives in `components/`, `hooks/`, `lib/`, `store/`, `api/` or `platform/domain/` — the sorting rule is a table in `CODE_HEALTH.md` 1b, keyed on consumer count. (`utils/` is gone; it merged into `lib/`.) `SourceChip`, used by three modules, lives in `components/`.
- Layer conventions are documented in `apps/console/src/{components,store,hooks,lib}/README.md` and `apps/console/src/platform/contracts/moduleContract.ts`.

## Vocabulary — workspace vs tournament
The product word is **workspace**; the schema, the route prefix and the console
store say **tournament**. They are the same thing at four altitudes:

> workspace ⟷ a `tournaments` row ⟷ `/tournaments/{tournament_id}` ⟷ `tournamentStore`

**New identifiers say workspace.** The `tournament` spelling is a fenced legacy
stratum in exactly three places (tables, the `/tournaments` prefix + the
`tournament_id` path param that `require_tournament_access` resolves BY NAME, and
`tournamentStore` + the generated DTOs). A *tournament* in the SPORTING sense — a
draw, a meet, an event — is a real domain noun and is not fenced. ADR 0014.

## Working practices
- **`CODE_HEALTH.md` is the standing code-health discipline** (applies to normal feature work, not just refactor programs): follow prior art, bounded Boy-Scout cleanup, cover-before-modify for high-complexity/low-coverage "locked" functions, and log out-of-scope debt to `docs/reference/debt-log.md` instead of silently fixing or ignoring it. `docs/history/programs/REFACTOR_PROGRESS.md` is the ledger for the (complete) SP-REFACTOR program + its Phase-5 practice install.
- **Program ledgers live in `docs/history/programs/`** (off the repo root 2026-08-06; under `history/` since SP-REORG-1 Phase 5, where `history/` means "dated working record", not "finished"): `CLOUD_PROGRESS.md` (SP-CLOUD), `SEC_PROGRESS.md` (SP-SEC), `REFACTOR_PROGRESS.md`, `FRONTEND_PROGRESS.md`, plus the `design-plan/` working notes. Each says "read at session start, update at session end" — that convention is unchanged, only the path moved. Root keeps only what a tool or convention reads by path: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_HEALTH.md`, `LICENSE`.
- Before calling a task done, run the relevant gate (`make check`, or the specific test/lint command) — don't report success on an unverified change.
- State the files in scope before editing; don't touch files outside that scope without flagging it.
- Refactors must not change behavior. If a test would need to change to keep passing, stop and flag it instead of editing the test to match new behavior.
- Don't restate rules `ruff`/eslint already enforce deterministically — fix the lint config instead of repeating style rules here.

## Known hazards
- Shadow packages: **resolved by SP-REORG-1 Phase 3.** The API's `app` package became `core`, so `apps/console/src/app` is now the only `app` in the tree. Tests put `apps/api/src` on sys.path (`tests/backend/conftest.py`) because that is the API's import root, not to disambiguate a collision.
- Backend ordering: list queries need a stable tiebreaker (`created_at DESC, id DESC` — `id` is a random UUID; `created_at` alone ties non-deterministically across SQLite/Postgres).
- Route registration: newer FastAPI keeps each `include_router` as a nested `_IncludedRouter` (`path=None`) rather than flattening onto `app.routes` — assert a route exists via `app.openapi()["paths"]`, not `app.routes`.
- vitest hoisting: `vitest` must stay hoisted to the **root** `node_modules` (root `@testing-library/jest-dom` resolves it there) and is a root devDep; pin `@vitest/coverage-v8` to vitest's major (project is on vitest 3).
- Nav model: the left sidebar (`src/platform/product-shell/workspaceNav.ts`, `buildWorkspaceNav`) is the real in-workspace navigation. The old horizontal TabBar / ModuleDock / `BRACKET_TABS` were removed 2026-08-17 — only stale prose comments mentioning "TabBar" remain; `lib/bracketTabs.ts` now holds just the live tab-id/view helpers.
- Playwright MCP screenshots: `browser_take_screenshot` saves a **bare** `filename` to the repo **root** (its output-dir is CWD — the plugin runs `@playwright/mcp` with no `--output-dir`), littering root with `*.png` (verified 2026-07-01). Always pass `filename: ".playwright-mcp/<name>.png"` — that dir is gitignored and is the documented home (page-snapshots/console logs already land there); use `docs/screenshots/<name>.png` (also gitignored) for keeper reference shots. Root `*.png` is gitignored as a backstop, but keep pics out of it.

## CI & the lean-gate philosophy
`.github/workflows/ci.yml` runs frontend (eslint + vitest + depcruise) and backend (ruff + pytest) — **both required** — on **every** push and PR, with no branch filter. That is deliberate: the old `[main, "dev/**"]` allowlist silently stopped matching the day `CONTRIBUTING.md` retired `dev/*` for `<type>/<slug>`, so pushes to `sec/hardening` ran no CI at all — invisibly, because a green PR check looks identical either way. Don't reintroduce a filter that has to be kept in step with a naming convention. e2e is intentionally NOT in the PR gate (it boots the Docker stack). The gates are deliberately **lean so they stay green** — don't "fix" them by blindly tightening:
- **ruff** gates on `select = ["F"]` (pyflakes) only; the broader `E,I,B,UP` set (~1400 mostly-stylistic findings, plus `B008` false-positives on FastAPI `Depends()`) is a deferred cleanup noted in `pyproject.toml`.
- **eslint** downgrades 7 newly-strict rules (react-hooks v7 react-compiler rules + `no-explicit-any` + `only-export-components`) to `warn`; `rules-of-hooks` stays error.
- **depcruise** / jscpd / knip cross-product + duplication findings are `warn` / report-only to ratchet, not block.

## Future / not yet done
- mypy on scheduler_core (typed domain core) — candidate next step.
- Ratchet the depcruise `warn` rules and broaden ruff once the deferred cleanups land.