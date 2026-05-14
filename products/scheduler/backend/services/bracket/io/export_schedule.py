"""Render the current state as CSV (order of play) or ICS (calendar feed).

CSV columns: ``event_id, round, match_id, court, slot, start_time,
duration_minutes, side_a, side_b, status``.

ICS: RFC-5545 VCALENDAR with one VEVENT per assigned PlayUnit. Times
are emitted as UTC (the prototype treats ``start_time`` as UTC at the
boundary).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from scheduler_core.domain.tournament import ParticipantType, TournamentState

from backend.state import TournamentSlot


def to_csv(slot: TournamentSlot) -> str:
    """Return an order-of-play CSV body. Unassigned PlayUnits are skipped."""
    state = slot.state
    interval = slot.config.interval_minutes
    start_time = slot.start_time

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "event_id", "round", "match_id", "court", "slot",
        "start_time", "duration_minutes", "side_a", "side_b", "status",
    ])

    for pu_id, a in _ordered_assignments(state):
        pu = state.play_units[pu_id]
        side_a = _side_label(pu.side_a, state)
        side_b = _side_label(pu.side_b, state)
        round_index = int(pu.metadata.get("round", 0)) if pu.metadata else 0
        writer.writerow([
            pu.event_id,
            round_index,
            pu.id,
            a.court_id,
            a.slot_id,
            _format_time(start_time, a.slot_id, interval),
            a.duration_slots * interval,
            side_a,
            side_b,
            _bucket(pu_id, a, state),
        ])

    return out.getvalue()


def to_ics(slot: TournamentSlot) -> str:
    """Return an RFC-5545 VCALENDAR feed."""
    state = slot.state
    interval = slot.config.interval_minutes
    start_time = slot.start_time or datetime.now(timezone.utc)
    stamp = _ics_dt(datetime.now(timezone.utc))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//tournament-prototype//EN",
        "CALSCALE:GREGORIAN",
    ]
    for pu_id, a in _ordered_assignments(state):
        pu = state.play_units[pu_id]
        event_start = _slot_to_dt(start_time, a.slot_id, interval)
        event_end = _slot_to_dt(
            start_time, a.slot_id + a.duration_slots, interval
        )
        round_index = int(pu.metadata.get("round", 0)) if pu.metadata else 0
        side_a = _side_label(pu.side_a, state) or "TBD"
        side_b = _side_label(pu.side_b, state) or "TBD"
        summary = f"{pu.event_id} R{round_index} — {side_a} vs {side_b}"
        status = (
            "CONFIRMED" if pu_id in state.results else "TENTATIVE"
        )
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{pu_id}@tournament-prototype",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{_ics_dt(event_start)}",
            f"DTEND:{_ics_dt(event_end)}",
            f"SUMMARY:{_ics_escape(summary)}",
            f"LOCATION:Court {a.court_id}",
            f"STATUS:{status}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# ---- helpers --------------------------------------------------------------


def _ordered_assignments(state: TournamentState):
    """Yield (pu_id, assignment) in (slot, court) order."""
    pairs = list(state.assignments.items())
    pairs.sort(key=lambda kv: (kv[1].slot_id, kv[1].court_id))
    return pairs


def _format_time(
    base: Optional[datetime], slot: int, interval_minutes: int
) -> str:
    if base is None:
        return f"+{slot * interval_minutes}m"
    return _slot_to_dt(base, slot, interval_minutes).isoformat()


def _slot_to_dt(base: datetime, slot: int, interval_minutes: int) -> datetime:
    return base + timedelta(minutes=slot * interval_minutes)


def _ics_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _ics_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\n", "\\n")
    )


def _side_label(
    side_ids: Optional[list], state: TournamentState
) -> str:
    if not side_ids:
        return ""
    names = []
    for pid in side_ids:
        p = state.participants.get(pid)
        if p is not None and p.name:
            names.append(p.name)
        else:
            names.append(pid)
    return " / ".join(names)


def _bucket(pu_id: str, a, state: TournamentState) -> str:
    if pu_id in state.results:
        return "done"
    if a.actual_start_slot is not None and pu_id not in state.results:
        return "live"
    return "ready"
