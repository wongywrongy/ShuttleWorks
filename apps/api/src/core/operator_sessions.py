"""One operator lifetime policy for cloud and event-node credentials."""
from datetime import datetime, timedelta

from core.time_utils import _aware

ABSOLUTE_LIFETIME = timedelta(hours=12)
IDLE_LIFETIME = timedelta(hours=1)
AUTHENTICATION_FRESHNESS = timedelta(minutes=5)
PENDING_LIFETIME = timedelta(minutes=10)


def session_is_live(row, now: datetime) -> bool:
    """Reads never count as activity. Future/corrupt stamps fail closed."""
    if row is None or row.revoked_at is not None:
        return False
    issued, seen = _aware(row.created_at), _aware(row.last_seen_at)
    return (
        issued <= seen <= now
        and now < min(_aware(row.expires_at), issued + ABSOLUTE_LIFETIME)
        and now < seen + IDLE_LIFETIME
    )


def authentication_is_fresh(authenticated_at: datetime | None, now: datetime) -> bool:
    if authenticated_at is None:
        return False
    authenticated = _aware(authenticated_at)
    return authenticated <= now < authenticated + AUTHENTICATION_FRESHNESS
