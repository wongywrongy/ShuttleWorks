"""Unit tests for the authoritative Meet pool-standings computation.

Ports the client-side ``groupScores`` useMemo previously in
``MeetDisplayPage.tsx`` (lines ~170-206) into a pure, session-free
function so the backend can serve it on ``TournamentStateDTO.standings``.
See ``meet/standings.py`` for the implementation and
``.superpowers/sdd/display/task-2-brief.md`` for the task spec.
"""
from __future__ import annotations

from meet.standings import compute_meet_standings, StandingRow


def test_basic_wins_losses():
    groups = [{"id": "g1", "name": "Riverside"}, {"id": "g2", "name": "Lakeside"}]
    players = [{"id": "p1", "groupId": "g1"}, {"id": "p2", "groupId": "g2"}]
    matches = [{"id": "m1", "sideA": ["p1"], "sideB": ["p2"]}]
    states = {"m1": {"status": "finished", "scoreSideA": 21, "scoreSideB": 15}}
    rows = compute_meet_standings(matches=matches, match_states=states, groups=groups, players=players)
    assert rows == [
        StandingRow(groupId="g1", groupName="Riverside", matchesPlayed=1, wins=1, losses=0),
        StandingRow(groupId="g2", groupName="Lakeside", matchesPlayed=1, wins=0, losses=1),
    ]


def test_unscored_and_zero_played_dropped():
    groups = [{"id": "g1", "name": "A"}, {"id": "g2", "name": "B"}]
    players = [{"id": "p1", "groupId": "g1"}, {"id": "p2", "groupId": "g2"}]
    matches = [{"id": "m1", "sideA": ["p1"], "sideB": ["p2"]}]
    states = {"m1": {"status": "scheduled"}}  # not finished
    assert compute_meet_standings(matches=matches, match_states=states, groups=groups, players=players) == []
