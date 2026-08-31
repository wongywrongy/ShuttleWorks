"""Contract tests for the public Schedule / Live projection.

These call the FastAPI route boundary directly against a real isolated SQLite
repository. The wider TestClient suite currently stalls before this route on
``POST /tournaments``; direct invocation keeps these tests useful while still
exercising slug resolution, publication gates, SQL reads and wire DTOs.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Response
from sqlalchemy import event as sqlalchemy_event
from starlette.requests import Request
from starlette.responses import Response as StarletteResponse

from tests.backend._helpers import isolate_test_database


ENVELOPE_KEYS = {
    "published",
    "items",
    "facets",
    "page",
    "pageSize",
    "total",
    "timeZone",
    "updatedAt",
    "revision",
}
ITEM_KEYS = {
    "matchKey",
    "source",
    "eventCode",
    "discipline",
    "roundLabel",
    "status",
    "scheduledDate",
    "scheduledTime",
    "court",
    "sides",
    "score",
    "walkover",
    "updatedAt",
}
SIDE_KEYS = {"participantKey", "persons", "placeholder"}
PERSON_KEYS = {"identity", "resolution", "label"}
IDENTITY_KEYS = {"id", "name"}


def _request(etag: Optional[str] = None) -> Request:
    headers = [] if etag is None else [(b"if-none-match", etag.encode("ascii"))]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/e/api/page/schedule-open/matches",
            "headers": headers,
        }
    )


def _call(repo, *, etag=None, **filters):
    from entries.entries_site import schedule_matches

    response = Response()
    result = schedule_matches(
        request=_request(etag),
        response=response,
        slug="schedule-open",
        day=filters.get("day"),
        event=filters.get("event"),
        player=filters.get("player"),
        court=filters.get("court"),
        state=filters.get("state"),
        page=filters.get("page", 1),
        page_size=filters.get("page_size", 25),
        repo=repo,
    )
    return result, response


def _seed(tmp_path, monkeypatch, *, published: bool):
    isolate_test_database(tmp_path, monkeypatch)
    from db.models import EntryPage, Match, MatchState, MeetEvent, Tournament
    from db.session import SessionLocal
    from repositories import LocalRepository

    session = SessionLocal()
    tournament = Tournament(
        name="Schedule Open",
        kind="meet",
        tournament_date="2026-08-29",
        tournament_end_date="2026-08-30",
        time_zone="America/Toronto",
        data={
            "config": {"dayStart": "09:00", "intervalMinutes": 30},
            "players": [
                {"id": "ada", "name": "Ada Chen"},
                {"id": "bo", "name": "Bo Lee"},
                {"id": "cass", "name": "Cass Doe"},
                # Negative control: contact-shaped data in the canonical blob
                # must never enter the public side projection.
                {"id": "dev", "name": "Dev Roy", "email": "private@example.test"},
            ],
            "matches": [
                {"id": "m-live", "sideA": ["ada"], "sideB": ["bo"], "eventRank": "MS1"},
                {"id": "m-done", "sideA": ["cass"], "sideB": ["dev"], "eventRank": "MS2"},
                {"id": "m-retired", "sideA": ["ada"], "sideB": ["cass"], "eventRank": "WS1"},
            ],
            "schedule": {
                "assignments": [
                    {"matchId": "m-live", "slotId": 0, "courtId": 1},
                    {"matchId": "m-done", "slotId": 1, "courtId": 2},
                    {"matchId": "m-retired", "slotId": 2, "courtId": 3},
                ]
            },
        },
    )
    session.add(tournament)
    session.flush()
    session.add(
        EntryPage(
            tournament_id=tournament.id,
            slug="schedule-open",
            is_open=True,
            draws_published=published,
            results_published=published,
        )
    )
    session.add_all(
        [
            MeetEvent(tournament_id=tournament.id, id="MS", label="Men's Singles", slot_count=2),
            MeetEvent(tournament_id=tournament.id, id="WS", label="Women's Singles", slot_count=1),
        ]
    )
    for match_id, court in (("m-live", 1), ("m-done", 2), ("m-retired", 3)):
        # The JSON schedule is planned state. Match.court_id is the
        # Operations-owned publication of the assignment.
        session.add(Match(tournament_id=tournament.id, id=match_id, court_id=court))
    session.flush()
    session.add_all(
        [
            MatchState(tournament_id=tournament.id, match_id="m-live", status="playing"),
            MatchState(
                tournament_id=tournament.id,
                match_id="m-done",
                status="finished",
                score_side_a=21,
                score_side_b=15,
            ),
            MatchState(tournament_id=tournament.id, match_id="m-retired", status="retired"),
        ]
    )
    session.commit()
    return session, LocalRepository(session)


def test_unpublished_schedule_reads_no_operational_rows(tmp_path, monkeypatch):
    session, repo = _seed(tmp_path, monkeypatch, published=False)
    try:
        def forbidden(*_args, **_kwargs):
            raise AssertionError("unpublished schedule read operational match data")

        monkeypatch.setattr(repo.match_states, "list_for_tournament", forbidden)
        monkeypatch.setattr(repo.session, "scalars", forbidden)
        result, response = _call(repo)
        body = result.model_dump(mode="json")

        assert set(body) == ENVELOPE_KEYS
        assert body["published"] is False
        assert body["items"] == []
        assert body["total"] == 0
        assert body["timeZone"] == "America/Toronto"
        assert response.headers["ETag"]
    finally:
        session.close()


def test_published_schedule_filters_paginates_and_exposes_only_allowlisted_fields(
    tmp_path, monkeypatch
):
    session, repo = _seed(tmp_path, monkeypatch, published=True)
    try:
        result, response = _call(repo, page_size=2)
        body = result.model_dump(mode="json")

        assert set(body) == ENVELOPE_KEYS
        assert body["published"] is True
        assert body["total"] == 3
        assert len(body["items"]) == 2
        assert body["page"] == 1 and body["pageSize"] == 2
        assert body["timeZone"] == "America/Toronto"
        assert body["facets"] == {
            "days": [{"day": "2026-08-29", "count": 3}],
            "events": ["MS1", "MS2", "WS1"],
            "courts": [1, 2, 3],
            "states": ["completed", "live", "retired"],
        }
        assert all(set(day) == {"day", "count"} for day in body["facets"]["days"])
        assert all(set(item) == ITEM_KEYS for item in body["items"])
        assert all(set(side) == SIDE_KEYS for item in body["items"] for side in item["sides"])
        assert all(
            set(person) == PERSON_KEYS
            and set(person["identity"]) == IDENTITY_KEYS
            and person["resolution"] == "dead"
            and person["identity"]["id"] is None
            for item in body["items"]
            for side in item["sides"]
            for person in side["persons"]
        )
        assert "private@example.test" not in str(body)

        live, _ = _call(repo, event="MS1", player="ada", court=1, state="live")
        assert [item.matchKey for item in live.items] == ["meet:m-live"]
        assert live.items[0].scheduledTime == "09:00"
        assert live.items[0].discipline == "Men's Singles"

        completed, _ = _call(repo, state="completed")
        assert completed.items[0].score == [[21, 15]]
        assert completed.items[0].status == "completed"

        second_page, _ = _call(repo, page=2, page_size=2)
        assert len(second_page.items) == 1

        etag = response.headers["ETag"]
        not_modified, _ = _call(repo, etag=etag)
        assert isinstance(not_modified, StarletteResponse)
        assert not_modified.status_code == 304
    finally:
        session.close()


def test_matches_route_is_explicitly_public_by_design():
    from tests.backend.test_auth_surface import PUBLIC_BY_DESIGN

    assert ("GET", "/e/api/page/{slug}/matches") in PUBLIC_BY_DESIGN


def test_planned_court_is_not_public_until_operations_assigns_it(tmp_path, monkeypatch):
    session, repo = _seed(tmp_path, monkeypatch, published=True)
    try:
        from db.models import Match

        # Remove the Operations materialization while retaining the planned
        # court in tournaments.data.schedule.assignments.
        for row in session.query(Match).all():
            row.court_id = None
        session.commit()
        result, _ = _call(repo)
        assert all(item.court is None for item in result.items)
        assert result.facets.courts == []
    finally:
        session.close()


def test_operations_court_change_invalidates_schedule_etag(tmp_path, monkeypatch):
    session, repo = _seed(tmp_path, monkeypatch, published=True)
    try:
        from db.models import Match

        first, response = _call(repo)
        old_etag = response.headers["ETag"]
        # SQLAlchemy's composite key needs the tournament id; use the known
        # row from the fixture instead of relying on a public match key.
        row = session.query(Match).filter(Match.id == "m-live").one()
        row.court_id = 4
        session.commit()

        changed, changed_response = _call(repo, etag=old_etag)
        assert not isinstance(changed, StarletteResponse)
        assert changed_response.headers["ETag"] != old_etag
        assert next(item for item in changed.items if item.matchKey == "meet:m-live").court == 4
    finally:
        session.close()


def test_schedule_etag_tracks_state_score_name_and_visibility(tmp_path, monkeypatch):
    session, repo = _seed(tmp_path, monkeypatch, published=True)
    try:
        from db.models import EntryPage, MatchState, Tournament

        def current_etag() -> str:
            _, response = _call(repo)
            return response.headers["ETag"]

        previous = current_etag()
        state = session.query(MatchState).filter(MatchState.match_id == "m-live").one()
        state.status = "scheduled"
        session.commit()
        state_result, state_response = _call(repo, etag=previous)
        assert not isinstance(state_result, StarletteResponse)
        assert state_response.headers["ETag"] != previous

        previous = state_response.headers["ETag"]
        state.status = "finished"
        state.score_side_a = 21
        state.score_side_b = 18
        session.commit()
        score_result, score_response = _call(repo, etag=previous)
        assert not isinstance(score_result, StarletteResponse)
        assert score_response.headers["ETag"] != previous
        assert next(item for item in score_result.items if item.matchKey == "meet:m-live").score == [[21, 18]]

        previous = score_response.headers["ETag"]
        tournament = session.query(Tournament).filter(Tournament.name == "Schedule Open").one()
        data = dict(tournament.data or {})
        players = [dict(player) for player in data.get("players") or []]
        next(player for player in players if player["id"] == "ada")["name"] = "Ada Renamed"
        data["players"] = players
        tournament.data = data
        session.commit()
        name_result, name_response = _call(repo, etag=previous)
        assert not isinstance(name_result, StarletteResponse)
        assert name_response.headers["ETag"] != previous
        assert "Ada Renamed" in str(name_result.model_dump(mode="json"))

        previous = name_response.headers["ETag"]
        page = session.query(EntryPage).filter(EntryPage.slug == "schedule-open").one()
        page.draws_published = False
        session.commit()
        visibility_result, visibility_response = _call(repo, etag=previous)
        assert not isinstance(visibility_result, StarletteResponse)
        assert visibility_response.headers["ETag"] != previous
        assert visibility_result.published is False
    finally:
        session.close()


def test_schedule_query_count_is_bounded_as_matches_scale(tmp_path, monkeypatch):
    """Person, court, state and event fan-out must stay batched (A6)."""
    session, repo = _seed(tmp_path, monkeypatch, published=True)
    statements: list[str] = []

    def record(_connection, _cursor, statement, *_args):
        statements.append(statement)

    def measured_call() -> int:
        statements.clear()
        sqlalchemy_event.listen(session.get_bind(), "before_cursor_execute", record)
        try:
            result, _ = _call(repo, page_size=200)
            assert result.published is True
        finally:
            sqlalchemy_event.remove(session.get_bind(), "before_cursor_execute", record)
        return len(statements)

    try:
        baseline = measured_call()

        from db.models import Match, MatchState, Tournament

        tournament = session.query(Tournament).filter(Tournament.name == "Schedule Open").one()
        data = dict(tournament.data or {})
        matches = list(data.get("matches") or [])
        schedule = dict(data.get("schedule") or {})
        assignments = list(schedule.get("assignments") or [])
        for index in range(4, 68):
            match_id = f"m-scale-{index}"
            matches.append(
                {
                    "id": match_id,
                    "sideA": ["ada"],
                    "sideB": ["bo"],
                    "eventRank": "MS1",
                }
            )
            assignments.append({"matchId": match_id, "slotId": index})
            session.add(Match(tournament_id=tournament.id, id=match_id, court_id=1))
            session.add(
                MatchState(
                    tournament_id=tournament.id,
                    match_id=match_id,
                    status="scheduled",
                )
            )
        data["matches"] = matches
        schedule["assignments"] = assignments
        data["schedule"] = schedule
        tournament.data = data
        session.commit()

        expanded = measured_call()
        # Identity-map warmth may remove one lookup, but scale must never add
        # a query. A per-match/person lookup negative control makes this grow.
        assert expanded <= baseline
        assert expanded <= 9
    finally:
        session.close()
