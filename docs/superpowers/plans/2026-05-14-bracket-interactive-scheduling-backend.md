# Bracket Interactive-Scheduling Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bracket surface a pure-Python per-match feasibility check (`POST /tournaments/{tid}/bracket/validate`) and a CP-SAT pin-and-re-solve (`POST /tournaments/{tid}/bracket/pin`), mirroring what the meet surface already has.

**Architecture:** Two new server-state-keyed FastAPI routes on the existing bracket router hydrate the persisted `BracketSession` and carry only the proposed move `{play_unit_id, slot_id, court_id}`. `/validate` splices the move into the current assignment set and runs `scheduler_core.find_conflicts` plus a new forward-only draw-dependency-ordering check — no CP-SAT. `/pin` partitions `state.assignments` into locked / pinned / free, builds a `ScheduleRequest` with `PreviousAssignment`s via an extended `adapter.build_problem`, re-solves through the shared CP-SAT engine via a new `TournamentDriver.repin_and_resolve`, writes assignments back, and returns the serialized session.

**Tech Stack:** Python · FastAPI · Pydantic · OR-Tools CP-SAT (`scheduler_core`) · pytest · TypeScript (thin API-client wiring only)

**Reference spec:** `docs/superpowers/specs/2026-05-14-bracket-interactive-scheduling-backend-design.md`

---

## Locked design decisions (resolve spec ambiguities before coding)

1. **`/pin` failure surface.** `/pin`'s `response_model` is `TournamentOut` (200-only success). A solver INFEASIBLE/UNKNOWN result (including timeout) → `raise HTTPException(status_code=409, detail={"error": "infeasible", "reasons": [...]})`. The locked-`play_unit_id` rejection → `raise HTTPException(status_code=409, detail={"error": "locked", "message": ...})`. Both are 409 but distinguishable by `detail["error"]`.
2. **`current_slot` is taken literally from `session.config.current_slot`** (currently always `0` in bracket sessions — `_hydrate_session` never sets it). The "ends-before-`current_slot`" locked criterion is therefore inert today but forward-defensive; it is implemented as the spec states. `repin_and_resolve` does **not** call `advance_current_slot()`.
3. **`build_problem` stays backward-compatible.** A new kw-only `previous_assignments: Optional[List[PreviousAssignment]] = None` parameter; `None` → `previous_assignments=[]` (preserves `schedule_next_round`'s current behaviour).
4. **`repin_and_resolve`'s match set is `state.assignments.keys()`** (the already-scheduled set), **not** `find_ready_play_units` (the next ready wave).
5. **Bracket validation DTOs are snake_case** (`BracketValidationConflictOut`, `BracketValidationOut`), defined locally in `api/brackets.py` — not imported from `app.schemas` (which is camelCase). "Mirrors the meet" is structural, not field-name.
6. **The locked-`play_unit_id` 409 uses `HTTPException`**, matching the existing bracket-route house style (`create_bracket` already does `raise HTTPException(status_code=409, ...)`), not the match-state `ConflictError`.
7. **`_expand_side` / `_build_players` in `adapter.py` are made public** (`expand_side`, `build_players`) so `services/bracket/validation.py` reuses them rather than duplicating side-expansion / player-window logic.

---

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `products/scheduler/backend/services/bracket/adapter.py` | Modify | Rename `_expand_side`→`expand_side`, `_build_players`→`build_players`; extend `build_problem` with a kw-only `previous_assignments` parameter that flows into `ScheduleRequest`. |
| `products/scheduler/backend/services/bracket/validation.py` | Create | Pure-Python bracket feasibility check: splice the proposed move into the current assignment set, run `scheduler_core.find_conflicts`, add the forward-only draw-dependency-ordering check, return a list of `(type, description, play_unit_id, other_play_unit_id, player_id, court_id, slot_id)` conflict tuples. |
| `products/scheduler/backend/services/bracket/scheduler.py` | Modify | Add `TournamentDriver.repin_and_resolve(play_unit_id, slot_id, court_id)`: partition `state.assignments` into locked/pinned/free, build the problem with `PreviousAssignment`s, solve, write assignments back. |
| `products/scheduler/backend/api/brackets.py` | Modify | Add `BracketValidateIn`, `BracketPinIn`, `BracketValidationConflictOut`, `BracketValidationOut` Pydantic models; add `POST /validate` and `POST /pin` routes. |
| `products/scheduler/frontend/src/api/bracketDto.ts` | Modify | Add `BracketValidateIn`, `BracketPinIn`, `BracketValidationConflict`, `BracketValidationOut` TypeScript types. |
| `products/scheduler/frontend/src/api/client.ts` | Modify | Add `validateBracketMove(tid, body)` and `pinBracketMatch(tid, body)` methods to `apiClient`. |
| `products/scheduler/frontend/src/api/bracketClient.tsx` | Modify | Add `validateMove` and `pinMatch` to the `BracketApi` interface + `BracketApiProvider` value. |
| `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` | Create (Test) | Route + service tests for `/validate`, `/pin`, and the validate↔pin contract. |

---

## Task 1 — Make `adapter.py` side/player helpers public and extend `build_problem`

**Files:**
- `products/scheduler/backend/services/bracket/adapter.py` (Modify)
- `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` (Create, Test)

### Steps

- [ ] **1.1 — Write the failing test for `build_problem` with `previous_assignments`.** Create `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` with the file header and the first test:

```python
"""Tests for the bracket interactive-scheduling backend — the
``/tournaments/{tid}/bracket/validate`` + ``/pin`` routes, the
``services/bracket/validation.py`` feasibility check, and
``TournamentDriver.repin_and_resolve``.

Sub-project #1 of the bracket court×time decomposition. Mirrors the
fixture style of ``test_bracket_routes.py`` (in-memory SQLite via
``isolate_test_database``, FastAPI ``TestClient`` over the real
routers + auth deps + repo).
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Interactive Scheduling Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    """Minimal 4-entrant single-elimination payload (2 courts)."""
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": time_limit,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


# ---- adapter.build_problem: previous_assignments wiring --------------------


def test_build_problem_emits_previous_assignments():
    """build_problem accepts a previous_assignments list and threads it
    into the ScheduleRequest; omitting it preserves the legacy [] shape."""
    from services.bracket.adapter import build_problem
    from scheduler_core.domain.models import PreviousAssignment, ScheduleConfig
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentState,
    )

    state = TournamentState()
    state.participants["P1"] = Participant(id="P1", name="P1", type=ParticipantType.PLAYER)
    state.participants["P2"] = Participant(id="P2", name="P2", type=ParticipantType.PLAYER)
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"], expected_duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)

    # Legacy call — no previous_assignments → empty list.
    legacy = build_problem(state, ["M1"], config=config)
    assert legacy.previous_assignments == []

    # New call — previous_assignments threaded through verbatim.
    prev = [PreviousAssignment(match_id="M1", slot_id=3, court_id=1, locked=True)]
    pinned = build_problem(state, ["M1"], config=config, previous_assignments=prev)
    assert pinned.previous_assignments == prev
```

- [ ] **1.2 — Run the test, confirm it fails.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py::test_build_problem_emits_previous_assignments -q`
  Expected failure: `TypeError: build_problem() got an unexpected keyword argument 'previous_assignments'`.

- [ ] **1.3 — Make the helpers public and extend `build_problem`.** In `products/scheduler/backend/services/bracket/adapter.py`:
  - Add `PreviousAssignment` to the `scheduler_core.domain.models` import.
  - Rename `_expand_side` → `expand_side` and `_build_players` → `build_players` (definitions and the two call sites inside `build_problem`).
  - Replace the `build_problem` signature and `ScheduleRequest` construction.

  New import block (top of file):
```python
from scheduler_core.domain.models import (
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverOptions,
)
```

  New `build_problem` signature + body (replacing lines 27–88):
```python
def build_problem(
    state: TournamentState,
    ready_play_unit_ids: Sequence[str],
    *,
    config: ScheduleConfig,
    solver_options: SolverOptions | None = None,
    previous_assignments: List[PreviousAssignment] | None = None,
) -> ScheduleRequest:
    """Assemble a SchedulingProblem for the engine.

    All PlayUnit / participant lookups go through `state` — for
    multi-event tournaments the state already holds everyone across
    events, so the engine sees one global match + player set per
    solve and player-no-overlap covers cross-event conflicts.

    `previous_assignments` carries the locked/pinned partition for a
    re-pin solve (see `TournamentDriver.repin_and_resolve`); when
    `None` it defaults to `[]`, preserving the append-only
    `schedule_next_round` behaviour.
    """
    if not ready_play_unit_ids:
        raise ValueError("no ready play units to schedule")

    matches: List[Match] = []
    referenced_player_ids: set[str] = set()

    for pu_id in ready_play_unit_ids:
        pu = state.play_units.get(pu_id)
        if pu is None:
            raise KeyError(f"unknown play unit {pu_id!r}")
        if not pu.side_a or not pu.side_b:
            raise ValueError(
                f"play unit {pu_id!r} has unresolved sides; cannot schedule"
            )

        side_a = expand_side(pu.side_a, state.participants)
        side_b = expand_side(pu.side_b, state.participants)
        if not side_a or not side_b:
            raise ValueError(
                f"play unit {pu_id!r} expanded to empty side"
            )

        matches.append(
            Match(
                id=pu.id,
                event_code=pu.event_id,
                duration_slots=pu.expected_duration_slots or 1,
                side_a=side_a,
                side_b=side_b,
            )
        )
        referenced_player_ids.update(side_a)
        referenced_player_ids.update(side_b)

    availability_window = (config.current_slot, config.total_slots)
    players = build_players(
        referenced_player_ids,
        state.participants,
        availability_window=availability_window,
    )

    return ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        previous_assignments=list(previous_assignments or []),
        solver_options=solver_options,
    )
```

  Then rename the two helper definitions (lines 91 and 114) from `_expand_side` / `_build_players` to `expand_side` / `build_players` — bodies unchanged.

- [ ] **1.4 — Run the test, confirm it passes.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py::test_build_problem_emits_previous_assignments -q`
  Expected: `1 passed`.

- [ ] **1.5 — Run the existing bracket suite to confirm no regression** (the `_expand_side` rename has no external callers — only `build_problem` used it — but `schedule_next_round` calls `build_problem`):
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_routes.py tests/test_core_smoke.py -q`
  Expected: all pass.

- [ ] **1.6 — Commit.**
```
git add products/scheduler/backend/services/bracket/adapter.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py
git commit -m "feat(bracket): thread previous_assignments through build_problem

Extend services/bracket/adapter.build_problem with a kw-only
previous_assignments parameter so a re-pin solve can pass the
locked/pinned partition as PreviousAssignment hints; None preserves
the append-only schedule_next_round behaviour (previous_assignments=[]).

Promote _expand_side/_build_players to public expand_side/build_players
so the upcoming services/bracket/validation.py reuses them instead of
duplicating side-expansion and player-window logic.

Sub-project #1 of the bracket court x time decomposition."
```

---

## Task 2 — `services/bracket/validation.py`: the pure-Python bracket feasibility check

**Files:**
- `products/scheduler/backend/services/bracket/validation.py` (Create)
- `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` (Modify, Test)

### Steps

- [ ] **2.1 — Write the failing tests for the validation module.** Append to `test_bracket_interactive_scheduling.py`:

```python
# ---- services/bracket/validation.py ---------------------------------------


def _two_player_state():
    """A TournamentState with two singles play units M1 (P1 vs P2) and
    M2 (P3 vs P4), plus a feeder dependency M3 depends on [M1]."""
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentAssignment,
        TournamentState,
    )

    state = TournamentState()
    for pid in ("P1", "P2", "P3", "P4"):
        state.participants[pid] = Participant(
            id=pid, name=pid, type=ParticipantType.PLAYER
        )
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"],
        expected_duration_slots=1,
    )
    state.play_units["M2"] = PlayUnit(
        id="M2", event_id="MS", side_a=["P3"], side_b=["P4"],
        expected_duration_slots=1,
    )
    state.play_units["M3"] = PlayUnit(
        id="M3", event_id="MS", side_a=["P1"], side_b=["P3"],
        expected_duration_slots=1, dependencies=["M1"],
    )
    state.assignments["M1"] = TournamentAssignment(
        play_unit_id="M1", slot_id=0, court_id=1, duration_slots=1
    )
    state.assignments["M2"] = TournamentAssignment(
        play_unit_id="M2", slot_id=0, court_id=2, duration_slots=1
    )
    return state


def test_validate_move_feasible():
    from scheduler_core.domain.models import ScheduleConfig
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M2 to (slot=1, court=1) — clear cell, no player conflict.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M2", slot_id=1, court_id=1
    )
    assert conflicts == []


def test_validate_move_court_overlap():
    from scheduler_core.domain.models import ScheduleConfig
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M2 onto M1's cell (slot=0, court=1).
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M2", slot_id=0, court_id=1
    )
    assert any(c.type == "court_conflict" for c in conflicts)


def test_validate_move_player_double_booking():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # Schedule M3 (P1 vs P3) at (slot=2, court=1).
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=2, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M1 (P1 vs P2) onto slot=2 court=2 — P1 collides with M3.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M1", slot_id=2, court_id=2
    )
    assert any(c.type == "player_overlap" for c in conflicts)


def test_validate_move_player_rest():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # M3 (P1 vs P3) at (slot=5, court=1).
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=5, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M1 (P1 vs P2) to slot=4 court=2: ends at 5, M3 starts at 5,
    # default rest is 1 slot → rest violation for P1.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M1", slot_id=4, court_id=2
    )
    assert any(c.type == "rest" for c in conflicts)


def test_validate_move_dependency_ordering():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # M3 depends on M1; M1 is at slot 0 (ends at 1). M3 currently
    # scheduled at slot 3.
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=3, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Drag M3 earlier than M1's end-slot (1) → dependency-ordering conflict.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M3", slot_id=0, court_id=2
    )
    assert any(c.type == "dependency_order" for c in conflicts)
    # And dragging it to slot >= 1 clears the dependency conflict.
    ok = validate_bracket_move(
        state, config, play_unit_id="M3", slot_id=1, court_id=2
    )
    assert not any(c.type == "dependency_order" for c in ok)
```

- [ ] **2.2 — Run the tests, confirm they fail.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k validate_move -q`
  Expected failure: `ModuleNotFoundError: No module named 'services.bracket.validation'`.

- [ ] **2.3 — Create `products/scheduler/backend/services/bracket/validation.py`** with the complete module:

```python
"""Pure-Python bracket feasibility check for drag-to-reschedule.

Splices a single proposed ``(slot_id, court_id)`` move for one
PlayUnit into the bracket session's current assignment set, then runs
the subset of hard constraints that applies to a bracket:

  - court/slot overlap, player double-booking, player rest,
    availability, breaks, court closures — via
    ``scheduler_core.engine.validation.find_conflicts``;
  - draw-dependency ordering — a new forward-only check: the proposed
    slot must be >= every feeder match's end-slot.

No CP-SAT invocation — fast enough to be debounced on drag-move by
the interactive Gantt UI (sub-project #3). Checked against the
**full current assignment set** (meet-faithful conservatism): a
position clear of every current match is necessarily clear of the
locked subset, so ``feasible: true`` reliably means ``/pin`` succeeds.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from scheduler_core.domain.models import (
    Assignment as CoreAssignment,
    Match,
    ScheduleConfig,
)
from scheduler_core.domain.tournament import TournamentState
from scheduler_core.engine.validation import Conflict, find_conflicts

from .adapter import build_players, expand_side


@dataclass
class BracketConflict:
    """One reason a proposed bracket move fails a hard constraint.

    Mirrors ``scheduler_core.engine.validation.Conflict`` but names the
    match field ``play_unit_id`` to match bracket-domain terminology.
    """

    type: str
    description: str
    play_unit_id: Optional[str] = None
    other_play_unit_id: Optional[str] = None
    player_id: Optional[str] = None
    court_id: Optional[int] = None
    slot_id: Optional[int] = None


def validate_bracket_move(
    state: TournamentState,
    config: ScheduleConfig,
    *,
    play_unit_id: str,
    slot_id: int,
    court_id: int,
) -> List[BracketConflict]:
    """Return the hard-constraint conflicts for moving ``play_unit_id``
    to ``(slot_id, court_id)`` against the current assignment set.

    An empty list means the move is feasible. Raises ``KeyError`` if
    ``play_unit_id`` has no PlayUnit in ``state``.
    """
    pu = state.play_units.get(play_unit_id)
    if pu is None:
        raise KeyError(f"unknown play unit {play_unit_id!r}")

    duration = pu.expected_duration_slots or 1

    # Build the Match + Player views for every *currently assigned*
    # PlayUnit — find_conflicts checks the full assignment set.
    matches: dict[str, Match] = {}
    referenced_player_ids: set[str] = set()
    for assigned_id in state.assignments:
        assigned_pu = state.play_units.get(assigned_id)
        if assigned_pu is None:
            continue
        if not assigned_pu.side_a or not assigned_pu.side_b:
            continue
        side_a = expand_side(assigned_pu.side_a, state.participants)
        side_b = expand_side(assigned_pu.side_b, state.participants)
        matches[assigned_id] = Match(
            id=assigned_id,
            event_code=assigned_pu.event_id,
            duration_slots=assigned_pu.expected_duration_slots or 1,
            side_a=side_a,
            side_b=side_b,
        )
        referenced_player_ids.update(side_a)
        referenced_player_ids.update(side_b)

    players_list = build_players(
        referenced_player_ids,
        state.participants,
        availability_window=(config.current_slot, config.total_slots),
    )
    players = {p.id: p for p in players_list}

    # Splice the proposed move into the assignment set, replacing the
    # PlayUnit's existing entry.
    core_assignments: List[CoreAssignment] = []
    for assigned_id, assignment in state.assignments.items():
        if assigned_id == play_unit_id:
            core_assignments.append(
                CoreAssignment(
                    match_id=play_unit_id,
                    slot_id=slot_id,
                    court_id=court_id,
                    duration_slots=duration,
                )
            )
        else:
            core_assignments.append(
                CoreAssignment(
                    match_id=assigned_id,
                    slot_id=assignment.slot_id,
                    court_id=assignment.court_id,
                    duration_slots=assignment.duration_slots,
                )
            )

    raw_conflicts: List[Conflict] = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=core_assignments,
        previous_assignments={},
    )

    conflicts: List[BracketConflict] = [
        BracketConflict(
            type=c.type,
            description=c.description,
            play_unit_id=c.match_id,
            other_play_unit_id=c.other_match_id,
            player_id=c.player_id,
            court_id=c.court_id,
            slot_id=c.slot_id,
        )
        for c in raw_conflicts
        # ``unscheduled`` fires for PlayUnits not in the assignment set;
        # the bracket only validates the scheduled set, so it is noise.
        if c.type != "unscheduled"
    ]

    # Forward-only draw-dependency ordering: the proposed slot must be
    # >= every feeder's end-slot. A PlayUnit whose feeders are not
    # resolved is not "ready" and so not in state.assignments at all —
    # so the reverse check (dragging earlier than something it feeds)
    # cannot arise and is not checked.
    for feeder_id in pu.dependencies:
        feeder_assignment = state.assignments.get(feeder_id)
        if feeder_assignment is None:
            continue
        feeder_end = (
            feeder_assignment.slot_id + feeder_assignment.duration_slots
        )
        if slot_id < feeder_end:
            conflicts.append(
                BracketConflict(
                    type="dependency_order",
                    description=(
                        f"Play unit {play_unit_id} at slot {slot_id} starts "
                        f"before feeder {feeder_id} ends (slot {feeder_end})"
                    ),
                    play_unit_id=play_unit_id,
                    other_play_unit_id=feeder_id,
                    slot_id=slot_id,
                )
            )

    return conflicts
```

- [ ] **2.4 — Run the tests, confirm they pass.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k validate_move -q`
  Expected: `5 passed`.

- [ ] **2.5 — Commit.**
```
git add products/scheduler/backend/services/bracket/validation.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py
git commit -m "feat(bracket): add pure-Python bracket move feasibility check

Add services/bracket/validation.py: validate_bracket_move splices a
proposed (slot_id, court_id) move for one PlayUnit into the session's
current assignment set and runs scheduler_core.find_conflicts plus a
new forward-only draw-dependency-ordering check. No CP-SAT — fast
enough for drag-move debouncing.

Checked against the full current assignment set (meet-faithful
conservatism): a cell clear of every current match is clear of the
locked subset, so feasible == /pin will succeed.

Sub-project #1 of the bracket court x time decomposition."
```

---

## Task 3 — `TournamentDriver.repin_and_resolve`

**Files:**
- `products/scheduler/backend/services/bracket/scheduler.py` (Modify)
- `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` (Modify, Test)

### Steps

- [ ] **3.1 — Write the failing tests for `repin_and_resolve`.** Append to `test_bracket_interactive_scheduling.py`:

```python
# ---- TournamentDriver.repin_and_resolve -----------------------------------


def _driver_state_two_assigned():
    """State with M1 (P1 vs P2) at (0,1) and M2 (P3 vs P4) at (0,2),
    both scheduled, no results."""
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentAssignment,
        TournamentState,
    )

    state = TournamentState()
    for pid in ("P1", "P2", "P3", "P4"):
        state.participants[pid] = Participant(
            id=pid, name=pid, type=ParticipantType.PLAYER
        )
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"],
        expected_duration_slots=1,
    )
    state.play_units["M2"] = PlayUnit(
        id="M2", event_id="MS", side_a=["P3"], side_b=["P4"],
        expected_duration_slots=1,
    )
    state.assignments["M1"] = TournamentAssignment(
        play_unit_id="M1", slot_id=0, court_id=1, duration_slots=1
    )
    state.assignments["M2"] = TournamentAssignment(
        play_unit_id="M2", slot_id=0, court_id=2, duration_slots=1
    )
    return state


def test_repin_pins_target_and_reoptimises_free():
    from scheduler_core.domain.models import (
        ScheduleConfig,
        SolverOptions,
        SolverStatus,
    )
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    # Pin M2 to (slot=3, court=1). M1 is free (no result, not started,
    # not past) — the solver re-places it.
    result = driver.repin_and_resolve("M2", slot_id=3, court_id=1)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    # M2 landed at its pinned target.
    assert state.assignments["M2"].slot_id == 3
    assert state.assignments["M2"].court_id == 1
    # M1 is still scheduled (re-optimised, exact cell solver's choice).
    assert "M1" in state.assignments


def test_repin_keeps_locked_match_fixed():
    from scheduler_core.domain.models import (
        ScheduleConfig,
        SolverOptions,
        SolverStatus,
    )
    from scheduler_core.domain.tournament import Result, WinnerSide
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    # M1 has a result → locked. Its (slot, court) must not move.
    state.results["M1"] = Result(winner_side=WinnerSide.A)
    locked_slot = state.assignments["M1"].slot_id
    locked_court = state.assignments["M1"].court_id

    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    result = driver.repin_and_resolve("M2", slot_id=5, court_id=2)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert state.assignments["M1"].slot_id == locked_slot
    assert state.assignments["M1"].court_id == locked_court
    assert state.assignments["M2"].slot_id == 5
    assert state.assignments["M2"].court_id == 2


def test_repin_rejects_locked_play_unit():
    from scheduler_core.domain.models import ScheduleConfig, SolverOptions
    from scheduler_core.domain.tournament import Result, WinnerSide
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    state.results["M1"] = Result(winner_side=WinnerSide.A)  # M1 locked
    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    with pytest.raises(ValueError, match="locked"):
        driver.repin_and_resolve("M1", slot_id=9, court_id=1)
```

- [ ] **3.2 — Run the tests, confirm they fail.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k repin -q`
  Expected failure: `AttributeError: 'TournamentDriver' object has no attribute 'repin_and_resolve'`.

- [ ] **3.3 — Add `repin_and_resolve` to `scheduler.py`.** In `products/scheduler/backend/services/bracket/scheduler.py`:
  - Add `PreviousAssignment` to the `scheduler_core.domain.models` import.
  - Add the method to `TournamentDriver`, after `schedule_next_round` (before `schedule_until_blocked`).

  Updated import (replace lines 14–19):
```python
from scheduler_core.domain.models import (
    PreviousAssignment,
    ScheduleConfig,
    ScheduleResult,
    SolverOptions,
    SolverStatus,
)
```

  New method:
```python
    def repin_and_resolve(
        self,
        play_unit_id: PlayUnitId,
        slot_id: int,
        court_id: int,
    ) -> RoundResult:
        """Re-pin one already-scheduled PlayUnit and re-solve the
        already-scheduled set around it.

        Partitions ``state.assignments`` into three groups:

        - **locked** — has a result (played) ∪ has ``actual_start_slot``
          set (started) ∪ ends before ``config.current_slot``
          (``slot_id + duration_slots <= current_slot``). Emitted as
          ``PreviousAssignment(locked=True)``.
        - **pinned** — the single ``play_unit_id`` being dragged.
          Emitted as ``PreviousAssignment(pinned_slot_id=...,
          pinned_court_id=...)``.
        - **free** — every other scheduled PlayUnit. Emitted as a plain
          ``Match`` with no ``PreviousAssignment`` — the solver
          re-places it.

        Re-solves with ``config.current_slot`` **unchanged** (this
        re-optimises the already-scheduled set; it does not advance a
        round — that is ``schedule_next_round``'s job). Writes the
        resulting assignments back into ``state.assignments``.

        Raises ``ValueError`` if ``play_unit_id`` is in the locked set —
        a played/started/past match cannot be re-pinned.
        """
        assignment = self.state.assignments.get(play_unit_id)
        if assignment is None:
            raise ValueError(
                f"play unit {play_unit_id!r} is not scheduled; cannot re-pin"
            )

        current_slot = self.config.current_slot

        def _is_locked(a: TournamentAssignment) -> bool:
            if a.play_unit_id in self.state.results:
                return True
            if a.actual_start_slot is not None:
                return True
            if a.slot_id + a.duration_slots <= current_slot:
                return True
            return False

        if _is_locked(assignment):
            raise ValueError(
                f"play unit {play_unit_id!r} is locked "
                f"(played / started / past); cannot re-pin"
            )

        previous_assignments: List[PreviousAssignment] = []
        for pu_id, a in self.state.assignments.items():
            if pu_id == play_unit_id:
                previous_assignments.append(
                    PreviousAssignment(
                        match_id=pu_id,
                        slot_id=a.slot_id,
                        court_id=a.court_id,
                        pinned_slot_id=slot_id,
                        pinned_court_id=court_id,
                    )
                )
            elif _is_locked(a):
                previous_assignments.append(
                    PreviousAssignment(
                        match_id=pu_id,
                        slot_id=a.slot_id,
                        court_id=a.court_id,
                        locked=True,
                    )
                )
            # free assignments contribute no PreviousAssignment.

        play_unit_ids = list(self.state.assignments.keys())
        problem = build_problem(
            self.state,
            play_unit_ids,
            config=self.config,
            solver_options=self.solver_options,
            previous_assignments=previous_assignments,
        )

        result = schedule(problem, options=self.solver_options)

        if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
            for solved in result.assignments:
                existing = self.state.assignments.get(solved.match_id)
                self.state.assignments[solved.match_id] = TournamentAssignment(
                    play_unit_id=solved.match_id,
                    slot_id=solved.slot_id,
                    court_id=solved.court_id,
                    duration_slots=solved.duration_slots,
                    actual_start_slot=(
                        existing.actual_start_slot if existing else None
                    ),
                    actual_end_slot=(
                        existing.actual_end_slot if existing else None
                    ),
                )

        return RoundResult(
            play_unit_ids=play_unit_ids,
            status=result.status,
            schedule_result=result,
            started_at_current_slot=current_slot,
        )
```

  Note: `actual_start_slot` / `actual_end_slot` are carried over from the prior `TournamentAssignment` so a re-pin does not silently clear started/finished metadata; a started match is in the *locked* set anyway, so the solver returns it at the same `(slot, court)`.

- [ ] **3.4 — Run the tests, confirm they pass.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k repin -q`
  Expected: `3 passed`.

- [ ] **3.5 — Run the existing bracket suite to confirm no regression** (`schedule_next_round` shares `build_problem` and the imports):
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_routes.py -q`
  Expected: all pass.

- [ ] **3.6 — Commit.**
```
git add products/scheduler/backend/services/bracket/scheduler.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py
git commit -m "feat(bracket): add TournamentDriver.repin_and_resolve

Add repin_and_resolve(play_unit_id, slot_id, court_id): partitions
state.assignments into locked (played u started u past) / pinned (the
dragged unit) / free, builds a ScheduleRequest with PreviousAssignment
hints, re-solves through the shared CP-SAT engine, and writes the
assignments back. Re-solves with config.current_slot unchanged — this
re-optimises the already-scheduled set, it does not advance a round.

Rejects a locked play_unit_id with ValueError before the partition.
Sits alongside the append-only schedule_next_round.

Sub-project #1 of the bracket court x time decomposition."
```

---

## Task 4 — `POST /tournaments/{tid}/bracket/validate` route

**Files:**
- `products/scheduler/backend/api/brackets.py` (Modify)
- `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` (Modify, Test)

### Steps

- [ ] **4.1 — Write the failing route tests.** Append to `test_bracket_interactive_scheduling.py`:

```python
# ---- POST /bracket/validate -----------------------------------------------


def _schedule_round_one(client, tid) -> dict:
    """Create a 4-entrant SE bracket and solve round one. Returns the
    TournamentDTO after schedule-next."""
    assert client.post(_bracket_url(tid), json=_se_4_body()).status_code == 200
    r = client.post(_bracket_url(tid, "schedule-next"))
    assert r.status_code == 200, r.text
    body = client.get(_bracket_url(tid)).json()
    # Two semifinals should now be assigned.
    assert len(body["assignments"]) == 2, body["assignments"]
    return body


def test_validate_feasible_move(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    target = assignments[0]
    # Move it to a clearly empty cell far from everything.
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": target["play_unit_id"],
            "slot_id": 20,
            "court_id": target["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is True
    assert payload["conflicts"] == []


def test_validate_court_overlap(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    a0, a1 = assignments[0], assignments[1]
    # Drag a1 onto a0's exact (slot, court).
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": a1["play_unit_id"],
            "slot_id": a0["slot_id"],
            "court_id": a0["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is False
    assert any(c["type"] == "court_conflict" for c in payload["conflicts"])


def test_validate_locked_match_is_infeasible(client, tid):
    """A played match is locked → /validate returns feasible:false with
    a `locked` conflict (locked matches are not draggable)."""
    body = _schedule_round_one(client, tid)
    sf = body["assignments"][0]
    # Record a result for that semifinal → it is now locked.
    rec = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf["play_unit_id"], "winner_side": "A"},
    )
    assert rec.status_code == 200, rec.text
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": sf["play_unit_id"],
            "slot_id": 30,
            "court_id": 1,
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is False
    assert any(c["type"] == "locked" for c in payload["conflicts"])


def test_validate_404_when_no_bracket(client, tid):
    r = client.post(
        _bracket_url(tid, "validate"),
        json={"play_unit_id": "M1", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_validate_404_for_unknown_play_unit(client, tid):
    _schedule_round_one(client, tid)
    r = client.post(
        _bracket_url(tid, "validate"),
        json={"play_unit_id": "GHOST", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404
```

- [ ] **4.2 — Run the tests, confirm they fail.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k "validate_feasible or validate_court_overlap or validate_locked or validate_404" -q`
  Expected failure: `404` for the route path itself (route not registered) — the assertions on `feasible` will not be reached. (`test_validate_404_when_no_bracket` may coincidentally pass for the wrong reason; that is fine — it will pass for the right reason after 4.3.)

- [ ] **4.3 — Add the DTOs and the `/validate` route to `api/brackets.py`.**
  - Add the validation-module import near the other `services.bracket` imports (top of file, after the `from services.bracket.state import ...` line):
```python
from services.bracket.validation import BracketConflict, validate_bracket_move
```
  - Add the four Pydantic models after `MatchActionIn` (after line 221):
```python
class BracketValidateIn(BaseModel):
    """A single proposed drag target evaluated by /bracket/validate."""
    play_unit_id: str
    slot_id: int
    court_id: int


class BracketPinIn(BaseModel):
    """A single proposed drag target committed by /bracket/pin."""
    play_unit_id: str
    slot_id: int
    court_id: int


class BracketValidationConflictOut(BaseModel):
    """One reason a proposed bracket move is infeasible.

    Snake-case sibling of the meet's ``ValidationConflict`` — the
    bracket API surface is snake_case throughout.
    """
    type: str
    description: str
    play_unit_id: Optional[str] = None
    other_play_unit_id: Optional[str] = None
    player_id: Optional[str] = None
    court_id: Optional[int] = None
    slot_id: Optional[int] = None


class BracketValidationOut(BaseModel):
    feasible: bool
    conflicts: List[BracketValidationConflictOut] = Field(default_factory=list)
```
  - Add the `_bracket_locked_play_unit_ids` helper after `_finished_play_unit_ids` (after line 656):
```python
def _bracket_locked_play_unit_ids(
    state: TournamentState, current_slot: int
) -> Set[str]:
    """PlayUnits whose assignment is locked: played (has a result) ∪
    started (``actual_start_slot`` set) ∪ past (ends at or before
    ``current_slot``). Mirrors the partition rule in
    ``TournamentDriver.repin_and_resolve``."""
    locked: Set[str] = set()
    for a in state.assignments.values():
        if a.play_unit_id in state.results:
            locked.add(a.play_unit_id)
        elif a.actual_start_slot is not None:
            locked.add(a.play_unit_id)
        elif a.slot_id + a.duration_slots <= current_slot:
            locked.add(a.play_unit_id)
    return locked
```
  - Add the route after `match_action` (after line 1097):
```python
@router.post(
    "/validate", response_model=BracketValidationOut, dependencies=[_VIEWER]
)
def validate_bracket_move_route(
    body: BracketValidateIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> BracketValidationOut:
    """Cheap (pure-Python) feasibility check for a drag-to-reschedule
    move on the bracket Schedule Gantt.

    No CP-SAT invocation — splices the proposed ``(slot_id, court_id)``
    for ``play_unit_id`` into the session's current assignment set and
    runs ``validate_bracket_move``. A *locked* (played / started / past)
    PlayUnit is not draggable: it returns ``feasible: false`` with a
    ``locked`` conflict rather than running the full check.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    if body.play_unit_id not in session.state.play_units:
        raise HTTPException(
            status_code=404,
            detail=f"play_unit {body.play_unit_id!r} not found",
        )

    locked_ids = _bracket_locked_play_unit_ids(
        session.state, session.config.current_slot
    )
    if body.play_unit_id in locked_ids:
        return BracketValidationOut(
            feasible=False,
            conflicts=[
                BracketValidationConflictOut(
                    type="locked",
                    description=(
                        f"Play unit {body.play_unit_id} is locked "
                        f"(played / started / past) and cannot be moved"
                    ),
                    play_unit_id=body.play_unit_id,
                )
            ],
        )

    conflicts: List[BracketConflict] = validate_bracket_move(
        session.state,
        session.config,
        play_unit_id=body.play_unit_id,
        slot_id=body.slot_id,
        court_id=body.court_id,
    )
    return BracketValidationOut(
        feasible=not conflicts,
        conflicts=[
            BracketValidationConflictOut(
                type=c.type,
                description=c.description,
                play_unit_id=c.play_unit_id,
                other_play_unit_id=c.other_play_unit_id,
                player_id=c.player_id,
                court_id=c.court_id,
                slot_id=c.slot_id,
            )
            for c in conflicts
        ],
    )
```

- [ ] **4.4 — Run the tests, confirm they pass.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k "validate_feasible or validate_court_overlap or validate_locked or validate_404" -q`
  Expected: `5 passed`.

- [ ] **4.5 — Commit.**
```
git add products/scheduler/backend/api/brackets.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py
git commit -m "feat(bracket): add POST /bracket/validate route

Add the snake-case BracketValidateIn / BracketValidationOut DTOs and
the POST /tournaments/{tid}/bracket/validate route: hydrates the
session, rejects a locked (played/started/past) play_unit with a
feasible:false + `locked` conflict, otherwise runs the pure-Python
validate_bracket_move against the full current assignment set.

404s on no-bracket and unknown play_unit. Viewer-gated.

Sub-project #1 of the bracket court x time decomposition."
```

---

## Task 5 — `POST /tournaments/{tid}/bracket/pin` route + the validate↔pin contract test

**Files:**
- `products/scheduler/backend/api/brackets.py` (Modify)
- `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` (Modify, Test)

### Steps

- [ ] **5.1 — Write the failing route tests, including the validate↔pin contract test.** Append to `test_bracket_interactive_scheduling.py`:

```python
# ---- POST /bracket/pin ----------------------------------------------------


def test_pin_lands_target_and_persists(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    target = assignments[0]
    r = client.post(
        _bracket_url(tid, "pin"),
        json={
            "play_unit_id": target["play_unit_id"],
            "slot_id": 10,
            "court_id": target["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    pinned = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == target["play_unit_id"]
    )
    assert pinned["slot_id"] == 10
    assert pinned["court_id"] == target["court_id"]
    # Persisted: a fresh GET sees the re-pin.
    after = client.get(_bracket_url(tid)).json()
    pinned_after = next(
        a for a in after["assignments"]
        if a["play_unit_id"] == target["play_unit_id"]
    )
    assert pinned_after["slot_id"] == 10


def test_pin_keeps_locked_match_fixed(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    locked_pu, free_pu = assignments[0], assignments[1]
    # Record a result for locked_pu → locked.
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": locked_pu["play_unit_id"], "winner_side": "A"},
    )
    locked_slot = locked_pu["slot_id"]
    locked_court = locked_pu["court_id"]
    # Re-pin the *free* match elsewhere.
    r = client.post(
        _bracket_url(tid, "pin"),
        json={
            "play_unit_id": free_pu["play_unit_id"],
            "slot_id": 7,
            "court_id": free_pu["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    locked_after = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == locked_pu["play_unit_id"]
    )
    assert locked_after["slot_id"] == locked_slot
    assert locked_after["court_id"] == locked_court
    free_after = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == free_pu["play_unit_id"]
    )
    assert free_after["slot_id"] == 7


def test_pin_409_when_play_unit_locked(client, tid):
    body = _schedule_round_one(client, tid)
    sf = body["assignments"][0]
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf["play_unit_id"], "winner_side": "A"},
    )
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": sf["play_unit_id"], "slot_id": 12, "court_id": 1},
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "locked"


def test_pin_404_when_no_bracket(client, tid):
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": "M1", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_pin_404_for_unknown_play_unit(client, tid):
    _schedule_round_one(client, tid)
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": "GHOST", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_pin_409_for_unscheduled_play_unit(client, tid):
    """A real PlayUnit that isn't in state.assignments yet (e.g. the
    final, awaiting feeders) cannot be pinned — it is not on the
    Gantt. repin_and_resolve raises ValueError → 409 infeasible."""
    body = _schedule_round_one(client, tid)
    final = next(
        p for p in body["play_units"] if p["round_index"] == 1
    )
    assert final["id"] not in {
        a["play_unit_id"] for a in body["assignments"]
    }
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": final["id"], "slot_id": 30, "court_id": 1},
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "infeasible"


# ---- The validate <-> pin contract ----------------------------------------


def test_validate_pin_contract_conservative_but_sound(client, tid):
    """Drag a match onto a cell occupied only by a *movable* match:
    /validate reports feasible:false (correct over-conservatism — it
    cannot see that a re-solve would vacate the cell), yet /pin for the
    same move *succeeds* (the re-solve relocates the movable match).

    This is the test that makes the meet-faithful conservatism a
    guarantee rather than a comment: the asymmetry that must never
    happen is the reverse — feasible:true that /pin then rejects."""
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    a0, a1 = assignments[0], assignments[1]
    # a0 and a1 share no players (distinct semifinals), so a0's cell is
    # blocked for a1 only by a *movable* match.
    move = {
        "play_unit_id": a1["play_unit_id"],
        "slot_id": a0["slot_id"],
        "court_id": a0["court_id"],
    }

    # /validate: conservative → infeasible (court_conflict with a0).
    v = client.post(_bracket_url(tid, "validate"), json=move)
    assert v.status_code == 200, v.text
    v_payload = v.json()
    assert v_payload["feasible"] is False
    assert any(c["type"] == "court_conflict" for c in v_payload["conflicts"])

    # /pin: the same move succeeds — the re-solve relocates a0.
    p = client.post(_bracket_url(tid, "pin"), json=move)
    assert p.status_code == 200, p.text
    p_payload = p.json()
    pinned = next(
        a for a in p_payload["assignments"]
        if a["play_unit_id"] == a1["play_unit_id"]
    )
    assert pinned["slot_id"] == a0["slot_id"]
    assert pinned["court_id"] == a0["court_id"]
    # a0 was relocated off its old cell (movable, no result).
    moved = next(
        a for a in p_payload["assignments"]
        if a["play_unit_id"] == a0["play_unit_id"]
    )
    assert (moved["slot_id"], moved["court_id"]) != (
        a0["slot_id"], a0["court_id"]
    )
```

- [ ] **5.2 — Run the tests, confirm they fail.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k "pin or contract" -q`
  Expected failure: the `/pin` route is unregistered → `404` on the route path; the `feasible`/`409`/`slot_id` assertions are not reached. (`test_pin_404_when_no_bracket` and `test_pin_404_for_unknown_play_unit` may pass for the wrong reason; correct after 5.3.)

- [ ] **5.3 — Add the `/pin` route to `api/brackets.py`.**
  - Add the driver imports near the existing `from services.bracket import (...)` block. `TournamentDriver` is already imported; add `SolverStatus` — already imported from `scheduler_core.domain.models` (line 52–56 already imports `SolverStatus`). Confirm `SolverOptions` is imported — line 52–56 imports `SolverOptions`. No new imports needed for the driver itself.
  - Add the route after `validate_bracket_move_route` (the route added in Task 4):
```python
@router.post(
    "/pin", response_model=TournamentOut, dependencies=[_OPERATOR]
)
def pin_bracket_match(
    body: BracketPinIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Re-pin one already-scheduled PlayUnit and re-solve the
    already-scheduled set around it via the shared CP-SAT engine.

    Partitions ``state.assignments`` into locked / pinned / free,
    re-solves with ``current_slot`` unchanged, writes the resulting
    assignments back, persists, and returns the serialized session
    (same shape ``/results`` and ``/match-action`` return).

    A *locked* (played / started / past) ``play_unit_id`` is rejected
    with ``409 {"error": "locked"}`` **before** the partition. A
    solver INFEASIBLE / UNKNOWN result (including timeout) is reported
    as ``409 {"error": "infeasible"}`` — surfaced to the operator, not
    a crash.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    if body.play_unit_id not in session.state.play_units:
        raise HTTPException(
            status_code=404,
            detail=f"play_unit {body.play_unit_id!r} not found",
        )

    # Reject a locked play_unit BEFORE the partition / feasibility
    # check so the frontend gets an unambiguous 409 rather than an
    # `infeasible` response.
    locked_ids = _bracket_locked_play_unit_ids(
        session.state, session.config.current_slot
    )
    if body.play_unit_id in locked_ids:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "locked",
                "message": (
                    f"play_unit {body.play_unit_id!r} is locked "
                    f"(played / started / past) and cannot be re-pinned"
                ),
            },
        )

    tournament = repo.tournaments.get_by_id(tournament_id)
    session_cfg = (
        (tournament.data or {}).get("bracket_session") if tournament else None
    ) or {}
    time_limit_seconds = float(session_cfg.get("time_limit_seconds", 5.0))

    driver = TournamentDriver(
        state=session.state,
        config=session.config,
        solver_options=SolverOptions(
            time_limit_seconds=time_limit_seconds,
        ),
        rest_between_rounds=session.rest_between_rounds,
    )
    try:
        result = driver.repin_and_resolve(
            body.play_unit_id,
            slot_id=body.slot_id,
            court_id=body.court_id,
        )
    except ValueError as exc:
        # repin_and_resolve raises ValueError for an unscheduled or
        # locked play_unit. The locked case is caught above; an
        # unscheduled real play_unit (e.g. the final, awaiting feeders)
        # cannot be pinned — surface it as infeasible.
        raise HTTPException(
            status_code=409,
            detail={"error": "infeasible", "reasons": [str(exc)]},
        )

    if not result.scheduled:
        reasons = (
            list(result.schedule_result.infeasible_reasons)
            if result.schedule_result is not None
            else []
        )
        raise HTTPException(
            status_code=409,
            detail={
                "error": "infeasible",
                "reasons": reasons or [
                    f"solver returned {result.status.value}"
                ],
            },
        )

    _persist_session_metadata(repo, tournament_id, session=session)
    return _serialize_session(session)
```

- [ ] **5.4 — Run the tests, confirm they pass.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py -k "pin or contract" -q`
  Expected: `7 passed`.

- [ ] **5.5 — Run the full new test file plus the existing bracket suite.**
  Command: `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py tests/unit/test_bracket_routes.py tests/unit/test_bracket_repository.py -q`
  Expected: all pass.

- [ ] **5.6 — Commit.**
```
git add products/scheduler/backend/api/brackets.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py
git commit -m "feat(bracket): add POST /bracket/pin route + validate-pin contract test

Add the POST /tournaments/{tid}/bracket/pin route: hydrates the
session, rejects a locked play_unit with 409 {error: locked} before
the partition, drives TournamentDriver.repin_and_resolve, and on a
solver INFEASIBLE/UNKNOWN result (including timeout) returns 409
{error: infeasible} — surfaced to the operator, not a crash. On
success, persists and returns the serialized session.

Includes the affirmative validate<->pin contract test: a drag onto a
cell blocked only by a movable match -> /validate says feasible:false
(correct over-conservatism), /pin for the same move succeeds (the
re-solve relocates the movable match).

Sub-project #1 of the bracket court x time decomposition."
```

---

## Task 6 — Frontend API-client wiring (no UI)

**Files:**
- `products/scheduler/frontend/src/api/bracketDto.ts` (Modify)
- `products/scheduler/frontend/src/api/client.ts` (Modify)
- `products/scheduler/frontend/src/api/bracketClient.tsx` (Modify)

### Steps

- [ ] **6.1 — Add the DTO types to `bracketDto.ts`.** Append after `BracketImportCsvParams` (after line 129):
```typescript
// ---- Interactive scheduling (sub-project #1) -------------------------------
// Wire types for POST /tournaments/{tid}/bracket/validate and /pin.
// Snake_case to match the bracket API surface (see api/brackets.py).

export interface BracketValidateIn {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
}

export interface BracketPinIn {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
}

export interface BracketValidationConflict {
  type: string;
  description: string;
  play_unit_id: string | null;
  other_play_unit_id: string | null;
  player_id: string | null;
  court_id: number | null;
  slot_id: number | null;
}

export interface BracketValidationOut {
  feasible: boolean;
  conflicts: BracketValidationConflict[];
}
```

- [ ] **6.2 — Add the client methods to `client.ts`.** Extend the `bracketDto` import block (lines 40–44) to add the new types:
```typescript
  BracketCreateIn,
  BracketTournamentDTO,
  BracketScheduleNextOut,
  BracketImportCsvParams,
  BracketValidateIn,
  BracketPinIn,
  BracketValidationOut,
} from './bracketDto';
```
  Then add the two methods inside the brackets block, after `bracketMatchAction` (after line 978):
```typescript
  async validateBracketMove(
    tid: string,
    body: BracketValidateIn,
  ): Promise<BracketValidationOut> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/validate`,
      body,
    );
    return response.data;
  }

  async pinBracketMatch(
    tid: string,
    body: BracketPinIn,
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/pin`,
      body,
    );
    return response.data;
  }
```

- [ ] **6.3 — Add `validateMove` / `pinMatch` to `bracketClient.tsx`.** Extend the type import (lines 16–22) to add the new types:
```typescript
import type {
  BracketCreateIn,
  BracketTournamentDTO,
  BracketScheduleNextOut,
  BracketImportCsvParams,
  BracketValidateIn,
  BracketPinIn,
  BracketValidationOut,
  WinnerSide,
} from './bracketDto';
```
  Add to the `BracketApi` interface, after `matchAction` (after line 40):
```typescript
  validateMove: (body: BracketValidateIn) => Promise<BracketValidationOut>;
  pinMatch: (body: BracketPinIn) => Promise<BracketTournamentDTO>;
```
  Add to the `BracketApiProvider` `value` object, after the `matchAction` line (after line 68):
```typescript
      validateMove: (body) => apiClient.validateBracketMove(tournamentId, body),
      pinMatch: (body) => apiClient.pinBracketMatch(tournamentId, body),
```

- [ ] **6.4 — Type-check the frontend.**
  Command: `cd products/scheduler/frontend && npx tsc -b`
  Expected: exit 0, no output. (`package.json` has no standalone `typecheck` script — `build` is `tsc -b && vite build`; `tsc -b` alone is the type-check-only step. Verified against this repo during plan finalisation.)

- [ ] **6.5 — Commit.**
```
git add products/scheduler/frontend/src/api/bracketDto.ts products/scheduler/frontend/src/api/client.ts products/scheduler/frontend/src/api/bracketClient.tsx
git commit -m "feat(bracket): wire validate/pin into the bracket API client

Add BracketValidateIn / BracketPinIn / BracketValidationConflict /
BracketValidationOut DTO types, the apiClient.validateBracketMove and
apiClient.pinBracketMatch methods, and the validateMove / pinMatch
entries on the BracketApi context. Thin client wiring only — the
interactive Gantt UI is sub-project #3.

Sub-project #1 of the bracket court x time decomposition."
```

---

## Final verification

- [ ] **Run the full backend test suite for the affected areas:**
  `cd products/scheduler && python -m pytest tests/unit/test_bracket_interactive_scheduling.py tests/unit/test_bracket_routes.py tests/unit/test_bracket_repository.py tests/test_core_smoke.py tests/unit/test_solver_locking.py -q`
  Expected: all pass — the existing bracket pytest suite stays green (spec "Testing", last bullet).

---

## Self-review

### Spec-coverage check (every spec section → a task)

| Spec section | Covered by |
|---|---|
| `POST /bracket/validate` — request `{play_unit_id, slot_id, court_id}`, response `{feasible, conflicts}`, pure-Python, hydrate + splice | Task 2 (`validate_bracket_move`), Task 4 (route + DTOs) |
| `/validate` feasibility = `find_conflicts` subset + draw-dependency ordering, checked against full current assignment set | Task 2 (`validate_bracket_move` calls `find_conflicts`, adds `dependency_order`, iterates `state.assignments`) |
| `/validate` locked match → `feasible:false` + `locked` conflict | Task 4 (`_bracket_locked_play_unit_ids` short-circuit) |
| `POST /bracket/pin` — request `{play_unit_id, slot_id, court_id}`, response `TournamentDTO` | Task 5 (route, `response_model=TournamentOut`) |
| `/pin` partition locked / pinned / free | Task 3 (`repin_and_resolve` partition logic) |
| `/pin` re-solve with `current_slot` unchanged | Task 3 (uses `self.config.current_slot`, no `advance_current_slot`); locked decision #2/#4 |
| `/pin` reject locked `play_unit_id` with 409 **before** partition | Task 5 (route checks `_bracket_locked_play_unit_ids` before constructing driver); Task 3 also raises `ValueError` as defence-in-depth |
| validate↔pin contract: `feasible:true` reliably → `/pin` succeeds; conservative-but-sound | Task 5 `test_validate_pin_contract_conservative_but_sound` (the affirmative contract test from the spec) |
| Dependency ordering is forward-only | Task 2 (`validate_bracket_move` checks only `pu.dependencies` feeders' end-slots; docstring states the reverse cannot arise) |
| `services/bracket/validation.py` *(new)* | Task 2 |
| `services/bracket/adapter.py` — emit `PreviousAssignment`s | Task 1 |
| `services/bracket/scheduler.py` — `repin_and_resolve` | Task 3 |
| `api/brackets.py` — two routes + Pydantic models | Tasks 4, 5 |
| `frontend/src/api/bracketClient.tsx` + `bracketDto.ts` — two client methods + DTO types | Task 6 (also `client.ts`, which the spec table folds into "bracketClient") |
| Transient pins — no new `locked`/`pinned_*` serialization on `TournamentAssignment` | No task adds serialization; `_persist_session_metadata` (unchanged) only writes `slot_id/court_id/duration_slots/actual_*`. Confirmed: Task 3 writes back plain `TournamentAssignment`s with no `locked`/`pinned_*` fields set. |
| Solver timeout on `/pin` → `infeasible`, surfaced not crashed | Task 5 (`if not result.scheduled` → `409 {"error": "infeasible"}`); locked decision #1 |
| Out of scope: freeze-horizon, breaks/closures, Gantt UI | Not implemented — no task touches them. |
| Testing: `/validate` feasible + one infeasible per conflict type + locked drag | Task 2 (court/player/rest/dependency at service level), Task 4 (court overlap + locked at route level) |
| Testing: `/pin` re-solve correctness + 409 locked | Task 3 (service: pinned lands, locked fixed, free re-optimised, 409-equivalent `ValueError`), Task 5 (route: same + `409 {"error":"locked"}`) |
| Testing: existing bracket suite stays green | Steps 1.5, 3.5, 5.5, Final verification |

### Placeholder scan

No `TBD`, no "add error handling", no "similar to Task N", no references to undefined symbols. Every code block is complete: full function bodies, full Pydantic models, full test bodies with concrete assertions.

### Type / name consistency

- `build_problem(... previous_assignments=...)` — defined Task 1, called Task 3. Match.
- `expand_side` / `build_players` — renamed Task 1, imported Task 2. Match.
- `BracketConflict` — defined Task 2, imported and used Task 4. Match.
- `validate_bracket_move` — defined Task 2, imported and called Task 4. Match.
- `repin_and_resolve` — defined Task 3, called Task 5. Match (`play_unit_id` positional, `slot_id` / `court_id` kw).
- `BracketValidateIn`, `BracketPinIn`, `BracketValidationConflictOut`, `BracketValidationOut` — defined Task 4, used Tasks 4 & 5. `_bracket_locked_play_unit_ids` — defined Task 4, used Tasks 4 & 5. Match.
- Frontend: `BracketValidateIn` / `BracketPinIn` / `BracketValidationConflict` / `BracketValidationOut` — defined Task 6.1, imported Task 6.2 (`client.ts`) and Task 6.3 (`bracketClient.tsx`). Match. (Note: the TS interface names intentionally mirror the Python class concepts but `BracketValidationConflict` (TS) vs `BracketValidationConflictOut` (Py) differ by the `Out` suffix — this is fine, they are separate codebases; within each codebase the names are internally consistent.)
- `RoundResult` — reused from existing `scheduler.py` for `repin_and_resolve`'s return; `.scheduled` property already exists (`status in (OPTIMAL, FEASIBLE)`), used in Task 5.

### Flagged uncertainties (honest gaps)

1. **Frontend type-check command (Step 6.4)** — resolved during plan finalisation: `products/scheduler/frontend/package.json` has no standalone `typecheck` script; `npx tsc -b` (the type-check half of `build`) is the verified command. Step 6.4 updated accordingly. The test-helper API (`tests/_helpers.py` `isolate_test_database` / `seed_tournament`) was also verified — the Task 1.1 fixture matches `test_bracket_routes.py` exactly.
2. **`test_pin_keeps_locked_match_fixed` / contract test slot choices** — these assume the 4-entrant SE round-one solve places the two semis at distinct courts in `slot 0` (the natural optimum for an empty 2-court day). If the solver's objective places them differently, the tests still hold structurally (they read `a0`/`a1` from the actual response and re-pin relative to those), but the specific re-pin target slots (`7`, `10`, `30`) assume `total_slots=64` headroom — safe. The contract test's "`a0` was relocated" assertion assumes the solver *will* move a movable match out of a pinned match's way rather than leaving the problem infeasible; this is the spec's stated guarantee and `LocksAndPins` enforces the pin as a hard constraint, so a `FEASIBLE`/`OPTIMAL` result necessarily vacates the cell. If the engine ever returned `INFEASIBLE` here it would be a real engine bug the test should catch.
3. **`current_slot` always 0 today** — confirmed via `_hydrate_session` (it never sets `ScheduleConfig.current_slot`, which defaults to 0). The "past" locked criterion (`slot_id + duration_slots <= current_slot`) is therefore inert in current sessions but implemented exactly as the spec describes; it activates for free once a playhead is wired into `_hydrate_session` in a later sub-project. No test exercises the "past" branch in isolation because no route currently sets a non-zero `current_slot` — flagged so the worker does not write an unreachable test for it.