# Backend architecture

A FastAPI app that fronts a CP-SAT solver. Stateless per-request: every
`POST /schedule` carries the entire problem in the body. Persistence is a
side-channel for tournament state and match status only.

## Layout

```
backend/
├── app/
│   ├── main.py        # FastAPI app, CORS, lifespan, request-id middleware
│   └── schemas.py     # Pydantic DTOs (mirror frontend/src/api/dto.ts)
├── api/
│   ├── schedule.py    # POST /schedule, /schedule/stream (SSE), /schedule/validate
│   ├── match_state.py # GET/PUT /match-state — live match status (called/started/finished)
│   ├── tournament_state.py  # GET/PUT /tournament-state — debounced full snapshot
│   ├── _backups.py    # tournament-state backup helpers
│   └── _validate.py   # shared validation utilities
├── services/
│   └── csv_importer.py     # parse roster/matches CSVs
├── Dockerfile
└── requirements.txt

src/scheduler_core/   # the solver itself; see src/scheduler_core/README.md
```

The HTTP layer lives in `backend/`. The solver engine lives in
`src/scheduler_core/` and is imported via `sys.path.insert` from the
schedule route — kept decoupled so the engine can be unit-tested without
the FastAPI app.

## Request lifecycle

```
client → request_id_middleware → router → handler → schemas validation
       → scheduler_core engine (CP-SAT) → ScheduleResult
       → schemas response
```

Every request gets an `X-Request-ID` (honours an inbound header from a
proxy or the frontend, else mints a uuid4). Errors propagate the ID in
their JSON body so a user can paste the toast detail into a bug report.

### `/schedule` (sync)

Body = `{ config, players, matches, previousAssignments? }`. Solver runs
to its time limit, returns full `ScheduleDTO`. Frontends use this for
small problems and for re-solves with pinned moves.

### `/schedule/stream` (SSE)

Same body, streams `solver_progress`, `solver_phase`, and
`solver_model_built` events as they happen. Powers the live HUD.
Backpressure: events queue up to `_SSE_QUEUE_MAX = 512` per request; if
the client stops draining we abort the solver to bound memory.

### `/schedule/validate`

Cheap pre-check used during a drag. Takes a `ProposedMove` and reports
hard-rule violations (court conflict, player double-book, availability
miss, freeze-horizon trespass) without running the full solver.

### `/tournament-state`

GET returns the persisted snapshot from `/data/tournament.json`. PUT
debounced from the frontend (~1 s) writes it back atomically. This is the
only mutable shared state on the backend; everything else is per-request.

### `/match-state`

Live operator status (`scheduled` / `called` / `started` / `finished`)
plus actual start/end timestamps. Persisted alongside tournament state
but written on every transition since these mutations carry user intent
that must not be debounced away.

## Adding a new HTTP route

1. Add a Pydantic model to `app/schemas.py` (and its TypeScript twin to
   `frontend/src/api/dto.ts`).
2. Create the handler under `backend/api/<feature>.py`. Define a
   `router = APIRouter(prefix=..., tags=[...])`.
3. Register it in `backend/app/main.py` via `app.include_router(...)`.
4. Add a method on `frontend/src/api/client.ts` and call it from the
   relevant feature hook.

## Adding a new constraint or objective term

Solver code lives in `src/scheduler_core/engine/cpsat_backend.py`. The
file's docstring lists every variable and constraint. Add hard
constraints in the `_build_*` helpers; add soft penalties to the
objective via `_add_penalty(...)`. Reflect any new knob in
`SolverOptions` (in `domain/models.py`) and surface it through
`backend/app/schemas.py`.

See `src/scheduler_core/README.md` for solver-side details.

## Logging

`scheduler.app`, `scheduler.schedule`, `scheduler.match_state`, and
`scheduler.tournament_state` are the loggers in use. The solver itself
logs via `scheduler_core._log` so its messages can be silenced in tests
without quieting the app log.

## Tests

```
cd backend && pytest
```

Backend tests are pure-Python and don't touch HTTP. End-to-end coverage
lives in `e2e/` (Playwright against the docker-compose stack).
