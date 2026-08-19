"""Direct tests for the scheduler-core ``find_conflicts`` helper.

The helper feeds two callers:
  - ``verify_schedule`` (post-solve safety net inside the solver), and
  - the ``/schedule/validate`` endpoint via the API adapter.

Both callers must reject placements that overlap a court closure.
This file uses the domain types directly so it doesn't depend on
the FastAPI test client.
"""
from __future__ import annotations

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    ScheduleConfig,
)
from scheduler_core.engine.validation import find_conflicts


def _config(**overrides) -> ScheduleConfig:
    base = dict(
        total_slots=8,
        court_count=4,
        interval_minutes=30,
        default_rest_slots=0,
    )
    base.update(overrides)
    return ScheduleConfig(**base)


def _match(mid: str, *, duration: int = 1) -> Match:
    return Match(id=mid, event_code="MS", duration_slots=duration, side_a=["pA"], side_b=["pB"])


def _player(pid: str) -> Player:
    return Player(id=pid, name=pid.upper(), availability=[], rest_slots=0)


def test_find_conflicts_flags_overlap_with_time_bounded_closure():
    config = _config(closed_court_windows=[(2, 4, 6)])  # court 2 closed slots 4–6
    matches = {"m1": _match("m1")}
    players = {"pA": _player("pA"), "pB": _player("pB")}
    # Place m1 at slot 4 on court 2 — directly inside the closure.
    conflicts = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=[Assignment(match_id="m1", slot_id=4, court_id=2, duration_slots=1)],
    )
    assert any(c.type == "court_closed" for c in conflicts)
    closure = next(c for c in conflicts if c.type == "court_closed")
    assert closure.court_id == 2
    assert closure.match_id == "m1"


def test_find_conflicts_passes_outside_closure_window():
    config = _config(closed_court_windows=[(2, 4, 6)])
    matches = {"m1": _match("m1")}
    players = {"pA": _player("pA"), "pB": _player("pB")}
    # Place m1 at slot 0 on court 2 — well before the closure.
    conflicts = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=[Assignment(match_id="m1", slot_id=0, court_id=2, duration_slots=1)],
    )
    assert not any(c.type == "court_closed" for c in conflicts)


def test_find_conflicts_legacy_closed_court_ids_treated_as_full_day():
    config = _config(closed_court_ids=[3])
    matches = {"m1": _match("m1")}
    players = {"pA": _player("pA"), "pB": _player("pB")}
    # Court 3 is closed for the entire day → any placement on it
    # registers a court_closed conflict regardless of slot.
    conflicts = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=[Assignment(match_id="m1", slot_id=2, court_id=3, duration_slots=1)],
    )
    assert any(c.type == "court_closed" and c.court_id == 3 for c in conflicts)


def test_find_conflicts_match_spanning_into_closure_caught():
    """A 2-slot match starting at slot 3 ends at slot 5 — overlapping
    a [4, 6) closure. The half-open overlap test must catch it."""
    config = _config(closed_court_windows=[(1, 4, 6)])
    matches = {"m1": _match("m1", duration=2)}
    players = {"pA": _player("pA"), "pB": _player("pB")}
    conflicts = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=[Assignment(match_id="m1", slot_id=3, court_id=1, duration_slots=2)],
    )
    assert any(c.type == "court_closed" for c in conflicts)
