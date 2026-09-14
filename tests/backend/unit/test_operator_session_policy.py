from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from core.operator_sessions import authentication_is_fresh, session_is_live

NOW = datetime(2026, 9, 14, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize("age,idle,expiry,revoked,expected", [
    (0, 0, 12, False, True),
    (11.9, 0, 30 * 24, False, True),
    (12, 0, 30 * 24, False, False),
    (1, 1, 12, False, False),
    (1, 0.999, 12, False, True),
    (0, 0, 0, False, False),
    (0, 0, 12, True, False),
    (0, -1, 12, False, False),
    (-1, -1, 12, False, False),
    (0, 1, 12, False, False),
])
def test_operator_session_deadlines(age, idle, expiry, revoked, expected):
    row = SimpleNamespace(created_at=NOW - timedelta(hours=age), last_seen_at=NOW - timedelta(hours=idle),
                          expires_at=NOW + timedelta(hours=expiry), revoked_at=NOW if revoked else None)
    assert session_is_live(row, NOW) is expected


@pytest.mark.parametrize("seconds,expected", [(0, True), (299, True), (300, False), (-1, False), (None, False)])
def test_sensitive_authentication_expires_at_five_minutes(seconds, expected):
    authenticated_at = None if seconds is None else NOW - timedelta(seconds=seconds)
    assert authentication_is_fresh(authenticated_at, NOW) is expected
