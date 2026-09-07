"""``shared/match_reference.py`` is held to the console's identity authority.

Every case below is transcribed from
``apps/console/src/platform/domain/__tests__/matchIdentity.test.ts`` — the
same coordinates, the same expected string. That is the whole point of the
module (state-and-formatting §6.1, "One reference, both tiers"): if the two
formatters ever disagree, a public bracket node and the operator's match list
name one match two ways, and this file fails rather than the reader finding
out.

Public-visual-fixes P3.
"""

import pytest

from shared.match_reference import (
    bracket_identity,
    format_match_identity,
    meet_identity,
)


def _elim(stage, sequence, *, segment=None, draw_format="se", round_index=0):
    return bracket_identity(
        event_code="MS",
        draw_format=draw_format,
        round_index=round_index,
        stage=stage,
        sequence=sequence,
        segment=segment,
    )


@pytest.mark.parametrize(
    ("identity", "expected"),
    [
        # matchIdentity.test.ts: "derives a round-robin identity"
        (
            bracket_identity(
                event_code="MS", draw_format="rr", round_index=0, stage="R1", sequence=2
            ),
            "MS R1·2",
        ),
        # "...and an elimination one" (MD R32·2)
        (
            bracket_identity(
                event_code="MD", draw_format="se", round_index=0, stage="R32", sequence=2
            ),
            "MD R32·2",
        ),
        # "preserves conventional QF/SF and final labels"
        (_elim("QF", 2), "MS QF2"),
        (_elim("SF", 2), "MS SF2"),
        (_elim("F", 1), "MS F"),
        # "preserves segment and grand-final conventions"
        (_elim("SF", 1, segment="L", draw_format="de", round_index=1), "MS L SF1"),
        (_elim("GF", 1, segment="GF", draw_format="de", round_index=0), "MS GF"),
        (_elim("GF", 1, segment="GF", draw_format="de", round_index=1), "MS GF-R"),
        # "omits only the configured main segment"
        (_elim("QF", 1, segment="W", draw_format="de"), "MS QF1"),
        (_elim("QF", 1, segment="W", draw_format="compass"), "MS W QF1"),
        # Monrad classification bracket: "P5_8" reads as the range.
        (_elim("F", 1, segment="P5_8", draw_format="monrad"), "MS 5–8 F"),
        # "formats Meet event rank and ordinal fallback"
        (meet_identity(event_code="MS", position=1, sequence=1), "MS1"),
        (meet_identity(event_code="", sequence=7), "M7"),
        (meet_identity(event_code="MS", position=None, sequence=7), "MS"),
    ],
)
def test_the_reference_is_spelled_exactly_as_the_console_spells_it(identity, expected):
    assert format_match_identity(identity) == expected


@pytest.mark.parametrize(
    ("identity", "expected"),
    [
        (_elim("R32", 11), "R32·11"),
        (_elim("QF", 2), "QF2"),
        (_elim("F", 1), "F"),
        (_elim("SF", 1, segment="L", draw_format="de", round_index=1), "L SF1"),
        (
            bracket_identity(
                event_code="MS", draw_format="rr", round_index=2, stage="R3", sequence=4
            ),
            "R3·4",
        ),
        (meet_identity(event_code="MS", position=3), "3"),
    ],
)
def test_a_single_event_view_may_drop_the_event_code(identity, expected):
    """Contract §6.1: in a view whose event is already unambiguous (one draw)
    the reference may read ``R16·2 · 10:00 · Court 3``; a mixed-event view
    keeps the code. Same coordinates, same authority, one flag."""
    assert format_match_identity(identity, include_event=False) == expected
    # ...and the full spelling is the short one with the code in front.
    assert format_match_identity(identity).endswith(expected)


def test_coordinates_that_cannot_name_a_match_render_nothing():
    """Never a machine id, never the rendered row number (§6.1)."""
    assert format_match_identity(meet_identity(event_code="")) is None
    assert (
        format_match_identity(
            bracket_identity(
                event_code="MS", draw_format="se", round_index=0, stage="R16", sequence=1
            ).__class__(source="bracket", event_code="MS", phase=None, sequence=None)
        )
        is None
    )
