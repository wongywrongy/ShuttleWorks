> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Modules — Backend Persistence (sub-project #1) — design

**Date:** 2026-06-23
**Status:** accepted (user approved)
**Branch:** `dev/workspace-suite`
**Program:** Bold workspace-modules control plane (7 sub-projects). This is #1 — the foundation everything else reads from. `kind` becomes legacy compatibility.

## Goal

Persist real per-workspace module state in a `workspace_modules` table tied to `tournaments.id`, derived from the legacy `kind` but stored as first-class rows, exposed via API, with dependency + no-data-loss rules. No change to `/tournaments/*` routes, `kind`, or any existing behavior.

## Data model

New `WorkspaceModule(Base)` in `backend/database/models.py`, table `workspace_modules`:
- `id`: int PK (autoincrement) — match the codebase's existing PK style.
- `tournament_id`: FK → `tournaments.id`, `ondelete="CASCADE"`, indexed, not null.
- `module_id`: `String(20)` not null — one of `meet | bracket | display`.
- `status`: `String(20)` not null — one of `enabled | available | disabled | coming_soon`.
- `config`: JSON nullable.
- `created_at` / `updated_at`: `DateTime`, server/default `now`, mirroring existing models.
- `UniqueConstraint(tournament_id, module_id)`.
- `relationship` on `Tournament.modules` (back_populates), cascade delete-orphan.

## Derivation from `kind` (the seed)

`derive_modules(kind) -> dict[module_id, status]`:
- `meet` → `{meet: enabled, display: available, bracket: coming_soon}`
- `bracket` → `{bracket: enabled, display: coming_soon, meet: coming_soon}`
- unknown/None → treat as meet.

Honest, not silo-locked: only the kind's operator module is `enabled`; the foreign operator is `coming_soon` (hybrid is a future sub-project — we don't pretend it's enableable yet). Display is `available` for meet (works), `coming_soon` for bracket (not built).

## Lazy derive-and-persist (makes tests + prod both correct)

Repository `ensure_modules(session, tournament) -> list[WorkspaceModule]`: if the tournament has zero module rows, insert the derived set (from `derive_modules(tournament.kind)`), flush, return; else return existing. Called by every read/mutate path. This means a fresh `create_all` DB (tests), a freshly-created tournament, and an existing prod row all converge without depending on the alembic backfill.

## Alembic migration

New revision (chained after the latest `g9d4e2a3b7c1...`): `create_table('workspace_modules', ...)` + backfill — for each existing `tournaments` row, insert its derived module rows. (Prod is correct immediately; tests use `create_all` + lazy-derive, so they don't run this — fine.)

## Dependency / no-data-loss rules (enforced on PATCH; 409 with stable error code on violation)

- **Display dependency:** enabling `display` requires ≥1 enabled data-producing module (`meet` or `bracket`).
- **At least one operational module:** cannot `disable` the last `enabled` operational module (`meet`/`bracket`).
- **Destructive-disable guard (this slice):** disabling a module that has data is blocked — `meet` with any `matches`, `bracket` with any `bracket_events`. (A future slice adds a confirm-to-archive flow; for now, block.)
- Allowed transitions: `available → enabled` (respecting deps), `enabled → disabled` (respecting guards), `disabled → enabled`, config updates on any non-`coming_soon`. `coming_soon` is immutable (returns 409).

## API / DTO

- `WorkspaceModuleDTO`: `{ moduleId: str, status: str, config: dict | None }` (camelCase via the existing DTO style in `app/schemas.py`).
- **Summary gains modules:** `TournamentSummaryDTO` gets a `modules: list[WorkspaceModuleDTO]` field, populated via `ensure_modules`. (Existing summary consumers ignore the new field.)
- `GET /tournaments/{id}/modules` → `list[WorkspaceModuleDTO]` (behind existing auth + tournament-access).
- `PATCH /tournaments/{id}/modules/{moduleId}` body `{ status?: str, config?: dict }` → updated `WorkspaceModuleDTO`; enforces the rules above. Lives in a new `api/workspace_modules.py` router (registered in `app/main.py` like the others), or appended to `api/tournaments.py` — implementer picks the lower-friction one and keeps routes additive.

## Constraints

- No change to `/tournaments/*` routes, `kind`, DB columns on `tournaments`, DTO fields consumers already use, solver, or any existing behavior. Purely additive.
- No file relocation / module reorg (that's the parked backend-modules migration; unrelated here).
- Backend test gate: `python3 -m pytest` from `products/scheduler/` — baseline 480 collected, 1 pre-existing psycopg2 failure expected; no NEW failures. App must construct (`python3 -c "from app.main import app"`).

## Tests (new, backend)

1. `derive_modules` returns the expected status map for meet / bracket / unknown.
2. Lazy: reading modules for a fresh tournament with no rows derives + persists them; a second read returns the same persisted rows (no duplication).
3. Summary endpoint / DTO includes `modules` with the derived set.
4. `GET /tournaments/{id}/modules` returns the module list.
5. `PATCH` enable display with no enabled operator → 409 (dependency); with meet enabled → 200.
6. `PATCH` disable the only enabled operational module → 409.
7. `PATCH` disable a meet module that has matches → 409 (destructive guard).
8. `PATCH` config update on an enabled module → 200, config persisted.
9. (migration) an Alembic upgrade test OR a model-level assertion that a backfill helper produces rows for existing tournaments — implementer picks the cheaper reliable check.

## Acceptance criteria

1. `workspace_modules` table + model exist; `Tournament.modules` relationship works; cascade delete.
2. Reading modules derives-and-persists from `kind` when absent; summary includes `modules`.
3. `GET`/`PATCH` endpoints work behind auth; dependency + destructive-disable + last-operational rules enforced (409).
4. Full backend suite: no new failures vs baseline; app constructs. `/tournaments/*` + `kind` unchanged.

## Deferred (later sub-projects)

Frontend reads the module DTO (#2); Hub/Settings/Sharing redesigns (#3–6); hybrid enablement making a foreign operator module functional; confirm-to-archive destructive disable; `/workspaces/*` aliases.
