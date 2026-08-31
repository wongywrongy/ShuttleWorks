"""Bracket Run assignments materialise on the Operations-owned match row."""

from __future__ import annotations

import uuid


class RecordingMatches:
    def __init__(self):
        self.calls = []

    def upsert(self, tournament_id, match_id, fields):
        self.calls.append((tournament_id, match_id, fields))


class RecordingRepo:
    def __init__(self):
        self.matches = RecordingMatches()


def test_operations_assignment_and_unassignment_share_the_match_projection():
    from bracket.brackets import _materialize_operations_assignment

    tournament_id = uuid.uuid4()
    repo = RecordingRepo()

    _materialize_operations_assignment(
        repo,
        tournament_id,
        "MS-R1-M1",
        court_id=3,
        slot_id=7,
    )
    _materialize_operations_assignment(
        repo,
        tournament_id,
        "MS-R1-M1",
        court_id=None,
        slot_id=None,
    )

    assert repo.matches.calls == [
        (tournament_id, "MS-R1-M1", {"court_id": 3, "time_slot": 7}),
        (tournament_id, "MS-R1-M1", {"court_id": None, "time_slot": None}),
    ]
