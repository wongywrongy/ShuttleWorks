# Backend structure

A FastAPI app that fronts the CP-SAT solver. Since SP-CLOUD-1 the meet batch solve is a **job,
not a request**: `POST /tournaments/{id}/solve-jobs` snapshots the full problem into the
`solve_jobs` queue table, a worker executes it in a killable child subprocess, and the client
polls the job to a terminal status (the legacy synchronous `POST /schedule` answers `410 Gone`).
Workspace and tournament state persist in **SQLite via SQLAlchemy 2.0** behind
`repositories/local.py` (`LocalRepository`) — Postgres 16 in cloud mode — with Alembic
migrations. There is no replication layer — one database is the whole story.
Identity is self-hosted cookie-session auth (SP-CLOUD-2), and every
workspace route runs behind the tenancy seam described below.

## Layout

```
apps/api/
├── alembic.ini            points at apps/api/src/alembic; prepend_sys_path = apps/api/src
├── .importlinter          the architecture contracts (15, all blocking)
├── Dockerfile             mirrors this tree into the image at /app/src
└── apps/api/src/          the sys.path ROOT - packages import by bare name
    ├── core/              the shared kernel
    │   ├── main.py        FastAPI app, CORS, lifespan (Alembic upgrade on startup), middleware
    │   ├── schemas.py     Pydantic DTOs (mirror apps/console/src/api/dto.ts)
    │   ├── error_codes.py ErrorCode enum + http_error() helper
    │   ├── throttle.py    the abuse throttle - a key, a budget, a doubling lock
    │   ├── paths.py       SRC_ROOT / API_ROOT / ALEMBIC_* - counted once, named
    │   └── …              config, exceptions, limits, CSRF, middleware, time utils
    ├── shared/            cross-domain DOMAIN logic, owned by no domain
    │   ├── sport/         badminton rules (meet, bracket and the solve rail)
    │   └── scheduling/    params -> ScheduleConfig, the one seam both engines use
    ├── db/                models.py (+ module helpers) and session.py
    ├── repositories/      LocalRepository + per-entity sub-repos
    ├── alembic/           SQLite + Postgres migrations
    ├── workspaces/        the control plane: tournaments, modules, signals, config lock
    ├── identity/          both principals: operator accounts, entrants, members, invites
    ├── meet/              the Meet engine: schedule*, proposals, repair, standings
    ├── bracket/           draws, advancement, formats/, io/, standings
    ├── operations/        the match-state machine + the idempotent command log
    ├── display/           the read-only spectator projection
    ├── entries/           the public entry page, the desk, and the commit
    ├── solve_rail/        the async job queue, worker loop and solve subprocess
    ├── ops/               liveness and readiness
    └── worker.py          standalone worker entrypoint (`python -m worker`, cloud mode)
```

Each domain package owns **its routers and its services together** — the thing
you change when you change that domain is in one directory. Where a router and
a service shared a name, the router carries a `_routes` suffix
(`operations/match_state_routes.py` beside `operations/match_state.py`).

`apps/api/src/` is a sys.path ROOT rather than a package, so imports read
`from meet.schedule import ...`, never `from src.meet...`. The boundaries
between these packages are not a convention: `apps/api/.importlinter` holds 15
contracts over them and `make check` fails on a violation.

The solver engine itself lives under `packages/scheduler-core/scheduler_core/` and is installed as a regular package, so
`import scheduler_core` resolves without any `sys.path` bootstrap.

## Route ownership

Routes are grouped by the **architectural module** that owns them. The full endpoint list is on the
[API reference](/reference/api/) page; the ownership summary:

| Route family | Owner | Notes |
| --- | --- | --- |
| `/tournaments/{id}/solve-jobs*` | **Meet** | the async solve rail (submit / poll / cancel); `POST /schedule` + `/schedule/stream` are `410 Gone` |
| `/schedule/validate`, tenant-scoped `/tournaments/{id}/schedule/proposals/*` | **Meet** | solver utilities and proposal flow; unscoped repair/warm-restart are `410 Gone` |
| `/tournaments/{id}/schedule/{advisories,proposals/*,suggestions/*,director-action}` | **Meet** | the live-planning pipeline |
| `/tournaments/{id}/bracket*` | **Bracket** | draws, schedule-next, results, match-action, import/export |
| `/tournaments/{id}/match-states*` | **Operations** | live match status + optimistic-concurrency (`ETag` / `If-Match`) |
| `/tournaments/{id}/commands` | **Operations** | idempotent operator command queue |
| `/display/{token}/*`, `/tournaments/{id}/display-token*` | **Display** | public capability-token projection + owner mint/rotate |
| `/tournaments/{id}/entry-page*`, `…/entry-events*`, `…/entries*` | **Entries** | the operator's entry-page config + entries desk (session-guarded) |
| `/e/api/*`, `/e/account/*` | **Entries** | the **public entrant surface** — slug-keyed page, unified Entries/Bracket player directory, draw/result projections, fee quote, submit, and entrant accounts (`sw_play_session`, never `users`). The *pages* are a separate React Router 7 service; these are the JSON it reads and the writes the browser posts directly (SP-PROGRAM-1 Phase 6, ruling R8-A) |
| `/tournaments`, `/tournaments/{id}`, `…/state`, `…/state/backups`, `…/members`, `…/invites` | **Control plane** | workspace CRUD + shared state + collaboration |
| `/tournaments/{id}/modules`, `…/modules/{moduleId}` | **Control plane** | the `workspace_modules` API |
| `/invites/*` | **Control plane** | public + authenticated invite endpoints |
| `/auth/*` | **Control plane** | self-hosted accounts & cookie sessions (`apps/api/src/identity/auth_routes.py`) |

Every router is registered in `apps/api/src/core/main.py` with an auth dependency, **except** `invites`
(its public `GET /invites/{token}` lookup declares per-endpoint auth), `auth` (login while
logged out), the public display projection router, `solve-jobs` (carries its own auth +
per-route role deps), and the two entrant routers (`/e/api/*`, `/e/account/*` — public by
design for the same reason `auth` is: an entrant with no account must be able to get one).
Each public endpoint is enumerated with a written reason in `tests/backend/test_auth_surface.py`'s
`PUBLIC_BY_DESIGN`, and a route that answers an anonymous caller without appearing there fails
that test.

### Auth & tenancy (SP-CLOUD-2)

`get_current_user` (`apps/api/src/core/dependencies.py`) is the single identity seam: it resolves the opaque
session cookie against `auth_sessions`; with no session, `AUTH_MODE=local` (the default) falls
back to the zero-UUID **bootstrap operator** (`local@dev`, ensured at startup), while
`AUTH_MODE=cloud` answers `401`. Passwords are Argon2id, policy is NIST length-bounds-only, and
state-changing cookie-authenticated requests must carry `X-ShuttleWorks-CSRF: 1` (middleware).

Tenancy: **orgs own workspaces** (`tournaments.org_id`); every user gets a personal org
(`apps/api/src/identity/auth.ensure_personal_org`), and per-workspace membership stays in
`tournament_members`. `require_tournament_access(min_role)` is the enforcement seam — it binds
to the `tournament_id` path param, answers a **uniform 404** (`TOURNAMENT_NOT_FOUND`) for
non-members and nonexistent ids, and `403` only for real members with an insufficient role. It
has no bypass: local mode records real member rows, so the same code path runs everywhere. The
self-maintaining isolation suite (`tests/backend/test_tenant_isolation.py`) derives every
`{tournament_id}` operation from the OpenAPI schema, so a new endpoint that forgets the
dependency fails CI. Full mechanics: `apps/api/BACKEND.md` § "Auth & tenancy".

### The solve-job rail (SP-CLOUD-1)

One codebase, two process topologies, entirely env-driven: locally an **embedded worker**
thread runs inside the API process (`EMBEDDED_WORKER=true`); in cloud mode `python -m worker`
containers scale independently against Postgres (`docker-compose.cloud.yml`). The queue rides
the primary database (`solve_jobs` table; `FOR UPDATE SKIP LOCKED` claims on Postgres, guarded
`UPDATE` on SQLite) — no broker, which buys *transactional enqueue* plus one thing to back up.
Two dedup layers: an `Idempotency-Key` unique index and a partial unique index enforcing at
most one active job per `(tournament, type)`. The solve itself runs in a **child subprocess**
(`apps/api/src/solve_rail/solve_child.py`) because CP-SAT cannot be preempted in-process — a kill is the only
reliable cancel; the child also takes the memory cap.
Determinism is a product guarantee (same input + params ⇒ same schedule on any host): fixed
seed, one search worker, `max_deterministic_time` as the binding stop criterion, an exact
`ortools` pin, and **stable sorted iteration in the engine's model build**. Gated end-to-end by
`tests/backend/test_solve_job_determinism.py` plus `tests/backend/unit/test_engine_build_order.py`, which
asserts one identical CP-SAT model fingerprint across four different `PYTHONHASHSEED` values.

The child used to run with `PYTHONHASHSEED=0`, and a former determinism guard warned
whenever a solve happened outside that pinned environment. Both were masks for hash-ordered
iteration in `get_player_ids`; SP-CLOUD-3 fixed the iteration and removed the pin, the guard,
and the child's hard-refusal together — determinism is now a property of the code rather than of
the launch environment. The full env matrix and rationale live in `apps/api/BACKEND.md`
§ "Dual-mode runtime".

### Request lifecycle

```
client → request_id_middleware → csrf_middleware → router → get_current_user
       → require_tournament_access → handler → schemas validation → response

batch solve (async):
submit → solve_jobs row (queued) → worker claims → solve_child subprocess
       → scheduler_core engine (CP-SAT) → job.result (ScheduleDTO) ← client polls
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
| `tournaments` | `id` (UUID) | the **workspace** row: `kind`, `status`, `tournament_date`, `data` JSON blob, `schema_version`, `org_id` (SP-CLOUD-2 — the owning org) |
| `workspace_modules` | `(tournament_id, module_id)` ¹ | per-workspace module status + config (control plane) |
| `matches` | `(tournament_id, id)` | the meet match rows: `court_id`, `time_slot`, `status`, `version` |
| `match_states` | `(tournament_id, match_id)` | **Operations**: live status, timestamps, score |
| `commands` | `id` (UUID) | **Operations**: idempotent command log (`action`, `applied_at`/`rejected_at`) |
| `bracket_events` | `(tournament_id, id)` | **Bracket**: `discipline`, `format`, `bracket_size`, `version` |
| `bracket_participants` | `(tournament_id, bracket_event_id, id)` | **Bracket**: `name`, `type`, `seed` |
| `bracket_matches` | `(tournament_id, bracket_event_id, id)` | **Bracket**: `round_index`, `match_index`, `kind`, slots, `version` |
| `bracket_results` | `(tournament_id, bracket_event_id, bracket_match_id)` | **Bracket**: `winner_side`, `score`, `walkover` |
| `tournament_backups` | `id` (UUID) | snapshots of `tournaments.data` |
| `tournament_members` | `(tournament_id, user_id)` | control plane: `role`, `joined_at` (`user_id` is an FK to `users` since the SP-CLOUD-2 backfill) |
| `invite_links` | `id` (UUID) | control plane: `role`, `email` (email invites), `expires_at`, `revoked_at` |
| `solve_jobs` | `id` (UUID) | **Meet**: the async solve queue — `type`, `status`, `params` + `input_snapshot` captured at submit, `result` / `error`; unique `Idempotency-Key` index + `uq_solve_jobs_active` partial unique index (one active job per tournament/type) |
| `users` | `id` (UUID) | auth: `email` (case-insensitive unique), nullable Argon2id `password_hash`, reset-token hash |
| `auth_sessions` | `id` (UUID) | auth: SHA-256 `token_hash` of the session cookie, `expires_at`, `revoked_at`, rolling `last_seen_at` |
| `auth_throttle` | `key` (string) | auth: per-account / per-IP credential backoff counters (DB-backed, no Redis) |
| `orgs` / `org_members` | `id` · `(org_id, user_id)` | tenancy: orgs own workspaces; every user gets a personal org |
| `display_tokens` | `tournament_id` | **Display**: the public capability token (stored raw; revocation = rotation) |

¹ `workspace_modules` has a surrogate autoincrement `id` PK with a uniqueness constraint on
`(tournament_id, module_id)`.

Several rows carry a `version` integer (`matches`, `bracket_events`, `bracket_matches`) for the
optimistic-concurrency check used by the command pipeline.

### Module helpers in `models.py`

- `derive_modules(kind)` — seeds the initial module set from the legacy `kind` column.
- `display_dependency_satisfied(statuses)` — the shared check for the display-needs-an-engine rule.
- `normalize_module_seed(seeds)` — validates an explicit create-time `modules[]` seed (rejects
  `coming_soon`, backfills missing modules as `available`).

See [Workspace model](/explanation/architecture/workspace-model) for how these drive the lifecycle.

## Repositories

`LocalRepository` (in `repositories/local.py`) is the persistence facade. It exposes per-entity
sub-repos, each wrapping a session: `tournaments`, `matches`, `brackets`, `match_states`,
`commands`, `backups`, `members`, `invite_links`, `modules`. Route handlers go through these rather
than touching the session directly.

## Migrations

Alembic migrations live in `apps/api/src/alembic/` and cover both SQLite and Postgres. The app runs
`alembic upgrade` on startup (in the FastAPI lifespan), so a fresh database is migrated to head
automatically. In cloud mode only the **API** container migrates; standalone workers **wait**
for the schema instead of racing it. The SP-CLOUD-2 tenancy migration is a **lossless
backfill**: existing users get personal orgs, existing workspaces get `org_id`, and
`tournament_members.user_id` gains its FK to `users` without dropping rows. The database URL is
`settings.database_url`, read in `apps/api/src/db/session.py`.

## Signals computation

The Hub's per-workspace operational signal — `health`, an `attention[]` list, a `setup` readiness
checklist, module counts, collaboration counts — is computed by `build_signals` in
`apps/api/src/workspaces/workspace_signals.py`. It is a **pure function** fed from one batched pass of grouped row
counts (no N+1). This is the most important cross-cutting backend feature and has its own page:
[API reference → Signals](/reference/api/signals).

## Adding a route

1. Add a Pydantic model to `apps/api/src/core/schemas.py`, then run `make generate-api` from
   the repo root to refresh `apps/console/src/api/dto.generated.ts` from the OpenAPI schema.
2. Create the handler under `apps/api/src/<package>/<feature>.py` with `router = APIRouter(prefix=…, tags=[…])`.
3. Register it in `apps/api/src/core/main.py` via `app.include_router(...)`.
4. **Workspace-scoped?** Take the tenant id from a path param named exactly `tournament_id` and
   attach `Depends(require_tournament_access("viewer|operator|owner"))` — otherwise the
   OpenAPI-driven isolation suite (`tests/backend/test_tenant_isolation.py`) fails CI. See
   [How to add an API endpoint](/how-to/add-an-api-endpoint).
5. Use `error_codes.http_error(...)` for any `HTTPException`.
6. Add a method on `apps/console/src/api/client.ts` and call it from the relevant feature hook.

The curated `dto.ts` mirrors the generated `dto.generated.ts` (the authority) plus a hand-written
section for frontend-private shapes. Drift between the two is a bug.
