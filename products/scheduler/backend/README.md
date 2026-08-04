# backend/

> **⚠️ PARTIALLY SUPERSEDED (2026-07-01).** This README predates the
> workspace-suite control-plane model; its file/route lists below are incomplete
> and a few names are out of date. For **current** backend architecture + route
> ownership use the canonical docs: `docs/architecture/backend-structure.md` and
> `products/scheduler/BACKEND.md`. The local conventions notes below are still useful.

FastAPI HTTP layer in front of the CP-SAT scheduler. Since SP-CLOUD-1
the batch solve is a **job**, not a request: `POST
/tournaments/{id}/solve-jobs` snapshots the full problem, a worker
executes it in a child subprocess, and the client polls the job to a
terminal status. The legacy synchronous `POST /schedule` answers 410.
Persisted state: the tournament snapshot, live match status, and the
`solve_jobs` queue.

For the high-level architecture and request lifecycle, see
[BACKEND.md](../BACKEND.md) at the repo root.

## Dual-mode runtime (SP-CLOUD-1)

One codebase, two process topologies — mode is entirely env-driven,
never forked logic:

| | Local (default) | Cloud |
|---|---|---|
| Database | SQLite (bind-mounted `data/local.db`) | Postgres 16 |
| Solve worker | embedded thread in the API process | `python -m worker` containers, `--scale`-able |
| Migrations | API lifespan (`alembic upgrade head`) | API only; workers **wait** for the schema |
| Compose file | `docker-compose.yml` | `docker-compose.cloud.yml` |

Local-first parity is a product rule: `docker compose up` must remain
the full offline product with no external services. Cloud mode is
strictly additive.

**Why a DB-backed queue and not a broker:** the queue rides the primary
database (`solve_jobs` table; `FOR UPDATE SKIP LOCKED` claims on
Postgres, guarded `UPDATE` on SQLite — the Solid Queue / procrastinate
design). At solves-per-day throughput this is orders of magnitude below
Postgres-queue failure territory, and it buys *transactional enqueue*
(a job exists iff its submit committed) plus one thing to back up. Two
dedup layers: an `Idempotency-Key` unique index (Stripe retry
semantics) and a partial unique index enforcing at most one *active*
job per `(tournament, type)`.

**Why the solve runs in a child subprocess:** CP-SAT cannot be
preempted in-process — a kill is the only reliable cancel; the child
also takes the Linux `RLIMIT_AS` memory cap and the
`PYTHONHASHSEED=0` pin.

**Determinism (a product guarantee):** same input + params ⇒ same
schedule on any host. Mechanisms: fixed `random_seed`, single search
worker, `max_deterministic_time` as the binding stop criterion
(wall-clock is only an outer safety kill), `PYTHONHASHSEED=0` in the
solve process (set/dict iteration order feeds model build), and an
exact `ortools` pin. `tests/test_solve_job_determinism.py` gates this
end-to-end (byte-identical double-solve + matching model fingerprints).

### Env matrix (solve jobs & worker)

| Var | Default | Meaning |
|---|---|---|
| `EMBEDDED_WORKER` | `true` | run the worker loop inside the API process |
| `WORKER_CONCURRENCY` | `1` | worker threads per standalone worker (one solve owns the CPU) |
| `WORKER_ID` | hostname-derived | stable identity stamped into claims |
| `SOLVE_RANDOM_SEED` | `42` | default seed persisted into job params |
| `SOLVE_NUM_WORKERS` | `1` | CP-SAT search workers (1 = deterministic) |
| `SOLVE_MAX_DETERMINISTIC_TIME` | `60.0` | host-independent solve budget |
| `SOLVE_WALL_CLOCK_CEILING_SECONDS` | `300.0` | outer safety kill only |
| `SOLVE_MEMORY_LIMIT_MB` | `1024` | child RLIMIT_AS cap (Linux; logged-off on Windows) |
| `JOB_LEASE_SECONDS` | `30.0` | heartbeat lease before a job is reaped back to queued |
| `JOB_MAX_ATTEMPTS` | `2` | retry budget (infra failures only; `infeasible` never retries) |
| `JOB_RETENTION_DAYS` | `30` | terminal jobs pruned after this window |
| `JOB_POLL_INTERVAL_SECONDS` | `1.0` | worker claim-poll cadence |

### Run cloud mode locally

```bash
cd products/scheduler
docker compose -f docker-compose.cloud.yml up -d --build
# API on :8600 (host 8000 is Windows-reserved on some boxes)

TID=$(curl -s -X POST localhost:8600/tournaments \
  -H 'content-type: application/json' -d '{"name":"cloud-smoke"}' | jq -r .id)
JOB=$(curl -s -X POST localhost:8600/tournaments/$TID/solve-jobs \
  -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d @solve-input.json | jq -r .id)          # body = GenerateScheduleRequest
curl -s localhost:8600/tournaments/$TID/solve-jobs/$JOB | jq .status
# → "queued" → "running" → "succeeded" (result carries the ScheduleDTO)

docker compose -f docker-compose.cloud.yml up -d --scale worker=2
```

`ENVIRONMENT` stays `local` in that stack on purpose — `cloud` makes
startup fail closed without HTTPS-only cookies + SMTP delivery, which a
plain-HTTP localhost smoke stack can't provide (see "Auth & tenancy"
below; the stack still runs `AUTH_MODE=cloud` so real accounts are
exercised).

## Auth & tenancy (SP-CLOUD-2)

Self-hosted cookie-session auth; Supabase Auth is retired (the
Supabase env vars now feed only the data mirror).

| | `AUTH_MODE=local` (default) | `AUTH_MODE=cloud` |
|---|---|---|
| Identity | requests without a session resolve to the **bootstrap operator** (zero UUID, `local@dev`, ensured at startup) — no signup, no email, offline | real accounts only; no session → 401 |
| Sign-in | optional (accounts work locally too) | `POST /auth/register` / `/auth/login` |
| Email | console backend logs invite/reset mail | `EMAIL_BACKEND=smtp` delivers it |
| Cookies | `Secure` off is tolerated (plain-HTTP dev) | startup **refuses** without `SESSION_COOKIE_SECURE=true` when `ENVIRONMENT=cloud` |

Mechanics (see `services/auth.py`, `api/auth.py`):
- Passwords: **Argon2id** (argon2-cffi PHC strings, transparent
  rehash-on-login). Policy is NIST 800-63B: length bounds only + a tiny
  worst-password blocklist. No composition rules, no rotation.
- Sessions: opaque 256-bit tokens in an `httpOnly; SameSite=Lax`
  cookie; only the SHA-256 lands in `auth_sessions` (revocable,
  rolling `last_seen`, absolute expiry). Password change/reset revokes
  every other session.
- CSRF: state-changing requests that carry the session cookie must
  send `X-ShuttleWorks-CSRF: 1` (enforced in middleware; the frontend
  sends it on every request). Cookie-less local bootstrap traffic is
  exempt by construction.
- Throttle: DB-backed per-account + per-IP backoff on credential
  endpoints (429 + `retryAfterSeconds`).
- Tenancy: **orgs own workspaces** (`tournaments.org_id`); every user
  gets a personal org (`services/auth.ensure_personal_org`).
  Membership stays per-workspace in `tournament_members` (FK to
  `users` since the SP-CLOUD-2 backfill migration).

### The enforcement seam — how to add a workspace endpoint

Every route that acts on a workspace resource MUST:
1. take the tenant id from a path param named exactly
   ``tournament_id`` (the seam binds to that name), and
2. attach ``Depends(require_tournament_access("<viewer|operator|owner>"))``
   (router- or route-level).

The seam answers a **uniform 404** (`TOURNAMENT_NOT_FOUND`) for
non-members and nonexistent ids — existence is information; never
hand-roll a 403 for "not yours". Insufficient *role* for a real member
is 403. The cross-tenant isolation suite
(`tests/test_tenant_isolation.py`) discovers every ``{tournament_id}``
operation from the OpenAPI schema and fails if any of them leaks — a
new endpoint that forgets the dependency fails CI automatically.

The ONLY unauthenticated data plane is the spectator display: public
``/display/{token}/*`` projection routes resolved by a per-workspace
capability token (`display_tokens`; owner mint/rotate via
``/tournaments/{id}/display-token``). Never add public routes keyed on
raw tournament UUIDs.

## Layout

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, lifespan, request-id middleware
│   ├── schemas.py              # Pydantic DTOs (mirror frontend/src/api/dto.ts)
│   ├── error_codes.py          # ErrorCode enum + http_error() helper
│   ├── paths.py                # data_dir() / ensure_data_dir() helpers
│   └── time_utils.py           # ISO-8601 UTC + slot-math helpers
├── api/
│   ├── schedule.py              # /schedule, /schedule/stream, /schedule/validate
│   ├── schedule_repair.py       # /schedule/repair
│   ├── schedule_warm_restart.py # /schedule/warm-restart
│   ├── match_state.py           # /tournaments/{id}/match-states, /commands
│   ├── tournaments.py           # /tournaments/{id}/state (+ control-plane routes)
│   ├── _backups.py              # tournament-state backup helpers
│   └── _validate.py             # shared validation utilities
├── services/
│   └── csv_importer.py          # roster/matches CSV parsing
├── Dockerfile
└── requirements.txt
```

`scheduler_core/` is sibling to `backend/`, not nested under it,
because the engine predates the FastAPI wrapper. The engine has its
own `pyproject.toml` and is installed as a regular package; routes
import it directly via `from scheduler_core...`.

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
4. **Workspace-scoped?** Follow "The enforcement seam" above —
   `tournament_id` path param + `require_tournament_access` dep, or
   the isolation suite fails.
5. Mirror the DTOs in `frontend/src/api/dto.ts`.
6. Add a method on `frontend/src/api/client.ts`.

## Tests

```
cd products/scheduler && pytest   # rootdir is products/scheduler; uses the repo .venv
```

The HTTP layer has no integration tests of its own — coverage lives
in `e2e/` (Playwright). Unit + integration tests are under
`products/scheduler/tests/`.
