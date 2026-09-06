"""Unit tests for ``shared.match_vocabulary`` (contract §2, §10 "Copy" row).

The legacy alias map must be total and bidirectional over the canonical
set, ``retired`` included — the case the one-directional map it replaces
(``operations/match_state_routes.py``) used to drop.
"""
from __future__ import annotations

import pytest

from db.models import MatchStatus
from shared.match_vocabulary import (
    CANONICAL_STATUSES,
    CANONICAL_TO_LEGACY,
    canonical_to_legacy,
    holds_court_commitment,
    legacy_to_canonical,
    occupies_court_now,
)


def test_legacy_map_is_total_over_the_canonical_set():
    assert set(CANONICAL_TO_LEGACY.keys()) == CANONICAL_STATUSES
    assert CANONICAL_STATUSES == set(MatchStatus)


def test_legacy_map_is_bidirectional_including_retired():
    for status in CANONICAL_STATUSES:
        legacy = canonical_to_legacy(status)
        assert legacy_to_canonical(legacy) is status

    # The case D4 dropped: the old one-directional table had no key for
    # RETIRED at all.
    assert MatchStatus.RETIRED in CANONICAL_TO_LEGACY
    assert canonical_to_legacy(MatchStatus.RETIRED) == "retired"
    assert legacy_to_canonical("retired") is MatchStatus.RETIRED


def test_started_is_the_legacy_spelling_of_playing():
    assert canonical_to_legacy(MatchStatus.PLAYING) == "started"
    assert legacy_to_canonical("started") is MatchStatus.PLAYING


def test_legacy_to_canonical_also_accepts_canonical_spelling():
    assert legacy_to_canonical("playing") is MatchStatus.PLAYING
    assert legacy_to_canonical("scheduled") is MatchStatus.SCHEDULED


def test_legacy_to_canonical_raises_for_unknown_value():
    with pytest.raises(KeyError):
        legacy_to_canonical("bogus")


@pytest.mark.parametrize(
    "status,expected",
    [
        ("scheduled", False),
        ("called", False),
        ("playing", True),
        ("started", True),  # legacy spelling still resolves
        ("finished", False),
        ("retired", False),
    ],
)
def test_occupies_court_now_true_only_for_playing(status, expected):
    assert occupies_court_now(status) is expected


@pytest.mark.parametrize(
    "status,expected",
    [
        ("scheduled", False),
        ("called", True),
        ("playing", True),
        ("finished", True),
        ("retired", True),
    ],
)
def test_holds_court_commitment_matches_locked_statuses(status, expected):
    assert holds_court_commitment(status) is expected


def test_holds_court_commitment_matches_operations_locked_statuses_set():
    from operations.match_state import LOCKED_STATUSES

    for status in MatchStatus:
        assert holds_court_commitment(status) == (status in LOCKED_STATUSES)
