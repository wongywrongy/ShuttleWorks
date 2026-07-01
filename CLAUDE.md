# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ShuttleWorks

Monorepo: a CP-SAT scheduling product (meets + bracket draws) plus a shared design system.
- `products/scheduler/frontend` — React + Vite + Zustand (the app).
- `products/scheduler/backend` — FastAPI + SQLAlchemy.
- `scheduler_core/` — pip-installed CP-SAT engine (domain models, solver). Imported as `scheduler_core.*`.
- `packages/design-system` — shared React components.
- `archive/` — FROZEN pre-merge tournament product. Never edit.

## Commands
- Frontend tests: `npm --prefix products/scheduler/frontend run test:run`  (vitest)
- Frontend lint: `npm run lint:scheduler`
- Backend tests: `cd products/scheduler && pytest`  (rootdir is products/scheduler; needs the repo .venv active)
- Architecture boundaries: `npm run depcruise`
- Python lint: `ruff check products/scheduler scheduler_core`
- All local checks at once: `make check`
- Regenerate frontend DTOs after backend schema changes: `make -C products/scheduler generate-api` (product-local target; then reconcile src/api/dto.ts by hand)
- Run the app: `make scheduler` (Docker; frontend :80, backend :8000) or `make scheduler-dev` (Vite :5173 + HMR); `make stop`. Where host :8000 is reserved (some Windows boxes), prefix `BACKEND_HOST_PORT=8600`.
- Single frontend test: `npm --prefix products/scheduler/frontend run test:run -- src/path/x.test.ts` (filter with `-t "name"`). Type gate `tsc -b` runs inside `build`.
- Single backend test: `cd products/scheduler && pytest tests/unit/test_x.py::test_name` (or `pytest -k name`). rootdir is `products/scheduler/`; async tests are opt-in (`asyncio_mode = strict`).
- Docs: `npm run docs:dev` to browse; `npm run docs:build` is a gate (fails on broken internal links); `npm run docs:freshness` flags docs lagging the code.

### Running the backend locally without Docker (Windows)
- `uvicorn app.main:app --port 8600` from `products/scheduler/backend` using the repo `.venv\Scripts\python.exe`. Auto-runs Alembic + seeds a synthetic local-dev user (no auth). **Port 8000 is unusable** — it's in a Windows reserved range, so uvicorn dies with `PermissionError` binding it.
- Point Vite at it: `VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev`.
- **The Vite dev proxy buffers `text/event-stream`** — SSE solver-progress UIs stall through `:5173` *in dev only* (fine direct-to-backend and in prod). Not a defect.

## Architecture — the module model
ShuttleWorks is a **workspace control plane**, not a stack of apps: the Hub (`/`) lists workspaces; each workspace enables **modules**. Four architectural modules share one anatomy — intake → engine → emit:
- **Meet** & **Bracket** are ENGINES (roster/config/draw → CP-SAT in `scheduler_core/` → matches). Both import the same pure, HTTP-free engine; their match *records* stay separate (non-merged — ADR 0006). Non-obvious: **neither Meet lineup nor Bracket advancement is a CP-SAT constraint** — both pre-resolve fully-formed matches and hand them to the same solver + plugins. Scheduling params become a `ScheduleConfig` in one place — `backend/services/scheduling/params.py` (`build_schedule_config`); constraints are plugins in `scheduler_core/engine/constraints/`.
- **Operations** OPERATES matches: a Plan board + a live **Run** surface (`products/scheduler/frontend/src/products/operations/run/` + `runtime/`) governed by an Operations-owned match-state machine (canonical `scheduled→called→playing→finished|retired`) and an idempotent command queue. It is **Tier-2** — always-on, no enable flag, `ArchModuleId = ModuleId | 'operations'`, no `workspace_modules` row.
- **Display** PROJECTS results (read-only poll; owns no backend routes).

**The module contract is load-bearing.** `src/platform/contracts/moduleContract.ts` declares, per module, what it owns/produces/consumes (segments, `apiClient` endpoints by *reference*, DTOs, seam edges); its test (`__tests__/moduleContract.test.ts`) holds those declarations to the running app. Adding a module touches that contract + its test baselines AND `ModuleId`, backend `MODULE_IDS`/`derive_modules`, `AppTab`, `buildWorkspaceNav`, `moduleModel.ts` (`MODULE_ORDER`/`MODULE_LABELS`/`moduleForTab`), and `ModuleOutlet`.

**Seams** (named cross-module edges): Meet→Operations `scheduleFinalized`, Bracket→Operations `drawGenerated`, Operations→Display `matchStateChanged`; Operations→Bracket *advancement* is deliberately UNWIRED (the contract test pins it). Bracket result recording flows through the command path `POST /bracket/commands` (idempotent), not the legacy `/bracket/results`.

**Data:** SQLite on the director's laptop is the source of truth; Supabase Postgres/Realtime is a mirror populated by a crash-safe **outbox** (`backend/services/sync_service.py`), so an event completes even if the cloud is unreachable all day. `commands` / `sync_queue` / `match_states` are local-only, never mirrored.

The authoritative deeper reference is the VitePress docs site (`docs/`): `architecture/system-overview`, `architecture/data-flow`, `contracts/`, and the `how-to/` extension guides.

## Code navigation — codanna first
Before grep/Read on anything in `products/scheduler` or `scheduler_core`, use codanna:
1. `codanna mcp semantic_search_with_context query:"..." limit:5` — start here for "where is X" / "how does X work". Use specific technical terms, not vague phrases.
2. Read only the returned line range (`limit = end_line - start_line + 1`), not the whole file.
3. `codanna retrieve describe symbol_id:N` — full signature, docs, calls, callers.
4. `codanna retrieve callers <symbol>` / `codanna retrieve calls <symbol>` — trace usage before changing or removing anything.

Fall back to grep/Read for non-indexed files (markdown, YAML, config) or when semantic search returns nothing above ~0.6 relevance.

**One-time setup** (the index is per-machine; `.codanna/` is gitignored): install codanna **0.9.22**, add `~/.local/bin` to PATH, then from the repo root run `codanna index products/scheduler/backend products/scheduler/frontend/src packages/design-system scheduler_core`. On Windows set `parallelism = 4` + `tantivy_heap_mb = 25` in `.codanna/settings.toml` and keep `index_path` outside any OneDrive-synced folder (Defender locks Tantivy writes otherwise). Re-index after large pulls with `codanna index`.

**The MCP server runs in HTTP mode** (`.mcp.json` → `http://127.0.0.1:8080/mcp`) so multiple CLIs share one index. **It must be running or no CLI connects** — `codanna serve --http --watch` (leave it up). If codanna tools fail with `ConnectionRefused at …:8080/mcp` the server is down; a CLI still on the pre-switch stdio config instead shows `-32000` and needs a restart. Then per session run `/mcp` → authorize `codanna` once (browser approval; token cached + auto-refreshed). Keep it always-on with a per-user logon Scheduled Task (`codanna-http-mcp`) — reproducible snippet + troubleshooting live in the docs at `getting-started/code-intelligence`. Don't fall back to stdio `serve`: it takes an exclusive per-index `serve.lock`, so a second concurrent CLI's server dies with `-32000`; HTTP excludes via port binding, no lock.

## Architecture boundaries (enforced by dependency-cruiser)
- `src/platform/` is the foundation layer — it must NOT import from `products/` or `pages/` (**ERROR**, clean), nor from `app/` (**ERROR** since the `workspaceNav` relocation, clean — the nav model now lives in `platform/product-shell/`).
- Feature products under `src/products/{meet,bracket,operations,display,hub,settings,workspace}/` must NOT import each other's internals (**WARN**, ~11 known violations being ratcheted to error; most remaining are legit aggregator/consumer edges). Shared code lives in `components/`, `hooks/`, `lib/`, `utils/`, `store/`, `api/` — e.g. `SourceChip` (used by 3 products) lives in `components/`.
- Layer conventions are documented in `src/components/README.md`, `src/store/README.md`, `src/hooks/README.md`, and `src/platform/contracts/moduleContract.ts`.

## Working practices
- **`CODE_HEALTH.md` is the standing code-health discipline** (applies to normal feature work, not just refactor programs): follow prior art, bounded Boy-Scout cleanup, cover-before-modify for high-complexity/low-coverage "locked" functions, and log out-of-scope debt to `docs/audits/debt-log.md` instead of silently fixing or ignoring it. `REFACTOR_PROGRESS.md` is the ledger for the (complete) SP-REFACTOR program + its Phase-5 practice install.
- Before calling a task done, run the relevant gate (`make check`, or the specific test/lint command) — don't report success on an unverified change.
- State the files in scope before editing; don't touch files outside that scope without flagging it.
- Refactors must not change behavior. If a test would need to change to keep passing, stop and flag it instead of editing the test to match new behavior.
- Don't restate rules `ruff`/eslint already enforce deterministically — fix the lint config instead of repeating style rules here.

## Known hazards
- Shadow packages: both `products/scheduler/frontend/src/app` and `products/scheduler/backend/app` exist; backend tests must put `backend/` first on sys.path. See `products/scheduler/tests/conftest.py`.
- Backend ordering: list queries need a stable tiebreaker (`created_at DESC, id DESC` — `id` is a random UUID; `created_at` alone ties non-deterministically across SQLite/Postgres).
- Route registration: newer FastAPI keeps each `include_router` as a nested `_IncludedRouter` (`path=None`) rather than flattening onto `app.routes` — assert a route exists via `app.openapi()["paths"]`, not `app.routes`.
- vitest hoisting: `vitest` must stay hoisted to the **root** `node_modules` (root `@testing-library/jest-dom` resolves it there) and is a root devDep; pin `@vitest/coverage-v8` to vitest's major (project is on vitest 3).
- Dead nav code: the left sidebar (`src/platform/product-shell/workspaceNav.ts`, `buildWorkspaceNav`) is the real in-workspace navigation. The old horizontal `TabBar` / `ModuleDock` / `BRACKET_TABS` are vestigial — editing them changes nothing users see.
- Playwright MCP screenshots: `browser_take_screenshot` saves a **bare** `filename` to the repo **root** (its output-dir is CWD — the plugin runs `@playwright/mcp` with no `--output-dir`), littering root with `*.png` (verified 2026-07-01). Always pass `filename: ".playwright-mcp/<name>.png"` — that dir is gitignored and is the documented home (page-snapshots/console logs already land there); use `docs/screenshots/<name>.png` (also gitignored) for keeper reference shots. Root `*.png` is gitignored as a backstop, but keep pics out of it.

## CI & the lean-gate philosophy
`.github/workflows/ci.yml` runs frontend (eslint + vitest + depcruise) and backend (ruff + pytest) — **both required** — on every PR/push to main and dev/**. e2e is intentionally NOT in the PR gate (it boots the Docker stack). The gates are deliberately **lean so they stay green** — don't "fix" them by blindly tightening:
- **ruff** gates on `select = ["F"]` (pyflakes) only; the broader `E,I,B,UP` set (~1400 mostly-stylistic findings, plus `B008` false-positives on FastAPI `Depends()`) is a deferred cleanup noted in `pyproject.toml`.
- **eslint** downgrades 7 newly-strict rules (react-hooks v7 react-compiler rules + `no-explicit-any` + `only-export-components`) to `warn`; `rules-of-hooks` stays error.
- **depcruise** / jscpd / knip cross-product + duplication findings are `warn` / report-only to ratchet, not block.

## Future / not yet done
- mypy on scheduler_core (typed domain core) — candidate next step.
- Ratchet the depcruise `warn` rules and broaden ruff once the deferred cleanups land.