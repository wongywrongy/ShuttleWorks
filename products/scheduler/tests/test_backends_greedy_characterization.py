"""Characterization / golden-master tests for ``GreedyBackend.solve``.

SP-REFACTOR Phase 7 (CODE_HEALTH.md Part 2, "cover before you modify"). These
freeze the *current* behavior of the greedy backend — bugs and quirks included —
so any future decomposition has a tripwire. They are scaffolding (Feathers),
brittle by design; expect to rewrite some if/when the function is decomposed.

Context (see docs/audits/07-locked-functions.md): ``GreedyBackend`` is a
pluggable *fallback* backend with no in-repo production caller (the live path
uses ``CPSATBackend``). ``solve`` is a pure, deterministic function of its
``request`` — it iterates ``request.matches`` in list order and mutates only
local state, so these assertions are stable (no CP-SAT seed concern).
"""
from scheduler_core.domain.models import (
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverStatus,
)
from scheduler_core.engine.backends import GreedyBackend, _player_ids


def _config(**overrides) -> ScheduleConfig:
    base = {"total_slots": 10, "court_count": 2}
    base.update(overrides)
    return ScheduleConfig(**base)


def _solve(config, players, matches, previous=None) -> "object":
    request = ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        previous_assignments=previous or [],
    )
    return GreedyBackend().solve(request)


# --------------------------------------------------------------------------- #
# Basic greedy placement
# --------------------------------------------------------------------------- #

def test_single_match_placed_at_first_cell():
    players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
    matches = [Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"])]

    result = _solve(_config(), players, matches)

    assert result.status == SolverStatus.FEASIBLE
    assert len(result.assignments) == 1
    a = result.assignments[0]
    assert (a.match_id, a.slot_id, a.court_id, a.duration_slots) == ("m1", 0, 1, 1)
    assert a.moved is False
    assert a.previous_slot_id is None and a.previous_court_id is None
    # Result-level invariants the greedy backend hard-codes.
    assert result.moved_count == 0
    assert result.locked_count == 0
    assert result.runtime_ms == 0.0
    assert result.soft_violations == []
    assert result.unscheduled_matches == []


def test_shared_player_forced_into_later_slot():
    """Two matches sharing p1 land in different slots (non-overlap enforced)."""
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS", side_a=["p1"], side_b=["p3"]),
    ]

    result = _solve(_config(court_count=2), players, matches)

    pos = {a.match_id: (a.slot_id, a.court_id) for a in result.assignments}
    assert pos == {"m1": (0, 1), "m2": (1, 1)}
    assert result.status == SolverStatus.FEASIBLE


def test_court_capacity_one_court_serializes():
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3", "p4")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS", side_a=["p3"], side_b=["p4"]),
    ]

    result = _solve(_config(court_count=1, total_slots=5), players, matches)

    pos = {a.match_id: (a.slot_id, a.court_id) for a in result.assignments}
    assert pos == {"m1": (0, 1), "m2": (1, 1)}


def test_multi_slot_match_occupies_consecutive_cells():
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3", "p4")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"], duration_slots=3),
        Match(id="m2", event_code="MS", side_a=["p3"], side_b=["p4"]),
    ]

    result = _solve(_config(court_count=1, total_slots=10), players, matches)

    pos = {a.match_id: (a.slot_id, a.court_id, a.duration_slots) for a in result.assignments}
    # m1 occupies slots 0,1,2 on court 1; m2 takes the next free cell (slot 3).
    assert pos["m1"] == (0, 1, 3)
    assert pos["m2"] == (3, 1, 1)


# --------------------------------------------------------------------------- #
# Locks and the freeze horizon
# --------------------------------------------------------------------------- #

def test_locked_previous_assignment_is_pinned():
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3", "p4")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS", side_a=["p3"], side_b=["p4"]),
    ]
    previous = [PreviousAssignment(match_id="m1", slot_id=5, court_id=2, locked=True)]

    result = _solve(_config(total_slots=10, court_count=2), players, matches, previous)

    pos = {a.match_id: (a.slot_id, a.court_id) for a in result.assignments}
    assert pos["m1"] == (5, 2)  # pinned at its previous cell
    assert pos["m2"] == (0, 1)  # freely placed around it
    # A pinned locked assignment is reported as moved=False.
    m1 = next(a for a in result.assignments if a.match_id == "m1")
    assert m1.moved is False
    assert result.locked_count == 1


def test_freeze_horizon_implicitly_locks_near_term_prev():
    """A non-locked prev inside [current, current+freeze) is treated as locked."""
    players = [Player(id="p1", name="p1"), Player(id="p2", name="p2")]
    matches = [Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"])]
    previous = [PreviousAssignment(match_id="m1", slot_id=2, court_id=1, locked=False)]

    result = _solve(
        _config(current_slot=0, freeze_horizon_slots=4), players, matches, previous
    )

    a = result.assignments[0]
    assert (a.slot_id, a.court_id) == (2, 1)  # pinned by the freeze horizon
    assert a.moved is False
    assert result.locked_count == 1  # counted as locked


def test_prev_outside_freeze_horizon_is_replaced_and_counted_moved():
    players = [Player(id="p1", name="p1"), Player(id="p2", name="p2")]
    matches = [Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"])]
    previous = [PreviousAssignment(match_id="m1", slot_id=6, court_id=1, locked=False)]

    # freeze_horizon_slots=0 -> freeze_until=0 -> slot 6 is NOT frozen/locked.
    result = _solve(_config(freeze_horizon_slots=0), players, matches, previous)

    a = result.assignments[0]
    assert (a.slot_id, a.court_id) == (0, 1)  # greedily re-placed at the front
    assert a.moved is True
    assert a.previous_slot_id == 6 and a.previous_court_id == 1
    assert result.moved_count == 1
    assert result.locked_count == 0


def test_prev_at_same_cell_is_not_counted_moved():
    players = [Player(id="p1", name="p1"), Player(id="p2", name="p2")]
    matches = [Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"])]
    previous = [PreviousAssignment(match_id="m1", slot_id=0, court_id=1, locked=False)]

    result = _solve(_config(freeze_horizon_slots=0), players, matches, previous)

    a = result.assignments[0]
    assert (a.slot_id, a.court_id) == (0, 1)
    assert a.moved is False
    # previous_* are recorded even when the match did not move.
    assert a.previous_slot_id == 0 and a.previous_court_id == 1
    assert result.moved_count == 0


def test_locked_placements_skip_feasibility_and_may_overlap():
    """Quirk pinned: Loop 1 places locked prevs with NO feasibility check, so two
    locked matches can be pinned onto the same court+slot (they overlap)."""
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3", "p4")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS", side_a=["p3"], side_b=["p4"]),
    ]
    previous = [
        PreviousAssignment(match_id="m1", slot_id=0, court_id=1, locked=True),
        PreviousAssignment(match_id="m2", slot_id=0, court_id=1, locked=True),
    ]

    result = _solve(_config(), players, matches, previous)

    pos = {a.match_id: (a.slot_id, a.court_id) for a in result.assignments}
    assert pos == {"m1": (0, 1), "m2": (0, 1)}  # both pinned onto the same cell
    assert result.status == SolverStatus.FEASIBLE
    assert result.locked_count == 2


def test_locked_prev_that_does_not_fit_falls_through_to_greedy():
    players = [Player(id="p1", name="p1"), Player(id="p2", name="p2")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"], duration_slots=3)
    ]
    # prev slot 9 + duration 3 = 12 > total_slots 10 -> cannot pin, greedy instead.
    previous = [PreviousAssignment(match_id="m1", slot_id=9, court_id=1, locked=True)]

    result = _solve(_config(total_slots=10), players, matches, previous)

    a = result.assignments[0]
    assert (a.slot_id, a.court_id) == (0, 1)  # re-placed greedily
    assert a.moved is True
    assert result.locked_count == 1  # still counted as locked
    assert result.moved_count == 1


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #

def test_availability_window_delays_placement():
    players = [
        Player(id="p1", name="p1", availability=[(3, 6)]),
        Player(id="p2", name="p2"),
    ]
    matches = [Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"])]

    result = _solve(_config(total_slots=10, court_count=1), players, matches)

    a = result.assignments[0]
    assert a.slot_id == 3  # first slot inside p1's only availability window


def test_availability_requires_a_single_covering_window():
    """Quirk pinned: availability is satisfied only if ONE window fully covers the
    duration — a match cannot straddle two adjacent windows."""
    players = [
        Player(id="p1", name="p1", availability=[(3, 5), (5, 8)]),
        Player(id="p2", name="p2"),
    ]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"], duration_slots=3)
    ]

    result = _solve(_config(total_slots=10, court_count=1), players, matches)

    a = result.assignments[0]
    # slots 3,4,5 are covered by the UNION of the two windows, but no single
    # window covers all three -> the first valid start is slot 5 (window [5,8)).
    assert a.slot_id == 5


# --------------------------------------------------------------------------- #
# Infeasibility
# --------------------------------------------------------------------------- #

def test_unschedulable_match_reported_infeasible():
    players = [Player(id=p, name=p) for p in ("p1", "p2", "p3")]
    matches = [
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS", side_a=["p1"], side_b=["p3"]),
    ]

    # 1 slot, 1 court, and p1 in both -> only one can be placed.
    result = _solve(_config(total_slots=1, court_count=1), players, matches)

    assert result.status == SolverStatus.INFEASIBLE
    assert result.unscheduled_matches == ["m2"]
    assert len(result.infeasible_reasons) == 1
    assert "Greedy backend could not place" in result.infeasible_reasons[0]
    assert [a.match_id for a in result.assignments] == ["m1"]


# --------------------------------------------------------------------------- #
# Helper
# --------------------------------------------------------------------------- #

def test_player_ids_unions_both_sides():
    m = Match(id="m", event_code="E", side_a=["a", "b"], side_b=["c"])
    assert _player_ids(m) == {"a", "b", "c"}
