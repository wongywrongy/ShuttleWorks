"""The ONE human match reference, spelled server-side.

This is the backend twin of ``apps/console/src/platform/domain/matchIdentity.ts``
and it exists for exactly one reason (state-and-formatting contract §6.1,
"One reference, both tiers"): a reader told ``MS R32·11`` at the desk and
``Match 11`` on the public draw has been given two identities for one match,
and neither can be used to talk to the other.

The console formats from decomposed identity COORDINATES - event code, phase
(kind / round index / stage / segment) and a 1-based sequence.  The public
wire carried none of them (recorded as the public-P0 wire gap in
state-and-formatting §6.4), so no public surface could render the shared
string.  This module publishes it: the same coordinates, the same grammar,
one function.

**Faithfulness is the contract, not tidiness.**  Every rule below mirrors
``formatMatchIdentity`` / ``playUnitIdentity`` exactly, including two the
backend would otherwise spell differently:

* ``round_robin`` is ``format == "rr"`` ALONE.  ``entries_site.py`` treats
  ``swiss`` as non-knockout for its ROUND LABELS, and the console does not -
  so a swiss draw's reference reads ``R16``-style on both tiers.  That is a
  shared defect, logged in ``docs/reference/debt-log.md``; diverging here to
  fix it on one tier would break the very invariant this module exists for.
* the separator is U+00B7 (``·``), which is what the authority emits.
  ``public-visual-fixes.md`` writes the same reference as ``MS R32-11``.

Nothing here reads a database row, a request or a domain module: it is a
pure formatter over values its caller already holds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

__all__ = [
    "BracketPhase",
    "MatchIdentity",
    "bracket_identity",
    "meet_identity",
    "format_match_identity",
    "MAIN_SEGMENT",
]

PhaseKind = Literal["elimination", "round_robin"]

#: Each multi-segment format's MAIN segment - its units keep plain stage
#: names ("MS QF1"), exactly like an SE draw.  Keyed by format because the
#: letters collide across formats: DE's main is 'W' (winners) while
#: compass's 'W' is the West consolation bracket.  Mirrors
#: ``bracketLabels.ts::MAIN_SEGMENT``.
MAIN_SEGMENT = {"de": "W", "monrad": "M", "compass": "E"}


@dataclass(frozen=True)
class BracketPhase:
    kind: PhaseKind
    round_index: int
    #: Already-derived stage (F, SF, QF, R32, or RR's R1, R2, ...).
    stage: str
    #: Segment code ('W'/'L'/'GF'/'P5_8'/compass letters), or None for a
    #: single-segment draw.  This is the segment's ID, not its label - the
    #: console formats from ``play_unit.segment``, which is the same value.
    segment: Optional[str] = None
    #: The format's intentionally unlabelled segment (see MAIN_SEGMENT).
    main_segment: Optional[str] = None


@dataclass(frozen=True)
class MatchIdentity:
    source: Literal["bracket", "meet"]
    event_code: str
    phase: Optional[BracketPhase] = None
    #: Bracket: the 1-based sequence within the round.  Meet: the display
    #: ordinal behind the ``M{n}`` fallback.
    sequence: Optional[int] = None
    #: Meet only: the number in the eventRank (``MS1`` -> 1).
    position: Optional[int] = None


def bracket_identity(
    *,
    event_code: str,
    draw_format: str,
    round_index: int,
    stage: str,
    sequence: int,
    segment: Optional[str] = None,
) -> MatchIdentity:
    """The bracket adapter's one identity projection (``playUnitIdentity``).

    ``stage`` is the caller's already-derived F/SF/QF/R32 (or RR's R1, R2)
    label: ``entries_site.py`` derives it with ``_short_round`` off the same
    (total rounds, round index) pair the console derives it from, so there is
    no second stage ladder here to drift from that one.
    """
    return MatchIdentity(
        source="bracket",
        event_code=event_code,
        phase=BracketPhase(
            kind="round_robin" if draw_format == "rr" else "elimination",
            round_index=round_index,
            stage=stage,
            segment=segment,
            main_segment=MAIN_SEGMENT.get(draw_format),
        ),
        sequence=sequence,
    )


def meet_identity(
    *, event_code: str, position: Optional[int] = None, sequence: Optional[int] = None
) -> MatchIdentity:
    return MatchIdentity(
        source="meet", event_code=event_code, position=position, sequence=sequence
    )


def _segment_short(segment: str, kind: PhaseKind, main_segment: Optional[str]) -> str:
    """``segmentShort`` - existing bracket label conventions, no new segment."""
    if kind == "elimination" and segment == main_segment:
        return ""
    if segment == "L":
        return "L"
    if segment == "PLATE":
        return "PL"
    if segment.startswith("P") and "_" in segment:
        head, _, tail = segment[1:].partition("_")
        if head.isdigit() and tail.isdigit():
            return f"{head}–{tail}"
    return segment


def format_match_identity(
    identity: MatchIdentity, *, include_event: bool = True
) -> Optional[str]:
    """``MS R32·11`` / ``MS QF2`` / ``MS F`` - or the same without the event
    code when the surrounding view already makes the event unambiguous
    (contract §6.1: a single draw may read ``R16·2 · 10:00 · Court 3``; a
    mixed-event schedule keeps the code).

    Returns ``None`` when the coordinates cannot name a match at all.  A
    caller renders nothing in that case; it never falls back to a machine id
    or to the rendered row number.
    """
    event = identity.event_code if include_event else ""

    if identity.source == "meet":
        if identity.event_code:
            if not include_event:
                return str(identity.position) if identity.position is not None else None
            return (
                f"{identity.event_code}{identity.position}"
                if identity.position is not None
                else identity.event_code
            )
        if identity.sequence is not None:
            return f"M{identity.sequence}"
        return None

    phase = identity.phase
    if phase is None or identity.sequence is None:
        return None

    def _join(*parts: str) -> str:
        return " ".join(part for part in parts if part)

    if phase.kind == "round_robin":
        return _join(event, f"{phase.stage}·{identity.sequence}")

    if phase.segment == "GF":
        reset = phase.round_index > 0 or identity.sequence > 1
        return _join(event, f"GF{'-R' if reset else ''}")

    tag = _segment_short(phase.segment, phase.kind, phase.main_segment) if phase.segment else ""
    head = _join(event, tag)
    if phase.stage == "F":
        return _join(head, "F")
    separator = "·" if phase.stage.startswith("R") else ""
    return _join(head, f"{phase.stage}{separator}{identity.sequence}")
