"""S4 — Monrad classification / plate generation.

Pins:
  1. Full classification N=8: segments {M, P3_4, P5_8, P7_8} — the
     plan's worked example (M-R0 losers → P5_8; P5_8-R0 losers → P7_8;
     M-R1 losers → P3_4) with exact feeder ids.
  2. Playing EVERY match yields a POSITION BIJECTION: each position
     1..N decided by exactly one final, each player lands exactly one
     position (also pinned at N=16 — recursion depth 3).
  3. Plate mode: segments {M, PLATE} only, plate fed by M-R0 losers.
  4. Byes (N=6): the S2 walkover→BYE policy cascades — no crash, all 6
     real players land distinct positions 1..6, positions 7/8 go
     undecided (double-BYE final).
  5. Registry config: consolation in ('full', 'plate'), default full,
     junk dropped, bad values rejected.
  6. ``Draw.rounds`` is a valid topological dependency layering.
"""
from __future__ import annotations

import pytest

from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
    WinnerSide,
)

from bracket.advancement import auto_walkover_byes, record_result
from bracket.formats.monrad import generate_monrad


def _participants(n: int) -> list[Participant]:
    return [
        Participant(id=f"p{i}", name=f"P{i}", type=ParticipantType.PLAYER)
        for i in range(1, n + 1)
    ]


def _register(draw) -> TournamentState:
    state = TournamentState(
        participants=dict(draw.participants),
        events={draw.event.id: draw.event},
        play_units=dict(draw.play_units),
    )
    auto_walkover_byes(state, draw)
    return state


def _play_all(state: TournamentState, draw) -> None:
    progressed = True
    while progressed:
        progressed = False
        for pu_id, pu in draw.play_units.items():
            if pu_id in state.results:
                continue
            if not pu.side_a or not pu.side_b:
                continue
            if any(d not in state.results for d in pu.dependencies):
                continue
            record_result(state, draw, pu_id, WinnerSide.A, finished_at_slot=1)
            progressed = True


def _final_positions(state: TournamentState, draw) -> dict[int, str]:
    """Each segment's final decides positions (lo, lo+1): winner takes
    ``lo``, loser ``lo + 1``. Walkover finals contribute only the side
    that exists; double-BYE (NONE) finals contribute nothing."""
    positions: dict[int, str] = {}
    for seg in draw.segments:
        lo = 1 if seg.id == "M" else seg.metadata["positions"][0]
        final_id = seg.rounds[-1][0]
        pu = state.play_units[final_id]
        result = state.results[final_id]
        if result.winner_side == WinnerSide.A:
            winner, loser = pu.side_a, pu.side_b
        elif result.winner_side == WinnerSide.B:
            winner, loser = pu.side_b, pu.side_a
        else:
            winner = loser = None
        if winner:
            assert lo not in positions
            positions[lo] = winner[0]
        if loser:
            assert lo + 1 not in positions
            positions[lo + 1] = loser[0]
    return positions


def _assert_valid_waves(draw) -> None:
    seen = [pu_id for wave in draw.rounds for pu_id in wave]
    assert sorted(seen) == sorted(draw.play_units)
    wave_of = {
        pu_id: i for i, wave in enumerate(draw.rounds) for pu_id in wave
    }
    for pu_id, pu in draw.play_units.items():
        for dep in pu.dependencies:
            assert wave_of[dep] < wave_of[pu_id]


# ---- 1. Full classification N=8 — the plan's worked example -----------------


def test_monrad_full_n8_segments():
    draw = generate_monrad(
        _participants(8), event_id="E", play_unit_id_prefix="E",
        consolation="full",
    )
    assert [s.id for s in draw.segments] == ["M", "P3_4", "P5_8", "P7_8"]
    assert [s.order for s in draw.segments] == [0, 1, 2, 3]
    assert [s.label for s in draw.segments] == [
        "Main draw", "3–4", "5–8", "7–8",
    ]
    segs = {s.id: s for s in draw.segments}
    assert segs["M"].metadata == {}
    assert segs["P5_8"].metadata == {"positions": [5, 8]}
    assert segs["P3_4"].metadata == {"positions": [3, 4]}
    assert segs["P7_8"].metadata == {"positions": [7, 8]}

    # Shapes: 8 players × 3 matches each / 2 = 12 units.
    assert [len(r) for r in segs["M"].rounds] == [4, 2, 1]
    assert [len(r) for r in segs["P5_8"].rounds] == [2, 1]
    assert [len(r) for r in segs["P3_4"].rounds] == [1]
    assert [len(r) for r in segs["P7_8"].rounds] == [1]
    assert len(draw.play_units) == 12

    def pin(pu_id):
        a, b = draw.slots[pu_id]
        return (
            (a.feeder_play_unit_id, a.feeder_take),
            (b.feeder_play_unit_id, b.feeder_take),
        )

    # M-R0 losers → P5_8.
    assert pin("E-P5_8-R0-0") == (("E-M-R0-0", "loser"), ("E-M-R0-1", "loser"))
    assert pin("E-P5_8-R0-1") == (("E-M-R0-2", "loser"), ("E-M-R0-3", "loser"))
    # M-R1 (SF) losers → P3_4.
    assert pin("E-P3_4-R0-0") == (("E-M-R1-0", "loser"), ("E-M-R1-1", "loser"))
    # P5_8's R0 losers → P7_8.
    assert pin("E-P7_8-R0-0") == (
        ("E-P5_8-R0-0", "loser"), ("E-P5_8-R0-1", "loser"),
    )

    # Positions ride the classification units' metadata (hydration hook).
    assert draw.play_units["E-P5_8-R1-0"].metadata["positions"] == [5, 8]
    _assert_valid_waves(draw)


# ---- 2. Position bijection ---------------------------------------------------


@pytest.mark.parametrize("n", [8, 16])
def test_monrad_full_positions_bijection(n):
    draw = generate_monrad(
        _participants(n), event_id="E", play_unit_id_prefix="E",
        consolation="full",
    )
    # Every position pair (lo, lo+1) is decided by exactly one final.
    los = sorted(
        1 if s.id == "M" else s.metadata["positions"][0]
        for s in draw.segments
    )
    assert los == list(range(1, n + 1, 2))

    state = _register(draw)
    _play_all(state, draw)
    assert set(state.results) == set(draw.play_units)

    positions = _final_positions(state, draw)
    assert sorted(positions.keys()) == list(range(1, n + 1))
    assert sorted(positions.values()) == sorted(p.id for p in _participants(n))


def test_monrad_full_n16_recursion_shape():
    draw = generate_monrad(
        _participants(16), event_id="E", play_unit_id_prefix="E",
        consolation="full",
    )
    assert [s.id for s in draw.segments] == [
        "M", "P3_4", "P5_8", "P7_8", "P9_16", "P11_12", "P13_16", "P15_16",
    ]
    assert len(draw.play_units) == 32  # 16 players × 4 matches / 2


# ---- 3. Plate mode -----------------------------------------------------------


def test_monrad_plate_mode():
    draw = generate_monrad(
        _participants(8), event_id="E", play_unit_id_prefix="E",
        consolation="plate",
    )
    assert [s.id for s in draw.segments] == ["M", "PLATE"]
    assert [s.label for s in draw.segments] == ["Main draw", "Plate"]
    segs = {s.id: s for s in draw.segments}
    assert [len(r) for r in segs["PLATE"].rounds] == [2, 1]
    assert len(draw.play_units) == 7 + 3

    a, b = draw.slots["E-PLATE-R0-0"]
    assert (a.feeder_play_unit_id, a.feeder_take) == ("E-M-R0-0", "loser")
    assert (b.feeder_play_unit_id, b.feeder_take) == ("E-M-R0-1", "loser")
    _assert_valid_waves(draw)


# ---- 4. Byes (N=6): coherent positions for real players ----------------------


def test_monrad_full_n6_byes():
    draw = generate_monrad(
        _participants(6), event_id="E", play_unit_id_prefix="E",
        consolation="full",
    )
    state = _register(draw)
    _play_all(state, draw)
    assert set(state.results) == set(draw.play_units)  # nothing stuck

    positions = _final_positions(state, draw)
    # 6 real players → distinct positions 1..6; 7/8 go undecided (the
    # P7_8 final is a double-BYE NONE walkover).
    assert sorted(positions.keys()) == [1, 2, 3, 4, 5, 6]
    assert sorted(positions.values()) == [f"p{i}" for i in range(1, 7)]
    p7_8_final = state.results["E-P7_8-R0-0"]
    assert p7_8_final.winner_side == WinnerSide.NONE
    assert p7_8_final.walkover is True


# ---- 5. Registry config -------------------------------------------------------


def test_monrad_registry_config():
    from bracket.formats import FORMAT_REGISTRY

    spec = FORMAT_REGISTRY["monrad"]
    assert spec.label == "Monrad"
    assert spec.uses_bracket_size is True
    assert spec.normalize_config({}, 8) == {"consolation": "full"}
    assert spec.normalize_config(
        {"consolation": "plate", "junk": True}, 8
    ) == {"consolation": "plate"}
    with pytest.raises(ValueError, match="consolation"):
        spec.normalize_config({"consolation": "bogus"}, 8)
    with pytest.raises(ValueError, match="consolation"):
        spec.normalize_config({"consolation": 3}, 8)
    with pytest.raises(ValueError, match="consolation"):
        generate_monrad(_participants(4), consolation="deep")
