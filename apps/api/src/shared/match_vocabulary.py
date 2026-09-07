"""Canonical match-state vocabulary and occupancy predicates.

Contract: ``docs/reference/contracts/state-and-formatting.md`` §2 and §4.

This module is the one authority for two related but distinct questions
that used to be answered ad hoc, differently, in five or more places
(the code map's D4/D5/D20):

1. What is the canonical set of match states, and what is the *total,
   bidirectional* map between it and the legacy wire spellings
   (``started`` <-> ``playing`` in particular, and ``retired`` — which the
   one-directional map in ``operations/match_state_routes.py`` used to drop
   entirely)?
2. Does a given status mean "a court is occupied right now" or "a court is
   committed to this match" — two different questions with two different
   answers for ``called`` (see §4.1).

Lives in ``shared/`` because Operations, Entries, Display and Workspaces all
need it and the import-linter contract ``shared-is-shared`` forbids any one
of them from owning it.
"""
from __future__ import annotations

from typing import Dict, FrozenSet

from db.models import MatchStatus

# The canonical persisted set, restated here for readers of this module
# rather than sending them to ``db.models``.
CANONICAL_STATUSES: FrozenSet[MatchStatus] = frozenset(
    {
        MatchStatus.SCHEDULED,
        MatchStatus.CALLED,
        MatchStatus.PLAYING,
        MatchStatus.FINISHED,
        MatchStatus.RETIRED,
    }
)

# The legacy wire spelling for each canonical status. ``started`` is the
# historical spelling of ``playing``; every other canonical status keeps its
# own name. This map is TOTAL over ``CANONICAL_STATUSES`` and, unlike the
# one-directional table it replaces, includes ``retired`` — D4.
CANONICAL_TO_LEGACY: Dict[MatchStatus, str] = {
    MatchStatus.SCHEDULED: "scheduled",
    MatchStatus.CALLED: "called",
    MatchStatus.PLAYING: "started",
    MatchStatus.FINISHED: "finished",
    MatchStatus.RETIRED: "retired",
}

# The inverse map, built from the forward one so the two can never drift.
LEGACY_TO_CANONICAL: Dict[str, MatchStatus] = {
    legacy: canonical for canonical, legacy in CANONICAL_TO_LEGACY.items()
}

# A second acceptable spelling of the canonical value is also accepted on
# input (a match's own ``.value`` reads e.g. "playing", not "started"), so
# call sites can hand this module either legacy or canonical wire text.
_CANONICAL_VALUE_TO_STATUS: Dict[str, MatchStatus] = {
    status.value: status for status in CANONICAL_STATUSES
}


def legacy_to_canonical(value: str) -> MatchStatus:
    """Translate a legacy or canonical wire string to the canonical enum.

    Total over the legacy vocabulary (including ``retired``) and also
    accepts a canonical spelling directly, so callers do not need to know
    which vocabulary a given string came from. Raises ``KeyError`` for a
    truly unrecognised value — callers decide how to render "unknown"
    (§2.2: never coerce to ``scheduled``).
    """
    if value in LEGACY_TO_CANONICAL:
        return LEGACY_TO_CANONICAL[value]
    return _CANONICAL_VALUE_TO_STATUS[value]


def canonical_to_legacy(status: MatchStatus) -> str:
    """Translate a canonical status to its legacy wire spelling."""
    return CANONICAL_TO_LEGACY[status]


def occupies_court_now(status: "MatchStatus | str") -> bool:
    """True iff a match in ``status`` is actually occupying a court now.

    Only ``playing`` occupies a court. ``called`` is excluded on purpose —
    players are still walking to the court, not on it. Feeds the counting
    rules (§4.1: ``playing``, ``courtsFree``) and conflict detection.
    """
    return _coerce(status) is MatchStatus.PLAYING


def holds_court_commitment(status: "MatchStatus | str") -> bool:
    """True iff a match in ``status`` has a court committed to it.

    True for ``called``, ``playing``, ``finished`` and ``retired`` — exactly
    the set ``operations.match_state.LOCKED_STATUSES`` already names. Feeds
    assignment decisions (a court cannot be reassigned out from under a
    called-but-not-yet-playing match) rather than occupancy counts.
    """
    return _coerce(status) in (
        MatchStatus.CALLED,
        MatchStatus.PLAYING,
        MatchStatus.FINISHED,
        MatchStatus.RETIRED,
    )


def _coerce(status: "MatchStatus | str") -> MatchStatus:
    if isinstance(status, MatchStatus):
        return status
    try:
        return MatchStatus(status)
    except ValueError:
        return legacy_to_canonical(status)
