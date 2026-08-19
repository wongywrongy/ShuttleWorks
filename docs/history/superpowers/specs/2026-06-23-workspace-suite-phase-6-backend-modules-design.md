> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Suite — Phase 6: Backend module migration — design

**Date:** 2026-06-23
**Status:** accepted (user approved start; executing in test-gated slices)
**Branch:** `dev/workspace-suite`
**Parent:** `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md` (Phase 6). Mapping basis: `docs/architecture/workspace-suite/backend-ownership-map.md`.

## Goal

Reorganize the FastAPI backend (`products/scheduler/backend/`) into product `modules/` behind the existing routes — no behavior, route-path, DB, or DTO change. Mirror the frontend's product-based structure on the backend.

## Constraints

- **No route-path changes.** `/tournaments/*`, `/schedule/*`, `/brackets/*`, etc. resolve exactly as before. `app/main.py` keeps registering the same routers.
- **No DB/schema/DTO/behavior change.** Pure relocation + import-path updates.
- **Backend imports are absolute** (package-rooted at `backend/`, which conftest puts on `sys.path`): `from api.tournaments import ...`, `from services.sync_service import ...`. Moving a module changes its dotted path *everywhere* (backend + tests).
- **Test gate:** `python3 -m pytest` from `products/scheduler/` (system python3 has pytest; the project `.venv`/`uv` lack it). Baseline **480 tests collected**; one pre-existing failure expected (`test_config.py::test_settings_picks_postgres_driver`, psycopg2 not installed locally). Each slice must keep the pass count unchanged (no NEW failures).
- Execute **controller-side, in test-gated slices** (smallest/lowest-coupling first). Each slice is its own commit.

## Target structure (per ownership map)

```
backend/modules/
  workspaces/   <- api/tournaments.py, api/invites.py  (ownership/identity)
  meet/         <- api/schedule*.py, api/match_state.py, services/{match_state,schedule_impact,suggestions_worker,csv_importer}.py
  bracket/      <- api/brackets.py, services/bracket/*
  display/      <- (read-model module — future; no dedicated code yet)
  commands/     <- api/commands.py
  sync/         <- services/sync_service.py
backend/app/        (unchanged: main.py, config, dependencies, schemas, error_codes, exceptions)
backend/database/   (unchanged)
backend/repositories/ (unchanged — shared data access)
```

Each `modules/<name>/` is a Python package (`__init__.py`). A route module exposes `router`; `app/main.py` imports it from the new path (e.g. `from modules.commands.routes import router as commands_router`). `__init__.py` may re-export for ergonomics.

## Slice order (lowest-coupling first; spec's order adapted to de-risk)

1. **`commands`** — `api/commands.py` → `modules/commands/`. Only consumer: `app/main.py` (router include) + `tests/unit/test_commands.py`. Smallest, proves the pattern.
2. **`sync`** — `services/sync_service.py` → `modules/sync/`. Consumers: `app/main.py`, `repositories/local.py`, `tests/unit/test_sync_service.py` (3 refs).
3. **`bracket`** — `api/brackets.py` (large) + `services/bracket/*` → `modules/bracket/`. More refs; its own slice.
4. **`meet`** — `api/schedule*.py` (7 files) + `api/match_state.py` + `services/{match_state,schedule_impact,suggestions_worker,csv_importer}.py` → `modules/meet/`. Largest; may sub-slice (schedule vs match-state vs services).
5. **`workspaces`** — `api/tournaments.py` + `api/invites.py` → `modules/workspaces/`. The ownership hub; moved with care (widely imported, e.g. `from api.invites import ...` inside tournaments.py).
6. **`display`** — no dedicated code yet; create the package as a placeholder/read-model home (optional).

Optional later: `/workspaces/*` route aliases (deferred — frontend uses `/tournaments/*`).

## Per-slice procedure

1. `mkdir modules/<name>`, add `__init__.py`. `git mv` the file(s) in (one `git mv` per file).
2. Fix the moved file's own imports if needed (absolute imports to `app/`, `database/`, `repositories/`, `services/` are unchanged since those dirs don't move; only intra-moved references change).
3. Update every consumer's dotted import (`from api.<x>` / `from services.<x>` → `from modules.<name>.<x>`), including `app/main.py` router registration and the tests. `grep -rn` for the old dotted path across `backend` + `tests` to find them all.
4. Gate: `python3 -m pytest` from `products/scheduler/` — pass count unchanged (only the pre-existing psycopg2 failure). Targeted run first (`pytest tests/unit/test_<x>.py`), then the full suite.
5. Commit the slice.

## Verification gate (per slice + at end)

- Full `python3 -m pytest` from `products/scheduler/`: no NEW failures vs baseline (480 collected; 1 pre-existing psycopg2 fail).
- App imports cleanly (FastAPI app constructs): a quick `python3 -c "from app.main import app"` smoke from `backend/`.
- `grep -rn "from api.<moved>\|from services.<moved>"` returns nothing stale after each slice.

## Acceptance criteria

1. `backend/modules/{commands,sync,bracket,meet,workspaces}/` hold their code; routes register from the new paths.
2. No `from api.<moved>` / `from services.<moved>` stale import remains.
3. Full backend suite: no new failures. Routes unchanged. App constructs.

## Notes / deferred

- `repositories/`, `app/`, `database/` stay shared (not product modules).
- `display` module is a placeholder until a read-model is built.
- `/workspaces/*` route aliases deferred.
- This phase is independent of the frontend; the frontend already consumes `/tournaments/*` etc. unchanged.
