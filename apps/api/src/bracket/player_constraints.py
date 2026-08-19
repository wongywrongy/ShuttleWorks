"""Per-player availability + rest extras for the bracket solve path.

SP-D7 S2: bracket roster players (``TournamentStateDTO.bracketPlayers``)
carry optional POSITIVE availability windows (HH:mm) and an optional
per-player ``restSlots``. This module converts those roster records into
slot-native ``PlayerExtras`` that ``adapter.build_players`` merges into
the engine ``Player`` objects, so the engine's existing ``availability``
and ``rest`` constraints do the actual enforcement.

Time base: the bracket session's ``start_time``. Slot *k* covers the
wall-clock range ``start_time + k*interval`` (see
``bracket/io/export_schedule.py``), so HH:mm windows map onto
slots with the same overnight-aware arithmetic the meet adapter uses
(``shared/sport/badminton.py:_time_to_slot``) — reimplemented locally
because bracket services must not import from the meet adapters layer.

When ``start_time`` is ``None`` the session has no wall-clock anchor, so
HH:mm windows cannot map to slots — availability comes back empty
(= unconstrained, today's behaviour). ``rest_slots`` is slot-native and
applies regardless.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

from core.schemas import BracketPlayerDTO

logger = logging.getLogger("scheduler.bracket.player_constraints")


@dataclass
class PlayerExtras:
    """Slot-native per-player scheduling extras.

    ``availability_slots`` are POSITIVE (allowed) half-open slot windows
    ``[start, end)``; empty means available for the whole session.
    """

    availability_slots: List[Tuple[int, int]] = field(default_factory=list)
    rest_slots: int = 1


def hhmm_to_minutes(hhmm: str) -> int:
    """``"HH:mm"`` → minutes since midnight. Raises ``ValueError`` on
    malformed input (roster windows are DTO-validated upstream; this is
    a defensive backstop, not an HTTP-level concern)."""
    try:
        hours, minutes = map(int, hhmm.split(":"))
    except (ValueError, AttributeError):
        raise ValueError(f"invalid time string: {hhmm!r}")
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"time out of range: {hhmm!r}")
    return hours * 60 + minutes


def time_to_slot(hhmm: str, day_start: str, interval_minutes: int) -> int:
    """Overnight-aware HH:mm → slot index relative to ``day_start``.

    Same semantics as the meet adapter's ``_time_to_slot``: minutes
    since day start, floor-divided by the interval; a time-of-day
    earlier than ``day_start`` is treated as the next day (+24h).
    """
    start_minutes = hhmm_to_minutes(day_start)
    time_minutes = hhmm_to_minutes(hhmm)
    if time_minutes < start_minutes:
        # Overnight schedule: time is the next day.
        time_minutes += 24 * 60
    return (time_minutes - start_minutes) // interval_minutes


def intersect_windows(
    windows: Sequence[Tuple[int, int]], bound: Tuple[int, int]
) -> List[Tuple[int, int]]:
    """Intersect each window with ``bound``, dropping empty results."""
    lo, hi = bound
    out: List[Tuple[int, int]] = []
    for s, e in windows:
        ns, ne = max(s, lo), min(e, hi)
        if ne > ns:
            out.append((ns, ne))
    return out


def intersect_window_lists(
    a: Sequence[Tuple[int, int]], b: Sequence[Tuple[int, int]]
) -> List[Tuple[int, int]]:
    """Pairwise intersection of two allowed-window lists (sorted output).

    Used for TEAM participants: a doubles pair may only play when ALL
    members are available, so the team's windows are the intersection
    of each member's list.
    """
    out: List[Tuple[int, int]] = []
    for s1, e1 in a:
        for s2, e2 in b:
            ns, ne = max(s1, s2), min(e1, e2)
            if ne > ns:
                out.append((ns, ne))
    return sorted(out)


def build_player_extras(
    players: Sequence[BracketPlayerDTO],
    *,
    start_time: Optional[datetime],
    interval_minutes: int,
    total_slots: int,
    default_rest_slots: int = 1,
) -> Dict[str, PlayerExtras]:
    """Map roster players to slot-native ``PlayerExtras``.

    - ``start_time is None`` → every player's ``availability_slots`` is
      empty (time windows cannot map to slots without a wall-clock
      base); ``rest_slots`` still applies.
    - HH:mm windows convert via :func:`time_to_slot` with the session
      start time's time-of-day as day start, clamp to
      ``[0, total_slots]``, and empty results are dropped. A player
      whose windows ALL drop gets an empty list (= unconstrained) plus
      a warning — a data-entry mistake must never poison the solve.
    - ``rest_slots`` = the player's explicit ``restSlots`` if set, else
      ``default_rest_slots``.
    """
    day_start = start_time.strftime("%H:%M") if start_time is not None else None

    extras: Dict[str, PlayerExtras] = {}
    for player in players:
        rest = (
            player.restSlots
            if player.restSlots is not None
            else default_rest_slots
        )

        windows: List[Tuple[int, int]] = []
        if day_start is not None and player.availability:
            raw = [
                (
                    time_to_slot(w.start, day_start, interval_minutes),
                    time_to_slot(w.end, day_start, interval_minutes),
                )
                for w in player.availability
            ]
            windows = intersect_windows(raw, (0, total_slots))
            if not windows:
                logger.warning(
                    "bracket player %s: availability windows %s all map to "
                    "empty slot ranges (day_start=%s, interval=%s, "
                    "total_slots=%s); treating player as unconstrained",
                    player.id,
                    [(w.start, w.end) for w in player.availability],
                    day_start,
                    interval_minutes,
                    total_slots,
                )

        extras[player.id] = PlayerExtras(
            availability_slots=windows,
            rest_slots=rest,
        )
    return extras
