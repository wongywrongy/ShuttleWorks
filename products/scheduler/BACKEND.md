# Backend architecture

> Reflects the 2026-06 workspace-suite control-plane redesign. Full per-slice
> design record: [`../../docs/superpowers/specs/`](../../docs/superpowers/specs).

A FastAPI app that fronts a CP-SAT solver. The solver path is stateless
per-request (every `POST /schedule` carries the full problem in the body).
Workspace + tournament state is persisted in **SQLite via SQLAlchemy 2.0**
(through `repositories/local.py`, the `LocalRepository`), with Alembic
migrations; the cloud mirror (Supabase Postgres) is populated asynchronously by
the outbox `sync_service`.

## Layout

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, lifespan (runs Alembic upgrade on startup), middleware
│   ├── schemas.py               # Pydantic DTOs (mirror frontend/src/api/dto.ts)
│   ├── error_codes.py           # ErrorCode enum + http_error() helper
│   └── …                        # auth deps, paths, time utils
├── api/                          # route handlers (one APIRouter per file)
│   ├── tournaments.py            # workspace CRUD + list (with control-plane signals) + /state + state backups
│   ├── workspace_modules.py      # GET/PATCH per-workspace modules (enable/disable + dependency rules)
│   ├── workspace_signals.py      # build_signals() — health / readiness / attention / collaboration
│   ├── invites.py                # collaborator invite links (create / list / revoke / accept)
│   ├── brackets.py               # bracket draws / advancement / import-export
│   ├── commands.py               # idempotent operator command queue
│   ├── match_state.py            # live match status (called / started / finished)
│   ├── schedule*.py              # /schedule (+ stream / validate / repair / warm-restart / proposals / …)
│   └── _validate.py              # shared validation utilities
├── database/
│   ├── models.py                 # SQLAlchemy models (Tournament, WorkspaceModule, TournamentMember,
│   │                             #   InviteLink, TournamentBackup, …) + derive/normalize module helpers
│   └── session.py                # one engine bound to settings.database_url
├── repositories/
│   ├── local.py                  # LocalRepository + per-entity sub-repos (members, modules, brackets, backups, …)
│   └── base.py
├── alembic/                      # SQLite + Postgres migrations (head: j3e7f9a1b5c8)
├── services/                     # match_state, sync_service (outbox), bracket/, suggestions_worker, csv_importer
├── Dockerfile
└── requirements.txt

scheduler_core/   # the solver itself; see scheduler_core/README.md
```

The HTTP layer lives in `backend/`. The solver engine lives under
`scheduler_core/` and is installed as a regular package via its own
`pyproject.toml`, so `import scheduler_core` resolves without any
`sys.path` bootstrap.

## Request lifecycle

```
client → request_id_middleware → router → handler → schemas validation
       → scheduler_core engine (CP-SAT) → ScheduleResult
       → schemas response
```

Every request gets an `X-Request-ID` (honours an inbound header from a
proxy or the frontend, else mints a uuid4). Errors propagate the ID in
their JSON body so a user can paste the toast detail into a bug
report. All `HTTPException`s should go through
`error_codes.http_error(...)` so the response carries a stable
`code` the frontend can branch on.

### `/schedule` (sync)

Body = `{ config, players, matches, previousAssignments? }`. Solver
runs to its time limit, returns the full `ScheduleDTO`. Used for
small problems and for re-solves seeded with pinned moves.

### `/schedule/stream` (SSE)

Same body, streams `solver_progress`, `solver_phase`, and
`solver_model_built` events as they happen. Powers the live HUD.
Backpressure: events queue up to `_SSE_QUEUE_MAX = 512` per request;
if the client stops draining we abort the solver to bound memory.

### `/schedule/validate`

Cheap pre-check used during a drag. Takes a `ProposedMove` and reports
hard-rule violations (court conflict, player double-book, availability
miss, freeze-horizon trespass) without running the full solver.

### `/schedule/repair`

Targeted disruption repair — withdrawal, court closure, overrun,
cancellation. Translates the disruption into a slice rule, invokes
the engine's `solve_repair` warm-started from the current schedule,
and returns a fresh `ScheduleDTO` whose `repairedMatchIds` tells the
UI which matches actually moved. Solve target: < 5 s for ≤ 40
matches.

### `/schedule/warm-restart`

Full re-solve biased to keep the existing schedule intact. Finished /
in-progress matches are hard-pinned; everything else is hinted at its
current slot+court with a per-match move penalty. Conservative /
Balanced / Aggressive map to penalty weights 10 / 5 / 1.

### `/tournaments/{id}/state`

GET returns the workspace's persisted state; PUT (debounced ~1 s from the
frontend) writes it back. State lives in SQLite via the `LocalRepository` — the
canonical store. (This replaced the old singleton `/tournament-state` +
`data/tournament.json` file when the backends merged onto SQLAlchemy.)

### `/match-state`

Live operator status (`scheduled` / `called` / `started` / `finished`) plus
actual start/end timestamps. Written on every transition (no debounce) since
the mutations carry user intent that must not be coalesced away.

## Workspace control plane

The control-plane surface (the Hub + per-workspace Settings) is served by:

- **`GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}`** — workspace
  CRUD. The list carries per-row `signals` (one batched pass, not N+1) and the
  caller's `role`, plus each workspace's `modules`. Create accepts an optional
  `modules[]` seed (validated by `normalize_module_seed`; `coming_soon` is not
  a seedable status).
- **`GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}`** — enable /
  disable a module. Server-enforced rules (each a 409): Display needs an enabled
  operational module (meet | bracket); a workspace keeps ≥1 operational module
  enabled; a module with data can't be disabled.
- **`GET …/state/backups`, `POST …/state/backup`, `POST …/state/restore/{filename}`**
  — per-workspace state snapshots (list / create / restore).
- **`/invites`** — collaborator invite links (create with role, list with
  status/expiry, revoke, accept). Members are listed via `GET …/members`.

`build_signals` (`api/workspace_signals.py`) is a pure function computing each
workspace's `health` (`good | attention | draft | archived`), an `attention[]`
code list, a `setup` readiness checklist, module counts, and collaboration
counts from batched row counts — no per-row DB work.

## Adding a new HTTP route

1. Add a Pydantic model to `app/schemas.py`. Run `make generate-api`
   from `products/scheduler/` to refresh `frontend/src/api/dto.generated.ts`
   from FastAPI's OpenAPI schema; reconcile any drift into the curated
   `frontend/src/api/dto.ts` by hand. `dto.generated.ts` carries a "do
   not edit by hand" header.
2. Create the handler under `backend/api/<feature>.py`. Define a
   `router = APIRouter(prefix=..., tags=[...])`.
3. Register it in `backend/app/main.py` via `app.include_router(...)`.
4. Use `error_codes.http_error(...)` for any `HTTPException`.
5. Add a method on `frontend/src/api/client.ts` and call it from the
   relevant feature hook.

## API contract regeneration

`frontend/src/api/dto.generated.ts` is auto-generated from the running
backend's OpenAPI schema via `openapi-typescript`. After any change to
`app/schemas.py` (or any Pydantic model referenced from a route handler),
run `make generate-api` from `products/scheduler/` to refresh it. The
target imports the FastAPI app directly (via `tools/generate_openapi.py`)
so no Docker / uvicorn is needed.

The curated `frontend/src/api/dto.ts` mirrors the auto-generated file
for contract types, plus a hand-written section for frontend-private
shapes (SSE events, internal enums, importer payloads). Treat
`dto.generated.ts` as the authority — drift between the two is a bug.

## Adding a new constraint or objective term

Constraints are plugins under `scheduler_core/engine/constraints/`.
Add a new file that implements the `Constraint` protocol, register
it via the package's loader, and wire its `ConstraintSpec` (name +
params) into the relevant `EngineConfig`. See
`scheduler_core/README.md` for the full plugin contract.

For tournament-wide scalars (court count, slot count, intervals,
breaks) reach for `ScheduleConfig` in `domain/models.py`. For
per-constraint toggles and weights, add fields to that constraint's
`params` schema and surface them through `backend/app/schemas.py` +
the frontend DTOs.

## Logging

`scheduler.app`, `scheduler.schedule`, `scheduler.match_state`,
`scheduler.tournament_state` are the loggers used in the HTTP layer.
The solver itself logs via `scheduler_core._log` so its messages can
be silenced in tests without quieting the app log.

## Tests

Install the dev set (which pulls in the prod set via `-r`):

```
pip install -r products/scheduler/backend/requirements-dev.txt
```

Then run from `products/scheduler/`:

```
pytest                                 # HTTP-layer + solver unit tests
```

The split keeps `pytest` + `httpx` (~25 MB) out of the production image
— `backend/requirements.txt` is prod-only and is what the Dockerfile
installs. End-to-end coverage lives in `e2e/` (Playwright against the
docker-compose stack); run with `make test-e2e`.
