"""Server-owned public tournament lifecycle vocabulary.

Phase is derived at the API boundary from persisted tournament facts. Clients
must not duplicate this precedence: the same value drives the public hero,
discovery metadata, and the next-action decision.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from typing import Optional, Sequence
from zoneinfo import ZoneInfo


class TournamentPhase(str, enum.Enum):
    ANNOUNCED = "announced"
    ENTRIES_OPEN = "entries_open"
    ENTRIES_CLOSED = "entries_closed"
    DRAWS_PUBLISHED = "draws_published"
    LIVE = "live"
    COMPLETE = "complete"
    ARCHIVED = "archived"


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _local_date(now: datetime, time_zone: str) -> date:
    try:
        zone = ZoneInfo(time_zone or "UTC")
    except Exception:
        zone = timezone.utc
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(zone).date()


def derive_tournament_phase(
    *,
    status: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    time_zone: str = "UTC",
    entries_open: bool = False,
    entries_configured: bool = False,
    draws_published: bool = False,
    match_states: Sequence[str] = (),
    now: Optional[datetime] = None,
) -> TournamentPhase:
    """Derive the public lifecycle phase with stable, explicit precedence.

    ``archived`` is an operator-authored terminal state. A dated tournament
    whose local end date has passed is complete even when results have not yet
    been published. During the tournament window a live/called match wins over
    the draw-published state. Before the window, publication and entry flags
    describe the next useful public action. Missing or malformed dates never
    manufacture a date; flags remain the source of truth.
    """
    if status == "archived":
        return TournamentPhase.ARCHIVED
    now = now or datetime.now(timezone.utc)
    today = _local_date(now, time_zone)
    start = _parse_date(start_date)
    end = _parse_date(end_date) or start

    if end is not None and today > end:
        return TournamentPhase.COMPLETE
    in_window = start is not None and end is not None and start <= today <= end
    if (in_window or (start is None and end is None)) and any(
        state in {"called", "playing", "live"} for state in match_states
    ):
        return TournamentPhase.LIVE
    if draws_published and (in_window or start is None or today < start):
        return TournamentPhase.DRAWS_PUBLISHED
    if entries_open:
        return TournamentPhase.ENTRIES_OPEN
    if entries_configured:
        return TournamentPhase.ENTRIES_CLOSED
    if start is not None and today >= start and draws_published:
        return TournamentPhase.DRAWS_PUBLISHED
    return TournamentPhase.ANNOUNCED


__all__ = ["TournamentPhase", "derive_tournament_phase"]
