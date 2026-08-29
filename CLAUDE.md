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
- `infra/compose` + `infra/nginx` — the six deployment stacks and the nginx configs. Dockerfiles stay with their apps. Since SP-HOST-1 the frontend image ships **three** files, one server block each: `http-shared.conf` (maps, rate-limit zones, realip — http context, no server), `console.conf` (`listen 8080`, operator console + `/api/`), `play.conf` (`listen 8081`, the public entrant tier). One server block per FILE is load-bearing: `apps/entrant/tests/helpers/nginxConf.ts` models a conf without tracking which `server {}` encloses a location, so two blocks in one file merge the tiers and leave every ingress assertion green while describing a config nginx never serves. **No hostname appears in any of them** — the Cloudflare tunnel routes hostname→port (`APP_HOSTNAME`→8080, `PLAY_HOSTNAME`→8081), so the domain stays configuration.
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
- Single frontend test: `npm --prefix apps/console run test:run -- apps/console/src/lib/__tests__/ganttTimeline.test.tsx` (filter with `-t "name"`). Type gate `tsc -b` runs inside `build`.
- Single backend test: `pytest tests/backend/unit/test_bracket_response_cache.py` (or `pytest -k name`). rootdir is the repo root; async tests are opt-in (`asyncio_mode = strict`).
- Docs: `npm run docs:dev` to browse; `npm run docs:build` is a gate (fails on broken internal links); `npm run docs:freshness` flags docs lagging the code.

### Running the backend locally without Docker (Windows)
- **TRAP: if the Docker stack is (still) up, Vite proxies to the CONTAINER, not your host backend.** `vite.config.ts` defaults the `/api` proxy to `:8000` — exactly where `shuttleworks-local-backend-1` listens — so without `VITE_API_PROXY_TARGET` every browser call hits the container's *baked image* (possibly weeks stale) and its bind-mounted `data/local.db`, while your host uvicorn (`:8600`, using a CWD-relative `local.db`) serves nothing. Backend code changes then silently "don't work" in the browser. Check `docker ps` first; `make stop` the stack, run the host backend with `DATABASE_URL` pointed at `data/local.db` (absolute URL) to keep the same data, and start Vite with `VITE_API_PROXY_TARGET=http://localhost:8600`.
- `uvicorn core.main:app --port 8600` from `apps/api/src` using the repo `.venv\Scripts\python.exe`. Auto-runs Alembic + seeds a synthetic local-dev user (no auth). **Port 8000 is unusable** — it's in a Windows reserved range, so uvicorn dies with `PermissionError` binding it.
- Point Vite at it: `VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev`.
- **The Vite dev proxy buffers `text/event-stream`** — SSE solver-progress UIs stall through `:5173` *in dev only* (fine direct-to-backend and in prod). Not a defect.

## Architecture — the module model
ShuttleWorks is a **workspace control plane**, not a stack of apps: the Hub (`/`) lists workspaces; each workspace enables **modules**. Four architectural modules share one anatomy — intake → engine → emit:
- **Meet** & **Bracket** are ENGINES (roster/config/draw → CP-SAT in `packages/scheduler-core/` → matches). Both import the same pure, HTTP-free engine; their match *records* stay separate (non-merged — ADR 0006). Non-obvious: **neither Meet lineup nor Bracket advancement is a CP-SAT constraint** — both pre-resolve fully-formed matches and hand them to the same solver + plugins. Scheduling params become a `ScheduleConfig` in one place — `apps/api/src/shared/scheduling/params.py` (`build_schedule_config`); constraints are plugins in `packages/scheduler-core/scheduler_core/engine/constraints/`.
- **Operations** OPERATES matches: a Plan board + a live **Run** surface (`apps/console/src/modules/operations/run/` + `runtime/`) governed by an Operations-owned match-state machine (canonical `scheduled→called→playing→finished|retired`) and an idempotent command queue. It is **Tier-2** — always-on, no enable flag, `ArchModuleId = ModuleId | 'operations'`, no `workspace_modules` row.
- **Display** PROJECTS results (read-only poll). Since SP-CLOUD-2 it owns the public capability-token routes `/display/{token}/*` (strict projection; raw tournament UUIDs are never public keys).

**The module contract is load-bearing.** `apps/console/src/platform/contracts/moduleContract.ts` declares, per module, what it owns/produces/consumes (segments, `apiClient` endpoints by *reference*, DTOs, seam edges); its test (`__tests__/moduleContract.test.ts`) holds those declarations to the running app. Adding a module touches that contract + its test baselines AND `ModuleId`, backend `MODULE_IDS`/`derive_modules`, `AppTab`, `buildWorkspaceNav`, `moduleModel.ts` (`MODULE_ORDER`/`MODULE_LABELS`/`moduleForTab`), and `ModuleOutlet`.

**The API has the same contract, machine-checked since SP-REORG-1 Phase 2.** `apps/api/.importlinter` holds fifteen contracts: persistence direction (nothing under `db`/`repositories` reaches up), the shared kernel's direction, `scheduler_core` purity, `shared/` names no domain, per-domain independence, and the **pinned absence** of Operations→Bracket — the backend twin of the console contract test. Run `cd apps/api/src && lint-imports --config ../.importlinter`; it is in `make check` and blocking in CI. The domain contracts judge DIRECT imports only (everything reaches the kernel; that is what a kernel is for). Every allowance is marked `DEBT(REORG-1)` and explained in that file — there are no unexplained ignores. Phase 3 gave the five cross-domain modules real homes (ruling R1): sport rules and the ScheduleConfig seam to `shared/`, SMTP and the abuse throttle to `core/`, Turnstile to `identity/` — so no domain owns code two others import.

**Seams** (named cross-module edges): Meet→Operations `scheduleFinalized`, Bracket→Operations `drawGenerated`, Operations→Display `matchStateChanged`; Operations→Bracket *advancement* is deliberately UNWIRED (the contract test pins it). Bracket result recording flows through the command path `POST /bracket/commands` (idempotent), not the legacy `/bracket/results`.

**Data:** single-store — SQLite on the director's laptop in local mode, Postgres in cloud mode and in the private production-parity demo. **There is no replication layer**: nothing in the write path touches the network, so an event completes with the internet down all day. In-product recovery is `tournament_backups` (list/create/restore snapshots); the demo additionally has verified physical backups and restore drills through `tools/demo-compose.sh` (ADR 0016). The Supabase mirror (`sync_queue` outbox + Realtime) was **removed entirely** in SP-CLOUD-3 — Supabase is absent from the product; if you meet it in an old doc or commit, it no longer exists (ADR 0012).

**Cloud runtime & auth (SP-CLOUD, 2026-08):**
- The meet batch solve is an **async job** (`POST /tournaments/{id}/solve-jobs`, idempotency keys, worker subprocess with pinned determinism; old `/schedule` routes answer 410). One worker loop runs embedded (local) or as `python -m worker` containers. Interactive solves (proposals/director/bracket) stay in-request by design — but only through **tenant-scoped** routes: the untenanted `POST /schedule/repair` and `/schedule/warm-restart` also answer 410 (the engines behind them are very much alive, reached via `/tournaments/{id}/schedule/proposals[/warm-restart]`).
- Deployment stacks, each with its own `.env.*.example` next to it: `docker-compose.yml` (default dev, project `shuttleworks-local`), `.dev.yml` (+ Postgres, `make dev-postgres`), `.cloud.yml` (smoke stack, deliberately `ENVIRONMENT=local`), `.selfhost.yml` (canonical production: SPA + API + Postgres + cloudflared — the tunnel points at `frontend:8080`, and `api` carries a `backend` network alias so one `nginx.conf` serves every stack), `.worker.yml` (remote compute host). `demo.override.yml` composes over the default stack for the Tailscale demo, retaining production application images while adding an isolated Postgres 16 database; it is governed by ADR 0016, not a second production definition. CI parses every standalone stack and the combined demo configuration.
- Lease ownership is checked on **both** lease-mutating writes — completion *and* heartbeat. A worker that lost its lease must not extend it; see `apps/api/src/solve_rail/solve_jobs.py` and `tests/backend/unit/test_lease_recovery.py`.
- `/health` is public liveness (dependency-free on purpose). `/health/ready|deep|metrics` carry operational detail and require `X-ShuttleWorks-Ops-Token`; `OPS_TOKEN` is blank (guard off) in local mode and **required** by the cloud API profile. Do not rely on ingress to hide them — a tunnel publishes a hostname, not a route list.
- **Two origins, not one host split by path (SP-HOST-1, 2026-08-23).** `app.<domain>` = operator console + `/api/`, behind Cloudflare Access. `play.<domain>` = the public entrant tier (`/e/*`), **never** behind Access. Origin is what scopes cookies/`localStorage`/IndexedDB/service-worker scope; `Path=` is not and is not enforced against same-origin script, so the old shared origin put the operator's `sw_session` in reach of code on the public entry site. **Never set `SESSION_COOKIE_DOMAIN`** — the API refuses to start if it is non-blank (`_enforce_host_only_cookies`), and host-only cookies are the whole mechanism. `CORS_ORIGINS` names the operator origin ALONE and `*` is a startup error (Starlette echoes the request Origin under `allow_credentials`). Absolute links route through exactly two settings properties, `settings.app_origin` / `settings.play_origin` — never the raw `public_*_origin`, which a test forbids. The play host terminates its own `/e/api/` + `/e/account/` because every entrant write is a native form POST on a relative path (CSP `form-action 'self'` would block a cross-host one), so no browser CORS is involved anywhere.
- Identity: cookie sessions (`users`/`auth_sessions`, Argon2id, CSRF header `X-ShuttleWorks-CSRF: 1` on cookie-carrying writes). `AUTH_MODE=local` (default) resolves credential-less requests to the zero-UUID bootstrap operator — the solo flow stays zero-friction and offline; `AUTH_MODE=cloud` requires real accounts.
- Tenancy: orgs own workspaces (`tournaments.org_id`); membership in `tournament_members` (FK to `users`). **Every workspace route needs a path param named exactly `tournament_id` + `Depends(require_tournament_access(role))`, which answers a uniform 404 to non-members** — `tests/backend/test_tenant_isolation.py` derives all such routes from OpenAPI and fails CI on a missing seam. See `apps/api/README.md` ("Auth & tenancy") and `docs/how-to/add-an-api-endpoint.md`.
- Current architecture and runtime guidance: `docs/explanation/architecture/system-overview.md`, `docs/explanation/architecture/backend-structure.md`, and the deployment how-to pages. Open work belongs in `docs/reference/debt-log.md`.

The authoritative deeper reference is the VitePress docs site (`docs/`), organised in **Diataxis quadrants**: `tutorials/` (learning), `how-to/` (task), `reference/` (lookup — modules, contracts, api, glossary, repo-layout, **debt-log**), and `explanation/` (understanding — `architecture/`, `decisions/`). Start at `explanation/architecture/system-overview`, `explanation/architecture/data-flow`, `reference/contracts/`, and the `how-to/` guides.

## Code navigation — Zed and language-server first
When working interactively, use Zed's project search, file finder, symbol outline,
and language-server definition/reference navigation to locate the smallest relevant
surface before opening a broad file. The same approach works in any editor with an
active language server. For command-line or agent sessions, use rg for targeted
searches and read only the relevant line ranges. Markdown, YAML, and other config
files are searched directly because they are not language-server indexed.

No external code-index service or MCP server is required for repository navigation.

## Architecture boundaries (enforced by dependency-cruiser)
- `apps/console/src/platform/` is the foundation layer — it must NOT import from `apps/console/src/modules/` or the retired pages layer (**ERROR**, clean), nor from `apps/console/src/app/` (**ERROR** since the `workspaceNav` relocation, clean — the nav model now lives in `apps/console/src/platform/product-shell/`).
- Feature modules under `apps/console/src/modules/{meet,bracket,operations,display,hub,settings,workspace,entries}/` must NOT import each other's internals. **A NEW cross-module edge is an ERROR** since SP-REORG-1 Phase 4; the 16 that predate the ratchet are enumerated by source in `KNOWN_CROSS_MODULE` (`apps/console/.dependency-cruiser.cjs`) and warn. Retiring a cluster = fix its edges, delete its line — the list only shortens. ADR 0011 + ADR 0013. Shared code lives in `components/`, `hooks/`, `lib/`, `store/`, `apps/console/src/api/` or `apps/console/src/platform/domain/` — the sorting rule is a table in `CODE_HEALTH.md` 1b, keyed on consumer count. (`utils/` is gone; it merged into `lib/`.) `SourceChip`, used by three modules, lives in `components/`.
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
- **`CODE_HEALTH.md` is the standing code-health discipline** (applies to normal feature work, not just refactor programs): follow prior art, bounded Boy-Scout cleanup, cover-before-modify for high-complexity/low-coverage "locked" functions, and log out-of-scope debt to `docs/reference/debt-log.md` instead of silently fixing or ignoring it. Completed program rationale is captured by the current architecture pages and ADRs.
- **Current decisions and status live in the VitePress docs**: accepted ADRs under `docs/explanation/decisions/`, architecture and module references under `docs/explanation/` and `docs/reference/`, and open work in `docs/reference/debt-log.md`. Do not create a parallel progress ledger in a root or app README.
- Before calling a task done, run the relevant gate (`make check`, or the specific test/lint command) — don't report success on an unverified change.
- State the files in scope before editing; don't touch files outside that scope without flagging it.
- Refactors must not change behavior. If a test would need to change to keep passing, stop and flag it instead of editing the test to match new behavior.
- Don't restate rules `ruff`/eslint already enforce deterministically — fix the lint config instead of repeating style rules here.

## Known hazards
- Shadow packages: **resolved by SP-REORG-1 Phase 3.** The API's `app` package became `core`, so `apps/console/src/app` is now the only `app` in the tree. Tests put `apps/api/src` on sys.path (`tests/backend/conftest.py`) because that is the API's import root, not to disambiguate a collision.
- Backend ordering: list queries need a stable tiebreaker (`created_at DESC, id DESC` — `id` is a random UUID; `created_at` alone ties non-deterministically across SQLite/Postgres).
- Route registration: newer FastAPI keeps each `include_router` as a nested `_IncludedRouter` (`path=None`) rather than flattening onto `app.routes` — assert a route exists via `app.openapi()["paths"]`, not `app.routes`.
- vitest hoisting: `vitest` must stay hoisted to the **root** `node_modules` (root `@testing-library/jest-dom` resolves it there) and is a root devDep; pin `@vitest/coverage-v8` to vitest's major (project is on vitest 3).
- Nav model: the left sidebar (`apps/console/src/platform/product-shell/workspaceNav.ts`, `buildWorkspaceNav`) is the real in-workspace navigation. The old horizontal TabBar / ModuleDock / `BRACKET_TABS` were removed 2026-08-17 — only stale prose comments mentioning "TabBar" remain; `lib/bracketTabs.ts` now holds just the live tab-id/view helpers.
- Playwright MCP screenshots: `browser_take_screenshot` saves a **bare** `filename` to the repo **root** (its output-dir is CWD — the plugin runs `@playwright/mcp` with no `--output-dir`), littering root with `*.png` (verified 2026-07-01). Always pass `filename: ".playwright-mcp/<name>.png"` — that dir is gitignored and is the documented home (page-snapshots/console logs already land there); use `docs/screenshots/<name>.png` (also gitignored) for keeper reference shots. Root `*.png` is gitignored as a backstop, but keep pics out of it.
- CRLF working tree: the repo is `core.autocrlf=true` and sources are checked out **CRLF**, so a tool that rewrites a file with **LF** endings changes every line on disk while `git diff` stays **clean and small** — git normalizes both sides to LF before comparing, so the whole-file rewrite is invisible in the diff and shows up only in the file's mtime and in whatever else reads the working tree. Prefer edits that preserve a file's existing endings over tools that rewrite it whole, and check `git diff --stat` is proportionate to the change before every commit.

## CI & the lean-gate philosophy
`.github/workflows/ci.yml` runs frontend (eslint + vitest + depcruise) and backend (ruff + pytest) — **both required** — on **every** push and PR, with no branch filter. That is deliberate: the old `[main, "dev/**"]` allowlist silently stopped matching the day `CONTRIBUTING.md` retired `dev/*` for `<type>/<slug>`, so pushes to `sec/hardening` ran no CI at all — invisibly, because a green PR check looks identical either way. Don't reintroduce a filter that has to be kept in step with a naming convention. e2e is intentionally NOT in the PR gate (it boots the Docker stack). The gates are deliberately **lean so they stay green** — don't "fix" them by blindly tightening:
- **ruff** gates on `select = ["F"]` (pyflakes) only; the broader `E,I,B,UP` set (~1400 mostly-stylistic findings, plus `B008` false-positives on FastAPI `Depends()`) is a deferred cleanup noted in `pyproject.toml`.
- **eslint** downgrades 7 newly-strict rules (react-hooks v7 react-compiler rules + `no-explicit-any` + `only-export-components`) to `warn`; `rules-of-hooks` stays error.
- **depcruise** / jscpd / knip cross-product + duplication findings are `warn` / report-only to ratchet, not block.

## Future / not yet done
- mypy on scheduler_core (typed domain core) — candidate next step.
- Ratchet the depcruise `warn` rules and broaden ruff once the deferred cleanups land.
