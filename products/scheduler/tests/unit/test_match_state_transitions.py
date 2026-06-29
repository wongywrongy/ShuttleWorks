"""TDD tests for the PLAYING→SCHEDULED (live postpone) transition.

Companion to test_match_state.py — kept separate so the two new
assertions are easy to locate during review.

conftest.py adds products/scheduler/backend/ to sys.path, so imports
are relative to that root (no 'backend.' prefix).
"""
from __future__ import annotations

import pytest

from services.match_state import assert_valid_transition, VALID_TRANSITIONS
from database.models import MatchStatus


def test_playing_can_return_to_scheduled_for_postpone():
    # Should not raise.
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.SCHEDULED)
    assert MatchStatus.SCHEDULED in VALID_TRANSITIONS[MatchStatus.PLAYING]


def test_playing_still_reaches_finished_and_retired():
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.FINISHED)
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.RETIRED)
