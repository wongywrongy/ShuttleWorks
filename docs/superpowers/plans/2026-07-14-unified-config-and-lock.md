# Unified Engine Config + Backend Schedule Lock — Implementation Plan (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared, schema-aware Engine configuration surface rendered by both Meet and Bracket, with Bracket actually consuming the solver/rest/break/optimization params it ignores today — and a backend-enforced "Schedule locked (edits will clear schedule)" contract (409 `CONFIG_LOCKED` → retry with `clearSchedule=true` → atomic clear-and-apply; started draws hard-locked with 409 `DRAW_STARTED`).

**Architecture:** Both Engine tabs already read/write the same tournament `data["config"]` blob, so unification = one component (`platform/settings/EngineConfigForm.tsx`) with a `module` prop, fed by the same store paths each side already uses. The lock is enforced at the single write funnel `PUT /tournaments/{id}/state`: a new `services/config_lock.py` classifies changed config keys against a shared non-scheduling-keys JSON (single source for backend + frontend parity tests). Bracket scheduling consumes shared params via a thin wrapper over the existing meet assembly `schedule_config_from_dto` (no meet-path refactor → no meet behavior risk).

**Tech Stack:** React + Zustand + vitest (frontend), FastAPI + SQLAlchemy + pytest (backend), scheduler_core `ScheduleConfig`.

**Sequencing:** This plan lands AFTER Plan A (`2026-07-14-match-list-parity.md`) and Plan B (`2026-07-14-draws-table.md`) but has no hard interface dependency on either — it can be executed independently if they slip.

## Global Constraints

- Branch: `dev/workspace-suite`. Commit after every task; every commit leaves the suite green.
- Backend tests: `cd products/scheduler && pytest <path>` with the repo `.venv` active. rootdir is `products/scheduler/`; `backend/` must be first on sys.path (handled by `tests/conftest.py`).
- Frontend tests: `npm --prefix products/scheduler/frontend run test:run -- <path>` (vitest 3, hoisted to root node_modules).
- Lint gates: `ruff check products/scheduler scheduler_core` (F-only) and `npm run lint:scheduler`. Boundaries: `npm run depcruise` — `src/platform/` must NOT import from `products/`; products must not import each other's internals.
- Error payloads go through `backend/app/error_codes.py::http_error` — frontend axios interceptor reads `detail.code` / `detail.message`.
- Non-scheduling (exempt) config keys — the single source of truth created in Task 1 (`products/scheduler/shared/non-scheduling-keys.json`): `scoringFormat, setsToWin, pointsPerSet, deuceEnabled, standingsMode, tvDisplayMode, tvAccent, tvPreset, tvGridColumns, tvCardSize, tvShowScores, courtOrder, hiddenCourts, tournamentName, clockShiftMinutes`. Every other config key is scheduling-relevant (fail-closed for new keys).
  - Note: `clockShiftMinutes` is a pure display offset (see its dto.ts comment) and `tournamentName` is metadata — both are exempt even though today's frontend `NON_SCHEDULING_KEYS` omits them; Task 5 aligns the frontend list.
- Commit messages end with:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG
```

---

## Part A — Backend schedule lock (spec Section 4)

### Task 1: Scheduling-field classifier (`services/config_lock.py`) + shared keys JSON

**Files:**
- Create: `products/scheduler/shared/non-scheduling-keys.json`
- Create: `products/scheduler/backend/services/config_lock.py`
- Test: `products/scheduler/tests/unit/test_config_lock.py`

**Interfaces:**
- Produces: `changed_scheduling_fields(prior_cfg: dict | None, incoming_cfg: dict | None) -> list[str]` and `NON_SCHEDULING_KEYS: frozenset[str]` — consumed by Task 3/4 (`put_tournament_state`) and by the Task 5 frontend parity test (which reads the JSON file directly).

- [ ] **Step 1: Create the shared JSON** (single source for both languages):

`products/scheduler/shared/non-scheduling-keys.json`:
```json
[
  "scoringFormat",
  "setsToWin",
  "pointsPerSet",
  "deuceEnabled",
  "standingsMode",
  "tvDisplayMode",
  "tvAccent",
  "tvPreset",
  "tvGridColumns",
  "tvCardSize",
  "tvShowScores",
  "courtOrder",
  "hiddenCourts",
  "tournamentName",
  "clockShiftMinutes"
]
```

- [ ] **Step 2: Write the failing test**

`products/scheduler/tests/unit/test_config_lock.py`:
```python
"""Unit tests for the scheduling-field classifier behind CONFIG_LOCKED.

The classifier is fail-closed: any config key NOT in the shared
non-scheduling-keys JSON is scheduling-relevant.
"""
from services.config_lock import NON_SCHEDULING_KEYS, changed_scheduling_fields


def test_exempt_keys_do_not_classify():
    prior = {"scoringFormat": "badminton", "pointsPerSet": 21}
    incoming = {"scoringFormat": "simple", "pointsPerSet": 11}
    assert changed_scheduling_fields(prior, incoming) == []


def test_scheduling_key_change_is_reported():
    prior = {"defaultRestMinutes": 30, "scoringFormat": "badminton"}
    incoming = {"defaultRestMinutes": 15, "scoringFormat": "simple"}
    assert changed_scheduling_fields(prior, incoming) == ["defaultRestMinutes"]


def test_unknown_new_key_is_scheduling_fail_closed():
    assert changed_scheduling_fields({}, {"someFutureKnob": 3}) == ["someFutureKnob"]


def test_removed_key_counts_as_change():
    assert changed_scheduling_fields({"freezeHorizonSlots": 4}, {}) == ["freezeHorizonSlots"]


def test_none_configs_never_classify():
    assert changed_scheduling_fields(None, {"courtCount": 4}) == []
    assert changed_scheduling_fields({"courtCount": 4}, None) == []


def test_equal_values_do_not_classify():
    cfg = {"courtCount": 4, "breaks": [{"start": "12:00", "end": "13:00"}]}
    assert changed_scheduling_fields(cfg, dict(cfg)) == []


def test_json_is_the_source():
    # The frozenset must come from the shared JSON, not a parallel literal.
    assert "tvAccent" in NON_SCHEDULING_KEYS
    assert "courtCount" not in NON_SCHEDULING_KEYS
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_config_lock.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.config_lock'`

- [ ] **Step 4: Implement**

`products/scheduler/backend/services/config_lock.py`:
```python
"""Scheduling-field classification behind the CONFIG_LOCKED contract.

The complement list (non-scheduling keys) lives in
``products/scheduler/shared/non-scheduling-keys.json`` — a single file
read by this module AND by the frontend parity test, so the two sides
cannot silently drift. Classification is fail-closed: any key not in
the exempt list is scheduling-relevant.
"""
from __future__ import annotations

import json
from pathlib import Path

_SHARED_JSON = (
    Path(__file__).resolve().parents[2] / "shared" / "non-scheduling-keys.json"
)

NON_SCHEDULING_KEYS: frozenset[str] = frozenset(
    json.loads(_SHARED_JSON.read_text(encoding="utf-8"))
)


def changed_scheduling_fields(
    prior_cfg: dict | None, incoming_cfg: dict | None
) -> list[str]:
    """Names of scheduling-relevant config keys whose value changed.

    ``None`` on either side means "no comparable config" — nothing to
    lock against (matches the prior structural-fields guard, which only
    fired when both blobs carried a config dict).
    """
    if not isinstance(prior_cfg, dict) or not isinstance(incoming_cfg, dict):
        return []
    keys = (set(prior_cfg) | set(incoming_cfg)) - NON_SCHEDULING_KEYS
    return sorted(
        k for k in keys if prior_cfg.get(k) != incoming_cfg.get(k)
    )
```

Path note: `parents[2]` from `backend/services/config_lock.py` → `products/scheduler/`.

- [ ] **Step 5: Run to verify pass**

Run: `cd products/scheduler && pytest tests/unit/test_config_lock.py -v`
Expected: 7 passed

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/shared/non-scheduling-keys.json products/scheduler/backend/services/config_lock.py products/scheduler/tests/unit/test_config_lock.py
git commit -m "feat(lock): scheduling-field classifier over a shared non-scheduling-keys JSON"
```
(with the Global Constraints trailer)

### Task 2: `DRAW_STARTED` error code + structured extras on `http_error`

**Files:**
- Modify: `products/scheduler/backend/app/error_codes.py`
- Test: `products/scheduler/tests/unit/test_config_lock.py` (append)

**Interfaces:**
- Produces: `ErrorCode.DRAW_STARTED`; `http_error(status, code, message, extra: dict | None = None)` — `extra` keys are merged into the detail payload (used by Task 3 for `{"fields": [...], "schedules": [...]}`).

- [ ] **Step 1: Write the failing test** (append to `tests/unit/test_config_lock.py`):

```python
def test_http_error_extra_payload():
    from app.error_codes import ErrorCode, http_error

    exc = http_error(
        409,
        ErrorCode.CONFIG_LOCKED,
        "locked",
        extra={"fields": ["courtCount"], "schedules": ["meet"]},
    )
    assert exc.status_code == 409
    assert exc.detail["code"] == "CONFIG_LOCKED"
    assert exc.detail["fields"] == ["courtCount"]
    assert exc.detail["schedules"] == ["meet"]


def test_draw_started_code_exists():
    from app.error_codes import ErrorCode

    assert ErrorCode.DRAW_STARTED.value == "DRAW_STARTED"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_config_lock.py -v`
Expected: the two new tests FAIL (`TypeError: http_error() got an unexpected keyword argument 'extra'`, `AttributeError: DRAW_STARTED`)

- [ ] **Step 3: Implement** in `backend/app/error_codes.py`:

Add to the `ErrorCode` enum, next to the existing lock codes (lines 43-44):
```python
    CONFIG_LOCKED = "CONFIG_LOCKED"
    ROSTER_LOCKED = "ROSTER_LOCKED"
    DRAW_STARTED = "DRAW_STARTED"
```

Change `http_error` (line 77) and `_payload` (line 91):
```python
def http_error(
    status: int,
    code: ErrorCode,
    message: str,
    extra: Optional[Dict[str, Any]] = None,
) -> HTTPException:
    """Build an ``HTTPException`` whose detail is a structured payload.

    The frontend axios interceptor reads ``detail.code`` for the toast
    title and ``detail.message`` for the body. ``extra`` keys are merged
    into the payload for machine-readable context (e.g. CONFIG_LOCKED's
    offending ``fields`` and the ``schedules`` a clear would remove).
    """
    return HTTPException(
        status_code=status,
        detail=_payload(code, message, extra),
    )


def _payload(
    code: ErrorCode, message: str, extra: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    out: Dict[str, Any] = {"code": code.value, "message": message}
    if extra:
        out.update(extra)
    return out
```
(Import `Optional` if not already imported in that module.)

- [ ] **Step 4: Run to verify pass**

Run: `cd products/scheduler && pytest tests/unit/test_config_lock.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/error_codes.py products/scheduler/tests/unit/test_config_lock.py
git commit -m "feat(lock): DRAW_STARTED error code + structured extras on http_error"
```

### Task 3: Generalized CONFIG_LOCKED + `clearSchedule` on `PUT /tournaments/{id}/state` (meet side)

**Files:**
- Modify: `products/scheduler/backend/api/tournaments.py` (`put_tournament_state`, lines ~516-627)
- Test: `products/scheduler/tests/test_tournaments.py` (append a new block)

**Interfaces:**
- Consumes: Task 1 `changed_scheduling_fields`, Task 2 `http_error(..., extra=)`.
- Produces: the wire contract — `PUT /tournaments/{id}/state?clearSchedule=true`; 409 detail `{code: "CONFIG_LOCKED", message, fields: [...], schedules: ["meet"|...]}`. Task 4 extends the same block for bracket; Task 5's client sends the query param.

Behavior (replaces the `_STRUCTURAL_CONFIG` venue-fields-only guard — structural fields are a subset of scheduling fields, so the old guard is subsumed; its error code stays `CONFIG_LOCKED`):
1. Compute `fields = changed_scheduling_fields(prior_cfg, incoming_cfg)`.
2. Meet lock is in play when the PRIOR blob has schedule assignments AND the INCOMING blob retains assignments (the sanctioned unlock that nulls the schedule in the same PUT keeps passing, exactly like today).
3. `fields` non-empty AND a lock in play AND `clearSchedule` false → 409 CONFIG_LOCKED with `fields` + `schedules`.
4. `clearSchedule=true` → server nulls `incoming["schedule"]` and sets `incoming["scheduleIsStale"] = False` before the (single, atomic) `commit_tournament_state` upsert.

- [ ] **Step 1: Write the failing tests** (append to `products/scheduler/tests/test_tournaments.py`; reuse the module's `client` fixture and `_basic_state` helper):

```python
# ---- Generalized schedule lock (Plan C, Task 3) --------------------------


def _state_with_schedule(name: str = "Locked") -> dict:
    s = _basic_state(name)
    s["matches"] = [
        {"id": "m1", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 2}
    ]
    s["schedule"] = {
        "assignments": [
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 2}
        ]
    }
    return s


def test_scheduling_field_locked_while_schedule_retained(client):
    created = client.post("/tournaments", json={"name": "L"}).json()
    tid = created["id"]
    assert client.put(f"/tournaments/{tid}/state", json=_state_with_schedule()).status_code == 200

    edited = _state_with_schedule()
    edited["config"]["defaultRestMinutes"] = 5  # scheduling-relevant
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CONFIG_LOCKED"
    assert detail["fields"] == ["defaultRestMinutes"]
    assert "meet" in detail["schedules"]


def test_non_scheduling_field_passes_while_locked(client):
    created = client.post("/tournaments", json={"name": "L2"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["scoringFormat"] = "simple"  # exempt
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 200


def test_clearing_schedule_in_same_put_passes_without_flag(client):
    # The sanctioned unlock path: the client nulls the schedule itself.
    created = client.post("/tournaments", json={"name": "L3"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["defaultRestMinutes"] = 5
    edited["schedule"] = None
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 200


def test_clear_schedule_flag_clears_and_applies_atomically(client):
    created = client.post("/tournaments", json={"name": "L4"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()  # still carries assignments
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200
    after = client.get(f"/tournaments/{tid}/state").json()
    assert after["schedule"] is None
    assert after["config"]["defaultRestMinutes"] == 5


def test_venue_structural_fields_still_lock(client):
    # The old _STRUCTURAL_CONFIG guard is subsumed, not lost.
    created = client.post("/tournaments", json={"name": "L5"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["courtCount"] = 8
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    assert r.json()["detail"]["fields"] == ["courtCount"]
```

- [ ] **Step 2: Run to verify the new block fails**

Run: `cd products/scheduler && pytest tests/test_tournaments.py -k "locked or clear_schedule or structural_fields_still" -v`
Expected: `test_scheduling_field_locked_while_schedule_retained` FAILS (200, no 409 — `defaultRestMinutes` isn't in the old structural list); flag test FAILS (unknown query param is ignored but the blob keeps assignments and 409s… actually passes 200 pre-change since restMinutes isn't structural — the assertion on `fields` catches it either way).

- [ ] **Step 3: Implement** in `put_tournament_state`:

Add imports at the top of `api/tournaments.py`:
```python
from fastapi import Query
from services.config_lock import changed_scheduling_fields
```

Replace the `_STRUCTURAL_CONFIG` block (lines 558-586) — keep everything above (`row_prior`, `incoming`, `prior`) and the ROSTER_LOCKED block below unchanged. New signature adds the query param:

```python
def put_tournament_state(
    state: TournamentStateDTO,
    tournament_id: uuid.UUID = Path(...),
    clearSchedule: bool = Query(
        False,
        description=(
            "Sanction the edit by clearing the committed schedule(s) it "
            "invalidates, atomically with the write. Refused (409 "
            "DRAW_STARTED) while any bracket draw is started."
        ),
    ),
    repo: LocalRepository = Depends(get_repository),
):
```

And the guard body:

```python
    prior_schedule = prior.get("schedule")
    prior_assignments = (
        prior_schedule.get("assignments") if isinstance(prior_schedule, dict) else None
    )
    incoming_schedule = incoming.get("schedule")
    incoming_assignments = (
        incoming_schedule.get("assignments")
        if isinstance(incoming_schedule, dict)
        else None
    )
    prior_cfg = prior.get("config") if isinstance(prior.get("config"), dict) else None
    incoming_cfg = incoming.get("config") if isinstance(incoming.get("config"), dict) else None

    fields = changed_scheduling_fields(prior_cfg, incoming_cfg)
    locked_schedules: list[str] = []
    if fields and prior_assignments and incoming_assignments:
        locked_schedules.append("meet")

    if locked_schedules and not clearSchedule:
        raise http_error(
            409,
            ErrorCode.CONFIG_LOCKED,
            "Schedule locked: "
            f"{', '.join(fields)} cannot change while a committed schedule "
            "exists. Retry with ?clearSchedule=true to clear it and apply "
            "the edit.",
            extra={"fields": fields, "schedules": locked_schedules},
        )

    if clearSchedule and fields:
        # Atomic clear-and-apply: the same single upsert persists both.
        incoming["schedule"] = None
        incoming["scheduleIsStale"] = False
```

(`locked_schedules` is a list so Task 4 can append `"bracket"`.)

- [ ] **Step 4: Run the new block AND the whole file** (the old structural-guard tests in this file, if any reference the old message text, must still pass — the code and status are unchanged; only the message wording moved. If an existing test asserts the old message substring "Venue structure is locked", update that assertion to the new message and flag it in the commit body.)

Run: `cd products/scheduler && pytest tests/test_tournaments.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/tournaments.py products/scheduler/tests/test_tournaments.py
git commit -m "feat(lock): generalize CONFIG_LOCKED to all scheduling fields + clearSchedule atomic clear-and-apply"
```

### Task 4: Bracket schedule joins the same lock (+ DRAW_STARTED hard lock)

**Files:**
- Modify: `products/scheduler/backend/api/tournaments.py` (same guard block)
- Modify: `products/scheduler/backend/repositories/local.py` (`commit_tournament_state`, lines ~1557-1599)
- Test: `products/scheduler/tests/test_tournaments.py` (append)

**Interfaces:**
- Consumes: Task 3's `locked_schedules` list and `clearSchedule` param.
- Produces: `LocalRepository.commit_tournament_state(tournament_id, payload, *, clear_bracket_assignments: bool = False)`; 409 `DRAW_STARTED`.

Facts this rides on: bracket assignments live in the server-managed `tournaments.data["bracket_session"]["assignments"]` (preserved across meet PUTs by the merge in `commit_tournament_state`, local.py:1588-1596); a started draw is a `bracket_events` row with `status == "started"` (`repo.brackets.list_events`).

- [ ] **Step 1: Write the failing tests** (append to `tests/test_tournaments.py`):

```python
def _seed_bracket_schedule(tid: str, *, started: bool = False) -> None:
    """Plant a bracket event + a bracket_session assignments blob directly
    through the repository (the bracket routers aren't mounted in this
    module's app)."""
    import uuid as _uuid
    from app.dependencies import get_repository_factory

    repo = get_repository_factory()()
    t_uuid = _uuid.UUID(tid)
    repo.brackets.create_event(
        t_uuid, "MS", discipline="MS", format="se", duration_slots=2,
        status="started" if started else "generated",
    )
    row = repo.tournaments.get_by_id(t_uuid)
    data = dict(row.data or {})
    data["bracket_session"] = {
        "total_slots": 128,
        "assignments": [
            {"play_unit_id": "MS-R1-M1", "slot_id": 0, "court_id": 1,
             "duration_slots": 2}
        ],
    }
    repo.tournaments.upsert_data(t_uuid, data)


def test_bracket_assignments_lock_scheduling_fields(client):
    created = client.post("/tournaments", json={"name": "B1"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B1"))
    _seed_bracket_schedule(tid)

    edited = _basic_state("B1")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CONFIG_LOCKED"
    assert detail["schedules"] == ["bracket"]


def test_clear_schedule_strips_bracket_assignments(client):
    created = client.post("/tournaments", json={"name": "B2"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B2"))
    _seed_bracket_schedule(tid)

    edited = _basic_state("B2")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200

    import uuid as _uuid
    from app.dependencies import get_repository_factory
    repo = get_repository_factory()()
    data = repo.tournaments.get_by_id(_uuid.UUID(tid)).data
    assert data["bracket_session"].get("assignments") in (None, [])
    # The rest of the session blob survives (total_slots untouched).
    assert data["bracket_session"]["total_slots"] == 128


def test_started_draw_is_hard_locked_even_with_flag(client):
    created = client.post("/tournaments", json={"name": "B3"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B3"))
    _seed_bracket_schedule(tid, started=True)

    edited = _basic_state("B3")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "DRAW_STARTED"
```

Note: if `get_repository_factory` is not the repo-construction seam in `app/dependencies.py`, use whatever `tests/_helpers.py` / existing bracket tests use to get a `LocalRepository` against the isolated DB — `tests/unit/test_bracket_repository.py` shows the canonical pattern. Adjust `_seed_bracket_schedule` to that pattern; the three test bodies stay as written.

- [ ] **Step 2: Run to verify they fail**

Run: `cd products/scheduler && pytest tests/test_tournaments.py -k bracket_assignments_lock -v` — expected FAIL (200: bracket lock not implemented).

- [ ] **Step 3: Implement.** In `put_tournament_state`, extend the Task-3 block:

```python
    bracket_session = prior.get("bracket_session")
    bracket_assignments = (
        bracket_session.get("assignments")
        if isinstance(bracket_session, dict)
        else None
    )
    if fields and bracket_assignments:
        locked_schedules.append("bracket")
```
(placed before the `if locked_schedules and not clearSchedule:` raise)

After that raise, before the clear:

```python
    clear_bracket = False
    if clearSchedule and fields:
        started = [
            ev.id
            for ev in repo.brackets.list_events(tournament_id)
            if (ev.status or "draft") == "started"
        ]
        if started:
            raise http_error(
                409,
                ErrorCode.DRAW_STARTED,
                "Draws in play cannot have their schedule cleared: "
                f"{', '.join(started)}. Finish or reset those draws first.",
                extra={"events": started},
            )
        incoming["schedule"] = None
        incoming["scheduleIsStale"] = False
        clear_bracket = bool(bracket_assignments)
```

And pass the flag through the single atomic write:
```python
        row = repo.commit_tournament_state(
            tournament_id, incoming, clear_bracket_assignments=clear_bracket
        )
```

In `repositories/local.py::commit_tournament_state`, add the keyword and strip assignments inside the existing preserve-merge (one upsert → atomic):

```python
    def commit_tournament_state(
        self,
        tournament_id: uuid.UUID,
        payload: dict,
        *,
        clear_bracket_assignments: bool = False,
    ) -> Tournament:
```
and inside the merge block (after `merged[key] = prior.data[key]`):
```python
        if clear_bracket_assignments and isinstance(merged.get("bracket_session"), dict):
            session = dict(merged["bracket_session"])
            session.pop("assignments", None)
            merged["bracket_session"] = session
```

- [ ] **Step 4: Run to verify pass, plus the neighbors**

Run: `cd products/scheduler && pytest tests/test_tournaments.py tests/unit/test_config_lock.py tests/unit/test_bracket_routes.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/tournaments.py products/scheduler/backend/repositories/local.py products/scheduler/tests/test_tournaments.py
git commit -m "feat(lock): bracket schedule joins CONFIG_LOCKED; DRAW_STARTED hard lock; atomic bracket clear"
```

### Task 5: Frontend — clearSchedule plumbing, unified guard, parity test

**Files:**
- Modify: `products/scheduler/frontend/src/api/client.ts` (`putTournamentState`, line ~751)
- Modify: `products/scheduler/frontend/src/hooks/useTournamentState.ts` (`forceSaveNow`)
- Modify: `products/scheduler/frontend/src/hooks/useLockGuard.ts`
- Modify: `products/scheduler/frontend/src/store/tournamentStore.ts` (align `NON_SCHEDULING_KEYS`)
- Test: `products/scheduler/frontend/src/hooks/__tests__/useLockGuard.clearSchedule.test.ts`
- Test: `products/scheduler/frontend/src/store/__tests__/nonSchedulingKeys.parity.test.ts`

**Interfaces:**
- Consumes: Task 3/4 wire contract (`?clearSchedule=true`, 409 payloads).
- Produces: `apiClient.putTournamentState(tid, state, opts?: { clearSchedule?: boolean })`; `requestClearScheduleOnNextSave()` exported from `useTournamentState.ts` (one-shot flag consumed by the next flush); `NON_SCHEDULING_KEYS` exported from `tournamentStore.ts`.

Design note (matches the approved spec): the confirm modal stays PROACTIVE (better UX than waiting for a round-trip), but on confirm the client now (a) clears locally as today AND (b) arms `clearSchedule=true` on the next PUT so the SERVER also clears the bracket schedule and sanctions the write. The 409 remains the enforcement backstop for stale tabs / raw API clients (the existing `forceSaveNow` 409 handler re-syncs + toasts — unchanged).

- [ ] **Step 1: Write the failing parity test**

`src/store/__tests__/nonSchedulingKeys.parity.test.ts`:
```typescript
/**
 * Pins the frontend NON_SCHEDULING_KEYS to the shared JSON the backend
 * classifier loads (products/scheduler/shared/non-scheduling-keys.json).
 * If this fails, one side changed the exempt list without the other.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NON_SCHEDULING_KEYS } from '../tournamentStore';

describe('non-scheduling keys parity', () => {
  it('frontend list matches the shared JSON', () => {
    const jsonPath = resolve(
      __dirname,
      '../../../../shared/non-scheduling-keys.json',
    );
    const shared: string[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect([...NON_SCHEDULING_KEYS].sort()).toEqual([...shared].sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/store/__tests__/nonSchedulingKeys.parity.test.ts`
Expected: FAIL — `NON_SCHEDULING_KEYS` is not exported (it's a local const inside `setConfig`), and the lists differ (`tournamentName`, `clockShiftMinutes`).

- [ ] **Step 3: Implement store change.** In `tournamentStore.ts`, hoist the list out of `setConfig` to module scope and export it, adding the two missing exempt keys:

```typescript
/** Config keys that never feed the solver — changing them must not mark
 *  the schedule stale or trip the lock. MUST stay in lockstep with
 *  products/scheduler/shared/non-scheduling-keys.json (the backend
 *  classifier's source) — pinned by nonSchedulingKeys.parity.test.ts. */
export const NON_SCHEDULING_KEYS: ReadonlyArray<keyof TournamentConfig> = [
  'scoringFormat',
  'setsToWin',
  'pointsPerSet',
  'deuceEnabled',
  'standingsMode',
  'tvDisplayMode',
  'tvAccent',
  'tvPreset',
  'tvGridColumns',
  'tvCardSize',
  'tvShowScores',
  'courtOrder',
  'hiddenCourts',
  'tournamentName',
  'clockShiftMinutes',
];
```
and inside `setConfig` delete the local `NON_SCHEDULING_KEYS` literal (the closure now reads the module const).

- [ ] **Step 4: Client + save-funnel plumbing.**

`api/client.ts`:
```typescript
  /** Overwrite a tournament's state blob. Returns the stamped state.
   *  `clearSchedule` sanctions a scheduling-field edit by clearing the
   *  committed schedule(s) server-side, atomically with the write. */
  async putTournamentState(
    tid: string,
    state: TournamentStateDTO,
    opts?: { clearSchedule?: boolean },
  ): Promise<TournamentStateDTO> {
    const response = await this.client.put<TournamentStateDTO>(
      `/tournaments/${tid}/state`,
      state,
      opts?.clearSchedule ? { params: { clearSchedule: true } } : undefined,
    );
    return response.data;
  }
```

`hooks/useTournamentState.ts` — module-level one-shot flag beside `pendingFollowup`:
```typescript
// Armed by useLockGuard's confirm: the next PUT carries ?clearSchedule=true
// so the SERVER clears the committed schedule(s) — including the bracket's,
// which lives in a server-managed blob the client cannot null out itself.
let clearScheduleNext = false;

/** One-shot: the next flushed PUT sanctions a scheduling-field edit. */
export function requestClearScheduleOnNextSave(): void {
  clearScheduleNext = true;
}
```
In `forceSaveNow`'s flush body, capture-and-reset before the PUT and pass it through:
```typescript
    const clearSchedule = clearScheduleNext;
    clearScheduleNext = false;
    ...
      await apiClient.putTournamentState(
        tid,
        snapshot(useTournamentStore.getState()),
        clearSchedule ? { clearSchedule: true } : undefined,
      );
```
Also reset the flag in `_resetSaveStateForTests()`.

`hooks/useLockGuard.ts` — arm the flag on confirm (local clear stays for immediate UX):
```typescript
import { requestClearScheduleOnNextSave } from './useTournamentState';
...
          resolve: (confirmed: boolean) => {
            if (confirmed) {
              requestClearScheduleOnNextSave();
              unlockSchedule();
            }
            setUnlockModalState(null);
            resolve(confirmed);
          },
```

- [ ] **Step 5: Write the flow test**

`src/hooks/__tests__/useLockGuard.clearSchedule.test.ts`:
```typescript
/**
 * Confirming the unlock modal must arm ?clearSchedule=true on the next
 * PUT — that is what sanctions the edit server-side and clears the
 * bracket schedule (which the client cannot null out itself).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import { useLockGuard } from '../useLockGuard';
import {
  _resetSaveStateForTests,
  forceSaveNow,
} from '../useTournamentState';

vi.mock('../useCanEdit', () => ({ assertCanEdit: () => true }));

describe('lock guard → clearSchedule PUT', () => {
  beforeEach(() => {
    _resetSaveStateForTests();
    useTournamentStore.setState({
      schedule: { assignments: [] } as never,
      isScheduleLocked: true,
    });
    useUiStore.getState().setActiveTournamentId('tid-1');
  });

  it('confirmed unlock sends clearSchedule on the next PUT', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockResolvedValue({} as never);

    const { result } = renderHook(() => useLockGuard());
    let confirmed: Promise<boolean>;
    act(() => {
      confirmed = result.current.confirmUnlock('edit rest');
      // Simulate the operator clicking Confirm in UnlockModalHost.
      useUiStore.getState().unlockModalState?.resolve(true);
    });
    await confirmed!;

    await forceSaveNow();
    expect(put).toHaveBeenCalledWith(
      'tid-1',
      expect.anything(),
      { clearSchedule: true },
    );

    // One-shot: the following save is a plain PUT.
    await forceSaveNow();
    expect(put).toHaveBeenLastCalledWith('tid-1', expect.anything(), undefined);
  });
});
```
(Adjust `unlockModalState?.resolve` access to the actual `uiStore` shape — read `store/uiStore.ts` first; the state setter is `setUnlockModalState` per `useLockGuard.ts`.)

- [ ] **Step 6: Run both new tests + the store/hook neighbors**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/store/__tests__/nonSchedulingKeys.parity.test.ts src/hooks/__tests__/useLockGuard.clearSchedule.test.ts src/store src/hooks`
Expected: pass

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/api/client.ts products/scheduler/frontend/src/hooks/useTournamentState.ts products/scheduler/frontend/src/hooks/useLockGuard.ts products/scheduler/frontend/src/store/tournamentStore.ts products/scheduler/frontend/src/store/__tests__/nonSchedulingKeys.parity.test.ts products/scheduler/frontend/src/hooks/__tests__/useLockGuard.clearSchedule.test.ts
git commit -m "feat(lock): client clearSchedule plumbing + keys parity pin"
```

---

## Part B — Unified engine configuration (spec Section 3)

### Task 6: Shared `EngineConfigForm` in `platform/settings/`

**Files:**
- Create: `products/scheduler/frontend/src/platform/settings/EngineConfigForm.tsx`
- Test: `products/scheduler/frontend/src/platform/settings/__tests__/EngineConfigForm.test.tsx`

**Interfaces:**
- Produces:
```typescript
export interface EngineConfigFormProps {
  module: 'meet' | 'bracket';
  formId?: string;                       // bar-level Save association (meet)
  onBusyChange?: (busy: boolean) => void;
  /** Resolves false to abort the save (lock guard). Defaults to allow. */
  guardSave?: () => Promise<boolean>;
}
export function EngineConfigForm(props: EngineConfigFormProps): JSX.Element;
export const ENGINE_CONFIG_FIELDS: ReadonlyArray<{
  key: keyof TournamentConfig; group: 'scoring' | 'timing' | 'solver' | 'goals';
  modules: ReadonlyArray<'meet' | 'bracket'>;
}>;
```
- Consumed by Task 7 (meet) and Task 8 (bracket). `ENGINE_CONFIG_FIELDS` is the declared schema — the module-applicability record the spec calls for; the parity test and any future audit read it.

Save-flow reconciliation (the "one pattern" decision): the shared form is **form-submit + Save** on both sides. Rationale: immediate writes (bracket's old pattern) would fire the lock confirm on every keystroke once scheduling fields are guarded; a Save step batches the confirm to one interaction and reuses the meet's proven dirty-check. Bracket's scoring fields thereby change from immediate-write to Save-on-submit — an intentional, spec-approved behavior change (flagged again in Task 8 where the old test is replaced).

- [ ] **Step 1: Create the component by moving the meet body.** Copy `products/meet/settings/EngineSettings.tsx` to `platform/settings/EngineConfigForm.tssx` → rename to `EngineConfigForm.tsx`, then apply these exact changes:

1. Fix relative imports (now one level shallower): `'../../../api/dto'` → `'../../api/dto'`; `'../../../hooks/useTournament'` → `'../../hooks/useTournament'`; same for `useTournamentId`, `useSuccessFlash`; `'../../../platform/settings/SettingsControls'` → `'./SettingsControls'`; `'../../../platform/settings/ScoringFields'` → `'./ScoringFields'`. **Delete** the `useLockGuard` import (platform must not depend on the meet-store guard — the guard arrives via prop; depcruise ERROR otherwise is on products/pages/app imports, and hooks/ is shared, but the prop keeps the component module-agnostic).
2. Rename the exported function `EngineSettings` → `EngineConfigForm` and change its props to `EngineConfigFormProps` above (add `module`, `guardSave`).
3. Replace the `confirmUnlock` line in `handleSubmit`:
```typescript
    if (guardSave && !(await guardSave())) return;
```
4. Add the schema const above the component:
```typescript
export const ENGINE_CONFIG_FIELDS = [
  { key: 'scoringFormat', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'pointsPerSet', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'setsToWin', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'deuceEnabled', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'defaultRestMinutes', group: 'timing', modules: ['meet', 'bracket'] },
  { key: 'breaks', group: 'timing', modules: ['meet', 'bracket'] },
  { key: 'restBetweenRounds', group: 'timing', modules: ['bracket'] },
  { key: 'deterministic', group: 'solver', modules: ['meet', 'bracket'] },
  { key: 'solverTimeLimitSeconds', group: 'solver', modules: ['meet', 'bracket'] },
  { key: 'freezeHorizonSlots', group: 'solver', modules: ['meet', 'bracket'] },
  { key: 'enableCourtUtilization', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'courtUtilizationPenalty', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'enableGameProximity', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'enableCompactSchedule', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'allowPlayerOverlap', group: 'goals', modules: ['meet', 'bracket'] },
] as const satisfies ReadonlyArray<{
  key: keyof TournamentConfig;
  group: 'scoring' | 'timing' | 'solver' | 'goals';
  modules: ReadonlyArray<'meet' | 'bracket'>;
}>;
```
5. In the Timing section, after the Break row, add the bracket-only row (rendered from the schema so applicability is declared, not ad-hoc):
```typescript
{ENGINE_CONFIG_FIELDS.some(
  (f) => f.key === 'restBetweenRounds' && f.modules.includes(module),
) && module === 'bracket' ? (
  <Row
    label="Rest between rounds"
    control={
      <NumberWithSuffix
        value={formData.restBetweenRounds ?? 1}
        onChange={(v) => set('restBetweenRounds', v)}
        suffix="slots"
        min={0}
        max={32}
        ariaLabel="Rest between rounds (slots)"
      />
    }
    last
  />
) : null}
```
and remove `last` from the Break row when `module === 'bracket'` (pass `last={module !== 'bracket'}`).
6. In `initialEngineState`, add `restBetweenRounds: config?.restBetweenRounds ?? 1,` so the dirty-check covers it (harmless for meet — the field just never renders or changes there).
7. Save-button label: `'Save engine settings'` stays.

- [ ] **Step 2: Write the test**

`src/platform/settings/__tests__/EngineConfigForm.test.tsx`:
```typescript
/**
 * The shared Engine form renders the SAME groups for both modules and
 * the declared bracket-only field only in bracket mode.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EngineConfigForm, ENGINE_CONFIG_FIELDS } from '../EngineConfigForm';

function mount(module: 'meet' | 'bracket') {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/config']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={<EngineConfigForm module={module} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<EngineConfigForm />', () => {
  it.each(['meet', 'bracket'] as const)(
    '%s renders all four shared groups',
    (module) => {
      mount(module);
      expect(screen.getByText('Scoring')).toBeInTheDocument();
      expect(screen.getByText('Timing')).toBeInTheDocument();
      expect(screen.getByText('Advanced solver')).toBeInTheDocument();
      expect(screen.getByText('Optimisation goals')).toBeInTheDocument();
    },
  );

  it('bracket-only rest-between-rounds renders only in bracket mode', () => {
    mount('meet');
    expect(
      screen.queryByLabelText('Rest between rounds (slots)'),
    ).not.toBeInTheDocument();
  });

  it('bracket mode shows rest-between-rounds', () => {
    mount('bracket');
    expect(
      screen.getByLabelText('Rest between rounds (slots)'),
    ).toBeInTheDocument();
  });

  it('guardSave=false aborts the submit', async () => {
    const guard = vi.fn().mockResolvedValue(false);
    const { container } = render(
      <MemoryRouter initialEntries={['/tournaments/t1/config']}>
        <Routes>
          <Route
            path="/tournaments/:id/*"
            element={<EngineConfigForm module="meet" guardSave={guard} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const form = container.querySelector('form')!;
    form.requestSubmit();
    // Guard consulted; no crash, no save side effects to assert beyond it.
    expect(guard).toHaveBeenCalled();
  });

  it('schema declares exactly one module-specific field', () => {
    const specific = ENGINE_CONFIG_FIELDS.filter((f) => f.modules.length === 1);
    expect(specific.map((f) => f.key)).toEqual(['restBetweenRounds']);
  });
});
```
(If `useTournament` needs providers/mocks in this repo's test setup, mirror how `src/products/bracket/__tests__/BracketEngineSection.test.tsx` mounts with a router + store — same pattern, it already renders `ScoringFields` against the live zustand store.)

- [ ] **Step 3: Run to verify pass**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/platform/settings/__tests__/EngineConfigForm.test.tsx`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add products/scheduler/frontend/src/platform/settings/EngineConfigForm.tsx products/scheduler/frontend/src/platform/settings/__tests__/EngineConfigForm.test.tsx
git commit -m "feat(config): shared schema-declared EngineConfigForm in platform/settings"
```

### Task 7: Meet adopts the shared form

**Files:**
- Modify: `products/scheduler/frontend/src/products/meet/TournamentSetupPage.tsx` (lines 27, 145)
- Delete: `products/scheduler/frontend/src/products/meet/settings/EngineSettings.tsx`

**Interfaces:**
- Consumes: `EngineConfigForm` (Task 6), `useLockGuard().confirmUnlock` (Task 5 behavior).

- [ ] **Step 1: Swap the render.** In `TournamentSetupPage.tsx`:

```typescript
import { EngineConfigForm } from '../../platform/settings/EngineConfigForm';
```
(replacing the `EngineSettings` import) and at line 145:
```typescript
        <EngineConfigForm
          module="meet"
          formId={FORM_ID}
          onBusyChange={setBusy}
          guardSave={() => confirmUnlock('save engine settings')}
        />
```
(`confirmUnlock` is already destructured at line 43.)

- [ ] **Step 2: Delete `products/meet/settings/EngineSettings.tsx`.** Check for a meet EngineSettings test first: `Glob products/scheduler/frontend/src/products/meet/settings/__tests__/*` — if an `EngineSettings.test.tsx` exists, port its assertions onto `EngineConfigForm.test.tsx` (they must all hold — meet behavior is unchanged) and delete the old file with the component.

- [ ] **Step 3: Run the meet + settings suites and lint/boundaries**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/meet src/platform/settings && npm run lint:scheduler && npm run depcruise`
Expected: pass; depcruise clean (platform imports hooks/ and api/ which are shared layers, not products/).

- [ ] **Step 4: Commit**

```bash
git add -A products/scheduler/frontend/src/products/meet products/scheduler/frontend/src/platform/settings
git commit -m "refactor(meet): Engine tab renders the shared EngineConfigForm (no behavior change)"
```

### Task 8: Bracket adopts the shared form (full option set, guarded saves)

**Files:**
- Modify: `products/scheduler/frontend/src/products/bracket/useBracketScheduleLock.ts`
- Modify: `products/scheduler/frontend/src/products/bracket/BracketTab.tsx` (lines ~175-198, 262-284)
- Delete: `products/scheduler/frontend/src/products/bracket/BracketEngineSection.tsx`
- Replace test: `products/scheduler/frontend/src/products/bracket/__tests__/BracketEngineSection.test.tsx` → `BracketEngineConfig.test.tsx`

**Interfaces:**
- Consumes: `EngineConfigForm` (Task 6), `requestClearScheduleOnNextSave` (Task 5), `useUiStore.setUnlockModalState` (existing modal host).
- Produces: `useBracketScheduleLock(data) -> { isLocked: boolean; hasSchedule: boolean }`.

Intentional behavior changes (spec-approved, restated for the reviewer): the bracket Engine tab gains the Solver + Optimisation groups and moves from immediate writes to Save-on-submit; a bracket schedule (assignments exist) now soft-locks scheduling fields behind the confirm-clear modal; a started draw stays a hard lock (fieldset disabled). The old `BracketEngineSection.test.tsx` asserts immediate-write behavior — it is REPLACED, not massaged.

- [ ] **Step 1: Extend the lock hook**

`useBracketScheduleLock.ts` — keep the header comment, change the body:
```typescript
import type { BracketTournamentDTO } from '../../api/bracketDto';

export function useBracketScheduleLock(
  data?: BracketTournamentDTO | null,
): { isLocked: boolean; hasSchedule: boolean } {
  // Hard lock: a draw in play — scores exist; config edits would corrupt
  // them. Never clearable (backend enforces 409 DRAW_STARTED).
  const isLocked = Boolean(
    data?.events.some((ev) => (ev.status ?? 'draft') === 'started'),
  );
  // Soft lock: a committed bracket schedule exists — scheduling-field
  // edits clear it (confirm modal → PUT ?clearSchedule=true).
  const hasSchedule = (data?.assignments?.length ?? 0) > 0;
  return { isLocked, hasSchedule };
}
```
(Verify the DTO field name: `BracketTournamentDTO.assignments` per `api/bracketDto.ts:80-89` usage — if the top-level list is named differently, e.g. nested under a session key, adjust the read; the two returned booleans keep these exact names.)

- [ ] **Step 2: Bracket guard + render swap in `BracketTab.tsx`.**

Add imports:
```typescript
import { EngineConfigForm } from '../../platform/settings/EngineConfigForm';
import { LockedFieldset } from '../../platform/settings/ConfigSurface';
import { useUiStore } from '../../store/uiStore';
import { requestClearScheduleOnNextSave } from '../../hooks/useTournamentState';
```
(and drop the `BracketEngineSection` import).

Update the lock destructure (line 175):
```typescript
  const { isLocked: bracketScheduleLocked, hasSchedule: bracketHasSchedule } =
    useBracketScheduleLock(data);
```

Add the guard (above `bracketSetupSections`):
```typescript
  const setUnlockModalState = useUiStore((s) => s.setUnlockModalState);
  // Soft lock: confirm → the next PUT carries ?clearSchedule=true and the
  // backend clears the bracket schedule atomically with the config write.
  // Hard lock (draw started) never reaches here — the fieldset is disabled.
  const guardBracketSave = useCallback((): Promise<boolean> => {
    if (!bracketHasSchedule) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setUnlockModalState({
        open: true,
        actionDescription: 'save engine settings (clears the bracket schedule)',
        resolve: (confirmed: boolean) => {
          if (confirmed) requestClearScheduleOnNextSave();
          setUnlockModalState(null);
          resolve(confirmed);
        },
      });
    });
  }, [bracketHasSchedule, setUnlockModalState]);
```
(add `useCallback` to the react import if absent).

Replace the engine section render (line 183):
```typescript
        render: () => (
          <LockedFieldset locked={bracketScheduleLocked}>
            <EngineConfigForm module="bracket" guardSave={guardBracketSave} />
          </LockedFieldset>
        ),
```
and update the `useMemo` dep array to `[bracketScheduleLocked, guardBracketSave]`.

In the setup `ConfigSurface` ribbons (line 271), show the unlock hint when soft-locked:
```typescript
              bracketScheduleLocked || bracketHasSchedule ? (
                <ScheduleLockIndicator
                  locked
                  showUnlockHint={!bracketScheduleLocked && bracketHasSchedule}
                />
              ) : null
```

- [ ] **Step 3: Delete `BracketEngineSection.tsx`** and replace its test with `src/products/bracket/__tests__/BracketEngineConfig.test.tsx`:

```typescript
/**
 * Bracket Engine tab — now the shared EngineConfigForm. Replaces
 * BracketEngineSection.test.tsx: the immediate-write pattern it pinned
 * was intentionally retired for Save-on-submit (unified config spec,
 * docs/superpowers/specs/2026-07-14-meet-bracket-unification-design.md §3).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LockedFieldset } from '../../../platform/settings/ConfigSurface';
import { EngineConfigForm } from '../../../platform/settings/EngineConfigForm';

function mountEngine(locked = false) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/bracket-setup']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <LockedFieldset locked={locked}>
              <EngineConfigForm module="bracket" />
            </LockedFieldset>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('bracket engine config (shared form)', () => {
  it('exposes the full unified option set', () => {
    mountEngine();
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Rest between matches')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Rest between rounds (slots)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Reproducible solver run')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximise court utilisation')).toBeInTheDocument();
  });

  it('hard lock disables the whole form', () => {
    mountEngine(true);
    const fieldset = document.querySelector('fieldset[data-locked]');
    expect(fieldset).not.toBeNull();
    expect(
      screen.getByLabelText('Rest between rounds (slots)'),
    ).toBeDisabled();
  });
});
```
(Reuse whatever store seeding/mocks the deleted test used for `useTournament` if the form needs a hydrated config; assertions above are the contract.)

- [ ] **Step 4: Run the bracket suite + lint + depcruise**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket src/platform/settings && npm run lint:scheduler && npm run depcruise`
Expected: pass. Also check `src/platform/contracts/__tests__/moduleContract.test.ts` in the full run — if a baseline pins the bracket engine section component or the `putTournamentState` reference, update the baseline per its in-file instructions and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add -A products/scheduler/frontend/src/products/bracket products/scheduler/frontend/src/platform
git commit -m "feat(bracket): Engine tab adopts unified EngineConfigForm with guarded, clearing saves"
```

### Task 9: Backend — `schedule_config_for_bracket` (pure mapping wrapper)

**Files:**
- Modify: `products/scheduler/backend/adapters/badminton.py` (append after `schedule_config_from_dto`)
- Test: `products/scheduler/tests/unit/test_bracket_schedule_config.py`

**Interfaces:**
- Produces:
```python
def schedule_config_for_bracket(
    config: TournamentConfig,
    *,
    court_count: int,
    total_slots: int,
    interval_minutes: int,
    closed_court_windows: list[tuple[int, int, int]],
) -> ScheduleConfig
```
- Consumed by Task 10 (`_hydrate_session`). NO changes to `schedule_config_from_dto` itself — the meet path is untouched by construction.

The wrapper reuses the full meet assembly (rest, freeze, breaks, objective weights) then overrides the four session-owned structural fields the bracket derives differently (its `total_slots` is a session constant, not a day-window computation; its closures are the meet-occupied windows; `closed_court_ids` resets — the meet's closed-courts list is already baked into the occupied windows the caller passes).

- [ ] **Step 1: Write the failing test**

`products/scheduler/tests/unit/test_bracket_schedule_config.py`:
```python
"""schedule_config_for_bracket — bracket consumes the shared config
assembly (rest / freeze / breaks / objective weights) with its
session-owned structural overrides on top."""
from adapters.badminton import schedule_config_for_bracket
from app.schemas import TournamentConfig


def _cfg(**over) -> TournamentConfig:
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="18:00",
        breaks=[],
        courtCount=4,
        defaultRestMinutes=60,
        freezeHorizonSlots=3,
    )
    base.update(over)
    return TournamentConfig(**base)


def _build(cfg: TournamentConfig):
    return schedule_config_for_bracket(
        cfg,
        court_count=2,
        total_slots=128,
        interval_minutes=30,
        closed_court_windows=[(1, 0, 4)],
    )


def test_structural_overrides_win():
    sc = _build(_cfg())
    assert sc.total_slots == 128            # session constant, not day window
    assert sc.court_count == 2              # session override
    assert sc.interval_minutes == 30
    assert sc.closed_court_windows == [(1, 0, 4)]
    assert sc.closed_court_ids == []        # baked into the windows already


def test_shared_params_flow_through():
    sc = _build(_cfg(defaultRestMinutes=60, freezeHorizonSlots=3))
    assert sc.default_rest_slots == 2       # 60 min / 30 min slots
    assert sc.freeze_horizon_slots == 3


def test_breaks_map_to_slots():
    sc = _build(
        _cfg(breaks=[{"start": "12:00", "end": "13:00"}])
    )
    assert (6, 8) in sc.break_slots         # 12:00 is slot 6 from 09:00 @30min


def test_objective_weights_flow_through():
    sc = _build(
        _cfg(
            enableCompactSchedule=True,
            enableCourtUtilization=False,
            allowPlayerOverlap=True,
        )
    )
    assert sc.enable_compact_schedule is True
    assert sc.enable_court_utilization is False
    assert sc.allow_player_overlap is True
```
(If `TournamentConfig` lives elsewhere than `app.schemas`, import it from wherever `adapters/badminton.py` imports it — match that module's import line exactly.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_bracket_schedule_config.py -v`
Expected: FAIL — `ImportError: cannot import name 'schedule_config_for_bracket'`

- [ ] **Step 3: Implement** (append to `adapters/badminton.py` after `schedule_config_from_dto`):

```python
def schedule_config_for_bracket(
    config: TournamentConfig,
    *,
    court_count: int,
    total_slots: int,
    interval_minutes: int,
    closed_court_windows: List[Tuple[int, int, int]],
) -> ScheduleConfig:
    """Bracket variant of the shared config assembly.

    Reuses the full meet mapping (rest, freeze horizon, breaks, solver
    objective weights) so both engines consume the SAME engine-config
    fields, then overrides the structural fields the bracket session
    owns: its slot axis is a session constant (not a day-window
    computation) and its closures are the meet-occupied windows the
    caller derives (which already account for closed courts).
    """
    base = schedule_config_from_dto(config)
    return replace(
        base,
        court_count=court_count,
        total_slots=total_slots,
        interval_minutes=interval_minutes,
        closed_court_windows=list(closed_court_windows),
        closed_court_ids=[],
        current_slot=0,
    )
```

- [ ] **Step 4: Run to verify pass**

Run: `cd products/scheduler && pytest tests/unit/test_bracket_schedule_config.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/adapters/badminton.py products/scheduler/tests/unit/test_bracket_schedule_config.py
git commit -m "feat(bracket): schedule_config_for_bracket reuses the shared config assembly"
```

### Task 10: Wire the bracket session to the shared assembly + solver options

**Files:**
- Modify: `products/scheduler/backend/api/brackets.py` (`_hydrate_session` lines ~696-720; `SolverOptions` construction sites at ~1576, 1676, 2868)
- Test: `products/scheduler/tests/unit/test_bracket_hydrate_config.py`

**Interfaces:**
- Consumes: Task 9 `schedule_config_for_bracket`, existing `solver_options_for` (`adapters/badminton.py:96`).
- Produces: bracket solves that honor `defaultRestMinutes`, `freezeHorizonSlots`, `breaks`, `deterministic`/`randomSeed`, and the optimization weights from the shared config blob. `restBetweenRounds` semantics are UNCHANGED (still session-level `rest_between_rounds`). Request-level `time_limit_seconds` precedence is UNCHANGED (request > session default 5.0) — `config.solverTimeLimitSeconds` deliberately does NOT override the bracket's per-request budget; that knob's bracket meaning stays "meet solve budget" and the plan flags this in the docstring.

- [ ] **Step 1: Write the failing test**

`products/scheduler/tests/unit/test_bracket_hydrate_config.py`:
```python
"""_hydrate_session must feed the shared engine-config fields into the
bracket's ScheduleConfig (Plan C wiring — before this, rest/freeze/
breaks/weights were silently ignored by the bracket path)."""
import uuid

import pytest

from _helpers import isolate_test_database


@pytest.fixture
def repo(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from app.dependencies import get_repository_factory

    return get_repository_factory()()


def test_hydrated_session_config_reads_shared_fields(repo):
    from api.brackets import _hydrate_session

    tid = uuid.uuid4()
    repo.tournaments.create(name="W")  # returns a row; use its id instead
    row = repo.tournaments.list_all()[0]
    tid = row.id
    repo.brackets.create_event(
        tid, "MS", discipline="MS", format="se", duration_slots=2
    )
    repo.tournaments.upsert_data(
        tid,
        {
            "config": {
                "intervalMinutes": 30,
                "dayStart": "09:00",
                "dayEnd": "18:00",
                "breaks": [{"start": "12:00", "end": "13:00"}],
                "courtCount": 3,
                "defaultRestMinutes": 60,
                "freezeHorizonSlots": 2,
                "enableCompactSchedule": True,
            },
            "bracket_session": {"total_slots": 128},
        },
    )

    session = _hydrate_session(repo, tid)
    assert session is not None
    sc = session.config
    assert sc.total_slots == 128            # session override intact
    assert sc.court_count == 3
    assert sc.default_rest_slots == 2       # NEW: was default 1 before wiring
    assert sc.freeze_horizon_slots == 2     # NEW: was 0
    assert (6, 8) in sc.break_slots         # NEW: was []
    assert sc.enable_compact_schedule is True  # NEW: weights flow through
```
(Adapt the two repo-seeding lines to the actual creation API — `repo.tournaments.create(...)` signature per `tests/unit/test_repositories.py`; the assertions are the contract.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_bracket_hydrate_config.py -v`
Expected: FAIL on `default_rest_slots == 2` (currently 1: builder default).

- [ ] **Step 3: Implement.** In `_hydrate_session` (brackets.py ~696-720), replace the `build_schedule_config(SchedulingParams(...))` call:

```python
    # Full shared assembly (rest / freeze / breaks / objective weights),
    # with the session-owned structural overrides on top. camel_cfg may be
    # sparse on old blobs — merge over the same defaults the meet uses.
    cfg_model = TournamentConfig.model_validate(
        {
            "intervalMinutes": interval_minutes,
            "dayStart": "09:00",
            "dayEnd": "18:00",
            "breaks": [],
            "courtCount": court_count,
            "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0,
            **{k: v for k, v in camel_cfg.items() if v is not None},
        }
    )
    config = schedule_config_for_bracket(
        cfg_model,
        court_count=court_count,
        total_slots=total_slots,
        interval_minutes=interval_minutes,
        # Hybrid coordination: schedule bracket matches AROUND the meet
        # schedule so the two engines never double-book a court.
        closed_court_windows=_meet_occupied_windows(data_blob, court_count),
    )
```
Add the imports at the top of brackets.py: `from adapters.badminton import schedule_config_for_bracket, solver_options_for` and the `TournamentConfig` schema import (same source as adapters/badminton.py uses). Remove now-unused `build_schedule_config`/`SchedulingParams` imports IF no other call site in the file uses them (line 1468-1475 import path also builds config — leave that call site as-is unless it's the same pattern; if it is, convert it identically).

Then the solver-options sites. Add one helper near `_hydrate_session`:

```python
def _bracket_solver_options(
    time_limit_seconds: float, camel_cfg: dict
) -> SolverOptions:
    """Bracket SolverOptions: per-request time budget (bracket-owned,
    default 5 s) + the shared deterministic/seed knobs from the engine
    config. config.solverTimeLimitSeconds deliberately does NOT apply
    here — the bracket's budget is a request/session parameter."""
    if camel_cfg.get("deterministic"):
        return SolverOptions(
            time_limit_seconds=time_limit_seconds,
            num_workers=1,
            random_seed=int(camel_cfg.get("randomSeed") or 42),
            log_progress=False,
            deterministic=True,
        )
    return SolverOptions(time_limit_seconds=time_limit_seconds, log_progress=False)
```
and at each `SolverOptions(time_limit_seconds=...)` construction inside the solve paths (~1576, 1676, 2868), replace with `_bracket_solver_options(time_limit_seconds, (tournament.data or {}).get("config") or {})` — read the surrounding code at each site for the in-scope variable that holds the tournament data blob (in `_hydrate_session` callers it's typically already loaded; if not in scope at a site, fetch via `repo.tournaments.get_by_id(tournament_id)` exactly as `_hydrate_session` does). Keep each site's existing `time_limit_seconds` value untouched.

- [ ] **Step 4: Run the new test + the whole bracket surface** (the wiring touches every bracket solve — determinism and interactive-scheduling tests are the canary):

Run: `cd products/scheduler && pytest tests/unit/test_bracket_hydrate_config.py tests/unit/test_bracket_routes.py tests/unit/test_bracket_interactive_scheduling.py tests/unit/test_bracket_event_routes.py tests/test_bracket_assign_unassign.py tests/test_bracket_commands_seam_c.py tests/test_determinism.py -v`
Expected: all pass. If a bracket scheduling test fails because its fixture blob now feeds real rest/breaks into the solve (e.g. a schedule that no longer fits 128 slots), STOP and inspect: the fix is adjusting the fixture's config (tests that never set `defaultRestMinutes` get 0 via the defaults merge above, so behavior is unchanged for them) — NOT weakening the wiring.

- [ ] **Step 5: Full backend suite**

Run: `cd products/scheduler && pytest`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/backend/api/brackets.py products/scheduler/tests/unit/test_bracket_hydrate_config.py
git commit -m "feat(bracket): solves consume shared rest/freeze/breaks/weights + deterministic solver options"
```

### Task 11: Full gates + docs/debt bookkeeping

**Files:**
- Modify (if needed): `products/scheduler/frontend/src/platform/contracts/moduleContract.ts` + `__tests__` baselines
- Modify: `docs/audits/debt-log.md` (only if something got deferred)

- [ ] **Step 1: Run everything**

```bash
make check
```
Expected: frontend lint+vitest, backend ruff+pytest, depcruise all green. Fix any moduleContract baseline drift per the contract test's own instructions (endpoint references moved: `putTournamentState` gained an options arg; bracket engine section component was replaced — only update baselines, never weaken the contract).

- [ ] **Step 2: Log deferrals.** If Task 10's solver-options wiring skipped any construction site (e.g. a site with no config blob in scope), add a debt-log entry describing the site and why.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(unification): gates green for unified config + backend schedule lock (Plan C)"
```

---

## Self-review notes (already applied)

- **Spec §3 coverage:** shared schema-declared form (Task 6), both modules render it (7, 8), Events tabs untouched (spec keeps them module-specific), backend wiring via wrapper — no meet-path refactor needed, which supersedes the spec's "extract from adapters/badminton.py" wording: the assembly already lives in one importable place; the wrapper IS the shared seam. Deviation recorded here deliberately.
- **Spec §4 coverage:** classifier + shared JSON (1), 409 payload + DRAW_STARTED (2), meet lock + atomic clear (3), bracket lock + hard lock (4), frontend flow + parity pin (5). Per-draw draft-only PATCH 409 already exists (brackets.py:1987-1991) — no task needed.
- **Type consistency:** `changed_scheduling_fields` list[str] used in Tasks 3/4; `{isLocked, hasSchedule}` produced in Task 8 Step 1 and consumed in Step 2; `EngineConfigFormProps.guardSave` produced Task 6, consumed 7/8; `putTournamentState` opts produced Task 5, consumed by guard flow.
- **Known soft spots called out inline** (not placeholders — each has a concrete fallback): repo-seeding helper shape in Task 4/10 tests (mirror `test_bracket_repository.py`), `uiStore.unlockModalState` access in Task 5's test, `BracketTournamentDTO.assignments` field name in Task 8.
