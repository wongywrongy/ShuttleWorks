# backend/

> **⚠️ PARTIALLY SUPERSEDED (2026-07-01).** This README predates the
> workspace-suite control-plane model; its file/route lists below are incomplete
> and a few names are out of date. For **current** backend architecture + route
> ownership use the canonical docs: `docs/architecture/backend-structure.md` and
> `apps/api/BACKEND.md`. The local conventions notes below are still useful.

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
| Compose file | `docker-compose.yml` | `docker-compose.cloud.yml` (dev smoke) · `docker-compose.selfhost.yml` + `docker-compose.worker.yml` (real deployment) |
| Startup validation | none | `_enforce_cloud_secrets`, **role-aware**: the API profile demands Postgres + `AUTH_MODE=cloud` + secure cookies + SMTP; the worker profile validates the database only |

Local-first parity is a product rule: `docker compose up` must remain
the full offline product with no external services. Cloud mode is
strictly additive.

**Ingress is a Cloudflare Tunnel, not an origin TLS terminator.** TLS
terminates at Cloudflare's edge; `cloudflared` dials outward, so the
host publishes no inbound port. Two consequences the code cares about:

- Every request arrives through a proxy, so the credential throttle and
  every per-IP entry budget would collapse into one global bucket
  without `TRUSTED_PROXY_IPS`, which lets `app/client_ip.py` believe
  `CF-Connecting-IP` **only** from that peer. **The peer is the
  `frontend` nginx container, not cloudflared** — the self-host stack
  has served the SPA and proxied `/api/*` since 2026-08-04, so the
  request path is `browser → cloudflared → nginx → backend:8000` and
  cloudflared never talks to the API at all. Naming the connector is the
  classic wrong value here, and it fails *open*, silently. nginx
  overwrites `CF-Connecting-IP` with an address it has itself vouched
  for (`frontend/nginx.conf`, `set_real_ip_from`), so what this trust
  buys is a proxy's word, never a client's. **Do not add uvicorn
  `--proxy-headers`** — it rewrites `request.client.host` from
  `X-Forwarded-For`, so the trust check stops matching and the collapse
  returns silently.
- Cookie security is configuration (`SESSION_COOKIE_SECURE=true`), never
  detection. Nothing in this backend reads the request scheme, so the
  container seeing plain HTTP is irrelevant.

Runbooks: [install-local](../../../docs/how-to/install-local.md),
[install-selfhost](../../../docs/how-to/install-selfhost.md),
[add-a-worker](../../../docs/how-to/add-a-worker.md),
[operations](../../../docs/how-to/operations.md).

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
also takes the Linux `RLIMIT_AS` memory cap. (It used to take a
`PYTHONHASHSEED=0` pin too; SP-CLOUD-3 fixed the hash-ordered iteration
that pin was masking, so determinism is now a property of the engine
rather than of the launch environment.)

**Health surface:** `/health` (liveness, dependency-free),
`/health/ready` (database reachable + schema at head; 503 otherwise),
`/health/deep` (readiness plus data-dir/solver checks — what the image
HEALTHCHECK calls), `/health/metrics` (queue depth, oldest-queued age,
per-worker heartbeat age). Do not publish these through the tunnel.

**Determinism (a product guarantee):** same input + params ⇒ same
schedule on any host. Mechanisms: fixed `random_seed`, single search
worker, `max_deterministic_time` as the binding stop criterion
(wall-clock is only an outer safety kill), **stable sorted iteration in
the engine's model build**, and an exact `ortools` pin. Gated
end-to-end by `tests/test_solve_job_determinism.py` (byte-identical
double-solve + matching model fingerprints) and
`tests/unit/test_engine_build_order.py`, which asserts one identical
CP-SAT fingerprint across four different `PYTHONHASHSEED` values.

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

Self-hosted cookie-session auth. Supabase is gone from the product
entirely — Auth retired in SP-CLOUD-2, the data mirror removed in
SP-CLOUD-3 (ADR 0012).

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

### The second principal: entrant accounts (SP-E1-2, ruling R10)

Everything above describes **operators**. Entries adds a second, entirely
separate principal — a member of the public who signs up on the entry
surface to submit entries for the people they are responsible for.

| | Operator | Entrant |
|---|---|---|
| Table | `users` | `entrant_accounts` |
| Sessions | `auth_sessions` | `entrant_sessions` |
| Cookie | `sw_session` | `sw_play_session` |
| Resolver | `get_current_user` (`app/dependencies.py`) | `get_current_entrant` (same file) |
| Routes | `/auth/*` | `/e/account/*` |
| Throttle keys | `ip:` `account:` `reg:` `entry:` | `esignup:` `eacct:` `eip:` |
| Local bootstrap | yes — no session resolves to the zero-UUID operator | **no** — 401 in both modes |
| Org / role / membership | yes | **never** |

**They are separate by construction, not by a check.** An entrant token is
not in `auth_sessions` and an operator token is not in `entrant_sessions`,
so neither resolver can be handed the other's credential — including under
the other's cookie name. The alternative considered (an audience
discriminator on `AuthSession`) fails *open* the day a resolver forgets to
read it, on 27 session-gated routes that carry no `{tournament_id}` and so
sit outside the tenancy suite. `tests/test_cross_principal_sessions.py`
proves both directions, including a sweep of every OpenAPI route with an
entrant cookie in the jar.

What is **shared** is deliberate and is the mechanism, never the identity:
Argon2id hashing, the NIST password policy, SHA-256 token hashing and the
throttle engine are principal-agnostic module functions in `services/auth.py`
and are reused directly. A second authentication stack would be a second set
of bugs. The ~40 lines of session plumbing in `services/entrants.py` are the
one deliberate copy: the operator trio is `User`-bound at the type level, and
generalizing it would produce a function returning "one of two unrelated ORM
classes", which is the shape where a caller trusts the wrong branch.

**Adding a cookie that authenticates a request** means adding its name to
`settings.session_cookie_names` — the registry the CSRF middleware reads.
`tests/test_csrf_cookie_registry.py` derives every `set_cookie` in
`backend/api/` from the source and fails, by file and line, on a cookie the
registry does not name.

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
│   ├── schedule.py              # /schedule/validate (+ 410 tombstones)
│   ├── schedule_repair.py       # repair engine (route is a 410 tombstone)
│   ├── schedule_warm_restart.py # warm-restart engine (route is a 410 tombstone)
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
pytest   # rootdir is the repo root; uses the repo .venv
```

The HTTP layer has no integration tests of its own — coverage lives
in `e2e/` (Playwright). Unit + integration tests are under
`tests/backend/`.
