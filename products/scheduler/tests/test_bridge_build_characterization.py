"""Characterization / golden-master tests for ``SchedulingProblemBuilder.build``.

SP-REFACTOR Phase 7 (CODE_HEALTH.md Part 2, "cover before you modify"). These
freeze the *current* behavior of the DTO/state -> engine-request bridge — bugs
and quirks included — so any future decomposition has a tripwire.

Context (see docs/audits/07-locked-functions.md): ``build`` is a library
convenience reachable only via ``live_ops.reschedule`` (no in-repo production
caller — the Meet/Bracket paths build ``ScheduleRequest`` directly). It is a pure
function of its arguments. One test pins a **latent bug** (config field-drop) —
it asserts the CURRENT wrong behavior on purpose; see ``test_freeze_override_*``.
"""
from scheduler_core.domain.models import ScheduleConfig, SolverStatus
from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    PlayUnit,
    PlayUnitKind,
    TournamentAssignment,
    TournamentState,
)
from scheduler_core.engine.backends import CPSATBackend
from scheduler_core.engine.bridge import (
    BridgeOptions,
    SchedulingProblemBuilder,
    _expand_to_match_ids,
    _participant_to_player,
)


def _unit(uid, *, a=None, b=None, event="MS", kind=PlayUnitKind.MATCH,
          children=None, duration=1) -> PlayUnit:
    return PlayUnit(
        id=uid,
        event_id=event,
        side_a=a,
        side_b=b,
        kind=kind,
        child_unit_ids=children or [],
        expected_duration_slots=duration,
    )


def _state(units=(), participants=(), assignments=None,
           events=()) -> TournamentState:
    return TournamentState(
        participants={p.id: p for p in participants},
        events={e.id: e for e in events},
        play_units={u.id: u for u in units},
        assignments=assignments or {},
    )


def _build(state, ready, config, options=None):
    return SchedulingProblemBuilder().build(state, ready, config, options)


# --------------------------------------------------------------------------- #
# Basic mapping
# --------------------------------------------------------------------------- #

def test_units_map_to_matches_and_participants_to_sorted_players():
    parts = [Participant(id=p, name=p.upper()) for p in ("p1", "p2", "p3", "p4")]
    units = [
        _unit("u1", a=["p1"], b=["p2"]),
        _unit("u2", a=["p3"], b=["p4"], duration=2),
    ]
    config = ScheduleConfig(total_slots=20, court_count=2)

    req = _build(_state(units, parts), ["u1", "u2"], config)

    assert [m.id for m in req.matches] == ["u1", "u2"]
    assert req.matches[0].event_code == "MS"
    assert req.matches[0].duration_slots == 1
    assert req.matches[1].duration_slots == 2  # expected_duration_slots carried
    assert sorted(p.id for p in req.players) == ["p1", "p2", "p3", "p4"]
    assert req.previous_assignments == []
    # No override options -> the config object is passed through unchanged.
    assert req.config is config


# --------------------------------------------------------------------------- #
# Tie expansion + unit selection (also exercises _expand_to_match_ids directly)
# --------------------------------------------------------------------------- #

def test_tie_unit_expands_to_child_units():
    tie = _unit("t1", kind=PlayUnitKind.TIE, children=["c1", "c2"])
    c1 = _unit("c1", a=["p1"], b=["p2"])
    c2 = _unit("c2", a=["p3"], b=["p4"])
    state = _state([tie, c1, c2])

    assert _expand_to_match_ids(state, ["t1"]) == ["c1", "c2"]
    req = _build(state, ["t1"], ScheduleConfig(total_slots=10, court_count=2))
    assert [m.id for m in req.matches] == ["c1", "c2"]


def test_tie_without_children_maps_to_itself():
    tie = _unit("t1", kind=PlayUnitKind.TIE, children=[])
    state = _state([tie])
    assert _expand_to_match_ids(state, ["t1"]) == ["t1"]


def test_missing_unit_is_dropped():
    assert _expand_to_match_ids(_state(), ["ghost"]) == []


def test_max_units_truncates_after_expansion():
    units = [_unit(f"u{i}", a=[f"a{i}"], b=[f"b{i}"]) for i in range(3)]
    state = _state(units)
    config = ScheduleConfig(total_slots=20, court_count=2)

    req = _build(state, ["u0", "u1", "u2"], config, BridgeOptions(max_units=2))
    assert [m.id for m in req.matches] == ["u0", "u1"]

    req0 = _build(state, ["u0", "u1", "u2"], config, BridgeOptions(max_units=0))
    assert req0.matches == [] and req0.players == [] and req0.previous_assignments == []


def test_negative_max_units_is_ignored():
    """Quirk pinned: the guard is ``max_units is not None and max_units >= 0``, so a
    negative value means 'no limit', NOT 'truncate to zero'."""
    units = [_unit(f"u{i}", a=[f"a{i}"], b=[f"b{i}"]) for i in range(3)]
    state = _state(units)

    req = _build(state, ["u0", "u1", "u2"],
                 ScheduleConfig(total_slots=20, court_count=2),
                 BridgeOptions(max_units=-1))
    assert [m.id for m in req.matches] == ["u0", "u1", "u2"]


# --------------------------------------------------------------------------- #
# Config override — LATENT BUG pinned (field-drop on rebuild)
# --------------------------------------------------------------------------- #

def test_freeze_override_preserves_all_config_fields():
    """Freeze/current-slot override rebuilds ScheduleConfig via ``dataclasses.replace``,
    so EVERY field is preserved except the two overridden. Regression guard for the
    former hand-listed-copy field-drop bug (fixed 2026-07-01; see debt-log 'Cleared').
    """
    config = ScheduleConfig(
        total_slots=20,
        court_count=3,
        interval_minutes=15,
        default_rest_slots=2,
        disruption_penalty=3.0,
        allow_player_overlap=True,
        player_overlap_penalty=99.0,
        enable_court_utilization=False,
        court_utilization_penalty=12.0,
        break_slots=[(5, 7)],
        closed_court_windows=[(2, 0, 5)],
        closed_court_ids=[2],
        enable_game_proximity=True,
        min_game_spacing_slots=3,
        enable_compact_schedule=True,
    )
    state = _state([_unit("u1", a=["p1"], b=["p2"])])

    req = _build(state, ["u1"], config, BridgeOptions(freeze_horizon_slots=2, current_slot=1))
    uc = req.config

    assert uc is not config  # a fresh object was built
    # Overridden fields:
    assert uc.freeze_horizon_slots == 2
    assert uc.current_slot == 1
    # Every other field preserved (not reset to defaults):
    assert (uc.total_slots, uc.court_count) == (20, 3)
    assert (uc.interval_minutes, uc.default_rest_slots) == (15, 2)
    assert uc.disruption_penalty == 3.0
    assert uc.allow_player_overlap is True
    assert uc.player_overlap_penalty == 99.0
    assert uc.enable_court_utilization is False
    assert uc.court_utilization_penalty == 12.0
    assert uc.break_slots == [(5, 7)]
    assert uc.closed_court_windows == [(2, 0, 5)]
    assert uc.closed_court_ids == [2]
    assert uc.enable_game_proximity is True
    assert uc.min_game_spacing_slots == 3
    assert uc.enable_compact_schedule is True


def test_rolling_horizon_shrinks_total_slots_preserving_fields():
    config = ScheduleConfig(total_slots=20, court_count=2, allow_player_overlap=True)
    state = _state([_unit("u1", a=["p1"], b=["p2"])])

    # rolling < total -> total_slots shrinks to current_slot(0) + rolling(8) = 8.
    req = _build(state, ["u1"], config, BridgeOptions(rolling_horizon_slots=8))
    assert req.config.total_slots == 8
    # Same replace()-based rebuild -> other fields preserved (fixed field-drop bug):
    assert req.config.allow_player_overlap is True

    # rolling >= total -> no shrink, and (no other override) the config passes
    # through unchanged.
    req2 = _build(state, ["u1"], config, BridgeOptions(rolling_horizon_slots=100))
    assert req2.config is config


# --------------------------------------------------------------------------- #
# Participant -> Player mapping
# --------------------------------------------------------------------------- #

def test_unit_with_empty_side_is_handled():
    """A unit with only one populated side (e.g. a bye) contributes only that
    side's participants; the empty side is skipped, and Match coerces it to []."""
    parts = [Participant(id="p1", name="P1")]
    state = _state([_unit("u1", a=["p1"], b=None)], parts)

    req = _build(state, ["u1"], ScheduleConfig(total_slots=10, court_count=1))
    assert [p.id for p in req.players] == ["p1"]
    assert req.matches[0].side_a == ["p1"]
    assert req.matches[0].side_b == []  # None side becomes an empty list


def test_team_member_ids_expanded_into_players():
    team = Participant(id="T1", name="Team 1", type=ParticipantType.TEAM,
                       member_ids=["m1", "m2"])
    members = [Participant(id="m1", name="M1"), Participant(id="m2", name="M2")]
    opp = Participant(id="p3", name="P3")
    state = _state([_unit("u1", a=["T1"], b=["p3"])], [team, *members, opp])

    req = _build(state, ["u1"], ScheduleConfig(total_slots=10, court_count=1))
    assert sorted(p.id for p in req.players) == ["T1", "m1", "m2", "p3"]


def test_participant_metadata_availability_and_rest_parsed():
    p = Participant(id="p1", name="P1",
                    metadata={"availability": [[3, 6], [8, 10]], "rest_slots": 2})
    pl = _participant_to_player(_state([], [p]), "p1")
    assert pl.availability == [(3, 6), (8, 10)]  # coerced to tuples
    assert pl.rest_slots == 2


def test_participant_metadata_filters_malformed_availability():
    p = Participant(id="p2", name="P2",
                    metadata={"availability": [[3, 6], [7], "bad", [1, 2, 3]]})
    pl = _participant_to_player(_state([], [p]), "p2")
    assert pl.availability == [(3, 6)]  # only the 2-element entry survives
    assert pl.rest_slots == 1  # default when metadata omits it


def test_missing_participant_defaults_to_id_named_player():
    pl = _participant_to_player(_state(), "ghost")
    assert (pl.id, pl.name) == ("ghost", "ghost")
    assert pl.availability == [] and pl.rest_slots == 1


# --------------------------------------------------------------------------- #
# Previous assignments
# --------------------------------------------------------------------------- #

def test_previous_assignments_only_for_in_scope_units():
    units = [
        _unit("u1", a=["p1"], b=["p2"]),
        _unit("u2", a=["p3"], b=["p4"]),
        _unit("u3", a=["p5"], b=["p6"]),
    ]
    assignments = {
        "u1": TournamentAssignment(play_unit_id="u1", slot_id=5, court_id=1, locked=True),
        "u3": TournamentAssignment(play_unit_id="u3", slot_id=2, court_id=2),  # out of ready scope
    }
    state = _state(units, assignments=assignments)

    req = _build(state, ["u1", "u2"], ScheduleConfig(total_slots=20, court_count=2))

    assert len(req.previous_assignments) == 1
    pa = req.previous_assignments[0]
    assert (pa.match_id, pa.slot_id, pa.court_id, pa.locked) == ("u1", 5, 1, True)


# --------------------------------------------------------------------------- #
# End-to-end: bridge -> CP-SAT backend (realism, using components that exist).
# NB: the examples/badminton_event_setup.py "recipe" is stale — it imports
# PoolGenerationPolicy/CompetitionGraph which no longer exist (logged in
# debt-log). This drives the real bridge->backend seam with a hand-built state.
# --------------------------------------------------------------------------- #

def test_bridge_output_solves_end_to_end():
    parts = [Participant(id=f"p{i}", name=f"P{i}") for i in range(1, 5)]
    units = [
        _unit("u1", a=["p1"], b=["p2"]),
        _unit("u2", a=["p3"], b=["p4"]),
        _unit("u3", a=["p1"], b=["p3"]),
    ]
    config = ScheduleConfig(total_slots=20, court_count=2)

    req = _build(_state(units, parts), ["u1", "u2", "u3"], config)
    assert len(req.players) == 4
    assert len(req.matches) == 3

    result = CPSATBackend().solve(req)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.assignments) == len(req.matches)
