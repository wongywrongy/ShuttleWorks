# Error-Handling Audit — 2026-05-15

Comprehensive audit of failure points across the scheduler stack, focused on
**error-code coverage**: where typed `{code, message}` payloads exist, where
generic 500s leak, and where user-facing UX collapses to "Server error 500".

This is the companion audit to `2026-05-15-pre-merge-audit-findings.md` (which
covered security, data-integrity, and audit-log gaps). Error observability is
the open seam those audits explicitly did not touch.

---

## Executive Summary

**The user-reported symptom — "errors just pop up as generic 500s" — reduces
to one missing handler.** The backend has typed-error scaffolding
(`app/error_codes.py::ErrorCode` enum, `app/error_codes.py::http_error()`
helper, two domain exceptions handled in `app/main.py`), and the frontend
axios interceptor (`api/client.ts:226-237`) already decodes `detail.code`
into a structured toast. The scaffolding works.

What's missing:

1. **No global `@app.exception_handler(Exception)`** in `app/main.py`. Only
   `ConflictError` (409) and `PreconditionFailedError` (412) have handlers.
   Every uncaught `SQLAlchemyError`, `OSError`, `KeyError`, `AssertionError`,
   etc. falls through to FastAPI's default `{"detail":"Internal Server
   Error"}` response with no code. This single absence is the dominant source
   of the user's experience.

2. **Two API files entirely bypass the helper** — `api/brackets.py` (40 raw
   `HTTPException` sites) and `api/invites.py` (7 sites) — neither imports
   `ErrorCode`. Every bracket and invite error today is uncoded.

3. **The solver path collapses 4 distinct failure modes into one code.**
   `SOLVE_INFEASIBLE` and `SOLVE_TIMEOUT` are defined in the enum but
   **never emitted by any route**. Build errors, validation errors, solver
   crashes, and post-solve assertion failures all surface as a single
   `SOLVE_FAILED` 500.

4. **The SSE error event has no code field.** `api/schedule.py:238` emits
   `{type: "error", message: "solver failed"}` — hard-coded literal string,
   actual exception lost to server logs only.

5. **The frontend toast renders code at 70 % opacity / 10 px font.** Even
   when a code arrives, the user sees only the message.

6. **Background workers swallow errors silently.** A speculative-solve
   crash, a Supabase push failure, a sync-queue exhaustion — none surface
   to the operator.

A typed code is only valuable if (a) it's emitted, (b) it's transmitted,
(c) it's decoded, and (d) it's rendered visibly. Today only (b) and (c)
work end-to-end; (a) is patchy and (d) is invisible.

---

## Table of Contents

- [Critical Findings (ERR-CRIT-1 – ERR-CRIT-7)](#critical-findings)
- [Important Findings (ERR-IMP-1 – ERR-IMP-15)](#important-findings)
- [Minor Findings (ERR-MIN-1 – ERR-MIN-8)](#minor-findings)
- [Proposed ErrorCode Additions](#proposed-errorcode-additions)
- [Follow-Up Plan](#follow-up-plan)
- [What's Already Working](#whats-already-working)

---

## Critical Findings

### ERR-CRIT-1 — No global `Exception` handler; every uncaught exception leaks as bare 500

**File:** `backend/app/main.py:132-152` (handler registrations)

**Scenario:** Only two `@app.exception_handler` decorators are registered
(`ConflictError`, `PreconditionFailedError`). FastAPI's default
behavior for any other unhandled exception is `JSONResponse(status_code=500,
content={"detail": "Internal Server Error"})`. This means:

- A `sqlalchemy.exc.IntegrityError` (FK violation on a deleted tournament,
  UNIQUE violation on duplicate command) → bare 500.
- A `sqlalchemy.exc.OperationalError` (pool exhausted, SQLite locked, disk
  full) → bare 500.
- An `OSError` / `FileNotFoundError` reading a backup file → bare 500.
- An `AssertionError` from `verify_schedule()` post-solve → bare 500.
- A `KeyError` / `AttributeError` from an adapter unpacking a malformed
  config → bare 500.
- A `pydantic.ValidationError` re-raised after Pydantic's first-pass
  validation (e.g., model-level `@validator` raising) → bare 500.

Verified: backend-wide grep for `SQLAlchemyError`, `IntegrityError`,
`OperationalError`, `StatementError`, `RequestValidationError` returns zero
matches in `api/`, `services/`, `repositories/`, `adapters/`.

**Fix shape:** Register
`@app.exception_handler(SQLAlchemyError)` →
`DATABASE_INTEGRITY` / `DATABASE_UNAVAILABLE` /
`STATE_WRITE_FAILED` (status-dispatched on exception subclass);
`@app.exception_handler(OSError)` → `FILE_IO_FAILED`;
`@app.exception_handler(RequestValidationError)` → re-wrap as
`INVALID_INPUT` (so 422 also carries a code);
`@app.exception_handler(Exception)` (the catch-all) → `INTERNAL` with
`request_id` echoed in the response body so the operator can correlate to
server logs.

**Effort:** S (one file, ~80 lines, no migration).

---

### ERR-CRIT-2 — `api/brackets.py` has 40 raw `HTTPException` sites and never imports `ErrorCode`

**File:** `backend/api/brackets.py` (entire file).

**Scenario:** Every bracket endpoint — create, generate, record-result,
pin, import-CSV, import-JSON, event-upsert, event-delete — raises bare
`HTTPException(status_code=400|404|409|500, detail="…")`. The detail is
either a hard-coded string ("event not found", "needs at least 2
participants") or `str(exc)` from a caught conversion exception (lines
898, 909, 1215, 1226, 1435, 1747, 1837).

Frontend axios interceptor `client.ts:228-230` only extracts `detail.code`
when `detail` is a `{message, code}` object. For brackets, `detail` is
always a string, so `code` stays `undefined` and the toast renders without
a title. The bracket subsystem produces ~30 % of user-facing operations
post-merge of the 2026-05-15 work; **every one of them is uncoded today**.

Three patterns to fix together:

| Pattern | Count | Current | Should be |
|---------|------:|---------|-----------|
| 404 "not found" | ~12 | bare `HTTPException(404, "tournament not found")` | `BRACKET_NOT_FOUND` / `BRACKET_EVENT_NOT_FOUND` |
| 400 input/validation | ~12 | bare `HTTPException(400, "...")` or `str(exc)` | `BRACKET_INVALID_INPUT` / `BRACKET_IMPORT_INVALID` |
| 409 state conflict | ~10 | bare `HTTPException(409, "event already started")` | `raise ConflictError(...)` (gets routed through existing handler) |
| 500 hydration | 1 | bare `HTTPException(500, "hydration failed")` line 1180 | `BRACKET_HYDRATION_FAILED` |

**Effort:** M (~40 call-site edits, but mostly mechanical; needs ~8 new enum members).

---

### ERR-CRIT-3 — Latent `AttributeError` on `ErrorCode.VALIDATION_FAILED` at `tournaments.py:188`

**File:** `backend/api/tournaments.py:188`.

**Scenario:** `POST /tournaments` calls `http_error(400,
ErrorCode.VALIDATION_FAILED, ...)` when `body.kind not in ("meet",
"bracket")`. The `VALIDATION_FAILED` member is **not defined** in
`app/error_codes.py::ErrorCode`. Today the route works only because real
clients never POST an invalid `kind` — but the moment a malicious or
fuzzing client sends `{"kind": "x"}`, the handler raises
`AttributeError: VALIDATION_FAILED` _inside_ the route, the
`AttributeError` is uncaught (per ERR-CRIT-1), and the user sees a bare
500 — the exact failure mode the helper was supposed to prevent.

**Fix:** Either add `VALIDATION_FAILED = "VALIDATION_FAILED"` to the enum
(preferred — generic-enough to reuse) or change the call site to
`ErrorCode.INVALID_INPUT` which already exists.

**Effort:** XS (one-line fix).

---

### ERR-CRIT-4 — SSE error event carries no code; message is hardcoded `"solver failed"`

**File:** `backend/api/schedule.py:238`.

**Scenario:** When the SSE solver thread raises (line 214-216 catches
`Exception` and stashes `str(e)` into `error_holder`), the streaming
response emits literally:

```python
yield f"data: {json.dumps({'type': 'error', 'message': 'solver failed'})}\n\n"
```

The actual exception string is **discarded** in favor of the generic
literal. Frontend `client.ts:611-612` decodes this into `new
Error(event.message)` — so the user sees the toast `"Solver stream
dropped"` with detail `"solver failed"` whether the failure was:

- A `RuntimeError` from invalid interval bounds in the model build
- A `KeyError` from a missing player in the adapter
- An infeasibility detected mid-solve
- A `verify_schedule()` post-solve assertion failure
- An out-of-memory in the solver process

The frontend has no way to differentiate, and the server has only the log
line.

**Fix shape:** Emit a structured payload `{type: "error", code:
"SSE_MODEL_BUILD_FAILED" | "SSE_SOLVE_CRASHED" | "SSE_VALIDATION_FAILED",
message: <exception summary>, request_id: <rid>}`. Add a small mapper that
inspects the exception class to pick the code. Update
`client.ts:611-612` to populate `err.code` from `event.code` and surface
the code in the SSE retry toast.

Note: SSE error events for failures **after** the response headers have
flushed cannot use HTTP status. But pre-stream errors (validation before
the solver starts) CAN return a proper HTTP 422 instead — the current
code path catches them inside the worker thread, denying that option.
Lifting the input-validation block out of the worker (so it runs on the
request thread, before `StreamingResponse` is returned) would let
malformed requests get a clean 422 with code rather than a fake-success
stream that emits an error event 1-2 seconds later.

**Effort:** M (touch backend SSE generator + frontend SSE consumer + add
~4 SSE-namespaced enum members).

---

### ERR-CRIT-5 — Solver routes conflate 4 distinct failure modes into one `SOLVE_FAILED`

**Files:** `backend/api/schedule.py:84-102`,
`backend/api/schedule_repair.py:251`,
`backend/api/schedule_warm_restart.py:121`.

**Scenario:** Each solver entry point ends with:

```python
except Exception:
    log.exception("...")
    raise http_error(500, ErrorCode.SOLVE_FAILED, "...")
```

The `ErrorCode` enum already defines `SOLVE_INFEASIBLE` (400) and
`SOLVE_TIMEOUT` (408), but **neither is ever raised**. Grep:
`grep -rn "SOLVE_INFEASIBLE\|SOLVE_TIMEOUT" api/ services/` → returns
zero `raise` / `http_error(...)` sites (only the enum definition).

The solver's `ScheduleResult.status` distinguishes `OPTIMAL`, `FEASIBLE`,
`INFEASIBLE`, `UNKNOWN` (timeout), but the route never branches on it — it
either returns the DTO (any status) or catches an exception (any exception
type). Frontend (`SchedulePage:191`) just renders whatever message landed
in the toast.

Four cases collapsed into one:

| Real failure | Should be | Status | Currently |
|---|---|---|---|
| Model construction raises | `MODEL_BUILD_FAILED` | 422 | `SOLVE_FAILED` 500 |
| Pre-solve adapter validation fails | `SOLVER_VALIDATION_FAILED` | 422 | `SOLVE_FAILED` 500 |
| `result.status == INFEASIBLE` | `SOLVE_INFEASIBLE` | 400 | returns DTO (frontend never checks) |
| `result.status == UNKNOWN` (timeout) | `SOLVE_TIMEOUT` | 408 | returns DTO (frontend never checks) |
| Genuine solver crash | `SOLVE_FAILED` | 500 | `SOLVE_FAILED` 500 ✓ |
| Post-solve `verify_schedule()` AssertionError | `POST_SOLVE_VALIDATION_FAILED` | 500 | `SOLVE_FAILED` 500 |

**User-visible impact:** Operators cannot distinguish "no feasible
schedule exists, relax constraints" from "solver crashed, retry" from
"timeout, simplify or increase budget" — yet these need three different
recovery actions.

**Effort:** M (need to branch on `result.status` in three solver routes,
add ~3 enum members, and add a try-block discriminator for build vs solve
failures).

---

### ERR-CRIT-6 — Background workers swallow exceptions silently; users never see the failure

**Files:** `backend/services/suggestions_worker.py:197-210`,
`backend/api/schedule_suggestions.py:127, 161, 274, 282, 309`,
`backend/services/sync_service.py:280-356`.

**Scenario:** The intentional `except Exception` pattern in workers
(documented with `noqa: BLE001` in `schedule_advisories.py`) is correct
for keeping the asyncio loop alive — a worker that crashes the loop on
the first exception is worse than one that swallows. **But there is no
mechanism to surface the failure to the operator.**

Two concrete failure modes today:

1. `SuggestionsWorker._dispatch` catches handler exceptions, logs them,
   and continues dequeuing. If `_handle_optimize` crashes for every
   trigger event in a stuck pipeline, the operator sees the Suggestions
   panel stay empty and assumes "no suggestions ready" — when in fact
   the worker is firing and crashing on every cycle.

2. `SyncService._process_row` increments `row.attempts` on Supabase push
   failures. At `MAX_ATTEMPTS` (10) the row is "capped" with
   `log.warning("sync_service.row_capped_at_max_attempts", ...)` and
   **left in `sync_queue` indefinitely**. No alert. No degraded-mode
   indicator. The Supabase replica silently diverges from local SQLite,
   detectable only by a manual queue-length poll or remote diff.

**Fix shape:** Workers should still swallow at the loop boundary, but
record the failure into a queryable surface — either a `Suggestion`
column (`error_code`, `error_message`) for the speculative-solve case,
or a "stuck queue" advisory that surfaces on `/advisories`. The frontend
already polls advisories every 15s — that's the natural channel for
"sync queue has N stuck rows, attempt cap hit X minutes ago".

**Effort:** M (need new advisory categories + DB columns on `Suggestion`
for failure context).

---

### ERR-CRIT-7 — No `SQLAlchemyError` catches anywhere in the codebase

**File:** `backend/repositories/local.py` (43 `session.commit()` /
`session.flush()` sites; zero exception handlers).

**Scenario:** This is the implementation detail behind ERR-CRIT-1. The
repository layer has zero `try`/`except` blocks wrapping any SQL
operation. The `Match.set_status()` path (`local.py:421`), the
`MatchState.upsert()` path (`local.py:327`), the
`bulk_project_from_schedule` path (`local.py:420-433`) — none guard
against `IntegrityError` (FK / UNIQUE) or `OperationalError` (lock /
pool-exhausted / disk-full). When SQLite has the file locked (e.g.,
during the lifespan `_run_migrations` window) every concurrent route
raises `OperationalError("database is locked")` which propagates as a
bare 500.

This is "the meta-gap is real and uniform" — there is genuinely no
defense in depth.

**Fix:** ERR-CRIT-1's global handler is the right place. Per-call-site
catches in the repo layer would be redundant defensive coding once the
global handler maps `SQLAlchemyError` subclasses to 409/503/500 with
codes.

**Effort:** S (subsumed by ERR-CRIT-1).

---

## Important Findings

### ERR-IMP-1 — `api/invites.py`: 7 raw HTTPException sites, never imports `ErrorCode`

**File:** `backend/api/invites.py` (lines 123, 129, 135, 161, 197, 202,
209-210).

**Scenario:** Same pattern as brackets but smaller surface. Mixed 400
("user id is not a UUID"), 403 ("owner role required"), 404 ("invite
not found"), 410 ("invite expired" / "invite revoked"). Five proposed
codes: `INVITE_NOT_FOUND` (404), `INVITE_EXPIRED` (410),
`INVITE_REVOKED` (410), `INVITE_ROLE_DENIED` (403), `INVITE_INVALID`
(400 — already serviceable via `INVALID_INPUT`).

**Effort:** S.

---

### ERR-IMP-2 — Bracket `409`s use bare `HTTPException`; can't reuse `ConflictError` as-is

**File:** `backend/api/brackets.py:843, 1084, 1170, 1173, 1271, 1279, 1393, 1664, 1703, 1714`.

**Scenario:** The codebase has a `ConflictError` (`app/exceptions.py:38-54`)
that gets routed through a registered handler (`main.py:132`) and produces
a flat structured body. Bracket 409 sites bypass this — they raise raw
`HTTPException(409, "event already started")` which the frontend has to
parse as a string.

**Signature wrinkle:** `ConflictError.__init__` requires `match_id: str`.
The bracket 409 sites are about **events** (line 843 "duplicate event id",
line 1271 "event already started"), **participants**, and **imports** —
not matches. Three options, pick one before Bucket B implementation:

1. **Generalize `ConflictError`** — make `match_id` optional, rename the
   field on the wire to `resource_id`, add a `resource_type:
   "match"|"event"|"participant"|"bracket"` discriminant. Backwards-compatible
   if the frontend reads `resource_id` with a fallback to `match_id`.
2. **Add `BracketConflictError`** — parallel exception with its own
   handler, keeps `ConflictError` untouched.
3. **Keep as `http_error(409, BRACKET_*_CONFLICT, ...)`** — don't route
   through a domain exception at all; bracket 409s get codes via the
   helper just like 400s and 404s.

Recommendation: **option 3** for the first pass (zero risk to existing
match-state code paths, no signature gymnastics). If a future generalized
"conflict" client-side decoder needs structured `current_status` /
`current_version` fields for brackets, escalate to option 1.

**Effort:** S (mechanical refactor — ~10 sites, all using `http_error`).

---

### ERR-IMP-3 — Frontend toast renders code at 70 % opacity / 10 px font; code is functionally invisible

**File:** `packages/design-system/components/Toast.tsx:85-90`.

**Scenario:** When the backend ships `{code: "SOLVE_INFEASIBLE", message:
"No feasible schedule"}`, the toast shows the message prominently and
the code as `<div className="text-[10px] opacity-70 truncate">{detail}</div>`.
For long operator sessions (where SchedulePage may be in the background)
the code is unreadable without leaning in. The whole point of typed
codes is to give the operator a stable string to reference when calling
support or filing a bug — invisible defeats the purpose.

**Fix shape:** Promote the code into the toast title (small label,
fixed-width / monospace, distinct color). Keep the `request_id` slice
in the existing detail line — that's where it belongs.

**Effort:** XS (CSS + JSX edit).

---

### ERR-IMP-4 — Hooks branch on `err.message` / `err.status` instead of `err.code`

**Files:** `frontend/src/hooks/useSchedule.ts:114-121`,
`frontend/src/hooks/useTournamentState.ts:74-78`,
`frontend/src/hooks/useBracket.ts:46-52`.

**Scenario:** `useSchedule` catches solver errors and stores
`err.message` in `generationError`; SchedulePage renders the string. With
typed codes, the hook should switch on `err.code`:

- `SOLVE_INFEASIBLE` → "No feasible schedule. Try relaxing constraints
  or dropping matches."
- `SOLVE_TIMEOUT` → "Solver budget exhausted. Try reducing the match
  count or increasing the time limit."
- `SOLVER_VALIDATION_FAILED` → "Schedule input invalid — check player
  availability and court setup."
- Anything else → existing generic message.

Same pattern for `useTournamentState` (`STATE_CORRUPT` → offer restore-
from-backup) and `useBracket` (`BRACKET_NOT_FOUND` → render the
"create bracket" empty state instead of a poll-error toast).

**Effort:** S (3 hooks, ~5 branch points each).

---

### ERR-IMP-5 — Adapter `KeyError` / `ValueError` / `TypeError` uncaught — silent 500 on malformed config

**File:** `backend/adapters/badminton.py` (and bracket adapter equivalents).

**Scenario:** `_time_to_minutes` (lines 74-79) defends against malformed
time strings with a try/except → `http_error(422)`. Other adapters
(`schedule_config_from_dto`, `players_from_dto`, `solver_options_for`)
do not — if `TournamentConfig.dayStart` is `None` (Pydantic should
catch but a custom validator could let this through), the
`KeyError`/`AttributeError` propagates to the route's `except
Exception → SOLVE_FAILED`. The user sees "solver failed" for a
**configuration** error.

**Fix shape:** Wrap each adapter at its boundary (one try block per
public function) and re-raise as
`http_error(422, ErrorCode.SOLVER_VALIDATION_FAILED, str(exc))`.
Alternatively, lean on ERR-CRIT-1's global handler to map
`KeyError`/`AttributeError`/`ValueError` to a generic
`SOLVER_VALIDATION_FAILED` when raised within a `/schedule*` route.

**Effort:** S.

---

### ERR-IMP-6 — File IO (backup restore, state.json) lacks `OSError` / `JSONDecodeError` handling

**Files:** `backend/repositories/local.py:1216-1236` (restore),
`backend/api/match_state.py:485-500` (import upload).

**Scenario:**
- `FileNotFoundError` from `restore_tournament_from_backup` is raised
  explicitly but never caught by callers; propagates as bare 500.
- `json.JSONDecodeError` on match-state import is partially caught
  (line 487-488 → `UPLOAD_INVALID_JSON`), but a broader `except
  Exception` at line 490-500 catches the post-parse validation under a
  different name, blurring the failure category.
- `OSError` on backup-write (permission denied, disk full, parent dir
  missing) is uncaught everywhere.

**Fix shape:** ERR-CRIT-1's global handler should map `OSError` /
`FileNotFoundError` to `FILE_IO_FAILED` (500); local catches in the
upload routes should explicitly distinguish parse vs schema vs IO.

**Effort:** S.

---

### ERR-IMP-7 — `tournaments.py` and `match_state.py` `except Exception` blocks return overly-generic 500s

**Files:** `backend/api/tournaments.py:360, 419`,
`backend/api/match_state.py:381, 496`.

**Scenario:** These catch `Exception` and return `STATE_WRITE_FAILED`
(500) — accurate for genuine write failures, but they also catch (and
hide) `IntegrityError` (which should be 409, "duplicate" /
"conflicting concurrent write") and `OperationalError` (which should
be 503, "retryable"). A single recovery message ("save failed") is
returned regardless.

**Fix shape:** Once ERR-CRIT-1 lands, simplify these blocks to a `try`
that lets `SQLAlchemyError` propagate to the global handler, retaining
only the route-specific catch for genuine logic errors.

**Effort:** S (refactor after ERR-CRIT-1).

---

### ERR-IMP-8 — Solver path: `verify_schedule()` `AssertionError` becomes generic 500

**Files:** `backend/api/schedule.py` (post-solve hook),
`scheduler_core/engine/extraction.py`, `scheduler_core/validation.py`.

**Scenario:** `verify_schedule()` is the runtime safety net — it asserts
the solver's output is consistent (no court double-booking, no player
overlap, schedule duration matches). When it raises `AssertionError`,
the route catches it under the generic `SOLVE_FAILED` branch. This is
**genuinely a server bug** (the solver produced invalid output) — it
should surface as a distinct code (`POST_SOLVE_VALIDATION_FAILED`) so
ops can grep logs and recognize the class.

**Fix shape:** Catch `AssertionError` specifically in the solver route,
emit `POST_SOLVE_VALIDATION_FAILED` (500) with the failed assertion
message. Independent of ERR-CRIT-1.

**Effort:** XS.

---

### ERR-IMP-9 — `ConnectionIndicator` and toast can both fire for the same backend hiccup

**Files:** `frontend/src/components/ConnectionIndicator.tsx`,
`frontend/src/api/client.ts:238-242`.

**Scenario:** `useReachability` polls `/health` every N seconds; when it
flips to "Offline" the indicator turns red. Independently, every queued
request fails with `"No response from server. Is the backend running?"`
and pushes a toast. The 30-second dedup helps but the **first** offline
moment shows two redundant signals.

**Fix shape:** When the reachability hook says "Offline", `client.ts`
should suppress the per-request toast for network-level errors (status
0 / no response). Show one banner ("Offline — actions will queue") via
the indicator; suppress toasts until reachability flips back.

**Effort:** S.

---

### ERR-IMP-10 — `brackets.py:1180` bare 500 `"hydration failed"`

**File:** `backend/api/brackets.py:1180`.

**Scenario:** `_hydrate_session(repo, tournament_id)` returns `None` for
several distinct cases (no bracket configured, malformed `bracket_session`
key, missing event rows). The single 500 conflates them. Worse: "no
bracket configured" is a 404 case, not a 500 — but the current code
hits this path because the upstream `is None` check doesn't
disambiguate.

**Fix shape:** Make `_hydrate_session` raise typed exceptions
(`BracketNotFound`, `BracketCorrupt`) instead of returning `None`;
route those to `BRACKET_NOT_FOUND` (404) vs `BRACKET_HYDRATION_FAILED`
(500).

**Effort:** S.

---

### ERR-IMP-11 — `RequestValidationError` (Pydantic 422) carries no code

**Files:** all routes that accept a body.

**Scenario:** When a request fails Pydantic validation (missing field,
wrong type), FastAPI returns the standard 422 with `{"detail":
[{"loc": [...], "msg": "...", "type": "..."}]}`. The frontend
interceptor at `client.ts:228-237` checks `detail.message` (string) —
neither path matches a Pydantic 422 array, so the toast falls through
to `error.response.data?.message || "Server error 422"`.

**Fix shape:** Register `@app.exception_handler(RequestValidationError)`
that re-wraps the 422 as `{code: "INVALID_INPUT", message: <flattened
human-readable summary>, validationErrors: [...]}`. The interceptor
already reads `code` + `message`; adding `validationErrors` for the
detailed-form-field-error UI is a non-breaking superset.

**Effort:** S.

---

### ERR-IMP-12 — `_handle_optimize` / `_handle_repair` workers don't persist failure context

**Files:** `backend/api/schedule_suggestions.py:127, 161, 274, 282, 309`.

**Scenario:** The intentional swallows (correctly tagged) lose the
exception type and message after `log.exception`. Operator can only see
that suggestions aren't appearing — not why. A small
`SuggestionFailure(suggestion_id, error_code, error_message,
failed_at)` table (or a JSONB column on the existing `suggestions` row)
would let the advisor surface "speculative solve failed: SOLVE_INFEASIBLE
× 3 in last hour" as an advisory.

**Effort:** M (schema change + migration + advisor wiring).

---

### ERR-IMP-13 — `ErrorBoundary` dumps raw stack trace to end-users

**File:** `products/scheduler/frontend/src/components/ErrorBoundary.tsx`
(hand-rolled `Component` subclass — not the `react-error-boundary` npm
library).

**Scenario:** When a React render crashes,
`getDerivedStateFromError` flips `hasError` true and `render()` returns:

```tsx
<h1>Something went wrong</h1>
<p>{error.message}</p>
<pre>{error.stack}</pre>  // ← lines 32-34
<button>Reload Page</button>
```

Stack traces are debug-grade; an end-user seeing one assumes the app is
broken (which it is, but the surface should be cleaner). The
information should be in a copy-to-clipboard "Copy diagnostics" button
that includes the last request ID + error code, not splashed across the
page.

**Effort:** S.

---

### ERR-IMP-14 — `client.ts:566` SSE pre-flight loses HTTP status structure

**File:** `frontend/src/api/client.ts:565-566`.

**Scenario:** The SSE consumer's first response check is
`if (!response.ok) throw new Error("HTTP ${response.status}:
${response.statusText}")`. If the backend returned a JSON error body
(say a 401 because the JWT was missing), the structured `{code,
message}` payload is dropped — only the status line survives. A 401
during SSE handshake should surface as
`AUTH_REQUIRED` exactly like a non-SSE 401.

**Fix shape:** On `!response.ok`, parse `response.body` as JSON, extract
`detail.code` / `detail.message` if present, fall back to the current
behavior otherwise.

**Effort:** S.

---

### ERR-IMP-15 — `/schedule/validate` endpoint not surveyed; likely shares same pattern

**File:** `backend/api/_validate.py`.

**Scenario:** The `/schedule/validate` route (called on every drag
during DragGantt) was outside the agent surveys but uses the same
helper / no-helper mix. Worth a focused pass before publishing the
final ErrorCode taxonomy. Specifically, validation infeasibilities
during a drag should surface as `MOVE_INFEASIBLE` rather than 500 —
already-typed but unverified in this audit.

**Effort:** XS (verification pass).

---

## Minor Findings

- **ERR-MIN-1** — `ErrorCode.INTERNAL` exists but is never used. Either
  delete it or wire it as the default for the catch-all handler.

- **ERR-MIN-2** — `error_codes.py` has no `__all__`; `_payload` is
  effectively public.

- **ERR-MIN-3** — Bracket import paths leak `str(exc)` into the `detail`
  field (lines 898, 909, 1215, 1226, 1435, 1747, 1837). On a Python-
  level error (`TypeError: 'NoneType' object is not subscriptable`)
  this exposes internals to clients.

- **ERR-MIN-4** — `SyncService._process_row` doesn't differentiate 4xx
  (auth / schema — non-retryable) from 5xx (transient) Supabase errors;
  both increment `attempts` identically.

- **ERR-MIN-5** — `log.warning("auth: token verification failed: %s",
  exc)` in `dependencies.py:124` — already captured as IMP-10 in the
  prior audit; reiterated here because it's also an error-handling
  surface.

- **ERR-MIN-6** — `IMP-20` from the prior audit (request_id not bound
  to log records) blocks operator-side log correlation; this audit
  recommends the global handler **echo `request_id` in every error
  body**, which is an alternate path that doesn't require a logging
  filter.

- **ERR-MIN-7** — Toast dedup key is `${status}:${message}`. With
  typed codes the key should be `${code}` so two different `STATE_*`
  failures don't get deduped just because both are 500.

- **ERR-MIN-8** — `client.ts:805-810` `healthCheck()` catches all
  errors and returns `false`. Fine for the indicator, but should not
  also be the source of truth for "is the user offline" — that hook is
  worth a separate health-check error surface (network vs auth vs
  reachable-but-degraded).

---

## Proposed ErrorCode Additions

| Code | Status | When | Layer |
|------|-------:|------|-------|
| `INTERNAL_ERROR` (rename `INTERNAL`) | 500 | global-handler fallback | infra |
| `DATABASE_INTEGRITY` | 409 | `IntegrityError` (FK / UNIQUE) | repo |
| `DATABASE_UNAVAILABLE` | 503 | `OperationalError` (pool / locked / disk) | repo |
| `FILE_IO_FAILED` | 500 | `OSError` / `FileNotFoundError` | repo |
| `MODEL_BUILD_FAILED` | 422 | `RuntimeError` during model construction | solver |
| `SOLVER_VALIDATION_FAILED` | 422 | adapter `KeyError`/`ValueError`/`TypeError` | solver |
| `POST_SOLVE_VALIDATION_FAILED` | 500 | `verify_schedule()` `AssertionError` | solver |
| `VALIDATION_FAILED` | 400 | generic input — fixes ERR-CRIT-3 | API |
| `BRACKET_NOT_FOUND` | 404 | bracket / event lookup miss | brackets |
| `BRACKET_HYDRATION_FAILED` | 500 | `_hydrate_session` corruption | brackets |
| `BRACKET_INVALID_INPUT` | 400 | bracket validation (event count, participants) | brackets |
| `BRACKET_IMPORT_INVALID` | 400 | CSV / JSON import parse errors | brackets |
| `INVITE_NOT_FOUND` | 404 | invite token resolution miss | invites |
| `INVITE_EXPIRED` | 410 | `expires_at` past | invites |
| `INVITE_REVOKED` | 410 | `revoked_at` non-null | invites |
| `INVITE_ROLE_DENIED` | 403 | caller not owner | invites |
| `AUTH_REQUIRED` | 401 | missing / invalid JWT | infra |
| `AUTH_FORBIDDEN` | 403 | role insufficient (replaces bare 403) | infra |
| `SSE_MODEL_BUILD_FAILED` | n/a (SSE) | exception in `solve_in_thread` build phase | SSE |
| `SSE_SOLVE_CRASHED` | n/a (SSE) | exception in `solve_in_thread` solve phase | SSE |
| `SSE_VALIDATION_FAILED` | n/a (SSE) | pre-stream input validation | SSE |
| `SSE_CLIENT_DISCONNECT` | n/a (SSE) | not an error; clean cancellation event | SSE |
| `MOVE_INFEASIBLE` | (verify) | `/schedule/validate` rejection | drag |
| `WORKER_FAILURE` | n/a (advisory) | surfaces in `/advisories` for stuck workers | workers |

`SOLVE_INFEASIBLE`, `SOLVE_TIMEOUT` already in the enum but unused —
will start being emitted when ERR-CRIT-5 lands.

---

## Follow-Up Plan

### Bucket A — Global handler + scaffolding (the meta-fix)

**Findings:** ERR-CRIT-1, ERR-CRIT-3, ERR-CRIT-7, ERR-IMP-7, ERR-IMP-11,
ERR-MIN-6.

**Approach:**

1. Add `VALIDATION_FAILED`, `INTERNAL_ERROR`, `DATABASE_*`,
   `FILE_IO_FAILED`, `AUTH_*` enum members.
2. Register `@app.exception_handler(SQLAlchemyError)` dispatching on
   subclass.
3. Register `@app.exception_handler(OSError)` → `FILE_IO_FAILED`.
4. Register `@app.exception_handler(RequestValidationError)` re-wrapping
   the 422.
5. Register `@app.exception_handler(Exception)` catch-all →
   `INTERNAL_ERROR` 500 with `request_id` in body.
6. Every handler attaches `request_id` from `request.state.request_id`
   to the response body.

**Effort:** S (1 day). Touches `app/main.py`, `app/error_codes.py`,
`api/tournaments.py:188`. Zero migrations.

**Backwards-compat note:** The new `RequestValidationError` handler
replaces FastAPI's default 422 array shape (`{"detail": [{"loc": [...],
"msg": "...", "type": "..."}]}`) with the structured `{detail: {code,
message, validationErrors}}` shape. Verified against the scheduler
frontend (`grep -rn "detail\[0\]\|detail.map\|response\.data\.detail" ...`
returns zero matches in `products/scheduler/frontend/src`) — no code
reads the old shape, so the swap is safe. If the legacy
`archive/tournament-pre-merge` or any third-party consumer is revived,
re-check before deploying.

This bucket alone covers the user's primary complaint.

---

### Bucket B — Bracket + invite ErrorCode coverage

**Findings:** ERR-CRIT-2, ERR-IMP-1, ERR-IMP-2, ERR-IMP-10, ERR-MIN-3.

**Approach:**

1. Add ~8 enum members for bracket + invite categories.
2. Convert raw `HTTPException` sites to `http_error()` calls.
3. Convert bracket 409s to `raise ConflictError(...)`.
4. Make `_hydrate_session` raise typed exceptions instead of returning
   `None`.

**Effort:** M (1-2 days). ~50 call-site edits, mechanical. Adds an
e2e test that hits every code path on the bracket subsystem.

---

### Bucket C — Solver path differentiation

**Findings:** ERR-CRIT-5, ERR-IMP-5, ERR-IMP-8, ERR-IMP-15.

**Approach:**

1. Wrap `schedule_config_from_dto` / `players_from_dto` /
   `solver_options_for` boundaries in adapter — surface
   `SOLVER_VALIDATION_FAILED` 422.
2. Branch on `result.status` after solve completes — emit
   `SOLVE_INFEASIBLE` / `SOLVE_TIMEOUT` instead of returning a DTO with
   the status embedded (frontend doesn't read it).
3. Catch `AssertionError` from `verify_schedule()` separately →
   `POST_SOLVE_VALIDATION_FAILED`.
4. Audit `/schedule/validate` for parity.

**Effort:** M (2 days). Touches three route files + adapter + solver
backend. Adds three new enum members.

---

### Bucket D — SSE structured errors

**Findings:** ERR-CRIT-4, ERR-IMP-14.

**Approach:**

1. Add SSE-namespaced enum members.
2. Inspect exception class in `solve_in_thread` catch; emit
   `{type:"error", code, message, request_id}` instead of hardcoded
   string.
3. Move pre-solve validation **out** of the worker thread so a clean
   422 can be returned before headers flush.
4. Update frontend `client.ts:611-612` to read `event.code`; populate
   `err.code` on the rejected error so toasts pick it up.
5. Fix `client.ts:565-566` to parse JSON from the response body on
   handshake failure.

**Effort:** M (1-2 days).

---

### Bucket E — Worker error visibility

**Findings:** ERR-CRIT-6, ERR-IMP-12, ERR-MIN-4.

**Approach:**

1. Add `failure_code` / `failure_message` / `failed_at` columns to
   `suggestions` (or a sibling `suggestion_failures` table).
2. Worker catches still swallow at the loop boundary but write the
   failure context first.
3. Advisor surfaces a "stuck worker" advisory when failure-rate /
   queue-depth thresholds trip.
4. `SyncService` distinguishes 4xx vs 5xx Supabase errors —
   4xx skips retry, raises a one-shot advisory.

**Effort:** M (2 days). Migration required.

---

### Bucket F — Frontend UX

**Findings:** ERR-IMP-3, ERR-IMP-4, ERR-IMP-9, ERR-IMP-13, ERR-MIN-7,
ERR-MIN-8.

**Approach:**

1. Toast: promote `code` to title slot with distinct styling.
2. Hooks: switch from `err.message` / `err.status` to `err.code` for
   `useSchedule`, `useTournamentState`, `useBracket`.
3. Suppress per-request toasts when `ConnectionIndicator` is
   `"Offline"`; show one banner instead.
4. ErrorBoundary: hide stack trace; provide "Copy diagnostics" button
   that bundles last request_id + error code.
5. Toast dedup key: switch from `${status}:${message}` to `${code}`
   (fall back to `${status}:${message}` for un-coded errors).

**Effort:** S (1 day).

---

### Recommended sequencing

1. **Bucket A first.** One day. Eliminates the user's primary complaint
   ("generic 500s"). Backwards-compatible.
2. **Bucket D + Bucket F in parallel.** Two days. SSE structured errors
   + frontend code rendering. Together these make typed codes
   user-visible.
3. **Bucket B.** Two days. Bracket coverage. Pre-requisite for
   ERR-IMP-4's bracket hook branch.
4. **Bucket C.** Two days. Solver differentiation. Big UX uplift on
   SchedulePage.
5. **Bucket E.** Two days. Worker visibility. Lowest user-visibility but
   highest ops-debugability.

**Total:** ~10 dev-days. After Bucket A alone (1 day), 80 % of the user's
"generic 500" complaint is addressed; the remaining buckets convert
typed-but-invisible to typed-and-actionable.

---

## What's Already Working

Acknowledging the parts that don't need touching, so the fix scope is
narrow and visible:

| Area | Status |
|------|--------|
| `ErrorCode` enum + `http_error` helper | ✓ Production-ready |
| `ConflictError` 409 / `PreconditionFailedError` 412 with `to_dict()` | ✓ Used correctly |
| `request_id` middleware (mint + propagate via header) | ✓ Working — only the body-echo and log-record-binding is missing |
| Frontend axios interceptor decodes `detail.code` | ✓ `client.ts:226-237` |
| Frontend toast dedup (30 s window by `status:message`) | ✓ Solves polling-flood symptom |
| Frontend `__handled` flag dedups with `window.onunhandledrejection` | ✓ `client.ts:278`, `AppShell.tsx:76-82` |
| Command-pipeline command-conflict / stale-version routing | ✓ `client.ts:850-870` discriminated-union API |
| `/schedule/repair` `DISRUPTION_INVALID` coverage | ✓ Fully typed (6 sites) |
| `/match-states/import/upload` upload error coverage | ✓ Four codes (`UPLOAD_*`) |
| 9 of 11 API files use `http_error` consistently | ✓ Pattern is internalized |

The scaffolding is in place — the audit findings are about coverage and
consistency, not about a missing architecture.
