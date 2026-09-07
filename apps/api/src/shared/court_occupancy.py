"""Court occupancy and dispute derivation — the one authority (§4.3).

Contract: ``docs/reference/contracts/state-and-formatting.md`` §4.

Court occupancy is a **three-value** answer, not a boolean: a court is
``free``, ``occupied`` (exactly one match currently playing on it), or
``disputed`` (two or more matches claim it as currently in play). Six
independent implementations of this used to exist across the backend and
console (the code map's D1); this module is the backend half of the single
derivation both the write guard (``operations/match_state.py``) and the
counts (``workspaces/workspace_signals.py``) now redirect to. The console
twin is ``apps/console/src/platform/domain/courtOccupancy.ts`` and computes
the same buckets from the same predicates.

Ruling C1 (state-and-formatting contract §4.2): the *dispute* is always
derived, on demand, from current match rows — never persisted. Only the
*resolution* of a dispute is persisted, as an ordinary command
(``operations/commands.py`` action ``resolve_court``).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Optional, Protocol

from shared.match_vocabulary import occupies_court_now

CourtState = Literal["free", "occupied", "disputed"]


class OccupancyMatch(Protocol):
    """The minimal shape this module needs from a match-like row.

    Deliberately a ``Protocol`` rather than a concrete type: callers hand
    this module ORM rows, plain dicts wrapped in a small adapter, or
    dataclasses — whatever the call site already has. Only ``id``,
    ``status`` and ``court_id`` are read for occupancy; the richer fields
    below are read only when present, for building a full ``CourtDispute``.
    """

    id: str
    status: str
    court_id: Optional[int]


@dataclass(frozen=True)
class CourtClaim:
    """One match's claim on a disputed court — §4.2's ``CourtClaim``."""

    match_key: str
    match_identity: Optional[str]
    status: str
    started_at: Optional[str]
    source: Optional[str]
    version: Optional[int]


@dataclass(frozen=True)
class CourtDispute:
    """A derived, unresolved (or resolved) claim conflict on one court."""

    court_id: int
    claims: List[CourtClaim] = field(default_factory=list)
    detected_at: Optional[str] = None
    resolution: Optional[dict] = None


def _get(match: Any, name: str, default: Any = None) -> Any:
    if isinstance(match, dict):
        return match.get(name, default)
    return getattr(match, name, default)


def derive_court_states(
    matches: Iterable[Any],
) -> Dict[int, CourtState]:
    """Bucket every court that any match claims into free/occupied/disputed.

    Only courts named by at least one match currently occupying it
    (``occupies_court_now``) appear in the result — a court nobody claims is
    "free" by omission, which is how callers with a known court roster (e.g.
    Workspaces, which knows the configured court count) compute
    ``courtsFree`` themselves: ``court_count - len(states)`` where every
    entry is ``occupied`` or ``disputed`` (a "free" entry never appears here
    because nothing claims it).
    """
    by_court: Dict[int, List[Any]] = {}
    for match in matches:
        status = _get(match, "status")
        court_id = _get(match, "court_id")
        if court_id is None:
            continue
        if not occupies_court_now(status):
            continue
        by_court.setdefault(court_id, []).append(match)

    states: Dict[int, CourtState] = {}
    for court_id, claimants in by_court.items():
        states[court_id] = "occupied" if len(claimants) == 1 else "disputed"
    return states


def derive_disputes(matches: Iterable[Any]) -> List[CourtDispute]:
    """Return one ``CourtDispute`` per court with 2+ current claimants."""
    by_court: Dict[int, List[Any]] = {}
    for match in matches:
        status = _get(match, "status")
        court_id = _get(match, "court_id")
        if court_id is None or not occupies_court_now(status):
            continue
        by_court.setdefault(court_id, []).append(match)

    disputes: List[CourtDispute] = []
    for court_id, claimants in sorted(by_court.items()):
        if len(claimants) < 2:
            continue
        claims = [
            CourtClaim(
                match_key=_get(match, "id"),
                match_identity=_get(match, "match_identity"),
                status=_get(match, "status"),
                started_at=_get(match, "started_at"),
                source=_get(match, "source"),
                version=_get(match, "version"),
            )
            for match in claimants
        ]
        disputes.append(CourtDispute(court_id=court_id, claims=claims))
    return disputes


def courts_free(court_count: int, states: Dict[int, CourtState]) -> int:
    """Courts with no current claim at all — a disputed court is NOT free."""
    claimed = len(states)
    return max(court_count - claimed, 0)


def occupied_court_count(states: Dict[int, CourtState]) -> int:
    """Number of courts in state ``occupied`` — feeds the ``playing`` count.

    A disputed court contributes zero here and one to
    :func:`disputed_court_count` (§4.1's counting rule, fixing D3).
    """
    return sum(1 for state in states.values() if state == "occupied")


def disputed_court_count(states: Dict[int, CourtState]) -> int:
    """Number of courts in state ``disputed``."""
    return sum(1 for state in states.values() if state == "disputed")
