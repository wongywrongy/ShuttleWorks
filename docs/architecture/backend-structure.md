# Backend structure

A FastAPI app that fronts the CP-SAT solver. The solver path is **stateless per request** (every
`POST /schedule` carries the full problem in its body). Workspace and tournament state persist in
**SQLite via SQLAlchemy 2.0** behind `repositories/local.py` (`LocalRepository`), with Alembic
migrations; the Supabase mirror is populated asynchronously by the outbox `sync_service`.

## Layout

```
backend/
├── app/
│   ├── main.py            FastAPI app, CORS, lifespan (runs Alembic upgrade on startup), middleware
│   ├── schemas.py         Pydantic DTOs (mirror frontend/src/api/dto.ts)
│   ├── error_codes.py     ErrorCode enum + http_error() helper
│   └── …                  auth deps, config, paths, time utils
├── api/                   route handlers — one APIRouter per file
├── database/
│   ├── models.py          SQLAlchemy models + derive/normalize module helpers
│   └── session.py         engine bound to settings.database_url
├── repositories/
│   ├── local.py           LocalRepository + per-entity sub-repos
│   └── base.py
├── alembic/               SQLite + Postgres migrations
└── services/              match_state, sync_service (outbox), bracket/, suggestions_worker, csv_importer
```

The solver engine itself lives under `scheduler_core/` and is installed as a regular package, so
`import scheduler_core` resolves without any `sys.path` bootstrap.

## Route ownership

Routes are grouped by the **architectural module** that owns them. The full endpoint list is on the
[API reference](/api/) page; the ownership summary:

| Route family | Owner | Notes |
| --- | --- | --- |
| `/schedule`, `/schedule/stream`, `/schedule/validate`, `/schedule/warm-restart` | **Meet** | stateless solver endpoints (no tournament id) |
| `/tournaments/{id}/schedule/{advisories,proposals/*,suggestions/*,director-action}` | **Meet** | the live-planning pipeline |
| `/tournaments/{id}/bracket*` | **Bracket** | draws, schedule-next, results, match-action, import/export |
| `/tournaments/{id}/match-states*` | **Operations** | live match status + optimistic-concurrency (`ETag` / `If-Match`) |
| `/tournaments/{id}/commands` | **Operations** | idempotent operator command queue |
| `/tournaments`, `/tournaments/{id}`, `…/state`, `…/state/backups`, `…/members`, `…/invites` | **Control plane** | workspace CRUD + shared state + collaboration |
| `/tournaments/{id}/modules`, `…/modules/{moduleId}` | **Control plane** | the `workspace_modules` API |
| `/invites/*` | **Control plane** | public + authenticated invite endpoints |

Every router is registered in `app/main.py` with an auth dependency, **except** `invites`, which is
registered without a router-level auth dep so the public `GET /invites/{token}` lookup works
(per-endpoint auth is declared inside that router).

### Request lifecycle

```
client → request_id_middleware → router → handler → schemas validation
       → scheduler_core engine (CP-SAT) → ScheduleResult → schemas response
```

Every request gets an `X-Request-ID` (honouring an inbound header, else a fresh uuid4) that
propagates into error bodies so a user can paste a toast detail into a bug report. All
`HTTPException`s go through `error_codes.http_error(...)` so the response carries a stable `code`
the frontend can branch on.

## The data model

Persistence is SQLite via SQLAlchemy 2.0. Most tables are scoped by `tournament_id` (cascade-delete
from `tournaments`) and many use composite primary keys.

| Table | Primary key | Owner / purpose |
| --- | --- | --- |
| `tournaments` | `id` (UUID) | the **workspace** row: `kind`, `status`, `tournament_date`, `data` JSON blob, `schema_version` |
| `workspace_modules` | `(tournament_id, module_id)` ¹ | per-workspace module status + config (control plane) |
| `matches` | `(tournament_id, id)` | the meet match rows: `court_id`, `time_slot`, `status`, `version` |
| `match_states` | `(tournament_id, match_id)` | **Operations**: live status, timestamps, score |
| `commands` | `id` (UUID) | **Operations**: idempotent command log (`action`, `applied_at`/`rejected_at`) |
| `sync_queue` | `id` (UUID) | the outbox: `entity_type`, `entity_id`, `payload`, `attempts` |
| `bracket_events` | `(tournament_id, id)` | **Bracket**: `discipline`, `format`, `bracket_size`, `version` |
| `bracket_participants` | `(tournament_id, bracket_event_id, id)` | **Bracket**: `name`, `type`, `seed` |
| `bracket_matches` | `(tournament_id, bracket_event_id, id)` | **Bracket**: `round_index`, `match_index`, `kind`, slots, `version` |
| `bracket_results` | `(tournament_id, bracket_event_id, bracket_match_id)` | **Bracket**: `winner_side`, `score`, `walkover` |
| `tournament_backups` | `id` (UUID) | snapshots of `tournaments.data` |
| `tournament_members` | `(tournament_id, user_id)` | control plane: `role`, `joined_at` |
| `invite_links` | `id` (UUID) | control plane: `role`, `expires_at`, `revoked_at` |

¹ `workspace_modules` has a surrogate autoincrement `id` PK with a uniqueness constraint on
`(tournament_id, module_id)`.

Several rows carry a `version` integer (`matches`, `bracket_events`, `bracket_matches`) for the
optimistic-concurrency check used by the command pipeline.

### Module helpers in `models.py`

- `derive_modules(kind)` — seeds the initial module set from the legacy `kind` column.
- `display_dependency_satisfied(statuses)` — the shared check for the display-needs-an-engine rule.
- `normalize_module_seed(seeds)` — validates an explicit create-time `modules[]` seed (rejects
  `coming_soon`, backfills missing modules as `available`).

See [Workspace model](/architecture/workspace-model) for how these drive the lifecycle.

## Repositories

`LocalRepository` (in `repositories/local.py`) is the persistence facade. It exposes per-entity
sub-repos, each wrapping a session: `tournaments`, `matches`, `brackets`, `match_states`,
`commands`, `backups`, `members`, `invite_links`, `modules`. Route handlers go through these rather
than touching the session directly.

## Migrations

Alembic migrations live in `backend/alembic/` and cover both SQLite and Postgres. The app runs
`alembic upgrade` on startup (in the FastAPI lifespan), so a fresh database is migrated to head
automatically; `BACKEND.md` records the head id (`j3e7f9a1b5c8` as of 2026-06). The database URL is
`settings.database_url`, read in `database/session.py`.

## Signals computation

The Hub's per-workspace operational signal — `health`, an `attention[]` list, a `setup` readiness
checklist, module counts, collaboration counts — is computed by `build_signals` in
`api/workspace_signals.py`. It is a **pure function** fed from one batched pass of grouped row
counts (no N+1). This is the most important cross-cutting backend feature and has its own page:
[API reference → Signals](/api/signals).

## Adding a route

1. Add a Pydantic model to `app/schemas.py`, then run `make generate-api` from
   `products/scheduler/` to refresh `frontend/src/api/dto.generated.ts` from the OpenAPI schema.
2. Create the handler under `api/<feature>.py` with `router = APIRouter(prefix=…, tags=[…])`.
3. Register it in `app/main.py` via `app.include_router(...)`.
4. Use `error_codes.http_error(...)` for any `HTTPException`.
5. Add a method on `frontend/src/api/client.ts` and call it from the relevant feature hook.

The curated `dto.ts` mirrors the generated `dto.generated.ts` (the authority) plus a hand-written
section for frontend-private shapes. Drift between the two is a bug.
