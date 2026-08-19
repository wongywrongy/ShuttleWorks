"""TDD tests for the PLAYING→SCHEDULED (live postpone) transition.

Companion to test_match_state.py — kept separate so the two new
assertions are easy to locate during review.

conftest.py adds apps/api/ to sys.path, so imports
are relative to that root (no 'backend.' prefix).
"""
from __future__ import annotations

from services.match_state import assert_valid_transition, VALID_TRANSITIONS
from database.models import MatchStatus


def test_playing_can_return_to_scheduled_for_postpone():
    # Should not raise.
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.SCHEDULED)
    assert MatchStatus.SCHEDULED in VALID_TRANSITIONS[MatchStatus.PLAYING]


def test_playing_still_reaches_finished_and_retired():
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.FINISHED)
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.RETIRED)


# --- FINISHED→PLAYING: the operator's undo of a mis-tapped Finish -----------
# The Run surface offers "Undo finish"; before this, FINISHED was terminal so
# every press 409'd with a misleading "version mismatch" toast and a Retry that
# could never succeed (interaction audit, finding A1). A live-day mis-tap must
# be correctable, so FINISHED gains exactly one outgoing edge — back to PLAYING.
# RETIRED stays terminal: it is a deliberate, adjudicated outcome, not a tap.


def test_finished_can_return_to_playing_to_undo_a_mistap():
    # Should not raise.
    assert_valid_transition("m1", MatchStatus.FINISHED, MatchStatus.PLAYING)
    assert MatchStatus.PLAYING in VALID_TRANSITIONS[MatchStatus.FINISHED]


def test_finished_undo_is_the_only_way_out_of_finished():
    """Undo re-opens a match; it must not become a general escape hatch."""
    assert VALID_TRANSITIONS[MatchStatus.FINISHED] == [MatchStatus.PLAYING]


def test_retired_stays_terminal():
    assert VALID_TRANSITIONS[MatchStatus.RETIRED] == []
