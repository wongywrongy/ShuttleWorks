"""S2 — loser routing through the advancement pipeline.

Pins:
  1. A real result feeds the LOSER into a ``feeder_take='loser'`` slot
     while the winner still advances through winner slots.
  2. THE BYE HAZARD: a walkover (bye or withdrawal) has no real loser —
     the loser feed resolves to BYE and ``_sweep_walkovers`` cascades a
     walkover through the consolation match automatically.
  3. WinnerSide.NONE (double bye) feeds BYE into both takes.
  4. Serialization: winner-take slots emit the exact historical dict
     (back-compat by omission); loser-take slots round-trip; persisted
     rows without the key hydrate to winner.
"""
from __future__ import annotations

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    ParticipantType,
    PlayUnit,
    TournamentState,
    WinnerSide,
)

from services.bracket.advancement import record_result
from services.bracket.draw import BYE, BracketSlot, Draw


def _participant(pid: str) -> Participant:
    return Participant(id=pid, name=pid.upper(), type=ParticipantType.PLAYER)


def _mini_plate_draw() -> tuple[TournamentState, Draw]:
    """Two R0 matches; final takes the winners, plate takes the losers.

        M0: a vs b   M1: c vs d
        F : winner(M0) vs winner(M1)
        P : loser(M0)  vs loser(M1)
    """
    participants = {p.id: _participant(p_id) for p_id in "abcd" for p in [_participant(p_id)]}
    play_units = {
        "M0": PlayUnit(id="M0", event_id="E", side_a=["a"], side_b=["b"],
                       expected_duration_slots=1, dependencies=[]),
        "M1": PlayUnit(id="M1", event_id="E", side_a=["c"], side_b=["d"],
                       expected_duration_slots=1, dependencies=[]),
        "F": PlayUnit(id="F", event_id="E", side_a=None, side_b=None,
                      expected_duration_slots=1, dependencies=["M0", "M1"]),
        "P": PlayUnit(id="P", event_id="E", side_a=None, side_b=None,
                      expected_duration_slots=1, dependencies=["M0", "M1"]),
    }
    slots = {
        "M0": (BracketSlot.of_participant("a"), BracketSlot.of_participant("b")),
        "M1": (BracketSlot.of_participant("c"), BracketSlot.of_participant("d")),
        "F": (BracketSlot.of_feeder("M0"), BracketSlot.of_feeder("M1")),
        "P": (
            BracketSlot.of_feeder("M0", take="loser"),
            BracketSlot.of_feeder("M1", take="loser"),
        ),
    }
    draw = Draw(
        event=Event(id="E", type_tags=[], format_plugin_name="de", parameters={}),
        participants=participants,
        play_units=play_units,
        slots=slots,
        rounds=[["M0", "M1"], ["F", "P"]],
    )
    state = TournamentState(
        participants=participants,
        events={"E": draw.event},
        play_units=dict(play_units),
        results={},
        assignments={},
    )
    return state, draw


def test_real_result_routes_winner_and_loser():
    state, draw = _mini_plate_draw()

    record_result(state, draw, "M0", WinnerSide.A, finished_at_slot=1)
    record_result(state, draw, "M1", WinnerSide.B, finished_at_slot=1)

    f = state.play_units["F"]
    p = state.play_units["P"]
    assert f.side_a == ["a"] and f.side_b == ["d"]  # winners
    assert p.side_a == ["b"] and p.side_b == ["c"]  # losers


def test_walkover_loser_is_bye_and_plate_cascades():
    state, draw = _mini_plate_draw()

    # M0 is a bye/withdrawal walkover: a advances, but NOBODY drops to
    # the plate from it.
    record_result(
        state, draw, "M0", WinnerSide.A, finished_at_slot=None, walkover=True
    )
    slot_a, _ = draw.slots["P"]
    assert slot_a.is_bye  # loser feed → BYE, not 'b'

    # M1 real result: c wins, d drops to the plate... whose other side is
    # a BYE — the sweep must auto-walkover the plate for d.
    affected = record_result(state, draw, "M1", WinnerSide.A, finished_at_slot=1)
    assert "P" in affected
    assert "P" in state.results
    assert state.results["P"].walkover is True
    assert state.results["P"].winner_side == WinnerSide.B  # d "wins" the plate
    # And the final still gets both real winners.
    f = state.play_units["F"]
    assert f.side_a == ["a"] and f.side_b == ["c"]


def test_double_walkover_feeds_bye_to_both_takes():
    state, draw = _mini_plate_draw()

    record_result(
        state, draw, "M0", WinnerSide.NONE, finished_at_slot=None, walkover=True
    )
    f_a, _ = draw.slots["F"]
    p_a, _ = draw.slots["P"]
    assert f_a.is_bye and p_a.is_bye


def test_slot_dict_back_compat_and_round_trip():
    from api.brackets import _dict_to_slot, _slot_to_dict

    # Winner-take feeder: EXACT historical dict (no feeder_take key).
    winner_slot = BracketSlot.of_feeder("M0")
    assert _slot_to_dict(winner_slot) == {
        "participant_id": None,
        "feeder_play_unit_id": "M0",
    }
    # Concrete participant: historical dict too.
    pid_slot = BracketSlot.of_participant("a")
    assert _slot_to_dict(pid_slot) == {
        "participant_id": "a",
        "feeder_play_unit_id": None,
    }
    # Loser-take round-trips.
    loser_slot = BracketSlot.of_feeder("M0", take="loser")
    encoded = _slot_to_dict(loser_slot)
    assert encoded["feeder_take"] == "loser"
    decoded = _dict_to_slot(encoded)
    assert decoded.feeder_take == "loser"
    assert decoded.feeder_play_unit_id == "M0"
    # Persisted rows WITHOUT the key hydrate to winner.
    legacy = _dict_to_slot({"participant_id": None, "feeder_play_unit_id": "M1"})
    assert legacy.feeder_take == "winner"


def test_bye_sentinel_slot_normalizes_take():
    # A resolved slot (participant set) never carries loser semantics.
    s = BracketSlot(participant_id=BYE, feeder_take="loser")
    assert s.feeder_take == "winner"
