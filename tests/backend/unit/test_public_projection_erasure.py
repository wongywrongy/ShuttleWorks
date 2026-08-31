"""Erased entrant identities never cross the public publication seam."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from _helpers import isolate_test_database


def test_erased_people_are_absent_from_entrants_and_reserves(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)

    from db.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Submission,
        Tournament,
    )
    from db.session import SessionLocal
    from entries.entries_public import _entrants, _reserves
    from repositories.local import LocalRepository

    tournament_id = uuid.uuid4()
    session = SessionLocal()
    try:
        tournament = Tournament(
            id=tournament_id,
            name="Erasure Open",
            kind="meet",
            data={},
        )
        account = EntrantAccount(
            email="privacy@example.test",
            password_hash="x",
        )
        session.add_all([tournament, account])
        session.flush()

        event = EntryEvent(
            tournament_id=tournament_id,
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        submission = Submission(
            tournament_id=tournament_id,
            account_id=account.id,
        )
        visible_confirmed = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account.id,
            full_name="Visible Confirmed",
            gender="X",
        )
        visible_reserve = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account.id,
            full_name="Visible Reserve",
            gender="X",
        )
        erased = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account.id,
            full_name="(erased)",
            gender="X",
            erased_at=datetime.now(timezone.utc),
        )
        session.add_all(
            [event, submission, visible_confirmed, visible_reserve, erased]
        )
        session.flush()
        session.add_all(
            [
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=event.id,
                    submission_id=submission.id,
                    entry_player_id=visible_confirmed.id,
                    state="confirmed",
                ),
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=event.id,
                    submission_id=submission.id,
                    entry_player_id=erased.id,
                    state="confirmed",
                ),
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=event.id,
                    submission_id=submission.id,
                    entry_player_id=visible_reserve.id,
                    state="waitlisted",
                ),
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=event.id,
                    submission_id=submission.id,
                    entry_player_id=erased.id,
                    state="waitlisted",
                ),
            ]
        )
        session.commit()

        repo = LocalRepository(session)
        entrants = _entrants(repo, tournament_id)
        reserves = _reserves(repo, tournament_id)

        assert [row[1] for row in entrants] == ["Visible Confirmed"]
        assert [row[3] for row in reserves] == ["Visible Reserve"]
        assert all(row[0] == "MS" for row in reserves)

        from entries.entries_site import _person_ref, _public_identities

        directory = _public_identities(repo, tournament_id)
        visible_key = f"entry-{visible_confirmed.id}"
        erased_key = f"entry-{erased.id}"
        assert directory.identities[visible_key].name == "Visible Confirmed"
        assert erased_key in directory.hidden
        hidden_ref = _person_ref(
            erased_key,
            name="(erased)",
            identities=directory,
        )
        assert hidden_ref.identity is None
        assert hidden_ref.resolution == "dead"
        assert hidden_ref.label == "Player not published"
    finally:
        session.close()


def test_mixed_event_visibility_is_scoped_without_parsing_rank_names(
    tmp_path, monkeypatch
):
    """A visible MS entry does not publish the same person's opted-out WS entry."""
    isolate_test_database(tmp_path, monkeypatch)

    from db.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Submission,
        Tournament,
    )
    from db.session import SessionLocal
    from entries.entries_site import (
        _event_public_club,
        _event_public_for_person,
        _meet_matches,
        _meet_schedule_matches,
        _participant_people,
        _participant_person_keys,
        _public_identities,
    )
    from repositories.local import LocalRepository

    tournament_id = uuid.uuid4()
    session = SessionLocal()
    try:
        account = EntrantAccount(email="mixed@example.test", password_hash="x")
        tournament = Tournament(
            id=tournament_id,
            name="Mixed Visibility",
            kind="meet",
            data={},
        )
        session.add_all([account, tournament])
        session.flush()
        submission = Submission(tournament_id=tournament_id, account_id=account.id)
        player = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account.id,
            full_name="Ada Visible Once",
            gender="X",
            club="Privacy BC",
        )
        ms = EntryEvent(
            tournament_id=tournament_id,
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            meet_event_id="MS",
        )
        ws = EntryEvent(
            tournament_id=tournament_id,
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            meet_event_id="WS",
        )
        session.add_all([submission, player, ms, ws])
        session.flush()
        session.add_all(
            [
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=ms.id,
                    submission_id=submission.id,
                    entry_player_id=player.id,
                    state="confirmed",
                    list_opt_out=False,
                ),
                Entry(
                    tournament_id=tournament_id,
                    entry_event_id=ws.id,
                    submission_id=submission.id,
                    entry_player_id=player.id,
                    state="confirmed",
                    list_opt_out=True,
                ),
            ]
        )
        roster_key = f"entry-{player.id}"
        tournament.data = {
            "config": {"intervalMinutes": 30, "dayStart": "09:00"},
            "players": [
                {
                    "id": roster_key,
                    "name": "Ada Visible Once",
                    "entryPlayerId": str(player.id),
                },
                {"id": "opponent", "name": "Imported Opponent"},
            ],
            "matches": [
                {
                    "id": "visible-match",
                    "sideA": [roster_key],
                    "sideB": ["opponent"],
                    "eventRank": "MS1",
                },
                {
                    "id": "hidden-match",
                    "sideA": [roster_key],
                    "sideB": ["opponent"],
                    "eventRank": "WS1",
                },
            ],
            "schedule": {"assignments": []},
        }
        session.commit()

        repo = LocalRepository(session)
        directory = _public_identities(repo, tournament_id)
        event_keys = {"MS1": "MS", "WS1": "WS"}
        assert _event_public_for_person(directory, roster_key, "MS") is True
        assert _event_public_for_person(directory, roster_key, "WS") is False
        assert (
            _event_public_club(
                roster_key,
                directory.clubs,
                directory,
                "MS",
            )
            == "Privacy BC"
        )
        assert (
            _event_public_club(
                roster_key,
                directory.clubs,
                directory,
                "WS",
            )
            is None
        )

        from types import SimpleNamespace

        pair = SimpleNamespace(
            id="pair",
            members=[roster_key, "missing-member"],
            name="Ada Visible Once / Private Composite Name",
        )
        hidden_pair = _participant_people(pair, {}, directory, "WS")
        assert [ref.label for ref in hidden_pair] == ["Player not published", "TBD"]
        assert "Private Composite Name" not in str(hidden_pair)

        aliased_single = SimpleNamespace(
            id="provider-row-17",
            members=None,
            entryPlayerId=str(player.id),
            name="Provider Label",
        )
        assert _participant_person_keys(aliased_single) == [roster_key]
        assert _participant_people(
            aliased_single, {}, directory, "MS"
        )[0].identity.name == "Ada Visible Once"
        assert _participant_people(
            aliased_single, {}, directory, "WS"
        )[0].label == "Player not published"

        player_projection = _meet_matches(
            repo,
            tournament,
            roster_key,
            False,
            directory,
            meet_event_keys=event_keys,
        )
        assert [match.eventCode for match in player_projection.matches] == ["MS1"]

        schedule = _meet_schedule_matches(
            tournament,
            results_on=False,
            tournament_date=None,
            updated_at=None,
            identities=directory,
            meet_event_keys=event_keys,
        )
        by_event = {match.eventCode: match for match in schedule}
        visible_ref = by_event["MS1"].sides[0].persons[0]
        hidden_ref = by_event["WS1"].sides[0].persons[0]
        assert visible_ref.identity is not None
        assert visible_ref.identity.name == "Ada Visible Once"
        assert hidden_ref.identity is None
        assert hidden_ref.label == "Player not published"
    finally:
        session.close()
