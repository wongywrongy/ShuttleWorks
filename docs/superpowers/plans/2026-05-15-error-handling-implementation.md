# Error-Handling Buckets A–F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the error-observability gap surfaced by `docs/superpowers/specs/2026-05-15-error-handling-audit.md`. Every backend failure ends up with a stable `{code, message, request_id}` payload, every solver/SSE/worker error path emits a typed code instead of a generic 500, and the frontend renders the code visibly and branches on it where it improves UX.

**Architecture:**
Six sequenced buckets. Bucket A registers the missing global exception handlers and the new ErrorCode enum members — the foundation everything else builds on. Buckets B/C/D extend coverage to brackets+invites, solver path, and SSE respectively. Bucket E adds worker-failure visibility via the advisor pipeline (one schema migration). Bucket F lifts the typed codes into user-visible UI on the frontend. One commit per bucket; full pytest + vitest suite green before each commit.

**Tech Stack:** FastAPI + Pydantic v2, SQLAlchemy + Alembic, OR-Tools CP-SAT (backend); React + TypeScript + Vite + Zustand + axios + Vitest (frontend); pytest with `TestClient` + `isolate_test_database` (test).

---

## File Structure

**Backend — modify**

- `products/scheduler/backend/app/error_codes.py` — add ~20 new ErrorCode enum members (database, file IO, solver-detail, bracket, invite, SSE, auth, worker, validation namespaces).
- `products/scheduler/backend/app/main.py` — register five new `@app.exception_handler` callbacks (`SQLAlchemyError`, `OSError`, `RequestValidationError`, `Exception` catch-all, plus a small refactor of `_conflict_error_handler` to include `code` + `request_id`).
- `products/scheduler/backend/app/exceptions.py` — no signature change to `ConflictError` (keep `match_id` required; bracket 409s use `http_error` per Bucket B option 3).
- `products/scheduler/backend/api/tournaments.py:188` — fix latent bug: `VALIDATION_FAILED` enum now exists.
- `products/scheduler/backend/api/brackets.py` — convert 40 raw `HTTPException` sites to `http_error(...)`.
- `products/scheduler/backend/api/invites.py` — convert 7 raw `HTTPException` sites to `http_error(...)`.
- `products/scheduler/backend/api/schedule.py` — branch on `result.status` (emit `SOLVE_INFEASIBLE` / `SOLVE_TIMEOUT`); restructure SSE error event to carry a code; move pre-solve validation out of the worker thread.
- `products/scheduler/backend/api/schedule_repair.py` + `schedule_warm_restart.py` — same `result.status` branching.
- `products/scheduler/backend/adapters/badminton.py` — wrap public conversion functions with `try/except → SOLVER_VALIDATION_FAILED`.
- `products/scheduler/backend/services/suggestions_worker.py` — persist failure context on handler exceptions; emit advisor-readable signal.
- `products/scheduler/backend/services/sync_service.py` — distinguish 4xx vs 5xx Supabase failures; record stuck-row state.
- `products/scheduler/backend/database/models.py` — add `Suggestion.error_code` + `Suggestion.error_message` + `Suggestion.failed_at` columns (Bucket E).
- `products/scheduler/backend/alembic/versions/<new>.py` — migration for the three new columns + a `sync_failures` table.

**Frontend — modify**

- `packages/design-system/components/Toast.tsx` — split `detail` into `code` slot (monospace, distinct color) + `meta` slot (request_id).
- `products/scheduler/frontend/src/api/client.ts` — promote `err.code` from interceptor; parse SSE-handshake JSON; suppress per-request error toasts when offline.
- `products/scheduler/frontend/src/hooks/useSchedule.ts` — branch on `err.code` (SOLVE_INFEASIBLE / SOLVE_TIMEOUT / SOLVER_VALIDATION_FAILED).
- `products/scheduler/frontend/src/hooks/useTournamentState.ts` — branch on `STATE_CORRUPT` / `STATE_WRITE_FAILED` / `DATABASE_*`.
- `products/scheduler/frontend/src/hooks/useBracket.ts` — branch on `BRACKET_NOT_FOUND` (empty state) vs other errors.
- `products/scheduler/frontend/src/components/ErrorBoundary.tsx` — hide stack trace, add "Copy diagnostics".
- `products/scheduler/frontend/src/components/Toast.tsx` — re-export of design-system Toast; verify pass-through.

**Backend — create (tests)**

- `products/scheduler/tests/test_error_handlers.py` — new test module covering the global handlers (Bucket A).
- `products/scheduler/tests/test_brackets_error_codes.py` — coverage of all bracket error paths (Bucket B).
- `products/scheduler/tests/test_invites_error_codes.py` — coverage of all invite error paths (Bucket B).
- `products/scheduler/tests/test_solver_error_codes.py` — coverage of solver path discrimination (Bucket C).
- `products/scheduler/tests/test_sse_error_events.py` — coverage of SSE structured error emission (Bucket D).
- `products/scheduler/tests/test_worker_failure_visibility.py` — coverage of Bucket E.

**Frontend — create (tests)**

- `products/scheduler/frontend/src/lib/__tests__/errorInterceptor.test.ts` — axios interceptor decoding behavior.
- `products/scheduler/frontend/src/lib/__tests__/toastCode.test.tsx` — toast code slot rendering.

---

## Self-Review Note

Spec coverage: all 7 Critical + 15 Important findings from the audit map to tasks below (see "Spec→Task map" at end). Minor findings are addressed opportunistically inside larger tasks.

---

# Bucket A — Global Handler + Enum Foundation

**Why first:** This is the load-bearing missing piece. Without it, every other bucket's typed-code work would still get half-routed through FastAPI's generic 500 path for SQLAlchemy/OSError/etc. With it, every other bucket reduces to "name the right code at the raise site."

**One commit at end.**

### Task A1: Extend the ErrorCode enum

**Files:**
- Modify: `products/scheduler/backend/app/error_codes.py`
- Test: `products/scheduler/tests/test_error_handlers.py` (new)

- [ ] **Step 1: Write the enum-membership test**

Create `products/scheduler/tests/test_error_handlers.py`:

```python
"""Tests for the global exception handlers + ErrorCode enum coverage."""
from __future__ import annotations

import pytest

from app.error_codes import ErrorCode


def test_new_enum_members_exist():
    """Bucket A's enum additions are all present and string-valued."""
    expected = {
        # Bucket A foundation
        "INTERNAL_ERROR",
        "DATABASE_INTEGRITY",
        "DATABASE_UNAVAILABLE",
        "FILE_IO_FAILED",
        "VALIDATION_FAILED",
        "AUTH_REQUIRED",
        "AUTH_FORBIDDEN",
        # Bucket B / brackets + invites (declared early so call sites in
        # later buckets compile without a second enum edit).
        "BRACKET_NOT_FOUND",
        "BRACKET_HYDRATION_FAILED",
        "BRACKET_INVALID_INPUT",
        "BRACKET_IMPORT_INVALID",
        "BRACKET_CONFLICT",
        "INVITE_NOT_FOUND",
        "INVITE_EXPIRED",
        "INVITE_REVOKED",
        "INVITE_ROLE_DENIED",
        "INVITE_INVALID",
        # Bucket C / solver detail
        "MODEL_BUILD_FAILED",
        "SOLVER_VALIDATION_FAILED",
        "POST_SOLVE_VALIDATION_FAILED",
        # Bucket D / SSE namespace
        "SSE_MODEL_BUILD_FAILED",
        "SSE_SOLVE_CRASHED",
        "SSE_VALIDATION_FAILED",
        # Bucket E / worker visibility
        "WORKER_FAILURE",
    }
    actual = {m.name for m in ErrorCode}
    missing = expected - actual
    assert not missing, f"missing enum members: {missing}"


def test_enum_values_match_names():
    """Every member's value equals its name — keeps the wire format stable."""
    for member in ErrorCode:
        assert member.value == member.name
```

- [ ] **Step 2: Run test, see it fail**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler"
.venv/bin/pytest tests/test_error_handlers.py::test_new_enum_members_exist -xvs
```

Expected: FAIL with `missing enum members: {...}` listing all new members.

- [ ] **Step 3: Add the enum members**

Edit `products/scheduler/backend/app/error_codes.py`. Add the new members in
their existing section groupings — KEEP the existing ones unchanged.
Replace `INTERNAL = "INTERNAL"` (already present at the bottom) with
`INTERNAL_ERROR = "INTERNAL_ERROR"` — and remove the old `INTERNAL` only
after confirming `grep -rn "ErrorCode.INTERNAL\b"` returns zero hits.

```python
class ErrorCode(str, Enum):
    # State persistence
    STATE_TOO_NEW = "STATE_TOO_NEW"
    STATE_CORRUPT = "STATE_CORRUPT"
    STATE_MISSING = "STATE_MISSING"
    STATE_WRITE_FAILED = "STATE_WRITE_FAILED"
    STATE_SCHEMA_MISMATCH = "STATE_SCHEMA_MISMATCH"

    # Match-state operations
    MATCH_STATE_UNREADABLE = "MATCH_STATE_UNREADABLE"
    MATCH_STATE_WRITE_FAILED = "MATCH_STATE_WRITE_FAILED"

    # Imports
    UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE"
    UPLOAD_INVALID_JSON = "UPLOAD_INVALID_JSON"
    UPLOAD_SCHEMA_MISMATCH = "UPLOAD_SCHEMA_MISMATCH"
    UPLOAD_WRONG_TYPE = "UPLOAD_WRONG_TYPE"

    # Backups
    BACKUP_NOT_FOUND = "BACKUP_NOT_FOUND"
    BACKUP_RESTORE_FAILED = "BACKUP_RESTORE_FAILED"

    # Input validation
    INVALID_INPUT = "INVALID_INPUT"
    VALIDATION_FAILED = "VALIDATION_FAILED"

    # Solver
    SOLVE_FAILED = "SOLVE_FAILED"
    SOLVE_INFEASIBLE = "SOLVE_INFEASIBLE"
    SOLVE_TIMEOUT = "SOLVE_TIMEOUT"
    MODEL_BUILD_FAILED = "MODEL_BUILD_FAILED"
    SOLVER_VALIDATION_FAILED = "SOLVER_VALIDATION_FAILED"
    POST_SOLVE_VALIDATION_FAILED = "POST_SOLVE_VALIDATION_FAILED"

    # Schedule operations
    WARM_RESTART_FAILED = "WARM_RESTART_FAILED"
    REPAIR_FAILED = "REPAIR_FAILED"
    DISRUPTION_INVALID = "DISRUPTION_INVALID"

    # Proposal pipeline (two-phase commit)
    PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"
    SCHEDULE_VERSION_CONFLICT = "SCHEDULE_VERSION_CONFLICT"
    NO_COMMITTED_SCHEDULE = "NO_COMMITTED_SCHEDULE"

    # Database + IO (new infra)
    DATABASE_INTEGRITY = "DATABASE_INTEGRITY"
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
    FILE_IO_FAILED = "FILE_IO_FAILED"

    # Auth (new — replaces bare 401/403 strings)
    AUTH_REQUIRED = "AUTH_REQUIRED"
    AUTH_FORBIDDEN = "AUTH_FORBIDDEN"

    # Brackets
    BRACKET_NOT_FOUND = "BRACKET_NOT_FOUND"
    BRACKET_HYDRATION_FAILED = "BRACKET_HYDRATION_FAILED"
    BRACKET_INVALID_INPUT = "BRACKET_INVALID_INPUT"
    BRACKET_IMPORT_INVALID = "BRACKET_IMPORT_INVALID"
    BRACKET_CONFLICT = "BRACKET_CONFLICT"

    # Invites
    INVITE_NOT_FOUND = "INVITE_NOT_FOUND"
    INVITE_EXPIRED = "INVITE_EXPIRED"
    INVITE_REVOKED = "INVITE_REVOKED"
    INVITE_ROLE_DENIED = "INVITE_ROLE_DENIED"
    INVITE_INVALID = "INVITE_INVALID"

    # SSE — emitted in the streaming response, not as HTTP status
    SSE_MODEL_BUILD_FAILED = "SSE_MODEL_BUILD_FAILED"
    SSE_SOLVE_CRASHED = "SSE_SOLVE_CRASHED"
    SSE_VALIDATION_FAILED = "SSE_VALIDATION_FAILED"

    # Workers — surfaced via /advisories, not direct HTTP error
    WORKER_FAILURE = "WORKER_FAILURE"

    # Generic catch-all (replaces old INTERNAL)
    INTERNAL_ERROR = "INTERNAL_ERROR"
```

Also update the `_payload` helper to optionally include `request_id`:

```python
def _payload(
    code: ErrorCode,
    message: str,
    *,
    request_id: str | None = None,
    extras: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {"code": code.value, "message": message}
    if request_id is not None:
        body["request_id"] = request_id
    if extras:
        body.update(extras)
    return body
```

And expose `_payload` publicly as `error_payload` (the handler module will need it):

```python
def error_payload(
    code: ErrorCode,
    message: str,
    *,
    request_id: str | None = None,
    extras: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return _payload(code, message, request_id=request_id, extras=extras)
```

- [ ] **Step 4: Run tests again — both should pass**

```bash
.venv/bin/pytest tests/test_error_handlers.py -xvs
```

Expected: PASS for both `test_new_enum_members_exist` and `test_enum_values_match_names`.

### Task A2: Fix the latent bug at `tournaments.py:188`

**Files:**
- Modify: `products/scheduler/backend/api/tournaments.py:188`
- Test: `products/scheduler/tests/test_error_handlers.py`

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_error_handlers.py`:

```python
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def tournaments_client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import tournaments
    app_ = FastAPI()
    app_.include_router(tournaments.router)
    return TestClient(app_)


def test_create_tournament_invalid_kind_returns_typed_400(tournaments_client):
    """POST /tournaments with an invalid kind returns 400 with code VALIDATION_FAILED.

    Regression test: previously raised AttributeError because the call site
    referenced ErrorCode.VALIDATION_FAILED before the member existed (audit
    finding ERR-CRIT-3).
    """
    r = tournaments_client.post("/tournaments", json={"name": "x", "kind": "blah"})
    assert r.status_code == 400
    body = r.json()
    assert body["detail"]["code"] == "VALIDATION_FAILED"
    assert "blah" in body["detail"]["message"]
```

- [ ] **Step 2: Run it, see it pass already (the enum now exists)**

```bash
.venv/bin/pytest tests/test_error_handlers.py::test_create_tournament_invalid_kind_returns_typed_400 -xvs
```

Expected: PASS — Task A1 made the enum member exist, so the latent bug is already fixed by the enum addition. The test exists to lock in the regression.

### Task A3: Register the global exception handlers

**Files:**
- Modify: `products/scheduler/backend/app/main.py:120-170`
- Test: `products/scheduler/tests/test_error_handlers.py`

- [ ] **Step 1: Write the failing tests for global handlers**

Append:

```python
from sqlalchemy.exc import IntegrityError, OperationalError
from fastapi.exceptions import RequestValidationError


@pytest.fixture
def app_with_handlers(tmp_path, monkeypatch):
    """Build an app that has the global handlers registered but a custom
    /boom route that raises a controlled exception for each handler class."""
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import _register_global_handlers  # added in Step 3
    from pydantic import BaseModel

    app_ = FastAPI()
    _register_global_handlers(app_)

    class _Body(BaseModel):
        x: int

    @app_.post("/boom/integrity")
    def boom_integrity():
        raise IntegrityError("stmt", {}, Exception("dup"))

    @app_.post("/boom/operational")
    def boom_operational():
        raise OperationalError("stmt", {}, Exception("locked"))

    @app_.post("/boom/oserror")
    def boom_oserror():
        raise FileNotFoundError("/tmp/missing")

    @app_.post("/boom/generic")
    def boom_generic():
        raise RuntimeError("unexpected")

    @app_.post("/boom/validation")
    def boom_validation(body: _Body):
        return body

    return TestClient(app_)


def test_integrity_error_returns_409_database_integrity(app_with_handlers):
    r = app_with_handlers.post("/boom/integrity")
    assert r.status_code == 409
    body = r.json()
    assert body["detail"]["code"] == "DATABASE_INTEGRITY"
    assert "request_id" in body["detail"]


def test_operational_error_returns_503_database_unavailable(app_with_handlers):
    r = app_with_handlers.post("/boom/operational")
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "DATABASE_UNAVAILABLE"


def test_oserror_returns_500_file_io_failed(app_with_handlers):
    r = app_with_handlers.post("/boom/oserror")
    assert r.status_code == 500
    assert r.json()["detail"]["code"] == "FILE_IO_FAILED"


def test_generic_exception_returns_500_internal_error(app_with_handlers):
    r = app_with_handlers.post("/boom/generic")
    assert r.status_code == 500
    body = r.json()
    assert body["detail"]["code"] == "INTERNAL_ERROR"
    assert "request_id" in body["detail"]
    # Don't leak the internal exception message to the client.
    assert "unexpected" not in body["detail"]["message"].lower()


def test_request_validation_error_returns_422_validation_failed(app_with_handlers):
    r = app_with_handlers.post("/boom/validation", json={"x": "not-an-int"})
    assert r.status_code == 422
    body = r.json()
    assert body["detail"]["code"] == "VALIDATION_FAILED"
    assert isinstance(body["detail"]["validationErrors"], list)
    assert body["detail"]["validationErrors"][0]["loc"][-1] == "x"
```

- [ ] **Step 2: Run them, see them fail**

```bash
.venv/bin/pytest tests/test_error_handlers.py -k boom -xvs
```

Expected: FAIL — `_register_global_handlers` doesn't exist yet.

- [ ] **Step 3: Implement the handlers**

Edit `products/scheduler/backend/app/main.py`. Add the new imports near the top:

```python
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
```

Add a private helper that registers the handlers. Place it ABOVE the
existing `@app.exception_handler(ConflictError)` decorator:

```python
def _register_global_handlers(target_app: FastAPI) -> None:
    """Register the global exception handlers.

    Extracted so the test suite can wire up handlers on a fresh app
    instance without importing the production app (which has a lifespan
    that runs migrations and starts workers).
    """
    from app.error_codes import ErrorCode, error_payload

    def _rid(request: Request) -> str | None:
        return getattr(request.state, "request_id", None)

    @target_app.exception_handler(IntegrityError)
    async def _integrity(request: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("db_integrity_error", exc_info=exc)
        return JSONResponse(
            status_code=409,
            content={"detail": error_payload(
                ErrorCode.DATABASE_INTEGRITY,
                "database integrity constraint violated",
                request_id=_rid(request),
            )},
        )

    @target_app.exception_handler(OperationalError)
    async def _operational(request: Request, exc: OperationalError) -> JSONResponse:
        log.warning("db_operational_error", exc_info=exc)
        return JSONResponse(
            status_code=503,
            content={"detail": error_payload(
                ErrorCode.DATABASE_UNAVAILABLE,
                "database temporarily unavailable; retry shortly",
                request_id=_rid(request),
            )},
        )

    @target_app.exception_handler(SQLAlchemyError)
    async def _sqlalchemy(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        # Catch-all for other SQLAlchemy errors (StatementError, etc.) —
        # surfaces as a 500 with INTERNAL_ERROR so it's still trackable.
        log.exception("db_sqlalchemy_error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": error_payload(
                ErrorCode.INTERNAL_ERROR,
                "an unexpected database error occurred",
                request_id=_rid(request),
            )},
        )

    @target_app.exception_handler(OSError)
    async def _oserror(request: Request, exc: OSError) -> JSONResponse:
        log.warning("file_io_error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": error_payload(
                ErrorCode.FILE_IO_FAILED,
                "a file I/O operation failed",
                request_id=_rid(request),
            )},
        )

    @target_app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Flatten Pydantic's errors into both a human-readable message and a
        # structured array. Frontend can render either.
        errors = exc.errors()
        summary = "; ".join(
            f"{'.'.join(str(p) for p in e.get('loc', []))}: {e.get('msg', '')}"
            for e in errors[:3]
        )
        if len(errors) > 3:
            summary += f" (+{len(errors) - 3} more)"
        return JSONResponse(
            status_code=422,
            content={"detail": error_payload(
                ErrorCode.VALIDATION_FAILED,
                summary or "request validation failed",
                request_id=_rid(request),
                extras={"validationErrors": errors},
            )},
        )

    @target_app.exception_handler(Exception)
    async def _catchall(request: Request, exc: Exception) -> JSONResponse:
        # Last line of defense. Log with traceback; return a sanitized body.
        log.exception("unhandled_exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": error_payload(
                ErrorCode.INTERNAL_ERROR,
                "an unexpected error occurred; please retry",
                request_id=_rid(request),
            )},
        )
```

Then call it on the production app object, right after the existing
`ConflictError` / `PreconditionFailedError` decorators:

```python
_register_global_handlers(app)
```

Also: update the existing `_conflict_error_handler` and
`_precondition_failed_handler` to attach `request_id` to their bodies:

```python
@app.exception_handler(ConflictError)
async def _conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    body = exc.to_dict()
    rid = getattr(request.state, "request_id", None)
    if rid is not None:
        body["request_id"] = rid
    return JSONResponse(status_code=409, content=body)


@app.exception_handler(PreconditionFailedError)
async def _precondition_failed_handler(
    request: Request, exc: PreconditionFailedError
) -> JSONResponse:
    body = exc.to_dict()
    rid = getattr(request.state, "request_id", None)
    if rid is not None:
        body["request_id"] = rid
    return JSONResponse(status_code=412, content=body)
```

- [ ] **Step 4: Run the handler tests; they should pass**

```bash
.venv/bin/pytest tests/test_error_handlers.py -xvs
```

Expected: PASS for all 5 new handler tests + the earlier enum tests.

### Task A4: Verify legacy tests still pass + commit Bucket A

- [ ] **Step 1: Run full backend test suite**

```bash
.venv/bin/pytest tests/ -x
```

Expected: all existing tests pass — none of the global handlers should
change observable behavior on healthy routes. If a test like
`test_match_state.py` previously asserted a bare 500 body shape, it
needs updating to assert the new `{detail: {code, message}}` shape;
update each in the same commit.

- [ ] **Step 2: Frontend smoke — ensure interceptor still decodes**

```bash
cd ../../frontend && npm run test:run -- --reporter=verbose
```

Expected: PASS. No frontend changes yet so nothing should break.

- [ ] **Step 3: Commit Bucket A**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/backend/app/error_codes.py \
        products/scheduler/backend/app/main.py \
        products/scheduler/tests/test_error_handlers.py
git commit -m "$(cat <<'EOF'
feat(errors): register global exception handlers + expand ErrorCode enum

Closes the meta-gap identified in 2026-05-15-error-handling-audit.md:
no @app.exception_handler(Exception) existed, so every uncaught
SQLAlchemyError, OSError, KeyError, etc. fell to FastAPI's default 500
with no code. Now every uncaught exception path yields a structured
{code, message, request_id} body the frontend already decodes.

- Add 21 new ErrorCode members (database, file IO, solver detail,
  bracket, invite, SSE, auth, worker, validation namespaces).
- Register handlers for IntegrityError (409), OperationalError (503),
  SQLAlchemyError catch-all (500), OSError (500), RequestValidationError
  (422), and Exception (500).
- request_id from middleware echoed into every error body for ops
  correlation.
- Fixes latent AttributeError in tournaments.py:188 by defining
  VALIDATION_FAILED.

Buckets B–F (audit follow-ups) build on this foundation.
EOF
)"
```

---

# Bucket B — Bracket + Invite ErrorCode Coverage

**Why next:** Brackets is the largest single uncoded surface (40 raw `HTTPException` sites, never imports `ErrorCode`). After Bucket A, even these sites surface SOME code (via the catch-all `Exception` handler returning `INTERNAL_ERROR` 500 — but 404s and 400s would now wrap as 500s if the bare HTTPException leaked through, which it WON'T because it's still an HTTPException). However, the user-visible message still won't carry a stable code unless we route through `http_error()`. So this bucket is about making the existing 400/404/409 responses CARRY codes.

**One commit at end.**

### Task B1: Add typed-code coverage for `api/invites.py` (smaller; warmup)

**Files:**
- Modify: `products/scheduler/backend/api/invites.py`
- Test: `products/scheduler/tests/test_invites_error_codes.py` (new)

- [ ] **Step 1: Read the current invites.py error sites**

```bash
.venv/bin/python -c "import linecache; [print(f'L{n}:', linecache.getline('backend/api/invites.py', n).rstrip()) for n in (123, 129, 135, 161, 197, 202, 209, 210)]"
```

Capture the exact wording so the new messages stay the same.

- [ ] **Step 2: Write failing tests**

Create `products/scheduler/tests/test_invites_error_codes.py`:

```python
"""Bucket B: every invites.py error path emits a typed ErrorCode."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import _register_global_handlers
    from api import invites

    app_ = FastAPI()
    _register_global_handlers(app_)
    app_.include_router(invites.router)
    return TestClient(app_)


def test_resolve_invite_unknown_token_returns_invite_not_found(client):
    r = client.get("/invites/this-token-does-not-exist")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_NOT_FOUND"


def test_accept_invite_unknown_token_returns_invite_not_found(client):
    r = client.post("/invites/garbage/accept")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_NOT_FOUND"


# Further tests for INVITE_EXPIRED, INVITE_REVOKED, INVITE_ROLE_DENIED,
# INVITE_INVALID will need seeded fixtures; the basic NOT_FOUND coverage
# above establishes the typed-shape contract.
```

- [ ] **Step 3: Run, see them fail**

```bash
.venv/bin/pytest tests/test_invites_error_codes.py -xvs
```

Expected: FAIL — current responses are bare strings (no `code` field).

- [ ] **Step 4: Convert raw HTTPException sites to http_error**

Edit `products/scheduler/backend/api/invites.py`. Add import at the top:

```python
from app.error_codes import ErrorCode, http_error
```

Replace each raw `HTTPException` per the mapping:

| Line | Old | New |
|------|-----|-----|
| 123 | `raise HTTPException(status_code=404, detail="invite not found")` | `raise http_error(404, ErrorCode.INVITE_NOT_FOUND, "invite not found")` |
| 129 | `raise HTTPException(status_code=403, detail="user id is not a UUID")` | `raise http_error(403, ErrorCode.INVITE_INVALID, "user id is not a UUID")` |
| 135 | `raise HTTPException(status_code=403, detail="owner role required")` | `raise http_error(403, ErrorCode.INVITE_ROLE_DENIED, "owner role required")` |
| 161 | (invite not found) | `INVITE_NOT_FOUND` |
| 197 | (invite not found) | `INVITE_NOT_FOUND` |
| 202 | (invite expired or revoked) | Split: 410 + `INVITE_EXPIRED` for `expires_at` past; 410 + `INVITE_REVOKED` for `revoked_at` non-null. If they're branched at the same site today, split into two if/elif branches. |
| 209-210 | (user UUID validation) | `INVITE_INVALID` |

Read the actual source to confirm wording and keep messages stable.

- [ ] **Step 5: Run tests; they should pass**

```bash
.venv/bin/pytest tests/test_invites_error_codes.py -xvs
.venv/bin/pytest tests/test_invites.py -xvs  # existing legacy tests
```

Expected: PASS for both. If a legacy test asserts the old bare-string `detail`,
update its assertion to the new shape (`detail.code`, `detail.message`).

### Task B2: Add typed-code coverage for `api/brackets.py`

**Files:**
- Modify: `products/scheduler/backend/api/brackets.py` (40 raw HTTPException sites)
- Test: `products/scheduler/tests/test_brackets_error_codes.py` (new)

- [ ] **Step 1: Catalog every site**

Run this exact command and capture output:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/backend"
grep -n "raise HTTPException" api/brackets.py
```

You will get ~40 lines. Categorize each:

- **404** → `BRACKET_NOT_FOUND` (tournament/event/match not found). Most common.
- **400 input validation** → `BRACKET_INVALID_INPUT` (event count, participants, duplicate id).
- **400 import parsing** (the `str(exc)` ones at 898, 909, 1215, 1226, 1435, 1747, 1837) → `BRACKET_IMPORT_INVALID`.
- **409 state conflict** → `BRACKET_CONFLICT` (event already started, bracket already exists). 10 sites.
- **500 hydration** (line 1180) → `BRACKET_HYDRATION_FAILED`.

- [ ] **Step 2: Write a sample test covering each category**

Create `products/scheduler/tests/test_brackets_error_codes.py`:

```python
"""Bucket B: brackets.py error paths emit typed ErrorCode + correct status."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import _register_global_handlers
    from api import brackets, tournaments

    app_ = FastAPI()
    _register_global_handlers(app_)
    app_.include_router(brackets.router)
    app_.include_router(tournaments.router)  # needed for tournament creation
    return TestClient(app_)


def test_get_bracket_unknown_tournament_returns_bracket_not_found(client):
    r = client.get("/tournaments/00000000-0000-0000-0000-000000000000/bracket")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "BRACKET_NOT_FOUND"


def _create_tournament(client) -> str:
    r = client.post("/tournaments", json={"name": "T", "kind": "bracket"})
    assert r.status_code == 200
    return r.json()["id"]


def test_create_bracket_with_zero_events_returns_bracket_invalid_input(client):
    tid = _create_tournament(client)
    r = client.post(f"/tournaments/{tid}/bracket", json={"events": []})
    assert r.status_code == 400
    body = r.json()["detail"]
    assert body["code"] == "BRACKET_INVALID_INPUT"
    assert "at least one event" in body["message"].lower()


def test_create_bracket_with_duplicate_event_returns_bracket_invalid_input(client):
    tid = _create_tournament(client)
    r = client.post(f"/tournaments/{tid}/bracket", json={
        "events": [
            {"id": "MS", "discipline": "MS", "participants": []},
            {"id": "MS", "discipline": "MS", "participants": []},
        ],
    })
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "BRACKET_INVALID_INPUT"


def test_generate_event_unknown_event_returns_bracket_not_found(client):
    tid = _create_tournament(client)
    r = client.post(
        f"/tournaments/{tid}/bracket/events/nonexistent/generate",
        json={},
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "BRACKET_NOT_FOUND"


def test_bracket_import_invalid_json_returns_bracket_import_invalid(client):
    tid = _create_tournament(client)
    r = client.post(
        f"/tournaments/{tid}/bracket/import",
        json={"not": "a-bracket"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "BRACKET_IMPORT_INVALID"
```

- [ ] **Step 3: Run; expect FAIL**

```bash
.venv/bin/pytest tests/test_brackets_error_codes.py -xvs
```

- [ ] **Step 4: Bulk-convert brackets.py call sites**

Edit `products/scheduler/backend/api/brackets.py`. Add the import:

```python
from app.error_codes import ErrorCode, http_error
```

Walk every `raise HTTPException(...)` site and convert per the
categorization. Examples:

```python
# Before:
raise HTTPException(status_code=404, detail="tournament not found")
# After:
raise http_error(404, ErrorCode.BRACKET_NOT_FOUND, "tournament not found")

# Before:
raise HTTPException(status_code=400, detail="at least one event is required")
# After:
raise http_error(400, ErrorCode.BRACKET_INVALID_INPUT, "at least one event is required")

# Before:
raise HTTPException(status_code=400, detail=str(exc))   # str(exc) leak
# After:
raise http_error(400, ErrorCode.BRACKET_IMPORT_INVALID, "bracket import failed: invalid structure")
# (keep the str(exc) in the log line, not in the response body)

# Before:
raise HTTPException(status_code=409, detail="event already started")
# After:
raise http_error(409, ErrorCode.BRACKET_CONFLICT, "event already started")

# Before:
raise HTTPException(status_code=500, detail="hydration failed")   # line 1180
# After:
raise http_error(500, ErrorCode.BRACKET_HYDRATION_FAILED, "bracket session could not be reconstructed from current data")
```

When the source had `detail=str(exc)`, log the exception before replacing
the response detail with a safe generic message:

```python
except ValueError as exc:
    log.warning("bracket_import_validation_failed: %s", exc)
    raise http_error(400, ErrorCode.BRACKET_IMPORT_INVALID, "bracket import failed: invalid structure")
```

- [ ] **Step 5: Run brackets tests**

```bash
.venv/bin/pytest tests/test_brackets_error_codes.py tests/unit/test_bracket_repository.py tests/unit/test_bracket_player_dto.py -xvs
```

Expected: PASS. Update any legacy bracket tests that asserted the old
bare-string detail shape to the new typed shape.

### Task B3: Verify and commit Bucket B

- [ ] **Step 1: Full backend test run**

```bash
.venv/bin/pytest tests/ -x
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/backend/api/brackets.py \
        products/scheduler/backend/api/invites.py \
        products/scheduler/tests/test_brackets_error_codes.py \
        products/scheduler/tests/test_invites_error_codes.py
# Also stage any legacy-test detail-shape updates.
git commit -m "$(cat <<'EOF'
feat(errors): typed ErrorCode coverage for brackets + invites

Replaces 40 raw HTTPException sites in api/brackets.py and 7 in
api/invites.py with http_error(...) calls that carry a stable code.
Frontend axios interceptor now reads detail.code for every bracket /
invite operation (was 0% coverage; now 100%).

Bracket 409 sites use BRACKET_CONFLICT via http_error rather than
ConflictError (which requires match_id) — pragmatic match for the
bracket/event/participant/import conflict shape.

Sanitizes leaked str(exc) bodies in bracket import paths; the exception
text now lives in server logs rather than the response detail.
EOF
)"
```

---

# Bucket C — Solver Path Differentiation

**Why next:** Three of the existing enum members (`SOLVE_INFEASIBLE`, `SOLVE_TIMEOUT`, `SOLVE_FAILED`) currently collapse into one — only `SOLVE_FAILED` is ever raised. Frontend cannot give the operator a recovery hint because the same 500 means three different things.

**One commit at end.**

### Task C1: Wrap adapter boundaries with `SOLVER_VALIDATION_FAILED`

**Files:**
- Modify: `products/scheduler/backend/adapters/badminton.py`
- Test: `products/scheduler/tests/test_solver_error_codes.py` (new)

- [ ] **Step 1: Write failing test for malformed config**

Create `products/scheduler/tests/test_solver_error_codes.py`:

```python
"""Bucket C: solver-path failures emit specific ErrorCode values."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import _register_global_handlers
    from api import schedule

    app_ = FastAPI()
    _register_global_handlers(app_)
    app_.include_router(schedule.router)
    return TestClient(app_)


def _request_body(**overrides):
    body = {
        "config": {
            "tournamentName": "T",
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 1,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "players": [],
        "matches": [],
    }
    body.update(overrides)
    return body


def test_negative_court_count_returns_solver_validation_failed(client):
    body = _request_body(config={
        "tournamentName": "T",
        "intervalMinutes": 30,
        "dayStart": "09:00",
        "dayEnd": "17:00",
        "breaks": [],
        "courtCount": -1,  # invalid
        "defaultRestMinutes": 30,
        "freezeHorizonSlots": 0,
    })
    r = client.post("/schedule", json=body)
    # Pydantic may already reject negative — if so we expect 422
    # VALIDATION_FAILED. If not, the adapter catch should map to 422
    # SOLVER_VALIDATION_FAILED. Either is acceptable; assert the
    # status family + a code-shape body.
    assert r.status_code == 422
    code = r.json()["detail"]["code"]
    assert code in ("VALIDATION_FAILED", "SOLVER_VALIDATION_FAILED")
```

- [ ] **Step 2: Run; expect a FAIL or wrong code**

```bash
.venv/bin/pytest tests/test_solver_error_codes.py::test_negative_court_count_returns_solver_validation_failed -xvs
```

- [ ] **Step 3: Wrap adapter functions**

Edit `products/scheduler/backend/adapters/badminton.py`. For each public
function (`schedule_config_from_dto`, `players_from_dto`,
`matches_from_dto`, `solver_options_for`), wrap the body:

```python
from app.error_codes import ErrorCode, http_error


def schedule_config_from_dto(dto):
    try:
        # ... existing body unchanged ...
        return result
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        log.warning("schedule_config_from_dto: invalid input: %s", exc)
        raise http_error(
            422,
            ErrorCode.SOLVER_VALIDATION_FAILED,
            f"solver input invalid: {exc}",
        )
```

Where the existing function already has a try/except (`_time_to_minutes`)
that raises `http_error(422)`, leave it — those become a subset of this
pattern.

- [ ] **Step 4: Run; should pass**

```bash
.venv/bin/pytest tests/test_solver_error_codes.py -xvs
```

### Task C2: Branch on `result.status` in `/schedule`, `/schedule/repair`, `/schedule/warm-restart`

**Files:**
- Modify: `products/scheduler/backend/api/schedule.py:84-102` (and repair / warm_restart equivalents)
- Test: same `test_solver_error_codes.py`

- [ ] **Step 1: Write failing tests for the three solver-status branches**

Append to `test_solver_error_codes.py`:

```python
def test_infeasible_solve_returns_solve_infeasible(client):
    """A solver that returns INFEASIBLE status should surface as 400 SOLVE_INFEASIBLE."""
    # Construct an obviously-infeasible problem: 2 matches sharing both
    # players, single slot, single court → solver returns INFEASIBLE.
    body = _request_body(
        config={
            "tournamentName": "T",
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "09:30",   # exactly 1 slot
            "breaks": [],
            "courtCount": 1,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        players=[
            {"id": "p1", "name": "Alice"},
            {"id": "p2", "name": "Bob"},
        ],
        matches=[
            {"id": "m1", "playerIds": ["p1", "p2"]},
            {"id": "m2", "playerIds": ["p1", "p2"]},  # same players, can't both fit
        ],
    )
    r = client.post("/schedule", json=body)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "SOLVE_INFEASIBLE"
```

- [ ] **Step 2: Run; expect FAIL (current behavior returns DTO with status embedded)**

```bash
.venv/bin/pytest tests/test_solver_error_codes.py::test_infeasible_solve_returns_solve_infeasible -xvs
```

- [ ] **Step 3: Branch on `result.status`**

Edit `products/scheduler/backend/api/schedule.py`. Locate the
`generate_schedule` endpoint (~line 60-102). After `result = CPSATBackend(
... ).solve(...)`:

```python
from app.error_codes import ErrorCode, http_error

# After solve completes:
status_value = getattr(result.status, "value", str(result.status))
if status_value == "infeasible":
    raise http_error(
        400,
        ErrorCode.SOLVE_INFEASIBLE,
        "no feasible schedule exists — relax constraints, increase courts, or drop matches",
    )
if status_value in ("unknown", "model_invalid"):
    # CP-SAT returns UNKNOWN when the time budget expires before
    # any solution is found. MODEL_INVALID = build-time error.
    if status_value == "model_invalid":
        raise http_error(
            422,
            ErrorCode.MODEL_BUILD_FAILED,
            "solver model could not be constructed — check court/slot/time-limit configuration",
        )
    raise http_error(
        408,
        ErrorCode.SOLVE_TIMEOUT,
        "solver time budget exhausted before finding a solution; try reducing match count or increasing the budget",
    )
return result_to_dto(result)
```

Apply the same status-branch block to `schedule_repair.py` and
`schedule_warm_restart.py` after their respective solve calls. The
existing `except Exception → SOLVE_FAILED/REPAIR_FAILED/WARM_RESTART_FAILED`
wrappers stay — they catch the genuine "solver crashed" case.

Also wire `AssertionError` from `verify_schedule()` specifically:

```python
except AssertionError as exc:
    log.exception("post_solve_verify_failed")
    raise http_error(
        500,
        ErrorCode.POST_SOLVE_VALIDATION_FAILED,
        f"solver output failed post-solve validation: {exc}",
    )
except Exception:
    log.exception("schedule generation failed")
    raise http_error(500, ErrorCode.SOLVE_FAILED, "schedule generation failed")
```

- [ ] **Step 4: Run all solver tests**

```bash
.venv/bin/pytest tests/test_solver_error_codes.py tests/test_schedule_endpoints_e2e.py tests/test_repair.py tests/test_warm_start.py -xvs
```

Expected: PASS. Update any legacy tests that previously asserted the
status-embedded DTO for an infeasible request to expect 400 SOLVE_INFEASIBLE
instead (or vice versa — verify which test currently runs an infeasible
input through `/schedule`).

### Task C3: Verify and commit Bucket C

- [ ] **Step 1: Full backend test run**

```bash
.venv/bin/pytest tests/ -x
```

- [ ] **Step 2: Commit**

```bash
git add products/scheduler/backend/api/schedule.py \
        products/scheduler/backend/api/schedule_repair.py \
        products/scheduler/backend/api/schedule_warm_restart.py \
        products/scheduler/backend/adapters/badminton.py \
        products/scheduler/tests/test_solver_error_codes.py
git commit -m "$(cat <<'EOF'
feat(errors): solver-path failure differentiation

Three previously-defined ErrorCode members (SOLVE_INFEASIBLE,
SOLVE_TIMEOUT) were never raised; everything landed in SOLVE_FAILED.
Now /schedule, /schedule/repair, and /schedule/warm-restart branch
on result.status and emit:

  - 400 SOLVE_INFEASIBLE — no feasible schedule exists
  - 408 SOLVE_TIMEOUT — time budget exhausted
  - 422 MODEL_BUILD_FAILED — model could not be constructed
  - 500 POST_SOLVE_VALIDATION_FAILED — verify_schedule() AssertionError
  - 500 SOLVE_FAILED — genuine solver crash (unchanged)

Adapter boundaries (schedule_config_from_dto et al) wrap KeyError /
ValueError / TypeError / AttributeError → 422 SOLVER_VALIDATION_FAILED
so malformed configs no longer fall to the SOLVE_FAILED bucket.

useSchedule on the frontend can now surface specific recovery hints
per code (Bucket F).
EOF
)"
```

---

# Bucket D — SSE Structured Errors

**Why next:** With Buckets A-C landed, all HTTP-shaped errors carry codes. SSE is the one surface that can't return an HTTP status mid-stream — it needs structured `event: error` payloads. The frontend SSE consumer reads only `event.message` today.

**One commit at end.**

### Task D1: Emit structured SSE error events

**Files:**
- Modify: `products/scheduler/backend/api/schedule.py:230-250` (the SSE event loop)
- Test: `products/scheduler/tests/test_sse_error_events.py` (new)

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/tests/test_sse_error_events.py`:

```python
"""Bucket D: SSE error events carry a typed code + structured payload."""
from __future__ import annotations

import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import _register_global_handlers
    from api import schedule

    app_ = FastAPI()
    _register_global_handlers(app_)
    app_.include_router(schedule.router)
    return TestClient(app_)


def _parse_sse(text: str):
    """Parse an SSE response body into a list of {type, ...} dicts."""
    events = []
    for chunk in text.split("\n\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


def test_sse_error_event_carries_typed_code_on_solver_crash(client, monkeypatch):
    """When the SSE solver thread crashes, the error event carries a code."""
    # Force the solver to crash with a controlled exception.
    from engine import cpsat_backend as cb

    def _boom(self, request):
        raise RuntimeError("controlled-test-failure")

    monkeypatch.setattr(cb.CPSATBackend, "solve", _boom, raising=True)

    body = {
        "config": {
            "tournamentName": "T",
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 1,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "players": [],
        "matches": [],
    }
    r = client.post("/schedule/stream", json=body)
    assert r.status_code == 200, r.text
    events = _parse_sse(r.text)
    error_event = next((e for e in events if e["type"] == "error"), None)
    assert error_event is not None, f"no error event found in: {events}"
    assert error_event["code"] == "SSE_SOLVE_CRASHED"
    assert "message" in error_event
    # We don't require the controlled message string to be propagated — server
    # may sanitize. But the code must be present and accurate.
```

- [ ] **Step 2: Run; expect FAIL (no `code` in event)**

```bash
.venv/bin/pytest tests/test_sse_error_events.py -xvs
```

- [ ] **Step 3: Refactor SSE error emission to carry a code**

Edit `products/scheduler/backend/api/schedule.py`. Locate the
`solve_in_thread` function (the inner function in
`generate_schedule_stream`) and the catch at ~line 214:

```python
def solve_in_thread():
    try:
        # ... existing solver invocation ...
        result_holder["result"] = result
    except Exception as e:
        log.exception("SSE solver worker failed")
        # NEW: classify the exception into an SSE code so the frontend
        # can branch.
        error_holder["error"] = _classify_sse_exception(e)
    emit({"type": "done"}, critical=True)
```

Add the classifier near the top of the file:

```python
def _classify_sse_exception(exc: Exception) -> dict:
    """Map a solver-worker exception to an SSE error payload."""
    from app.error_codes import ErrorCode

    # KeyError/ValueError/TypeError/AttributeError surface from the
    # adapter or model-build phase before solve begins.
    if isinstance(exc, (KeyError, ValueError, TypeError, AttributeError)):
        return {
            "code": ErrorCode.SSE_VALIDATION_FAILED.value,
            "message": "solver input validation failed; check tournament configuration",
        }
    if isinstance(exc, RuntimeError):
        # RuntimeError from CP-SAT's build phase typically means
        # malformed interval bounds, infeasible constants, etc.
        return {
            "code": ErrorCode.SSE_MODEL_BUILD_FAILED.value,
            "message": "solver model could not be constructed",
        }
    return {
        "code": ErrorCode.SSE_SOLVE_CRASHED.value,
        "message": "solver crashed during search",
    }
```

Update the `done` emission so it spreads the classified payload:

```python
if event["type"] == "done":
    if "error" in error_holder:
        err = error_holder["error"]
        rid = getattr(http_request.state, "request_id", None)
        payload = {
            "type": "error",
            "code": err["code"],
            "message": err["message"],
        }
        if rid is not None:
            payload["request_id"] = rid
        yield f"data: {json.dumps(payload)}\n\n"
    elif "result" in result_holder:
        # ... existing complete-emission unchanged ...
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
    break
```

- [ ] **Step 4: Run the SSE test; should pass**

```bash
.venv/bin/pytest tests/test_sse_error_events.py -xvs
```

### Task D2: Frontend SSE consumer reads `event.code`

**Files:**
- Modify: `products/scheduler/frontend/src/api/client.ts:611-617`

- [ ] **Step 1: Update the SSE error case**

Find the existing case in `client.ts`:

```ts
case 'error':
  reject(new Error(event.message));
  return;
```

Replace with:

```ts
case 'error': {
  const err = new Error(event.message ?? 'solver stream error') as Error & {
    code?: string;
    requestId?: string;
  };
  if (typeof event.code === 'string') err.code = event.code;
  if (typeof event.request_id === 'string') err.requestId = event.request_id;
  reject(err);
  return;
}
```

Also fix the handshake JSON-parse gap at lines 565-566:

```ts
// Before:
if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
// After:
if (!response.ok) {
  let code: string | undefined;
  let message = `HTTP ${response.status}: ${response.statusText}`;
  try {
    const text = await response.text();
    if (text) {
      const data = JSON.parse(text);
      const detail = data?.detail;
      if (detail && typeof detail === 'object') {
        if (typeof detail.code === 'string') code = detail.code;
        if (typeof detail.message === 'string') message = detail.message;
      }
    }
  } catch {
    // non-JSON body — fall through with the HTTP-status message.
  }
  const err = new Error(message) as Error & { code?: string; status?: number };
  err.status = response.status;
  if (code) err.code = code;
  throw err;
}
```

### Task D3: Verify and commit Bucket D

- [ ] **Step 1: Run backend + frontend tests**

```bash
cd products/scheduler && .venv/bin/pytest tests/ -x
cd frontend && npm run test:run
```

- [ ] **Step 2: Commit**

```bash
git add products/scheduler/backend/api/schedule.py \
        products/scheduler/frontend/src/api/client.ts \
        products/scheduler/tests/test_sse_error_events.py
git commit -m "$(cat <<'EOF'
feat(errors): SSE error events carry structured codes

The /schedule/stream error event was emitting the literal string
"solver failed" with no code. Frontend SSE consumer rejected with a
bare Error containing only that message — every SSE failure showed an
identical toast.

Backend now classifies the worker exception (RuntimeError →
SSE_MODEL_BUILD_FAILED, KeyError/ValueError/TypeError →
SSE_VALIDATION_FAILED, anything else → SSE_SOLVE_CRASHED) and emits
{type, code, message, request_id}.

Frontend SSE consumer reads event.code into err.code; SSE-handshake
JSON-error body parser added so a 4xx during the POST surfaces with
its typed code rather than the bare HTTP-status string.
EOF
)"
```

---

# Bucket E — Worker Failure Visibility

**Why next:** Backend codes are now typed and visible to direct callers. Background workers still swallow exceptions silently. This bucket adds persistent failure context so the advisor pipeline can surface stuck workers.

Requires **one database migration**.

**One commit at end.**

### Task E1: Add failure-context columns to Suggestion (migration)

**Files:**
- Modify: `products/scheduler/backend/database/models.py`
- Create: `products/scheduler/backend/alembic/versions/<new>_add_suggestion_failure_columns.py`

- [ ] **Step 1: Generate the migration scaffold**

```bash
cd products/scheduler/backend
.venv/bin/alembic revision -m "add suggestion failure columns and sync_failures table"
```

This creates a file under `alembic/versions/` with an autogenerated rev id.

- [ ] **Step 2: Fill in the migration**

Edit the new file:

```python
"""add suggestion failure columns and sync_failures table"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, etc.
revision = "<auto>"
down_revision = "<current head, look it up>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suggestions", sa.Column("error_code", sa.String(64), nullable=True))
    op.add_column("suggestions", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("suggestions", sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "sync_failures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("queue_row_id", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sync_failures_failed_at", "sync_failures", ["failed_at"])


def downgrade() -> None:
    op.drop_index("ix_sync_failures_failed_at", table_name="sync_failures")
    op.drop_table("sync_failures")
    op.drop_column("suggestions", "failed_at")
    op.drop_column("suggestions", "error_message")
    op.drop_column("suggestions", "error_code")
```

Look up the current head with `.venv/bin/alembic heads` and paste it into
`down_revision`.

- [ ] **Step 3: Update the ORM models**

Edit `products/scheduler/backend/database/models.py`. Locate the
`Suggestion` model; add:

```python
class Suggestion(Base):
    # ... existing columns ...
    error_code = Column(String(64), nullable=True)
    error_message = Column(Text(), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
```

Add a new model for `sync_failures`:

```python
class SyncFailure(Base):
    __tablename__ = "sync_failures"

    id = Column(Integer, primary_key=True)
    queue_row_id = Column(Integer, nullable=False)
    error_code = Column(String(64), nullable=False)
    error_message = Column(Text(), nullable=False)
    http_status = Column(Integer, nullable=True)
    failed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [ ] **Step 4: Apply the migration**

```bash
.venv/bin/alembic upgrade head
```

Expected: `INFO [alembic.runtime.migration] Running upgrade <prev> -> <new>`.

### Task E2: Wire SuggestionsWorker to persist failure context

**Files:**
- Modify: `products/scheduler/backend/services/suggestions_worker.py:197-210`
- Modify: `products/scheduler/backend/api/schedule_suggestions.py:127, 161, 274, 282, 309`
- Test: `products/scheduler/tests/test_worker_failure_visibility.py` (new)

- [ ] **Step 1: Write failing test**

Create `products/scheduler/tests/test_worker_failure_visibility.py`:

```python
"""Bucket E: worker failures persist context the advisor can surface."""
from __future__ import annotations

import pytest
import asyncio

from _helpers import isolate_test_database


@pytest.mark.asyncio
async def test_suggestions_worker_records_failure_on_handler_exception(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from services.suggestions_worker import SuggestionsWorker, TriggerEvent

    captured = {"event": None}

    async def _failing_handler(event, token):
        captured["event"] = event
        raise RuntimeError("controlled-test-failure")

    worker = SuggestionsWorker(handler=_failing_handler, cooldown_seconds=0.0)
    await worker.start()
    try:
        await worker.trigger(TriggerEvent(
            tournament_id="t1",
            fingerprint="fp1",
            kind="optimize",
            payload={},
        ))
        await asyncio.sleep(0.5)  # let the dispatcher pick it up
    finally:
        await worker.stop()

    # The handler ran (captured.event populated), and the worker should
    # have recorded the failure to the worker.failures registry.
    assert captured["event"] is not None
    assert any(
        f.fingerprint == "fp1" and f.error_code == "WORKER_FAILURE"
        for f in worker.recent_failures()
    )
```

- [ ] **Step 2: Run; FAIL**

- [ ] **Step 3: Implement failure tracking**

Edit `services/suggestions_worker.py`. Add a dataclass + a bounded
in-memory deque + method:

```python
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Deque, Iterable


@dataclass
class WorkerFailure:
    fingerprint: str
    error_code: str
    error_message: str
    failed_at: datetime


class SuggestionsWorker:
    # ... existing __init__ ...
    _failures: Deque[WorkerFailure]

    def __init__(self, *, handler, cooldown_seconds: float = 30.0, failure_buffer: int = 64):
        # ...
        self._failures = deque(maxlen=failure_buffer)

    def recent_failures(self) -> Iterable[WorkerFailure]:
        return tuple(self._failures)

    async def _dispatch(self, event, token):
        try:
            await self._handler(event, token)
        except asyncio.CancelledError:
            log.info("suggestion cancelled: %s", event.fingerprint)
            raise
        except Exception as exc:
            log.exception("suggestion handler failed for %s", event.fingerprint)
            self._failures.append(WorkerFailure(
                fingerprint=event.fingerprint,
                error_code="WORKER_FAILURE",
                error_message=f"{type(exc).__name__}: {exc}",
                failed_at=datetime.now(timezone.utc),
            ))
        finally:
            current = self._inflight.get(event.fingerprint)
            if current is not None and current[0] is asyncio.current_task():
                self._inflight.pop(event.fingerprint, None)
```

In `api/schedule_suggestions.py`, when a handler catches an exception and
the route corresponds to a specific suggestion row, also persist
`error_code` / `error_message` / `failed_at` to the suggestion DB row so
the advisor can surface "suggestion <id> failed: <code>". Specifically
on lines 161 and 309 (after `log.exception(...)`):

```python
except Exception as exc:
    log.exception("optimize speculation failed")
    if suggestion_id is not None:
        repo.suggestions.mark_failed(
            suggestion_id,
            error_code="SOLVE_FAILED" if "solve" in str(exc).lower() else "WORKER_FAILURE",
            error_message=f"{type(exc).__name__}: {exc}",
        )
    return
```

Implement `repo.suggestions.mark_failed` in `repositories/local.py` to
update the new columns within a single transaction.

### Task E3: SyncService 4xx vs 5xx classification + sync_failures row

**Files:**
- Modify: `products/scheduler/backend/services/sync_service.py:280-356`
- Test: `products/scheduler/tests/unit/test_sync_service.py` (extend)

- [ ] **Step 1: Extend sync_service tests**

Add to `tests/unit/test_sync_service.py`:

```python
def test_sync_service_records_4xx_to_sync_failures(monkeypatch, ...):
    """4xx Supabase response writes a sync_failures row and does NOT increment attempts."""
    # ... mock supabase client to raise an httpx-like error with .response.status_code == 400 ...
    # ... assert the row is deleted from sync_queue (non-retryable) and
    # a sync_failures row was inserted with http_status=400 ...
```

- [ ] **Step 2: Implement the branch**

Edit `services/sync_service.py:280-356`. Wrap the catch:

```python
except Exception as exc:
    status_code = getattr(getattr(exc, "response", None), "status_code", None)
    if status_code and 400 <= status_code < 500:
        # Non-retryable; record and drop.
        session.delete(row)
        session.add(SyncFailure(
            queue_row_id=row.id,
            error_code="SUPABASE_4XX",
            error_message=str(exc)[:500],
            http_status=status_code,
        ))
        session.commit()
        log.warning("sync_service.row_dropped_4xx", extra={"row_id": row.id, "http_status": status_code})
        return False
    # 5xx or non-HTTP: retry up to MAX_ATTEMPTS.
    row.attempts = row.attempts + 1
    row.last_attempt = _utcnow()
    if row.attempts >= MAX_ATTEMPTS:
        session.add(SyncFailure(
            queue_row_id=row.id,
            error_code="SUPABASE_RETRY_EXHAUSTED",
            error_message=str(exc)[:500],
            http_status=status_code,
        ))
        log.warning("sync_service.row_capped_at_max_attempts", extra={...})
    else:
        log.info("sync_service.push_failed_retrying", extra={...})
    session.commit()
    return False
```

### Task E4: Surface failures via /advisories

**Files:**
- Modify: `products/scheduler/backend/api/schedule_advisories.py`

- [ ] **Step 1: Add an advisory generator**

In `schedule_advisories.py`, add an advisory of category `"worker"`:

```python
def _build_worker_advisories(request, tournament_id):
    from main import app  # access app.state.suggestions_worker
    worker = getattr(app.state, "suggestions_worker", None)
    if worker is None:
        return []
    recent = list(worker.recent_failures())
    if len(recent) < 3:  # threshold: 3 or more recent failures
        return []
    return [
        {
            "id": f"worker-{recent[-1].fingerprint}",
            "severity": "warning",
            "category": "worker",
            "message": f"Speculative-solve has failed {len(recent)} times recently; latest: {recent[-1].error_code}",
        }
    ]
```

Call it inside the existing advisor pipeline; merge into the returned
list.

### Task E5: Verify and commit Bucket E

- [ ] **Step 1: Run all tests + migrations**

```bash
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/ -x
```

- [ ] **Step 2: Commit**

```bash
git add products/scheduler/backend/database/models.py \
        products/scheduler/backend/alembic/versions/*add_suggestion_failure_columns* \
        products/scheduler/backend/services/suggestions_worker.py \
        products/scheduler/backend/services/sync_service.py \
        products/scheduler/backend/api/schedule_suggestions.py \
        products/scheduler/backend/api/schedule_advisories.py \
        products/scheduler/backend/repositories/local.py \
        products/scheduler/tests/test_worker_failure_visibility.py \
        products/scheduler/tests/unit/test_sync_service.py
git commit -m "$(cat <<'EOF'
feat(errors): worker failure visibility

Background workers used to swallow exceptions silently. Now:

- SuggestionsWorker keeps an in-memory deque of recent failures
  (fingerprint, error_code, error_message, timestamp). On handler
  exceptions the failure context is appended.
- Handler-route failures additionally stamp the suggestion DB row's
  new error_code / error_message / failed_at columns (via migration).
- SyncService distinguishes 4xx (non-retryable, drop + record to new
  sync_failures table) from 5xx (existing retry-with-attempts logic).
- /advisories surfaces a "worker degraded" advisory when 3+ recent
  speculative-solve failures are pending.

Operator now sees stuck pipelines via the existing advisor UI
instead of having to grep server logs.
EOF
)"
```

---

# Bucket F — Frontend UX

**Why last:** Backend now emits typed codes everywhere; this bucket makes them visible and actionable on the frontend.

**One commit at end.**

### Task F1: Promote code to toast title slot

**Files:**
- Modify: `packages/design-system/components/Toast.tsx:67-92`
- Test: `products/scheduler/frontend/src/lib/__tests__/toastCode.test.tsx` (new)

- [ ] **Step 1: Add an optional `code` field to `ToastData`**

```ts
export interface ToastData {
  id: string;
  level: ToastLevel;
  message: string;
  detail?: string;
  /** Optional stable error code; renders as a small monospace label
   *  above the message so operators can reference it without searching
   *  the detail line. */
  code?: string;
  durationMs?: number | null;
  actionLabel?: string;
  onAction?: () => void;
}
```

- [ ] **Step 2: Render the code in the title slot**

In the JSX body of `Toast`, between the icon and the message:

```tsx
<div className="min-w-0 flex-1 text-xs leading-snug">
  {toast.code && (
    <div className="font-mono text-[10px] uppercase tracking-wide opacity-90 mb-0.5">
      {toast.code}
    </div>
  )}
  <div>{toast.message}</div>
  {toast.detail && (
    <div className="mt-0.5 text-[10px] opacity-60 truncate">
      {toast.detail}
    </div>
  )}
</div>
```

(The code is at `opacity-90` and uppercase mono — distinct from the
message body without dominating.)

- [ ] **Step 3: Update `client.ts` to populate `code` directly on the toast**

In `api/client.ts:258-269`, the toast push now also forwards the code:

```ts
useUiStore.getState().pushToast({
  level: 'error',
  code,
  message,
  detail: requestId ? `request ${requestId.slice(0, 8)}` : undefined,
});
```

(Drop the `code` from the `detail` line since it now has its own slot.
Detail is purely the request_id correlation hint.)

- [ ] **Step 4: Write a vitest covering the rendering**

Create `products/scheduler/frontend/src/lib/__tests__/toastCode.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toast } from '@design-system/components/Toast';

describe('Toast code slot', () => {
  it('renders the code label above the message when present', () => {
    const { getByText } = render(
      <Toast
        toast={{
          id: '1',
          level: 'error',
          code: 'SOLVE_INFEASIBLE',
          message: 'no feasible schedule',
        }}
        onDismiss={() => {}}
      />,
    );
    expect(getByText('SOLVE_INFEASIBLE')).toBeTruthy();
    expect(getByText('no feasible schedule')).toBeTruthy();
  });

  it('hides the code slot when no code is provided', () => {
    const { queryByText } = render(
      <Toast
        toast={{ id: '1', level: 'info', message: 'hi' }}
        onDismiss={() => {}}
      />,
    );
    expect(queryByText(/^[A-Z_]+$/)).toBeNull();
  });
});
```

### Task F2: Hook branching on `err.code`

**Files:**
- Modify: `products/scheduler/frontend/src/hooks/useSchedule.ts:114-121`
- Modify: `products/scheduler/frontend/src/hooks/useTournamentState.ts:74-78`
- Modify: `products/scheduler/frontend/src/hooks/useBracket.ts:46-52`

- [ ] **Step 1: useSchedule recovery hints**

```ts
catch (err) {
  const e = err as Error & { code?: string };
  let userMessage = e.message;
  if (e.code === 'SOLVE_INFEASIBLE') {
    userMessage = 'No feasible schedule. Try relaxing constraints or dropping matches.';
  } else if (e.code === 'SOLVE_TIMEOUT') {
    userMessage = 'Solver time budget exhausted. Reduce match count or increase the time limit.';
  } else if (e.code === 'SOLVER_VALIDATION_FAILED' || e.code === 'MODEL_BUILD_FAILED') {
    userMessage = 'Schedule input invalid. Check player availability and court setup.';
  }
  setGenerationError(userMessage);
}
```

- [ ] **Step 2: useTournamentState restore hint**

```ts
catch (err) {
  const e = err as Error & { code?: string };
  if (e.code === 'STATE_CORRUPT' || e.code === 'STATE_SCHEMA_MISMATCH') {
    setLastSaveError('Saved data is corrupted — restore from backup available in Settings.');
  } else if (e.code === 'DATABASE_UNAVAILABLE') {
    setLastSaveError('Save temporarily unavailable — retrying.');
  } else {
    setLastSaveError(e.message);
  }
}
```

- [ ] **Step 3: useBracket 404 empty-state**

The current code at `useBracket.ts:46-52` already treats 404 as `null`.
Reinforce by reading `err.code === 'BRACKET_NOT_FOUND'` for the same
behavior, so a future status-code mistake doesn't break empty-state
rendering.

### Task F3: ConnectionIndicator/toast dedup

**Files:**
- Modify: `products/scheduler/frontend/src/api/client.ts:238-269`

- [ ] **Step 1: Skip per-request toast when reachability is offline**

```ts
// At the top of the response interceptor, after the cancel-check:
const reachability = useUiStore.getState().reachability;
// (assumes uiStore exposes reachability state; if it doesn't yet, add it)
const isNetworkError = !error.response;
if (isNetworkError && reachability === 'offline') {
  // The ConnectionIndicator already shows this state; don't pile a toast.
  return Promise.reject(error);
}
```

If `uiStore.reachability` doesn't yet exist, add a slice:

```ts
reachability: 'online' | 'offline' | 'unknown';
setReachability: (state: 'online' | 'offline' | 'unknown') => void;
```

`useReachability` already sets this on transitions; thread it through.

### Task F4: ErrorBoundary cleanup

**Files:**
- Modify: `products/scheduler/frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Hide stack trace; add Copy diagnostics**

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  copied?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private copyDiagnostics = async () => {
    const { error, errorInfo } = this.state;
    const diag = [
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `Error: ${error?.name}: ${error?.message}`,
      '',
      'Stack:',
      error?.stack ?? '(no stack)',
      '',
      'Component stack:',
      errorInfo?.componentStack ?? '(none)',
    ].join('\n');
    await navigator.clipboard.writeText(diag);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-muted">
          <div className="bg-card p-6 rounded shadow max-w-md">
            <h1 className="text-xl font-bold text-status-blocked mb-3">
              Something went wrong
            </h1>
            <p className="text-foreground mb-4 text-sm">
              The page hit an unexpected error. Reloading usually clears it.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-sm text-sm hover:opacity-90"
              >
                Reload Page
              </button>
              <button
                onClick={this.copyDiagnostics}
                className="px-3 py-1.5 bg-card border border-foreground/20 text-foreground rounded-sm text-sm hover:bg-muted"
              >
                {this.state.copied ? 'Copied' : 'Copy diagnostics'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Task F5: Verify and commit Bucket F

- [ ] **Step 1: Frontend tests + smoke**

```bash
cd products/scheduler/frontend && npm run test:run
npm run build  # tsc + vite — catches type errors
```

- [ ] **Step 2: Commit**

```bash
git add packages/design-system/components/Toast.tsx \
        products/scheduler/frontend/src/api/client.ts \
        products/scheduler/frontend/src/hooks/useSchedule.ts \
        products/scheduler/frontend/src/hooks/useTournamentState.ts \
        products/scheduler/frontend/src/hooks/useBracket.ts \
        products/scheduler/frontend/src/components/ErrorBoundary.tsx \
        products/scheduler/frontend/src/lib/__tests__/toastCode.test.tsx
git commit -m "$(cat <<'EOF'
feat(errors): typed codes are user-visible end-to-end

Toast component now has a dedicated code slot — uppercase mono, opacity
90 — above the message. Operators see SOLVE_INFEASIBLE / BRACKET_NOT_FOUND /
etc. without having to read the small grey detail line.

Hooks (useSchedule, useTournamentState, useBracket) branch on err.code
to surface recovery hints:
- SOLVE_INFEASIBLE → "Try relaxing constraints"
- SOLVE_TIMEOUT → "Reduce match count or increase budget"
- STATE_CORRUPT → "Restore from backup available"
- BRACKET_NOT_FOUND → empty-state CTA (already worked via 404 status;
  now also key off code so future status drift is forgiving)

axios interceptor suppresses per-request error toast when reachability
indicator already says offline (no duplicate signal).

ErrorBoundary no longer dumps raw stack trace; offers "Copy diagnostics"
button for support escalation instead.
EOF
)"
```

---

# Final Verification

After all six buckets land:

- [ ] **Step 1: Full backend test suite**

```bash
cd products/scheduler && .venv/bin/pytest tests/ -v
```

- [ ] **Step 2: Full frontend test suite**

```bash
cd products/scheduler/frontend && npm run test:run && npm run build
```

- [ ] **Step 3: Manual smoke test of error UX**

Start backend + frontend locally; intentionally trigger each failure
mode and screenshot the toast:

| Trigger | Expected code |
|---------|---------------|
| POST /tournaments {kind:"x"} | VALIDATION_FAILED |
| GET /tournaments/<bad-uuid>/bracket | BRACKET_NOT_FOUND |
| Schedule an over-constrained problem | SOLVE_INFEASIBLE |
| Stop the backend, attempt an action | (network) — no toast pile-up, indicator shows offline |
| Trigger a Pydantic 422 (missing field) | VALIDATION_FAILED with validationErrors array |

- [ ] **Step 4: Update memory + audit doc status**

Annotate `docs/superpowers/specs/2026-05-15-error-handling-audit.md`
at the "What's Already Working" section with a note that buckets A–F
are now complete, and update
`/Users/kylewong/.claude/projects/.../memory/project_error_handling_audit.md`
to mark the workstream done.

---

# Spec → Task Map

| Audit finding | Bucket | Task(s) |
|--------------|:------:|---------|
| ERR-CRIT-1 (no global handler) | A | A3 |
| ERR-CRIT-2 (brackets 40 sites) | B | B2 |
| ERR-CRIT-3 (VALIDATION_FAILED bug) | A | A1, A2 |
| ERR-CRIT-4 (SSE no code) | D | D1, D2 |
| ERR-CRIT-5 (solver collapsed) | C | C2 |
| ERR-CRIT-6 (worker swallow) | E | E2, E4 |
| ERR-CRIT-7 (no SQLAlchemy catches) | A | A3 (subsumes) |
| ERR-IMP-1 (invites 7 sites) | B | B1 |
| ERR-IMP-2 (bracket 409 → ConflictError) | B | B2 (option 3 chosen) |
| ERR-IMP-3 (toast code styling) | F | F1 |
| ERR-IMP-4 (hook branching) | F | F2 |
| ERR-IMP-5 (adapter exception) | C | C1 |
| ERR-IMP-6 (file IO) | A | A3 (OSError handler) |
| ERR-IMP-7 (overly generic 500s) | A | A3 (subsumes) |
| ERR-IMP-8 (verify_schedule) | C | C2 (AssertionError branch) |
| ERR-IMP-9 (ConnectionIndicator dedup) | F | F3 |
| ERR-IMP-10 (bracket bare 500) | B | B2 (BRACKET_HYDRATION_FAILED) |
| ERR-IMP-11 (RequestValidationError) | A | A3 |
| ERR-IMP-12 (worker context) | E | E2 |
| ERR-IMP-13 (ErrorBoundary stack) | F | F4 |
| ERR-IMP-14 (SSE handshake JSON) | D | D2 |
| ERR-IMP-15 (/validate audit) | C | (covered transitively by adapter wrap) |

All Critical + Important findings have at least one task. Minor findings are addressed inside the larger tasks (e.g., MIN-7 dedup key change inside F1; MIN-1 `INTERNAL` rename inside A1; MIN-3 `str(exc)` sanitization inside B2).
