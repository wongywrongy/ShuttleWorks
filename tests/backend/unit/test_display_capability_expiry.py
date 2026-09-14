from datetime import datetime, timezone

import pytest

from display.capabilities import event_link_deadline


def test_deadline_counts_local_calendar_days_across_dst():
    assert event_link_deadline("2026-03-07", "2026-03-01", "America/New_York") == datetime(
        2026, 3, 15, 4, tzinfo=timezone.utc)


@pytest.mark.parametrize("end,start,zone", [
    (None, None, "UTC"), (None, "invalid", "UTC"),
    ("9999-12-31", None, "UTC"), (None, "2026-03-01", "not-a-zone"),
    ("invalid", "2026-03-01", "UTC"),
])
def test_missing_or_invalid_coordinates_require_an_explicit_deadline(end, start, zone):
    assert event_link_deadline(end, start, zone) is None
