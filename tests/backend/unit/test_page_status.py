"""The one status function SP-P8 §3 demands: strip, rows and counts all
consume this, so every boundary lives here once (prompt §7 traps)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from entries.entries_public import PAGE_STATUSES, page_status

NOW = datetime(2026, 9, 12, 12, 0, tzinfo=timezone.utc)


def ev(opens=None, closes=None):
    return SimpleNamespace(opens_at=opens, closes_at=closes)


def test_the_enum_has_exactly_the_six_cases():
    assert PAGE_STATUSES == {
        "entries_open", "entries_closed", "in_progress_live",
        "in_progress", "completed_winners", "completed",
    }


def test_open_event_means_entries_open_with_countdown():
    closes = NOW + timedelta(days=3)
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev(closes=closes)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", 3)


def test_an_open_event_with_no_deadline_counts_no_days():
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", None)


def test_closes_later_today_rounds_up_to_one_like_the_tier_always_has():
    # Mirrors app/lib/phase.ts `countdown` (ceil, floor 0) so the server
    # replacing the client derivation is not a behavior change.
    closes = NOW + timedelta(hours=2)
    _, days = page_status(
        tournament_date=None, events=[ev(closes=closes)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert days == 1


def test_skew_row_open_but_deadline_past_floors_at_zero():
    past = NOW - timedelta(hours=1)
    # Two events: one still open (keeps entries_open), one carrying a past
    # deadline is CLOSED by _event_is_open, so only open deadlines count.
    status, days = page_status(
        tournament_date=None, events=[ev(), ev(closes=past)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", None)


def test_all_events_closed_means_entries_closed():
    past = NOW - timedelta(days=1)
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev(closes=past)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_closed", None)


def test_no_events_at_all_is_entries_closed():
    status, _ = page_status(
        tournament_date=None, events=[],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "entries_closed"


def test_starts_today_is_in_progress():
    status, days = page_status(
        tournament_date="2026-09-12", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("in_progress", None)


def test_in_window_with_draws_published_is_follow_live():
    status, _ = page_status(
        tournament_date="2026-09-12", events=[],
        draws_published=True, results_published=False, now=NOW,
    )
    assert status == "in_progress_live"


def test_ended_yesterday_is_completed():
    status, _ = page_status(
        tournament_date="2026-09-11", events=[ev()],
        draws_published=True, results_published=False, now=NOW,
    )
    assert status == "completed"


def test_completed_with_results_published_carries_winners():
    status, _ = page_status(
        tournament_date="2026-09-11", events=[],
        draws_published=False, results_published=True, now=NOW,
    )
    assert status == "completed_winners"


def test_date_facts_beat_a_still_open_event():
    # A past tournament whose director forgot a closes_at must not list as
    # enterable (prompt §7: ending yesterday renders completed).
    status, _ = page_status(
        tournament_date="2026-09-11", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "completed"


def test_an_unparseable_date_is_treated_as_undated():
    status, _ = page_status(
        tournament_date="sometime in fall", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "entries_open"
