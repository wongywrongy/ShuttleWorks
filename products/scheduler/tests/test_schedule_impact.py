"""Unit tests for the pre-commit impact diff (`compute_impact`)."""
from __future__ import annotations

import sys
from pathlib import Path


# Same sys.path shuffle the other backend tests use so ``from app.schemas
# import ...`` resolves to backend/app, not src/app.
_BACKEND_ROOT = str(Path(__file__).resolve().parents[1] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

from app.schemas import (
    MatchDTO,
    PlayerDTO,
    RosterGroupDTO,
    ScheduleAssignment,
    ScheduleDTO,
    SoftViolation,
    SolverStatus,
)
from services.schedule_impact import compute_impact


def _schedule(
    assignments: list[tuple[str, int, int]],
    *,
    objective: float | None = 1000.0,
    soft_violations: list[SoftViolation] | None = None,
    unscheduled: list[str] | None = None,
    infeasible: list[str] | None = None,
    status: SolverStatus = SolverStatus.FEASIBLE,
) -> ScheduleDTO:
    return ScheduleDTO(
        assignments=[
            ScheduleAssignment(matchId=mid, slotId=s, courtId=c, durationSlots=1)
            for mid, s, c in assignments
        ],
        unscheduledMatches=unscheduled or [],
        softViolations=soft_violations or [],
        objectiveScore=objective,
        infeasibleReasons=infeasible or [],
        status=status,
    )


def _match(mid: str, side_a: list[str], side_b: list[str]) -> MatchDTO:
    return MatchDTO(id=mid, sideA=side_a, sideB=side_b)


def _player(pid: str, group: str) -> PlayerDTO:
    return PlayerDTO(id=pid, name=pid.upper(), groupId=group, ranks=[])


# ---------------------------------------------------------------------------
# identity case: no diff
# ---------------------------------------------------------------------------
def test_identity_schedule_yields_empty_impact():
    sch = _schedule([("m1", 0, 1), ("m2", 1, 2)])
    impact = compute_impact(sch, sch, [], [])
    assert impact.movedMatches == []
    assert impact.affectedPlayers == []
    assert impact.affectedSchools == []
    assert impact.metricDelta.objectiveDelta == 0.0
    assert impact.metricDelta.softViolationCountDelta == 0
    assert impact.infeasibilityWarnings == []


# ---------------------------------------------------------------------------
# single match move
# ---------------------------------------------------------------------------
def test_single_match_move_reports_exactly_one_move():
    committed = _schedule([("m1", 0, 1), ("m2", 1, 2)])
    proposed = _schedule([("m1", 0, 1), ("m2", 3, 2)])  # m2 slips slot 1 → 3
    matches = [_match("m1", ["pA"], ["pB"]), _match("m2", ["pC"], ["pD"])]
    players = [
        _player("pA", "schoolA"),
        _player("pB", "schoolB"),
        _player("pC", "schoolA"),
        _player("pD", "schoolB"),
    ]
    impact = compute_impact(committed, proposed, matches, players)

    assert len(impact.movedMatches) == 1
    move = impact.movedMatches[0]
    assert move.matchId == "m2"
    assert move.fromSlotId == 1
    assert move.toSlotId == 3

    # Both schools touched (one player each); each player has 1 match move
    affected_player_ids = {p.playerId for p in impact.affectedPlayers}
    assert affected_player_ids == {"pC", "pD"}
    affected_groups = {s.groupId for s in impact.affectedSchools}
    assert affected_groups == {"schoolA", "schoolB"}


# ---------------------------------------------------------------------------
# court swap with same slot
# ---------------------------------------------------------------------------
def test_court_swap_counts_as_a_move():
    committed = _schedule([("m1", 0, 1)])
    proposed = _schedule([("m1", 0, 3)])
    impact = compute_impact(committed, proposed, [_match("m1", ["pA"], ["pB"])], [
        _player("pA", "g"), _player("pB", "g")
    ])
    assert len(impact.movedMatches) == 1
    assert impact.movedMatches[0].fromCourtId == 1
    assert impact.movedMatches[0].toCourtId == 3
    assert impact.movedMatches[0].fromSlotId == 0
    assert impact.movedMatches[0].toSlotId == 0


# ---------------------------------------------------------------------------
# infeasible proposal (newly unscheduled match)
# ---------------------------------------------------------------------------
def test_newly_unscheduled_match_surfaces_infeasibility_warning():
    committed = _schedule([("m1", 0, 1), ("m2", 1, 1)])
    proposed = _schedule(
        [("m1", 0, 1)],
        unscheduled=["m2"],
    )
    matches = [_match("m1", ["pA"], ["pB"]), _match("m2", ["pC"], ["pD"])]
    impact = compute_impact(committed, proposed, matches, [])
    # m2 vanished — counted as a move (to=None) AND surfaced as a warning
    moves = {m.matchId: m for m in impact.movedMatches}
    assert moves["m2"].toSlotId is None
    assert any("cannot be placed" in w for w in impact.infeasibilityWarnings)
    assert impact.metricDelta.unscheduledMatchesDelta == 1


# ---------------------------------------------------------------------------
# infeasible reasons propagate verbatim
# ---------------------------------------------------------------------------
def test_proposed_infeasible_reasons_propagate():
    committed = _schedule([("m1", 0, 1)])
    proposed = _schedule(
        [("m1", 5, 1)],
        infeasible=["court 1 closed at 14:00"],
        status=SolverStatus.INFEASIBLE,
    )
    impact = compute_impact(committed, proposed, [_match("m1", [], [])], [])
    assert "court 1 closed at 14:00" in impact.infeasibilityWarnings


# ---------------------------------------------------------------------------
# new rest violations are warned
# ---------------------------------------------------------------------------
def test_net_new_rest_violations_surface_as_warning():
    committed = _schedule(
        [("m1", 0, 1)],
        soft_violations=[],
    )
    proposed = _schedule(
        [("m1", 1, 1)],
        soft_violations=[
            SoftViolation(type="rest", playerId="pA", description="x", penaltyIncurred=10),
            SoftViolation(type="rest", playerId="pB", description="y", penaltyIncurred=10),
        ],
    )
    impact = compute_impact(committed, proposed, [_match("m1", ["pA"], ["pB"])], [
        _player("pA", "g"), _player("pB", "g")
    ])
    assert impact.metricDelta.restViolationsDelta == 2
    assert any("rest violation" in w for w in impact.infeasibilityWarnings)


# ---------------------------------------------------------------------------
# resolved violations decrement the delta but don't trigger warnings
# ---------------------------------------------------------------------------
def test_resolved_rest_violations_yield_negative_delta():
    committed = _schedule(
        [("m1", 0, 1)],
        soft_violations=[
            SoftViolation(type="rest", playerId="pA", description="x", penaltyIncurred=10),
        ],
    )
    proposed = _schedule(
        [("m1", 5, 1)],
        soft_violations=[],
    )
    impact = compute_impact(committed, proposed, [_match("m1", ["pA"], ["pB"])], [
        _player("pA", "g"), _player("pB", "g")
    ])
    assert impact.metricDelta.restViolationsDelta == -1
    # No "violations introduced" warning when they go down.
    assert not any("rest violation" in w for w in impact.infeasibilityWarnings)


# ---------------------------------------------------------------------------
# objective delta computed when both schedules carry an objective
# ---------------------------------------------------------------------------
def test_objective_delta_computed_when_both_present():
    committed = _schedule([("m1", 0, 1)], objective=1000.0)
    proposed = _schedule([("m1", 0, 2)], objective=850.0)
    impact = compute_impact(committed, proposed, [_match("m1", [], [])], [])
    assert impact.metricDelta.objectiveDelta == -150.0


def test_objective_delta_none_when_either_missing():
    committed = _schedule([("m1", 0, 1)], objective=None)
    proposed = _schedule([("m1", 0, 2)], objective=850.0)
    impact = compute_impact(committed, proposed, [_match("m1", [], [])], [])
    assert impact.metricDelta.objectiveDelta is None


# ---------------------------------------------------------------------------
# null committed: every proposed assignment is a fresh placement
# ---------------------------------------------------------------------------
def test_null_committed_treated_as_empty_baseline():
    proposed = _schedule([("m1", 0, 1), ("m2", 1, 2)])
    matches = [_match("m1", ["pA"], ["pB"]), _match("m2", ["pC"], ["pD"])]
    players = [_player(p, "g") for p in ["pA", "pB", "pC", "pD"]]
    impact = compute_impact(None, proposed, matches, players)
    assert {m.matchId for m in impact.movedMatches} == {"m1", "m2"}
    # All "fromSlot" values are None on a fresh placement.
    assert all(m.fromSlotId is None for m in impact.movedMatches)


# ---------------------------------------------------------------------------
# null proposed: everything previously scheduled becomes unscheduled
# ---------------------------------------------------------------------------
def test_null_proposed_marks_everything_removed():
    committed = _schedule([("m1", 0, 1)])
    impact = compute_impact(committed, None, [_match("m1", [], [])], [])
    assert len(impact.movedMatches) == 1
    assert impact.movedMatches[0].toSlotId is None


# ---------------------------------------------------------------------------
# school + player aggregation
# ---------------------------------------------------------------------------
def test_school_aggregation_counts_unique_schools_per_match():
    committed = _schedule([("m1", 0, 1), ("m2", 1, 1), ("m3", 2, 1)])
    proposed = _schedule([("m1", 5, 1), ("m2", 6, 1), ("m3", 7, 1)])
    matches = [
        _match("m1", ["pA1", "pA2"], ["pB1", "pB2"]),  # schools A vs B
        _match("m2", ["pA3"], ["pC1"]),                # schools A vs C
        _match("m3", ["pB3"], ["pC2"]),                # schools B vs C
    ]
    players = [
        _player("pA1", "schoolA"), _player("pA2", "schoolA"), _player("pA3", "schoolA"),
        _player("pB1", "schoolB"), _player("pB2", "schoolB"), _player("pB3", "schoolB"),
        _player("pC1", "schoolC"), _player("pC2", "schoolC"),
    ]
    groups = [
        RosterGroupDTO(id="schoolA", name="School A"),
        RosterGroupDTO(id="schoolB", name="School B"),
        RosterGroupDTO(id="schoolC", name="School C"),
    ]
    impact = compute_impact(committed, proposed, matches, players, groups)
    by_id = {s.groupId: s for s in impact.affectedSchools}
    # School A is in m1 + m2 (2 moves); B is in m1 + m3 (2 moves); C is in m2 + m3 (2 moves).
    assert by_id["schoolA"].matchCount == 2
    assert by_id["schoolB"].matchCount == 2
    assert by_id["schoolC"].matchCount == 2
    assert by_id["schoolA"].groupName == "School A"


# ---------------------------------------------------------------------------
# move ordering — chronological by target slot
# ---------------------------------------------------------------------------
def test_moves_are_chronologically_sorted():
    committed = _schedule([("m_late", 0, 1), ("m_early", 5, 1)])
    proposed = _schedule([("m_late", 9, 1), ("m_early", 2, 1)])
    impact = compute_impact(committed, proposed, [
        _match("m_late", [], []), _match("m_early", [], [])
    ], [])
    assert [m.matchId for m in impact.movedMatches] == ["m_early", "m_late"]


# ---------------------------------------------------------------------------
# tri-meet: sideC players counted
# ---------------------------------------------------------------------------
def test_tri_meet_side_c_players_counted():
    committed = _schedule([("m1", 0, 1)])
    proposed = _schedule([("m1", 5, 1)])
    match = MatchDTO(
        id="m1",
        sideA=["pA"],
        sideB=["pB"],
        sideC=["pC"],
        matchType="tri",
    )
    players = [
        _player("pA", "schoolA"),
        _player("pB", "schoolB"),
        _player("pC", "schoolC"),
    ]
    impact = compute_impact(committed, proposed, [match], players)
    assert {p.playerId for p in impact.affectedPlayers} == {"pA", "pB", "pC"}
    assert {s.groupId for s in impact.affectedSchools} == {"schoolA", "schoolB", "schoolC"}


# ---------------------------------------------------------------------------
# missing match metadata is silently skipped
# ---------------------------------------------------------------------------
def test_missing_match_metadata_skipped_gracefully():
    committed = _schedule([("orphan", 0, 1)])
    proposed = _schedule([("orphan", 5, 1)])
    impact = compute_impact(committed, proposed, [], [])  # no matches list
    assert len(impact.movedMatches) == 1
    # No player or school breakdown when metadata is missing.
    assert impact.affectedPlayers == []
    assert impact.affectedSchools == []
