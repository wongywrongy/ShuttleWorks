"""Abuse throttling: a key, a windowed budget, and a doubling lock.

Extracted from ``identity/auth.py`` by SP-REORG-1 Phase 3 under ruling R1.
Rate-limiting a public form has nothing to do with who anyone is; these
symbols lived in the identity service only because that is where the first
caller needed them, and leaving them there forced a permanent and false
Entries -> Identity dependency (the Phase 2 report's edge (a), which this
extraction deletes rather than keeps).

The counting engine is principal-agnostic: a key string and three numbers.
The KEY NAMESPACES are where the care goes, and the operator and entrant ones
stay in ``identity.auth`` beside each other, because the property that matters
about them is a property of the set -- every namespace must be disjoint from
every other, and that is only reviewable where the list is.

Every function below was moved by cut-and-paste. No body was edited.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from core.config import settings
from core.time_utils import _aware, _utcnow
from db.models import AuthThrottle

_LOCK_CAP_SECONDS = 900.0


def throttle_check(session: Session, key: str) -> Optional[float]:
    """Locked? Returns remaining lock seconds, else None."""
    row = session.get(AuthThrottle, key)
    if row is None or row.locked_until is None:
        return None
    remaining = (_aware(row.locked_until) - _utcnow()).total_seconds()
    return remaining if remaining > 0 else None


def throttle_record_attempt(
    session: Session,
    key: str,
    *,
    max_attempts: int,
    window_seconds: float,
    lock_seconds: float,
) -> None:
    """Count one attempt against ``key``; lock with doubling backoff once
    the windowed budget is spent.

    The counting mechanism is identical whatever is being counted — only
    the budget differs — so the credential throttle and the registration
    volume bucket (SEC-03) share this and pass their own numbers. The
    column is still named ``failures``; it means "attempts charged to this
    key", and renaming it would cost a migration for no behaviour change.
    """
    now = _utcnow()
    row = session.get(AuthThrottle, key)
    if row is None:
        row = AuthThrottle(key=key, failures=0, window_started_at=now)
        session.add(row)
        # Sessions run autoflush=False; flush so a same-transaction
        # re-read (multiple failures in one request) sees this row.
        session.flush()
    window_age = (now - _aware(row.window_started_at)).total_seconds()
    if window_age > window_seconds:
        row.failures = 0
        row.window_started_at = now
        row.locked_until = None
    row.failures += 1
    overflow = row.failures - max_attempts
    if overflow >= 0:
        lock = min(lock_seconds * (2**overflow), _LOCK_CAP_SECONDS)
        row.locked_until = now + timedelta(seconds=lock)


def entries_key(ip: str) -> str:
    """Bucket key for public entry submissions from one client IP.

    A third namespace, for the same reason ``reg:`` is separate from
    ``ip:``: the buckets count different things and a shared budget lets
    one surface's abuse close another. A flood of entry submissions from a
    venue's shared address must not lock that venue's director out of
    *signing in* — and, in the other direction, a run of failed logins must
    not stop entrants entering.
    """
    return f"entry:{ip}"


def throttle_record_entry(session: Session, key: str) -> None:
    """Count one public entry submission — accepted or refused — against
    the IP.

    Refused attempts count deliberately. The abuse case here is an
    automated poster that fails the challenge every time; charging only
    successes would leave it unbounded.
    """
    throttle_record_attempt(
        session,
        key,
        max_attempts=settings.entries_max_per_ip,
        window_seconds=settings.entries_window_seconds,
        lock_seconds=settings.entries_lock_seconds,
    )
