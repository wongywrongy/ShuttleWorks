"""S4 — compass draw generation.

Pins:
  1. The spawn table for N=8: only E/W/N/S exist — NE would be seeded by
     losers(E, R2), but a size-8 East final drops exactly one loser, and
     a one-entry bracket is skipped (entry count >= 2 rule).
  2. N=16: all eight segments in spawn-table order, exact feeder pins
     for the second-generation directions (NE/NW/SE/SW).
  3. N=4 degenerates to E + W.
  4. Everyone keeps playing: N=8 plays out completely (12 results, no
     stuck units).
  5. ``Draw.rounds`` is a valid topological dependency layering.
  6. Registry entry: id 'compass', label 'Compass', no config knobs.
"""
from __future__ import annotations

from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
    WinnerSide,
)

from services.bracket.advancement import auto_walkover_byes, record_result
from services.bracket.formats.compass import generate_compass


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


def _assert_valid_waves(draw) -> None:
    seen = [pu_id for wave in draw.rounds for pu_id in wave]
    assert sorted(seen) == sorted(draw.play_units)
    wave_of = {
        pu_id: i for i, wave in enumerate(draw.rounds) for pu_id in wave
    }
    for pu_id, pu in draw.play_units.items():
        for dep in pu.dependencies:
            assert wave_of[dep] < wave_of[pu_id]


def _pin(draw, pu_id):
    a, b = draw.slots[pu_id]
    return (
        (a.feeder_play_unit_id, a.feeder_take),
        (b.feeder_play_unit_id, b.feeder_take),
    )


# ---- 1. N=8 → E/W/N/S only ----------------------------------------------------


def test_compass_n8_spawn_table():
    draw = generate_compass(
        _participants(8), event_id="E1", play_unit_id_prefix="X"
    )
    assert [s.id for s in draw.segments] == ["E", "W", "N", "S"]
    assert [s.order for s in draw.segments] == [0, 1, 2, 3]
    assert [s.label for s in draw.segments] == [
        "East", "West", "North", "South",
    ]
    segs = {s.id: s for s in draw.segments}
    assert [len(r) for r in segs["E"].rounds] == [4, 2, 1]
    assert [len(r) for r in segs["W"].rounds] == [2, 1]
    assert [len(r) for r in segs["N"].rounds] == [1]
    assert [len(r) for r in segs["S"].rounds] == [1]
    assert len(draw.play_units) == 12  # 8 players × 3 matches / 2

    # W = losers(E, R0); N = losers(E, R1); S = losers(W, R0).
    assert _pin(draw, "X-W-R0-0") == (
        ("X-E-R0-0", "loser"), ("X-E-R0-1", "loser"),
    )
    assert _pin(draw, "X-W-R0-1") == (
        ("X-E-R0-2", "loser"), ("X-E-R0-3", "loser"),
    )
    assert _pin(draw, "X-N-R0-0") == (
        ("X-E-R1-0", "loser"), ("X-E-R1-1", "loser"),
    )
    assert _pin(draw, "X-S-R0-0") == (
        ("X-W-R0-0", "loser"), ("X-W-R0-1", "loser"),
    )
    _assert_valid_waves(draw)


# ---- 2. N=16 → all eight segments ----------------------------------------------


def test_compass_n16_all_segments():
    draw = generate_compass(
        _participants(16), event_id="E1", play_unit_id_prefix="X"
    )
    assert [s.id for s in draw.segments] == [
        "E", "W", "N", "S", "NE", "NW", "SE", "SW",
    ]
    assert [s.label for s in draw.segments] == [
        "East", "West", "North", "South",
        "Northeast", "Northwest", "Southeast", "Southwest",
    ]
    segs = {s.id: s for s in draw.segments}
    assert sum(len(r) for r in segs["E"].rounds) == 15
    assert sum(len(r) for r in segs["W"].rounds) == 7
    assert sum(len(r) for r in segs["N"].rounds) == 3
    assert sum(len(r) for r in segs["S"].rounds) == 3
    for seg_id in ("NE", "NW", "SE", "SW"):
        assert sum(len(r) for r in segs[seg_id].rounds) == 1
    assert len(draw.play_units) == 32  # 16 players × 4 matches / 2

    # Second-generation spawns.
    assert _pin(draw, "X-NE-R0-0") == (
        ("X-E-R2-0", "loser"), ("X-E-R2-1", "loser"),
    )
    assert _pin(draw, "X-NW-R0-0") == (
        ("X-N-R0-0", "loser"), ("X-N-R0-1", "loser"),
    )
    assert _pin(draw, "X-SE-R0-0") == (
        ("X-W-R1-0", "loser"), ("X-W-R1-1", "loser"),
    )
    assert _pin(draw, "X-SW-R0-0") == (
        ("X-S-R0-0", "loser"), ("X-S-R0-1", "loser"),
    )
    _assert_valid_waves(draw)


# ---- 3. N=4 degenerates to E + W ------------------------------------------------


def test_compass_n4_two_segments():
    draw = generate_compass(
        _participants(4), event_id="E1", play_unit_id_prefix="X"
    )
    assert [s.id for s in draw.segments] == ["E", "W"]
    assert len(draw.play_units) == 4  # E: 3, W: 1


# ---- 4. Everyone keeps playing ---------------------------------------------------


def test_compass_n8_plays_out_completely():
    draw = generate_compass(
        _participants(8), event_id="E1", play_unit_id_prefix="X"
    )
    state = _register(draw)
    _play_all(state, draw)
    assert set(state.results) == set(draw.play_units)
    assert all(not r.walkover for r in state.results.values())
    # Every player played exactly 3 matches.
    match_counts: dict[str, int] = {}
    for pu in draw.play_units.values():
        for side in (pu.side_a, pu.side_b):
            match_counts[side[0]] = match_counts.get(side[0], 0) + 1
    assert match_counts == {f"p{i}": 3 for i in range(1, 9)}


# ---- 6. Registry ------------------------------------------------------------------


def test_compass_registry_entry():
    from services.bracket.formats import FORMAT_REGISTRY

    spec = FORMAT_REGISTRY["compass"]
    assert spec.label == "Compass"
    assert spec.uses_bracket_size is True
    # No knobs: junk is dropped, nothing survives.
    assert spec.normalize_config({"anything": 1}, 8) == {}
