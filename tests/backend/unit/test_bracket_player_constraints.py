"""SP-D7 S2 — bracket per-player availability + rest channel.

Covers the three layers of the new plumbing:

  - ``bracket.player_constraints`` pure helpers: overnight-aware
    HH:mm → slot conversion, window clamping, extras building (start_time
    None ⇒ no slot windows; restSlots explicit vs session default).
  - ``bracket.adapter.build_players``: extras=None stays
    byte-identical to the pre-extras output (pin), per-player windows
    INTERSECT the round window (never replace it), TEAM aggregation
    (window intersection + max rest), and the empty-intersection guard
    (fallback to the round window + warning, never infeasible).
  - ``bracket.brackets._load_bracket_player_extras``: blob → extras incl. the
    ``defaultRestSlots`` config pick and malformed-entry tolerance.
"""
from __future__ import annotations

import logging
from datetime import datetime

import pytest

from core.schemas import AvailabilityWindow, BracketPlayerDTO
from scheduler_core.domain.models import Player
from scheduler_core.domain.tournament import Participant, ParticipantType

from bracket.adapter import build_players
from bracket.player_constraints import (
    PlayerExtras,
    build_player_extras,
    intersect_window_lists,
    intersect_windows,
    time_to_slot,
)


# ---------------------------------------------------------------------------
# time_to_slot — overnight-aware HH:mm → slot conversion
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "hhmm,day_start,interval,expected",
    [
        ("09:00", "09:00", 30, 0),      # exactly day start
        ("12:00", "09:00", 30, 6),      # 3h later @30min
        ("12:15", "09:00", 30, 6),      # floor division inside a slot
        ("18:00", "09:00", 30, 18),
        ("10:00", "09:00", 15, 4),      # different interval
        ("01:00", "18:00", 30, 14),     # overnight wrap: 01:00 is next day
        ("08:00", "09:00", 30, 46),     # before day start → +24h
    ],
)
def test_time_to_slot(hhmm, day_start, interval, expected):
    assert time_to_slot(hhmm, day_start, interval) == expected


def test_time_to_slot_rejects_malformed():
    with pytest.raises(ValueError):
        time_to_slot("banana", "09:00", 30)
    with pytest.raises(ValueError):
        time_to_slot("25:00", "09:00", 30)


def test_intersect_windows_clamps_and_drops_empty():
    assert intersect_windows([(-3, 4), (2, 6), (10, 20)], (0, 12)) == [
        (0, 4),
        (2, 6),
        (10, 12),
    ]
    # fully outside the bound → dropped
    assert intersect_windows([(20, 30)], (0, 12)) == []


def test_intersect_window_lists():
    a = [(0, 6), (10, 20)]
    b = [(4, 12), (18, 30)]
    assert intersect_window_lists(a, b) == [(4, 6), (10, 12), (18, 20)]
    assert intersect_window_lists([(0, 4)], [(6, 10)]) == []


# ---------------------------------------------------------------------------
# build_player_extras
# ---------------------------------------------------------------------------


def _p(pid: str, windows=None, rest=None) -> BracketPlayerDTO:
    return BracketPlayerDTO(
        id=pid,
        name=pid.title(),
        restSlots=rest,
        availability=[
            AvailabilityWindow(start=s, end=e) for s, e in (windows or [])
        ],
    )


_START = datetime(2026, 7, 2, 9, 0)


def test_extras_without_start_time_has_no_windows_but_keeps_rest():
    extras = build_player_extras(
        [_p("p-one", windows=[("12:00", "18:00")], rest=3)],
        start_time=None,
        interval_minutes=30,
        total_slots=64,
        default_rest_slots=1,
    )
    assert extras["p-one"].availability_slots == []
    assert extras["p-one"].rest_slots == 3


def test_extras_rest_defaults_vs_explicit():
    extras = build_player_extras(
        [_p("p-default"), _p("p-explicit", rest=4), _p("p-zero", rest=0)],
        start_time=_START,
        interval_minutes=30,
        total_slots=64,
        default_rest_slots=2,
    )
    assert extras["p-default"].rest_slots == 2
    assert extras["p-explicit"].rest_slots == 4
    assert extras["p-zero"].rest_slots == 0  # explicit 0 is honoured


def test_extras_converts_windows_to_slots():
    extras = build_player_extras(
        [_p("p-one", windows=[("12:00", "18:00"), ("08:00", "09:30")])],
        start_time=_START,
        interval_minutes=30,
        total_slots=64,
        default_rest_slots=1,
    )
    # 12:00–18:00 → slots (6, 18); 08:00–09:30 wraps overnight
    # (08:00 < day start) → (46, 1) → empty after clamp → dropped.
    assert extras["p-one"].availability_slots == [(6, 18)]


def test_extras_clamps_to_total_slots():
    extras = build_player_extras(
        [_p("p-one", windows=[("12:00", "23:00")])],
        start_time=_START,
        interval_minutes=30,
        total_slots=16,  # day ends at slot 16 (= 17:00)
        default_rest_slots=1,
    )
    assert extras["p-one"].availability_slots == [(6, 16)]


def test_extras_all_windows_dropped_warns_and_is_unconstrained(caplog):
    with caplog.at_level(
        logging.WARNING, logger="scheduler.bracket.player_constraints"
    ):
        extras = build_player_extras(
            [_p("p-one", windows=[("06:00", "08:00")])],  # before day start
            start_time=_START,
            interval_minutes=30,
            total_slots=16,
            default_rest_slots=1,
        )
    assert extras["p-one"].availability_slots == []
    assert any("p-one" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# build_players — extras merge
# ---------------------------------------------------------------------------


def _participants() -> dict:
    return {
        "p-alice": Participant(id="p-alice", name="Alice"),
        "p-bob": Participant(id="p-bob", name="Bob"),
        "T1": Participant(
            id="T1",
            name="Alice / Bob",
            type=ParticipantType.TEAM,
            member_ids=["p-alice", "p-bob"],
        ),
    }


def test_build_players_without_extras_is_byte_identical():
    """Pin: extras omitted (or None) reproduces today's output exactly."""
    ids = {"p-alice", "p-unknown"}
    expected = [
        Player(id="p-alice", name="Alice", availability=[(2, 10)]),
        Player(id="p-unknown", name="p-unknown", availability=[(2, 10)]),
    ]
    assert (
        build_players(ids, _participants(), availability_window=(2, 10))
        == expected
    )
    assert (
        build_players(
            ids, _participants(), availability_window=(2, 10), extras=None
        )
        == expected
    )
    # Degenerate round window → unconstrained, as today.
    assert build_players(
        {"p-alice"}, _participants(), availability_window=(5, 5)
    ) == [Player(id="p-alice", name="Alice", availability=[])]


def test_build_players_empty_extras_matches_no_extras():
    ids = {"p-alice", "p-unknown"}
    assert build_players(
        ids, _participants(), availability_window=(2, 10), extras={}
    ) == build_players(ids, _participants(), availability_window=(2, 10))


def test_build_players_intersects_windows_with_round_window():
    extras = {
        "p-alice": PlayerExtras(
            availability_slots=[(0, 4), (6, 18)], rest_slots=3
        ),
    }
    out = build_players(
        {"p-alice", "p-bob"},
        _participants(),
        availability_window=(2, 10),
        extras=extras,
    )
    alice = next(p for p in out if p.id == "p-alice")
    bob = next(p for p in out if p.id == "p-bob")
    # Windows ∩ round window — never a replacement.
    assert alice.availability == [(2, 4), (6, 10)]
    assert alice.rest_slots == 3
    assert alice.rest_is_hard is True
    # No windows on record → the plain round window, as today.
    assert bob.availability == [(2, 10)]
    assert bob.rest_slots == 1


def test_build_players_no_windows_keeps_round_window_but_sets_rest():
    extras = {"p-alice": PlayerExtras(availability_slots=[], rest_slots=5)}
    out = build_players(
        {"p-alice"}, _participants(), availability_window=(0, 20), extras=extras
    )
    assert out[0].availability == [(0, 20)]
    assert out[0].rest_slots == 5


def test_build_players_empty_intersection_falls_back_with_warning(caplog):
    """Pinned guard: windows ∩ round window = ∅ → round window + warning."""
    extras = {
        "p-alice": PlayerExtras(availability_slots=[(0, 2)], rest_slots=2)
    }
    with caplog.at_level(logging.WARNING, logger="scheduler.bracket.adapter"):
        out = build_players(
            {"p-alice"},
            _participants(),
            availability_window=(10, 20),
            extras=extras,
        )
    assert out[0].availability == [(10, 20)]  # solve stays feasible
    assert out[0].rest_slots == 2  # rest still applies
    assert any("p-alice" in r.message for r in caplog.records)


def test_build_players_team_intersects_members_and_takes_max_rest():
    extras = {
        "p-alice": PlayerExtras(availability_slots=[(0, 8)], rest_slots=1),
        "p-bob": PlayerExtras(availability_slots=[(4, 12)], rest_slots=4),
    }
    out = build_players(
        {"T1"}, _participants(), availability_window=(0, 20), extras=extras
    )
    team = out[0]
    assert team.availability == [(4, 8)]  # ∩ of members ∩ round window
    assert team.rest_slots == 4  # max of members


def test_build_players_team_member_without_windows_is_unrestricted():
    extras = {
        "p-alice": PlayerExtras(availability_slots=[(4, 12)], rest_slots=2),
        "p-bob": PlayerExtras(availability_slots=[], rest_slots=3),
    }
    out = build_players(
        {"T1"}, _participants(), availability_window=(0, 20), extras=extras
    )
    assert out[0].availability == [(4, 12)]
    assert out[0].rest_slots == 3


def test_build_players_team_disjoint_members_fall_back_with_warning(caplog):
    extras = {
        "p-alice": PlayerExtras(availability_slots=[(0, 4)], rest_slots=1),
        "p-bob": PlayerExtras(availability_slots=[(10, 14)], rest_slots=2),
    }
    with caplog.at_level(logging.WARNING, logger="scheduler.bracket.adapter"):
        out = build_players(
            {"T1"}, _participants(), availability_window=(0, 20), extras=extras
        )
    assert out[0].availability == [(0, 20)]  # never infeasible
    assert out[0].rest_slots == 2
    assert any("T1" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# bracket.brackets._load_bracket_player_extras — blob → extras + config pick
# ---------------------------------------------------------------------------


def test_load_extras_from_blob_with_default_rest_pick():
    from bracket.brackets import _load_bracket_player_extras

    blob = {
        "config": {"defaultRestSlots": 3},
        "bracket_session": {"default_rest_slots": 9},  # camelCase wins
        "bracketPlayers": [
            {
                "id": "p-one",
                "name": "One",
                "availability": [{"start": "12:00", "end": "18:00"}],
            },
            {"id": "p-two", "name": "Two", "restSlots": 0},
            {"id": "", "name": ""},  # malformed → skipped, not fatal
        ],
    }
    extras = _load_bracket_player_extras(
        blob,
        start_time=_START,
        interval_minutes=30,
        total_slots=64,
    )
    assert set(extras) == {"p-one", "p-two"}
    assert extras["p-one"].availability_slots == [(6, 18)]
    assert extras["p-one"].rest_slots == 3  # session default via _pick
    assert extras["p-two"].rest_slots == 0  # explicit wins


def test_load_extras_empty_blob_is_empty():
    from bracket.brackets import _load_bracket_player_extras

    assert (
        _load_bracket_player_extras(
            {}, start_time=None, interval_minutes=30, total_slots=64
        )
        == {}
    )
