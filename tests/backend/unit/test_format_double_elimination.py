"""S3 — double elimination: segments + waves + the DE generator.

Pins:
  1. Shapes: N=4/8/16 → W is the SE shape, L has 2k-2 rounds with sizes
     halving every two rounds (N-2 units), GF has 1 unit (2 with reset).
  2. Every W unit's loser feeds EXACTLY one L slot.
  3. The drop-in order is deterministic (``_drop_order``: reversed on
     odd W rounds, half-rotated on even) — exact feeder ids pinned for
     N=8.
  4. Grand-final reset: a static conditional unit taking BOTH the winner
     and the loser of GF-R0.
  5. Byes (N=5): W-R0 walkovers hollow the L bracket via the S2
     walkover→BYE policy — no exceptions, and exactly 2n-2 real matches.
  6. ``Draw.rounds`` is a valid topological dependency layering.
  7. Route round-trip: upsert format='de' → generate (real solve) →
     segments/PlayUnit.segment on the wire, surviving hydration → record
     results through the GF via POST /bracket/results.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament

from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
    WinnerSide,
)

from services.bracket.advancement import auto_walkover_byes, record_result
from services.bracket.formats.double_elimination import (
    _drop_order,
    generate_double_elimination,
)


def _participants(n: int) -> list[Participant]:
    return [
        Participant(id=f"p{i}", name=f"P{i}", type=ParticipantType.PLAYER)
        for i in range(1, n + 1)
    ]


def _register(draw) -> TournamentState:
    """Absorb a draw into a fresh state + auto-walkover R0 byes (what
    ``register_draw`` does, minus its DB-adjacent module imports)."""
    state = TournamentState(
        participants=dict(draw.participants),
        events={draw.event.id: draw.event},
        play_units=dict(draw.play_units),
    )
    auto_walkover_byes(state, draw)
    return state


def _play_all(state: TournamentState, draw) -> None:
    """Record an A-win for every playable unit until the draw is done."""
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
    seen: list[str] = [pu_id for wave in draw.rounds for pu_id in wave]
    assert sorted(seen) == sorted(draw.play_units)  # each unit exactly once
    wave_of = {
        pu_id: i for i, wave in enumerate(draw.rounds) for pu_id in wave
    }
    for pu_id, pu in draw.play_units.items():
        for dep in pu.dependencies:
            assert wave_of[dep] < wave_of[pu_id], (
                f"{pu_id} (wave {wave_of[pu_id]}) depends on {dep} "
                f"(wave {wave_of[dep]})"
            )


# ---- 1. Shapes -------------------------------------------------------------


@pytest.mark.parametrize(
    "n,w_rounds,l_sizes",
    [
        (4, 2, [1, 1]),
        (8, 3, [2, 2, 1, 1]),
        (16, 4, [4, 4, 2, 2, 1, 1]),
    ],
)
def test_de_shapes(n, w_rounds, l_sizes):
    draw = generate_double_elimination(
        _participants(n), event_id="E", play_unit_id_prefix="E"
    )
    segs = {s.id: s for s in draw.segments}
    assert [s.id for s in draw.segments] == ["W", "L", "GF"]
    assert [s.order for s in draw.segments] == [0, 1, 2]
    assert [s.label for s in draw.segments] == [
        "Main draw", "Losers bracket", "Grand final",
    ]

    assert len(segs["W"].rounds) == w_rounds
    assert sum(len(r) for r in segs["W"].rounds) == n - 1
    assert [len(r) for r in segs["L"].rounds] == l_sizes
    assert sum(len(r) for r in segs["L"].rounds) == n - 2
    assert segs["GF"].rounds == [["E-GF-R0-0"]]
    assert len(draw.play_units) == (n - 1) + (n - 2) + 1

    # Segment metadata rides every unit (the persistence contract).
    for pu_id, pu in draw.play_units.items():
        assert pu.metadata["segment"] in ("W", "L", "GF")
        assert pu_id.startswith(f"E-{pu.metadata['segment']}-R")

    assert draw.event.parameters == {
        "bracket_size": n,
        "participant_count": n,
        "seeded_count": n,
    }
    _assert_valid_waves(draw)


def test_de_rejects_bracket_smaller_than_4():
    with pytest.raises(ValueError, match="at least 4"):
        generate_double_elimination(_participants(2))
    with pytest.raises(ValueError, match="at least 4"):
        generate_double_elimination(_participants(2), bracket_size=2)


# ---- 2. Every W loser feeds exactly one L slot ------------------------------


def test_every_w_loser_feeds_exactly_one_l_slot():
    draw = generate_double_elimination(
        _participants(8), event_id="E", play_unit_id_prefix="E"
    )
    w_ids = [
        pu_id for pu_id, pu in draw.play_units.items()
        if pu.metadata["segment"] == "W"
    ]
    loser_feeds: dict[str, int] = {w: 0 for w in w_ids}
    for pu_id, (slot_a, slot_b) in draw.slots.items():
        for s in (slot_a, slot_b):
            if s.feeder_take == "loser" and s.feeder_play_unit_id in loser_feeds:
                assert draw.play_units[pu_id].metadata["segment"] == "L"
                loser_feeds[s.feeder_play_unit_id] += 1
    assert all(count == 1 for count in loser_feeds.values()), loser_feeds


# ---- 3. Drop-order pin (N=8) -----------------------------------------------


def test_drop_order_is_deterministic():
    assert _drop_order(4, 1) == [3, 2, 1, 0]  # odd w → reversed
    assert _drop_order(4, 2) == [2, 3, 0, 1]  # even w → half-rotation
    assert _drop_order(2, 1) == [1, 0]
    assert _drop_order(2, 2) == [1, 0]
    assert _drop_order(1, 2) == [0]


def test_de_n8_feeder_pin():
    draw = generate_double_elimination(
        _participants(8), event_id="E", play_unit_id_prefix="E"
    )

    def pin(pu_id):
        a, b = draw.slots[pu_id]
        return (
            (a.feeder_play_unit_id, a.feeder_take),
            (b.feeder_play_unit_id, b.feeder_take),
        )

    # L-R0 pairs W-R0 losers adjacently.
    assert pin("E-L-R0-0") == (("E-W-R0-0", "loser"), ("E-W-R0-1", "loser"))
    assert pin("E-L-R0-1") == (("E-W-R0-2", "loser"), ("E-W-R0-3", "loser"))
    # L-R1 drop-in: w=1 (odd) → reversed W-R1 order.
    assert pin("E-L-R1-0") == (("E-L-R0-0", "winner"), ("E-W-R1-1", "loser"))
    assert pin("E-L-R1-1") == (("E-L-R0-1", "winner"), ("E-W-R1-0", "loser"))
    # L-R2 internal: adjacent L-R1 winners.
    assert pin("E-L-R2-0") == (("E-L-R1-0", "winner"), ("E-L-R1-1", "winner"))
    # L-R3 drop-in: the W final's loser.
    assert pin("E-L-R3-0") == (("E-L-R2-0", "winner"), ("E-W-R2-0", "loser"))
    # GF: W champion vs L champion.
    assert pin("E-GF-R0-0") == (("E-W-R2-0", "winner"), ("E-L-R3-0", "winner"))


# ---- 4. Grand-final reset ---------------------------------------------------


def test_grand_final_reset_unit():
    draw = generate_double_elimination(
        _participants(4), event_id="E", play_unit_id_prefix="E",
        grand_final_reset=True,
    )
    segs = {s.id: s for s in draw.segments}
    assert segs["GF"].rounds == [["E-GF-R0-0"], ["E-GF-R1-0"]]

    reset = draw.play_units["E-GF-R1-0"]
    assert reset.metadata["conditional"] is True
    assert reset.dependencies == ["E-GF-R0-0"]
    slot_a, slot_b = draw.slots["E-GF-R1-0"]
    assert (slot_a.feeder_play_unit_id, slot_a.feeder_take) == (
        "E-GF-R0-0", "winner",
    )
    assert (slot_b.feeder_play_unit_id, slot_b.feeder_take) == (
        "E-GF-R0-0", "loser",
    )
    _assert_valid_waves(draw)

    # Without the knob there is no reset unit.
    plain = generate_double_elimination(
        _participants(4), event_id="E", play_unit_id_prefix="E",
    )
    assert "E-GF-R1-0" not in plain.play_units


# ---- 5. Byes: N=5 hollows L without exceptions -------------------------------


def test_n5_byes_hollow_losers_bracket():
    draw = generate_double_elimination(
        _participants(5), event_id="E", play_unit_id_prefix="E"
    )
    state = _register(draw)

    # Both feeders of E-L-R0-1 are W-R0 bye walkovers → swept to a
    # double-BYE NONE result already at registration.
    assert state.results["E-L-R0-1"].winner_side == WinnerSide.NONE
    assert state.results["E-L-R0-1"].walkover is True

    _play_all(state, draw)

    assert set(state.results) == set(draw.play_units)  # everything resolved
    real = [pu_id for pu_id, r in state.results.items() if not r.walkover]
    # 2n-2 real matches when the W champion never loses (5 players → 8).
    assert len(real) == 2 * 5 - 2
    # The GF was a real match between real players.
    gf = state.play_units["E-GF-R0-0"]
    assert gf.side_a and gf.side_b


# ---- 6. Registry config -----------------------------------------------------


def test_de_registry_config():
    from services.bracket.formats import FORMAT_REGISTRY

    spec = FORMAT_REGISTRY["de"]
    assert spec.label == "Double elimination"
    assert spec.uses_bracket_size is True
    assert spec.normalize_config({}, 8) == {"grand_final_reset": False}
    assert spec.normalize_config(
        {"grand_final_reset": True, "junk": 1}, 8
    ) == {"grand_final_reset": True}
    with pytest.raises(ValueError, match="grand_final_reset"):
        spec.normalize_config({"grand_final_reset": "yes"}, 8)


# ---- 7. Route round-trip -----------------------------------------------------


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
    return seed_tournament(client, "DE Format Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


def _players(n: int) -> list[dict]:
    return [{"id": f"p{i}", "name": f"Player {i}"} for i in range(1, n + 1)]


def test_de_route_end_to_end(client, tid):
    # Session with a throwaway SE seed event (segments must stay None).
    r = client.post(
        _bracket_url(tid),
        json={
            "courts": 2, "total_slots": 64, "rest_between_rounds": 1,
            "interval_minutes": 30, "time_limit_seconds": 2.0,
            "events": [{
                "id": "_SEED", "discipline": "Seed", "format": "se",
                "participants": _players(2), "duration_slots": 1,
            }],
        },
    )
    assert r.status_code == 200, r.text

    # Upsert a 4-player DE draw. normalize_config fills the default knob.
    r = client.post(
        _bracket_url(tid, "events", "DE"),
        json={"discipline": "MS", "format": "de", "participants": _players(4)},
    )
    assert r.status_code == 200, r.text
    ev = next(e for e in r.json()["events"] if e["id"] == "DE")
    assert ev["config"] == {"grand_final_reset": False}

    # Generate — real (tiny) solve.
    r = client.post(
        _bracket_url(tid, "events", "DE", "generate"), json={"wipe": False}
    )
    assert r.status_code == 200, r.text

    def check_shape(out):
        ev = next(e for e in out["events"] if e["id"] == "DE")
        assert ev["segments"] is not None
        assert [s["id"] for s in ev["segments"]] == ["W", "L", "GF"]
        assert [s["label"] for s in ev["segments"]] == [
            "Main draw", "Losers bracket", "Grand final",
        ]
        w = ev["segments"][0]
        assert w["rounds"] == [["DE-W-R0-0", "DE-W-R0-1"], ["DE-W-R1-0"]]
        assert w["positions"] is None
        # se draws must NOT gain segments.
        seed_ev = next(e for e in out["events"] if e["id"] == "_SEED")
        assert seed_ev["segments"] is None
        pus = {p["id"]: p for p in out["play_units"]}
        assert pus["DE-W-R0-0"]["segment"] == "W"
        assert pus["DE-L-R1-0"]["segment"] == "L"
        assert pus["DE-GF-R0-0"]["segment"] == "GF"
        assert pus["_SEED-R0-0"]["segment"] is None

    check_shape(r.json())

    # The same shape must survive persistence → hydration.
    r = client.get(_bracket_url(tid))
    assert r.status_code == 200, r.text
    check_shape(r.json())

    # Play it through the GF. BWF placement for [p1..p4] is
    # [p1, p4, p3, p2]: W-R0-0 = p1 v p4, W-R0-1 = p3 v p2.
    def record(pu_id, side):
        rr = client.post(
            _bracket_url(tid, "results"),
            json={"play_unit_id": pu_id, "winner_side": side,
                  "finished_at_slot": 1},
        )
        assert rr.status_code == 200, rr.text
        return rr.json()

    record("DE-W-R0-0", "A")            # p1 beats p4 → p4 drops
    out = record("DE-W-R0-1", "B")      # p2 beats p3 → p3 drops
    pus = {p["id"]: p for p in out["play_units"]}
    assert pus["DE-L-R0-0"]["side_a"] == ["p4"]
    assert pus["DE-L-R0-0"]["side_b"] == ["p3"]

    record("DE-L-R0-0", "A")            # p4 beats p3
    out = record("DE-W-R1-0", "A")      # p1 wins W; p2 drops to L final
    pus = {p["id"]: p for p in out["play_units"]}
    assert pus["DE-L-R1-0"]["side_a"] == ["p4"]
    assert pus["DE-L-R1-0"]["side_b"] == ["p2"]

    out = record("DE-L-R1-0", "B")      # p2 wins L
    pus = {p["id"]: p for p in out["play_units"]}
    assert pus["DE-GF-R0-0"]["side_a"] == ["p1"]
    assert pus["DE-GF-R0-0"]["side_b"] == ["p2"]

    out = record("DE-GF-R0-0", "A")     # p1 champion
    de_results = {
        res["play_unit_id"] for res in out["results"]
        if res["play_unit_id"].startswith("DE-")
    }
    assert de_results == {
        "DE-W-R0-0", "DE-W-R0-1", "DE-W-R1-0",
        "DE-L-R0-0", "DE-L-R1-0", "DE-GF-R0-0",
    }
