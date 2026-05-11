# backend/

FastAPI HTTP layer in front of the CP-SAT scheduler. Stateless per
request — the solver receives the full problem in the body and
returns the full solution. The only persisted state is the tournament
snapshot and live match status.

For the high-level architecture and request lifecycle, see
[BACKEND.md](../BACKEND.md) at the repo root.

## Layout

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, lifespan, request-id middleware
│   ├── schemas.py              # Pydantic DTOs (mirror frontend/src/api/dto.ts)
│   ├── error_codes.py          # ErrorCode enum + http_error() helper
│   ├── paths.py                # data_dir() / ensure_data_dir() helpers
│   ├── time_utils.py           # ISO-8601 UTC + slot-math helpers
│   └── scheduler_core_path.py  # sys.path bootstrap for scheduler_core
├── api/
│   ├── schedule.py              # /schedule, /schedule/stream, /schedule/validate
│   ├── schedule_repair.py       # /schedule/repair
│   ├── schedule_warm_restart.py # /schedule/warm-restart
│   ├── match_state.py           # /match-state
│   ├── tournament_state.py      # /tournament-state
│   ├── _backups.py              # tournament-state backup helpers
│   └── _validate.py             # shared validation utilities
├── services/
│   └── csv_importer.py          # roster/matches CSV parsing
├── Dockerfile
└── requirements.txt
```

`scheduler_core/` is sibling to `backend/`, not nested under it,
because the engine predates the FastAPI wrapper.
`backend/app/scheduler_core_path.py` does the `sys.path` insertion;
routes import the engine after that shim runs.

## Conventions

- **Loggers**: `scheduler.app`, `scheduler.schedule`,
  `scheduler.match_state`, `scheduler.tournament_state`. Solver
  internals use `scheduler_core._log` so they can be silenced in
  tests.
- **Errors**: prefer `error_codes.http_error(code, message, ...)` —
  the helper attaches a stable `code` enum value the frontend can
  branch on, alongside the message and request id.
- **Schemas**: every DTO has a TypeScript twin in
  `frontend/src/api/dto.ts`. Keep them in lock-step.
- **Modules prefixed with `_`** are private to the package and not
  routed (e.g. `_backups.py`, `_validate.py`).

## Adding an endpoint

1. Define request/response models in `app/schemas.py`.
2. Add the handler under `api/<feature>.py`:
   ```python
   router = APIRouter(prefix="/feature", tags=["feature"])

   @router.post("/do-thing")
   def do_thing(req: DoThingRequest) -> DoThingResponse: ...
   ```
3. Register it in `app/main.py`: `app.include_router(feature.router)`.
4. Mirror the DTOs in `frontend/src/api/dto.ts`.
5. Add a method on `frontend/src/api/client.ts`.

## Tests

```
cd backend && pytest
```

The HTTP layer has no integration tests of its own — coverage lives
in `e2e/` (Playwright). Unit tests for solver logic are under
`src/tests/`.
