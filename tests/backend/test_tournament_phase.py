from datetime import datetime, timezone

from core.tournament_phase import TournamentPhase, derive_tournament_phase
from entries.entries_json import _bracket_live_states


NOW = datetime(2026, 8, 29, 12, tzinfo=timezone.utc)


def test_archived_is_operator_terminal_state():
    assert derive_tournament_phase(status="archived", start_date=None, end_date=None) == TournamentPhase.ARCHIVED


def test_phase_uses_venue_timezone_for_calendar_window():
    # 2026-08-29 UTC is still 2026-08-28 in Honolulu.
    assert derive_tournament_phase(
        status="active",
        start_date="2026-08-29",
        end_date="2026-08-29",
        time_zone="Pacific/Honolulu",
        entries_open=True,
        entries_configured=True,
        now=NOW,
    ) == TournamentPhase.ENTRIES_OPEN


def test_live_match_wins_over_draw_publication():
    assert derive_tournament_phase(
        status="active",
        start_date="2026-08-29",
        end_date="2026-08-29",
        draws_published=True,
        match_states=["playing"],
        now=NOW,
    ) == TournamentPhase.LIVE


def test_bracket_assignment_clock_projects_live_state():
    assert _bracket_live_states(
        {
            "bracket_session": {
                "assignments": [
                    {"play_unit_id": "done", "actual_start_slot": 2, "actual_end_slot": 4},
                    {"play_unit_id": "live", "actual_start_slot": 8, "actual_end_slot": None},
                    {"play_unit_id": "next", "actual_start_slot": None, "actual_end_slot": None},
                ]
            }
        }
    ) == ["playing"]


def test_bracket_assignment_clock_negative_control_requires_a_start():
    assert _bracket_live_states(
        {"bracket_session": {"assignments": [{"actual_end_slot": None}]}}
    ) == []


def test_end_date_passed_is_complete_even_without_results():
    assert derive_tournament_phase(
        status="active",
        start_date="2026-08-28",
        end_date="2026-08-28",
        now=NOW,
    ) == TournamentPhase.COMPLETE
