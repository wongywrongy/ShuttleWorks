"""Staff capabilities stop at the deadline, including malformed legacy rows."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize(
    "expires_at,revoked_at,expected",
    [
        (None, None, False),
        (datetime(2026, 9, 13, tzinfo=timezone.utc), None, False),
        (datetime(2026, 9, 13), None, False),
        (datetime(2026, 9, 14, tzinfo=timezone.utc), None, True),
        (datetime(2026, 9, 14, tzinfo=timezone.utc), datetime(2026, 9, 12), False),
    ],
)
def test_acceptance_stops_at_expiry(expires_at, revoked_at, expected):
    from repositories.local import is_invite_valid

    row = SimpleNamespace(expires_at=expires_at, revoked_at=revoked_at)
    assert is_invite_valid(row, now=datetime(2026, 9, 13, tzinfo=timezone.utc)) is expected
