"""Finite venue-board access, measured in the venue's calendar days."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def event_link_deadline(end_date: str | None, start_date: str | None, zone: str) -> datetime | None:
    """Allow the event's last day plus seven complete local calendar days.

    Missing or invalid event coordinates require an explicit deadline; they
    never silently create an unbounded capability or guess the venue zone.
    """
    raw_date = end_date or start_date
    if not raw_date:
        return None
    try:
        last_day = date.fromisoformat(raw_date)
        return datetime.combine(last_day + timedelta(days=8), time.min, ZoneInfo(zone)).astimezone(timezone.utc)
    except (ValueError, OverflowError, ZoneInfoNotFoundError):
        return None
