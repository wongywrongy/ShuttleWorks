"""Slot-index to wall-clock conversion, and the schedule-state predicate.

Single authority for turning a tournament's slot grid into a spoken
"HH:MM" and for answering the one question the schedule domain asks: has
the operator approved a slot for publication? See
``docs/reference/contracts/state-and-formatting.md`` §3.

Absorbs three previously-independent implementations (D10):
``entries_site.py:_hhmm_plus``, ``entries_site.py:_slot_time`` and
``workspaces/workspace_signals.py:_slot_time_label``. All three now
delegate here so the public page and the operator's schedule can never
disagree about a start time. Lives in ``shared/`` because Entries and
Workspaces both need it and neither may import the other
(``apps/api/.importlinter``).
"""
from __future__ import annotations

from typing import Optional, Tuple

_MINUTES_PER_DAY = 24 * 60


def _parse_hhmm(value: str) -> Optional[Tuple[int, int]]:
    try:
        h, m = str(value).split(":")[:2]
        return int(h), int(m)
    except (ValueError, TypeError):
        return None


def add_minutes_wrapping(day_start: str, minutes: int) -> str:
    """``day_start`` + ``minutes``, wrapping at midnight.

    Mirrors the console's ``slotToTime`` (``lib/time.ts``) so the public
    page and the operator's schedule can never disagree about a start
    time. Raises on an unparseable ``day_start`` — a caller that may not
    have one should use :func:`slot_wall_clock` instead, which returns
    ``None``.
    """
    h, m = day_start.split(":")
    total = (int(h) * 60 + int(m) + minutes) % _MINUTES_PER_DAY
    return f"{total // 60:02d}:{total % 60:02d}"


def slot_wall_clock(
    day_start: Optional[str],
    slot: Optional[int],
    interval: Optional[int],
) -> Optional[str]:
    """``"HH:MM"`` for ``day_start + slot*interval`` minutes, or ``None``.

    ``None`` when ``day_start`` is missing/unparseable. A missing or
    negative ``slot``/``interval`` is treated as ``0`` rather than
    raising.

    Slot ids span the whole tournament plan. Wrapping at midnight means a
    day-five 09:00 assignment still says 09:00; clamping every later day
    to 23:59 made otherwise-populated demo plans look corrupt.
    """
    if not day_start:
        return None
    parsed = _parse_hhmm(day_start)
    if parsed is None:
        return None
    minutes = max(0, int(slot or 0)) * max(0, int(interval or 0))
    return add_minutes_wrapping(f"{parsed[0]:02d}:{parsed[1]:02d}", minutes)


def slot_time_from_start(
    start_hour: int,
    start_minute: int,
    slot_id: Optional[int],
    interval_minutes: Optional[int],
) -> Optional[str]:
    """Venue-local start for a bracket slot given the session's ``start_time``.

    ``slot_id`` names the offset from the day's first slot in
    ``interval_minutes``-wide steps; ``None`` when there is no slot (the
    match has not been scheduled).
    """
    if slot_id is None:
        return None
    minutes = slot_id * (interval_minutes or 0)
    return add_minutes_wrapping(f"{start_hour:02d}:{start_minute:02d}", minutes)


def slot_approved(approved_slot: Optional[object]) -> bool:
    """True when an approved time slot exists for publication (contract §3.1).

    A solver *proposal* is not an approved slot; callers must pass the
    approved value only (whatever is currently published as the match's
    time), never a candidate the operator has not committed.
    """
    return approved_slot is not None


def slot_pending(approved_slot: Optional[object]) -> bool:
    """True when no approved time exists — the inverse of :func:`slot_approved`."""
    return not slot_approved(approved_slot)
