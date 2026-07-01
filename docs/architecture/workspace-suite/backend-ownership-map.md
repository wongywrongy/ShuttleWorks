> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time analysis map from the 2026-06 workspace-suite redesign, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and the VitePress site. (Labeled in SP-REFACTOR Phase 6.)

# Backend Ownership Map

Maps current `products/scheduler/backend/` modules to their future suite owner.
No files move in Phase 1. Routes (`/tournaments/*`) and tables are unchanged.
FastAPI app + router includes are assembled in `app/main.py`.

## Workspaces (ownership / identity)

- `api/tournaments.py` — tournament CRUD, list, state, schema version (the ownership hub).
- `api/invites.py` — invites, sharing, token flow.
- `api/commands.py` — operator command log / idempotency.
- `repositories/` (tournaments), `database/` ORM models, `alembic/` migrations.

## Meet product

- `api/schedule.py`, `api/schedule_repair.py`, `api/schedule_advisories.py`,
  `api/schedule_proposals.py`, `api/schedule_director.py`,
  `api/schedule_suggestions.py`, `api/schedule_warm_restart.py` — solver + proposal pipeline.
- `api/match_state.py` — match state machine.
- `services/match_state.py`, `services/schedule_impact.py`,
  `services/suggestions_worker.py`, `services/csv_importer.py`.

## Bracket product

- `api/brackets.py` — draws, advancement, seeding, bracket I/O (large; cleanup is Phase 6).
- `services/bracket/` — bracket service implementations.

## Display product

- No dedicated backend module today. Display reads via tournament/state endpoints.
  **Gap:** a `display`/read-model module is a future deliverable (spec Phase 6.3).

## Commands / Sync (Core Platform)

- `api/commands.py` — command queue (shared).
- `services/sync_service.py` — Supabase outbox sync.

## Core / app assembly

- `app/main.py` — FastAPI app + router includes.
- `app/dependencies.py` — DI (auth).
- `app/schemas.py` — Pydantic request/response models.
- `adapters/` — external service adapters.

## Risk list

- `api/brackets.py` — single very large file; trails Meet's modularity (spec weak point #5).
- `api/schedule_*.py` spread — Meet's solver concerns are split across seven route files;
  a future Meet module should consolidate the boundary, not the files, first.
