"""The controlled ``representation`` field (D4 / O4).

Two risks worth a test, and only two: that a valid code survives the trip
through the DTOs the roster is written with (a field that silently vanishes
on the way in looks identical to one that was never typed), and that an
unlisted code is REFUSED rather than stored (a controlled vocabulary that
accepts anything is free text with extra ceremony).
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from core.representation import (
    UNKNOWN_LABEL,
    normalize_representation,
    representation_name,
)
from core.schemas import BracketPlayerDTO, PlayerDTO


def test_a_valid_code_round_trips_through_both_roster_dtos():
    """Meet and Bracket rosters carry the same field, normalized the same."""
    meet = PlayerDTO(id="p1", name="Alex Tan", groupId="g1", representation="tpe")
    draw = BracketPlayerDTO(id="p1", name="Alex Tan", representation=" ENG ")

    # Case and surrounding whitespace are canonicalized, not rejected: a
    # pasted code is still the code the operator meant.
    assert meet.representation == "TPE"
    assert draw.representation == "ENG"
    assert representation_name(meet.representation) == "Chinese Taipei"

    # And it survives serialization, which is what the blob actually stores.
    assert meet.model_dump()["representation"] == "TPE"


def test_unknown_is_absence_and_an_unlisted_code_is_refused():
    """``None``/``""`` mean Unknown; anything else off the list is a 422."""
    for blank in (None, "", "   "):
        assert PlayerDTO(
            id="p1", name="Alex Tan", groupId="g1", representation=blank
        ).representation is None
    assert PlayerDTO(id="p1", name="Alex Tan", groupId="g1").representation is None
    assert representation_name(None) == UNKNOWN_LABEL

    with pytest.raises(ValidationError) as caught:
        BracketPlayerDTO(id="p1", name="Alex Tan", representation="ZZZ")
    # The refusal names the field and says what a good value looks like —
    # a 422 that only says "value error" leaves the operator guessing.
    assert "unknown representation code" in str(caught.value)

    with pytest.raises(ValueError):
        normalize_representation("United States")



def test_csv_import_preserves_controlled_representation_and_unknown():
    from bracket.io.import_matches import _build_draw_from_csv_rows
    rows = [{"round": "0", "match_index": "0", "side_a": "Alice", "side_b": "Bob",
             "side_a_representation": "TPE", "side_b_representation": ""}]
    draw = _build_draw_from_csv_rows("MS", "se", rows)
    assert draw.participants["Alice"].metadata["representation"] == "TPE"
    assert draw.participants["Bob"].metadata.get("representation") is None
    rows[0]["side_a_representation"] = "ZZZ"
    with pytest.raises(ValueError):
        _build_draw_from_csv_rows("MS", "se", rows)
