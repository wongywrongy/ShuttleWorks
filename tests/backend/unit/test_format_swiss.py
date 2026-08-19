"""S6 — Swiss generator: R1 seed-fold + swiss_rounds config.

Pins:
  1. generate_swiss returns ROUND 0 ONLY: seed-fold pairing (top half vs
     bottom half), concrete sides, no dependencies, ids ``{prefix}-R0-{m}``
     with NO segment component, metadata without a ``segment`` key, and
     ``Draw.segments`` None (Swiss is single-segment).
  2. Odd fields: the LAST seed gets the bye unit (side_b None, slot BYE —
     the SE idiom register_draw auto-walkovers).
  3. event.parameters carries participant_count + swiss_rounds +
     resolved_config (what the generate route persists for "Round k of K").
  4. normalize_swiss_config: default max(1, ceil(log2 n)) clamped to n-1;
     explicit values clamp too; non-int / bool / < 1 are ValueErrors;
     unknown keys dropped.
  5. Registry entry: progressive + has_standings, dispatch parity with the
     direct generator.
"""
from __future__ import annotations

import pytest

from scheduler_core.domain.tournament import Participant, ParticipantType

from bracket.formats import FORMAT_REGISTRY
from bracket.formats.swiss import (
    generate_swiss,
    normalize_swiss_config,
)


def _participants(n: int) -> list[Participant]:
    return [
        Participant(id=f"p{i}", name=f"P{i}", type=ParticipantType.PLAYER)
        for i in range(1, n + 1)
    ]


# ---- 1/3. R1 seed-fold, even field -------------------------------------------


def test_r1_seed_fold_even_field():
    draw = generate_swiss(
        _participants(6), event_id="E", play_unit_id_prefix="E"
    )

    assert draw.rounds == [["E-R0-0", "E-R0-1", "E-R0-2"]]
    assert draw.segments is None
    assert sorted(draw.play_units) == ["E-R0-0", "E-R0-1", "E-R0-2"]

    # Seed fold: i vs i + n/2 (top half vs bottom half).
    expected_sides = {
        "E-R0-0": (["p1"], ["p4"]),
        "E-R0-1": (["p2"], ["p5"]),
        "E-R0-2": (["p3"], ["p6"]),
    }
    for m, (pu_id, (side_a, side_b)) in enumerate(expected_sides.items()):
        pu = draw.play_units[pu_id]
        assert pu.side_a == side_a
        assert pu.side_b == side_b
        assert pu.dependencies == []
        assert pu.metadata == {"round": 0, "match_index": m}
        assert "segment" not in pu.metadata
        slot_a, slot_b = draw.slots[pu_id]
        assert slot_a.participant_id == side_a[0]
        assert slot_b.participant_id == side_b[0]
        assert slot_a.feeder_play_unit_id is None
        assert slot_b.feeder_play_unit_id is None

    # ceil(log2 6) == 3; persisted for "Round k of K" rendering.
    assert draw.event.parameters == {
        "participant_count": 6,
        "swiss_rounds": 3,
        "resolved_config": {"swiss_rounds": 3},
    }


# ---- 2. Odd field: bye to the last seed ---------------------------------------


def test_r1_odd_field_gives_bye_to_last_seed():
    draw = generate_swiss(
        _participants(7), event_id="E", play_unit_id_prefix="E"
    )

    assert draw.rounds == [["E-R0-0", "E-R0-1", "E-R0-2", "E-R0-3"]]
    pairs = {
        pu_id: (pu.side_a, pu.side_b)
        for pu_id, pu in draw.play_units.items()
    }
    assert pairs["E-R0-0"] == (["p1"], ["p4"])
    assert pairs["E-R0-1"] == (["p2"], ["p5"])
    assert pairs["E-R0-2"] == (["p3"], ["p6"])
    # The LAST seed sits out — SE bye idiom: side_b None, slot BYE.
    assert pairs["E-R0-3"] == (["p7"], None)
    slot_a, slot_b = draw.slots["E-R0-3"]
    assert slot_a.participant_id == "p7"
    assert slot_b.is_bye
    assert draw.play_units["E-R0-3"].metadata == {
        "round": 0, "match_index": 3,
    }
    assert draw.event.parameters["swiss_rounds"] == 3  # ceil(log2 7)


def test_generate_swiss_needs_two_participants():
    with pytest.raises(ValueError, match="at least 2"):
        generate_swiss(_participants(1))


# ---- 4. normalize_swiss_config -------------------------------------------------


@pytest.mark.parametrize(
    "n,expected",
    [(2, 1), (3, 2), (5, 3), (6, 3), (8, 3), (16, 4), (17, 5)],
)
def test_normalize_default_rounds(n, expected):
    assert normalize_swiss_config({}, n) == {"swiss_rounds": expected}


def test_normalize_clamps_to_field_size_minus_one():
    # Explicit values clamp to n-1 (everyone has met by then)...
    assert normalize_swiss_config({"swiss_rounds": 99}, 4) == {
        "swiss_rounds": 3,
    }
    # ...while in-range values pass through untouched.
    assert normalize_swiss_config({"swiss_rounds": 3}, 8) == {
        "swiss_rounds": 3,
    }
    # Default clamps too: ceil(log2 3) == 2 == n-1.
    assert normalize_swiss_config({}, 3) == {"swiss_rounds": 2}


def test_normalize_drops_unknown_keys():
    assert normalize_swiss_config({"swiss_rounds": 2, "junk": True}, 8) == {
        "swiss_rounds": 2,
    }


@pytest.mark.parametrize("bad", ["3", 0, -1, True, 1.5, {}])
def test_normalize_rejects_bad_values(bad):
    with pytest.raises(ValueError, match="swiss_rounds"):
        normalize_swiss_config({"swiss_rounds": bad}, 8)


# ---- 5. Registry entry ----------------------------------------------------------


def test_swiss_registry_entry_and_dispatch_parity():
    spec = FORMAT_REGISTRY["swiss"]
    assert spec.label == "Swiss"
    assert spec.progressive is True
    assert spec.has_standings is True
    assert spec.uses_bracket_size is False
    assert spec.normalize_config({}, 6) == {"swiss_rounds": 3}

    participants = _participants(5)

    def shape(draw):
        return (
            sorted(draw.play_units.keys()),
            [list(r) for r in draw.rounds],
            {
                pu_id: (pu.side_a, pu.side_b, dict(pu.metadata))
                for pu_id, pu in draw.play_units.items()
            },
            dict(draw.event.parameters),
        )

    direct = generate_swiss(
        participants, event_id="E", play_unit_id_prefix="E",
        duration_slots=1, config={},
    )
    via_registry = spec.generate(
        participants, event_id="E", play_unit_id_prefix="E",
        duration_slots=1, seeded_count=None, bracket_size=None,
        rr_rounds=1, config={},
    )
    assert shape(direct) == shape(via_registry)
