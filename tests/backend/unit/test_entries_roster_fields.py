"""SP-E1-1 — the two roster-player fields the Entries commit seam writes.

Seam A (spec §5) materializes a confirmed entry as a roster player and
writes a back-reference on **both** sides: ``entries.committed_player_id``
pointing at the player, and ``sourceEntryId`` on the player pointing back.
The entrant's ``remarks`` ride along verbatim — never parsed, never turned
into a constraint (spec §4) — so the operator reads the sentence next to
the availability controls where the decision actually gets made.

Both DTOs are ``StrictModel`` (``extra="forbid"``), so an undeclared key is
rejected outright: the seam cannot smuggle these through, and neither can a
client. Hence the schema change, and hence the negative controls below that
prove ``forbid`` is still doing its job afterwards.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from core.schemas import (
    BracketPlayerDTO,
    PlayerDTO,
    TournamentStateDTO,
    state_dto_from_document,
)


def test_player_dto_carries_the_seam_back_reference_and_remarks():
    p = PlayerDTO(
        id="p1",
        name="Alice",
        groupId="g1",
        ranks=["MS1"],
        sourceEntryId="9f6d1c2e-0000-4000-8000-000000000001",
        remarks="can't play before 6pm Saturday",
    )
    assert p.sourceEntryId == "9f6d1c2e-0000-4000-8000-000000000001"
    assert p.remarks == "can't play before 6pm Saturday"


def test_player_dto_fields_are_optional_so_hand_added_players_still_validate():
    """The overwhelming majority of roster players never came from an entry.

    If these were required, every existing payload — and every player the
    operator types in by hand — would fail validation on the next autosave.
    """
    p = PlayerDTO(id="p1", name="Alice", groupId="g1")
    assert p.sourceEntryId is None
    assert p.remarks is None


def test_player_dto_still_forbids_unknown_keys():
    """Negative control for the change above.

    ``extra="forbid"`` is the reason these fields had to be declared at all.
    A test that only proved the new keys are accepted would pass just as
    happily if someone had "fixed" the problem by relaxing the model — which
    would silently admit every typo and every stale client key.
    """
    with pytest.raises(ValidationError):
        PlayerDTO(
            id="p1",
            name="Alice",
            groupId="g1",
            sourceEntryID="wrong-case",  # noqa: N803 — the point of the test
        )


def test_bracket_player_dto_carries_the_same_pair():
    p = BracketPlayerDTO(
        id="p-alex-tan",
        name="Alex Tan",
        sourceEntryId="9f6d1c2e-0000-4000-8000-000000000002",
        remarks="leaving at 4",
    )
    assert p.sourceEntryId == "9f6d1c2e-0000-4000-8000-000000000002"
    assert p.remarks == "leaving at 4"


def test_bracket_player_dto_fields_are_optional():
    p = BracketPlayerDTO(id="p-ben", name="Ben")
    assert p.sourceEntryId is None
    assert p.remarks is None


def test_bracket_player_dto_still_forbids_unknown_keys():
    """Negative control, bracket half."""
    with pytest.raises(ValidationError):
        BracketPlayerDTO(id="p-ben", name="Ben", remark="typo")


def test_the_state_blob_round_trips_both_halves():
    """The autosave path, end to end at the DTO layer.

    The seam writes into ``tournaments.data``; the operator SPA reads that
    document back through ``state_dto_from_document`` and PUTs a snapshot of
    it. If either field failed to survive that round trip the very next
    autosave would drop the entry's provenance — silently, because a dropped
    optional field raises nothing.
    """
    document = {
        "version": 2,
        "players": [
            {
                "id": "p1",
                "name": "Alice",
                "groupId": "MS",
                "ranks": ["MS"],
                "sourceEntryId": "entry-1",
                "remarks": "sharing a lift with Bo",
            }
        ],
        "bracketPlayers": [
            {
                "id": "p-bo",
                "name": "Bo",
                "sourceEntryId": "entry-2",
                "remarks": "leaving at 4",
            }
        ],
        # A server-managed section the DTO does not declare — the projection
        # exists to drop it, and must keep doing so.
        "bracket_session": {"assignments": {}},
    }

    projected = state_dto_from_document(document)
    assert projected.players[0].sourceEntryId == "entry-1"
    assert projected.players[0].remarks == "sharing a lift with Bo"
    assert projected.bracketPlayers[0].sourceEntryId == "entry-2"
    assert projected.bracketPlayers[0].remarks == "leaving at 4"

    # And the snapshot a client would PUT back validates unchanged.
    resent = TournamentStateDTO(
        **projected.model_dump(exclude={"standings", "updatedAt"})
    )
    assert resent.players[0].sourceEntryId == "entry-1"
    assert resent.bracketPlayers[0].remarks == "leaving at 4"
