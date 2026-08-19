"""Shared time utilities for backend API routes.

Single source of truth for the ISO-8601 UTC timestamp shape we persist
to ``data/tournament.json`` and ``data/match_state.json``. Frontend
parses with ``parseMatchStartMs`` (``frontend/src/lib/time.ts``); the
``Z``-suffixed form below matches what that parser expects.
"""
from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    """ISO-8601 UTC timestamp with the ``Z`` suffix, e.g.
    ``2026-04-19T18:05:37.000Z``. Use this everywhere a string
    timestamp is persisted; do not call ``datetime.now`` inline."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def time_to_minutes(hh_mm: str) -> int:
    """Parse an ``HH:MM`` time string to minutes-since-midnight.
    Mirror of frontend ``timeToMinutes`` in ``lib/time.ts``."""
    h, m = hh_mm.split(":")
    return int(h) * 60 + int(m)


def time_to_slot(hh_mm: str, day_start: str, interval_minutes: int) -> int:
    """Convert an ``HH:MM`` time to a slot index given a tournament
    day-start and slot interval. Mirrors the dual on the frontend."""
    return (time_to_minutes(hh_mm) - time_to_minutes(day_start)) // interval_minutes
