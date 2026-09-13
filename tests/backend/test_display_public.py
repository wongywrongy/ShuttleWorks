"""Public display capability link (SP-CLOUD-2 Rule 8) + email invites.

Pins: unauthenticated read-only access via TOKEN only, projection (no
operator material on the wire), non-enumerability (uniform 404, no raw
UUID acceptance), revocation-by-rotation, and no mutation surface.
"""
from __future__ import annotations

import logging

import pytest

from tests.backend._helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def workspace(client):
    tid = seed_tournament(client, name="TV Night")
    token = client.get(f"/tournaments/{tid}/display-token").json()["token"]
    return tid, token


def test_token_minted_once_and_rotatable(client, workspace):
    tid, token = workspace
    again = client.get(f"/tournaments/{tid}/display-token").json()["token"]
    assert again == token  # stable until rotated

    rotated = client.post(
        f"/tournaments/{tid}/display-token/rotate", headers=CSRF
    ).json()["token"]
    assert rotated != token
    # Old capability is dead, new one lives — for an anonymous caller.
    client.cookies.clear()
    assert client.get(f"/display/{token}/summary").status_code == 404
    assert client.get(f"/display/{rotated}/summary").status_code == 200


def test_projection_is_unauthenticated_and_strips_operator_material(
    client, workspace
):
    tid, token = workspace
    state = {
        "config": {
            "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
            "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0, "tournamentName": "TV Night",
        },
        "players": [], "matches": [], "groups": [],
    }
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    client.cookies.clear()  # anonymous spectator
    summary = client.get(f"/display/{token}/summary")
    assert summary.status_code == 200
    assert summary.json()["kind"] == "meet"

    body = client.get(f"/display/{token}/state").json()
    assert body["config"]["tournamentName"] == "TV Night"
    assert "standings" in body
    # Strict projection: ONLY the fields the board renders — the raw
    # blob's operator material (scheduleHistory revert pool,
    # scheduleVersion, planFinalized, bracketPlayers…) never reaches
    # the public wire, whatever the blob accumulates.
    allowed = {
        "config", "groups", "players", "matches",
        "schedule", "scheduleIsStale", "standings",
    }
    assert set(body.keys()) <= allowed, set(body.keys()) - allowed

    ms = client.get(f"/display/{token}/match-states")
    assert ms.status_code == 200 and ms.json() == {}


def test_projection_strips_private_fields_at_every_nested_surface(client, workspace):
    import uuid
    from db.models import Tournament
    from db.session import SessionLocal

    tid, token = workspace
    with SessionLocal() as session:
        row = session.get(Tournament, uuid.UUID(tid))
        row.data = {
            "config": {"tournamentName": "Board", "operatorNote": "private-config"},
            "groups": [{"id": "g", "name": "Club", "metadata": {"email": "private-group"}}],
            "players": [{
                "id": "p", "name": "Player", "groupId": "g",
                "availability": [{"start": "09:00", "end": "10:00"}],
                "notes": "private-player", "sourceEntryId": "private-entry",
            }],
            "matches": [{"id": "m", "sideA": ["p"], "sideB": [], "tags": ["private-match"]}],
            "schedule": {
                "assignments": [{"matchId": "m", "slotId": 1, "courtId": 1,
                                 "operatorNote": "private-assignment"}],
                "infeasibleReasons": ["private-schedule"],
            },
        }
        session.commit()
    response = client.get(f"/display/{token}/state")
    assert response.status_code == 200, response.text
    assert "private-" not in response.text
    assert "availability" not in response.text
    body = response.json()
    assert body["players"][0]["name"] == "Player"
    assert body["schedule"]["assignments"][0]["courtId"] == 1


@pytest.mark.parametrize("model_name", ["DisplayStateDTO", "DisplayBracketDTO"])
def test_display_schema_has_no_untyped_nested_values(client, model_name):
    from display.display import DisplayStateDTO
    from display.projection import DisplayBracketDTO

    schema = {"DisplayStateDTO": DisplayStateDTO, "DisplayBracketDTO": DisplayBracketDTO}[model_name].model_json_schema()

    def visit(value):
        if not isinstance(value, dict):
            return
        assert value.get("additionalProperties") is not True, value
        for field in value.get("properties", {}).values():
            assert any(key in field for key in ("type", "$ref", "anyOf", "allOf")), field
            visit(field)
        for child in value.get("$defs", {}).values():
            visit(child)
        for key in ("anyOf", "allOf"):
            for child in value.get(key, []):
                visit(child)
        for key in ("items", "additionalProperties"):
            if isinstance(value.get(key), dict):
                assert value[key], value
                visit(value[key])

    visit(schema)


def test_public_bracket_discards_private_cached_operator_fields(client, workspace):
    import uuid
    from bracket import response_cache

    tid, token = workspace
    participant = {"id": "p", "name": "Player", "sourceEntryId": "private-entry", "personId": "private-person"}
    response_cache.put(uuid.UUID(tid), {
        "courts": 1, "total_slots": 16, "rest_between_rounds": 1, "interval_minutes": 15,
        "participants": [participant], "assignments": [], "play_units": [],
        "events": [{"id": "event", "discipline": "MS", "format": "se", "participant_count": 1,
                    "rounds": [], "participants": [participant],
                    "config": {"pointsPerSet": 21, "operatorNote": "private-config"}}],
        "results": [{"play_unit_id": "m", "winner_side": "A", "reason": "private-medical-note",
                     "score": {"sets": [{"sideA": 21, "sideB": 10, "notes": "private-game"}],
                               "notes": "private-score"}}],
    })
    response = client.get(f"/display/{token}/bracket")
    assert response.status_code == 200, response.text
    assert "private-" not in response.text
    body = response.json()
    assert body["participants"][0]["name"] == "Player"
    assert body["events"][0]["config"]["pointsPerSet"] == 21
    assert body["results"][0]["score"] == {"sets": [{"sideA": 21, "sideB": 10}]}
    assert body["results"][0]["reason"] is None


def test_summary_kind_follows_enabled_modules_not_the_kind_column(
    client, workspace
):
    """A workspace running BOTH operator modules is a supported state
    (``derive_modules`` seeds the foreign one as ``available``, and the
    control plane promotes it). Keying the board off the fixed ``kind``
    column made that workspace's bracket structurally invisible: the board
    could only ever render one engine, chosen at create time.
    """
    tid, token = workspace
    assert (
        client.patch(
            f"/tournaments/{tid}/modules/bracket",
            json={"status": "enabled"},
            headers=CSRF,
        ).status_code
        == 200
    )

    client.cookies.clear()  # anonymous spectator
    assert client.get(f"/display/{token}/summary").json()["kind"] == "hybrid"


def test_summary_kind_is_unchanged_for_single_engine_workspaces(client, workspace):
    """The seeded shape (one operator module enabled) still answers meet."""
    _, token = workspace
    client.cookies.clear()
    assert client.get(f"/display/{token}/summary").json()["kind"] == "meet"


def test_display_token_is_the_only_public_key(client, workspace):
    tid, token = workspace
    client.cookies.clear()
    # The raw tournament UUID is not a display capability…
    assert client.get(f"/display/{tid}/summary").status_code == 404
    # …nor does the token unlock the authenticated data plane.
    # (In local mode the bootstrap identity is a member of its own
    # workspaces; the isolation suite covers foreign ones. Here: a
    # garbage token answers the same uniform 404 as a real-but-wrong id.)
    assert client.get("/display/not-a-token/state").status_code == 404
    assert (
        client.get("/display/not-a-token/state").json()["detail"]["code"]
        == "TOURNAMENT_NOT_FOUND"
    )


def test_match_states_vocabulary_is_total_and_bidirectional(client, workspace):
    """D4: the board's own ``/match-states`` DTO redirects to
    ``shared.match_vocabulary`` and must not repeat
    ``operations.match_state_routes.MatchStateDTO``'s four-value Literal,
    which silently coerced ``retired`` (and any other unrecognised spelling)
    to ``scheduled``. ``playing``/``started`` and ``retired`` must both
    survive the round trip onto the public wire."""
    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    tid, token = workspace
    state = {
        "config": {
            "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
            "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0, "tournamentName": "TV Night",
        },
        "groups": [{"id": "g1", "name": "Riverside"}],
        "players": [
            {"id": "p1", "name": "Alice", "groupId": "g1", "availability": []},
            {"id": "p2", "name": "Bob", "groupId": "g1", "availability": []},
        ],
        "matches": [
            {"id": "m-live", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 1},
            {"id": "m-retired", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 1},
        ],
    }
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.match_states.upsert(_uuid.UUID(tid), "m-live", {"status": "started"})
        repo.match_states.upsert(_uuid.UUID(tid), "m-retired", {"status": "retired"})
    finally:
        session.close()

    client.cookies.clear()
    body = client.get(f"/display/{token}/match-states").json()
    assert body["m-live"]["status"] == "started"
    assert body["m-retired"]["status"] == "retired"


def test_display_routes_have_no_mutation_surface(client, workspace):
    _, token = workspace
    client.cookies.clear()
    for path in ("summary", "state", "match-states", "bracket"):
        r = client.post(f"/display/{token}/{path}", json={})
        assert r.status_code == 405, f"{path} accepted a write"


def test_token_management_is_owner_gated(client, workspace):
    tid, _ = workspace
    from tests.backend._helpers import purge_backend_modules  # noqa: F401

    # A registered non-member gets the uniform 404 on the manage routes.
    client.cookies.clear()
    client.post(
        "/auth/register",
        json={"email": "other@example.com", "password": "a fine passphrase!"},
    )
    assert client.get(f"/tournaments/{tid}/display-token").status_code == 404


def test_email_invite_rides_the_seam_and_expires(client, workspace, caplog):
    from datetime import datetime, timedelta

    tid, _ = workspace
    with caplog.at_level(logging.INFO, logger="scheduler.email"):
        r = client.post(
            f"/tournaments/{tid}/invites",
            json={"role": "viewer", "email": "friend@example.com"},
        )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    mail = [m for m in caplog.messages if "friend@example.com" in m]
    assert mail and f"/invite/{token}" in mail[0]

    listed = client.get(f"/tournaments/{tid}/invites").json()
    row = next(i for i in listed if i["token"] == token)
    assert row["email"] == "friend@example.com"
    assert datetime.fromisoformat(row["expiresAt"]) - datetime.fromisoformat(
        row["createdAt"]
    ) == timedelta(days=7)

    # Public resolve never exposes the invitee's address.
    client.cookies.clear()
    resolved = client.get(f"/invites/{token}").json()
    assert "email" not in resolved or resolved.get("email") is None

def test_link_invite_expires_after_seven_days(client, workspace):
    from datetime import datetime, timedelta

    tid, _ = workspace
    r = client.post(f"/tournaments/{tid}/invites", json={"role": "operator"})
    assert r.status_code == 201
    assert r.json()["token"]
    listed = client.get(f"/tournaments/{tid}/invites").json()
    row = next(i for i in listed if i["token"] == r.json()["token"])
    assert row["email"] is None
    assert row["expiresAt"] is not None
    assert datetime.fromisoformat(row["expiresAt"]) - datetime.fromisoformat(
        row["createdAt"]
    ) == timedelta(days=7)


# ---- SEC-13: the public state route is cached ------------------------


def test_display_state_is_served_from_a_short_ttl_cache(
    client, workspace, monkeypatch
):
    """The only unauthenticated data plane must not rebuild per request.

    Standings are recomputed from the blob and joined against match_states
    on every call; a leaked capability URL could drive that as fast as it
    liked. Asserted by counting rebuilds, not by timing.
    """
    from bracket import response_cache

    response_cache.clear_all()
    tid, token = workspace
    client.put(
        f"/tournaments/{tid}/state",
        json={
            "config": {
                "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
                "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
                "freezeHorizonSlots": 0, "tournamentName": "TV Night",
            },
            "players": [], "matches": [], "groups": [],
        },
        headers=CSRF,
    )
    client.cookies.clear()

    calls = {"n": 0}
    import workspaces.tournaments as tournaments_api

    real = tournaments_api._meet_standings_for

    def counting(*a, **kw):
        calls["n"] += 1
        return real(*a, **kw)

    monkeypatch.setattr(tournaments_api, "_meet_standings_for", counting)

    for _ in range(3):
        assert client.get(f"/display/{token}/state").status_code == 200
    assert calls["n"] == 1, "standings rebuilt on a cached read"


def test_display_state_and_bracket_caches_do_not_collide(client):
    """Both cache per tournament id; without a namespace one would serve
    the other's payload."""
    from bracket import response_cache

    response_cache.clear_all()
    tid = __import__("uuid").uuid4()
    response_cache.put(tid, {"which": "bracket"}, response_cache.BRACKET)
    response_cache.put(tid, {"which": "state"}, response_cache.DISPLAY_STATE)

    assert response_cache.get(tid, response_cache.BRACKET) == {"which": "bracket"}
    assert response_cache.get(tid, response_cache.DISPLAY_STATE) == {"which": "state"}


def test_invalidate_clears_every_namespace(client):
    """A bracket write changes standings the display board also renders."""
    from bracket import response_cache

    response_cache.clear_all()
    tid = __import__("uuid").uuid4()
    response_cache.put(tid, {"a": 1}, response_cache.BRACKET)
    response_cache.put(tid, {"b": 2}, response_cache.DISPLAY_STATE)

    response_cache.invalidate(tid)

    assert response_cache.get(tid, response_cache.BRACKET) is None
    assert response_cache.get(tid, response_cache.DISPLAY_STATE) is None


# ---- F-DM-30 / F-DM-71: the projection's EXACT key sets ---------------
#
# The public display plane is a strict allow-list projection, and until P1
# it was an allow-list expressed as a Python tuple with a prose comment
# naming its TS consumer. These pin the EXACT key sets — equality, not
# subset, so an added field reddens here rather than reaching a public
# screen unnoticed. Model: tests/backend/test_season_listing.py's ROW_KEYS.
DISPLAY_STATE_KEYS = {
    "config", "groups", "players", "matches", "schedule",
    "scheduleIsStale", "standings",
}
MEET_STANDING_ROW_KEYS = {
    "groupId", "groupName", "matchesPlayed", "wins", "losses",
}
# TournamentOut's field list — read off the ACTUAL response, so this pins
# the wire rather than the declaration.
DISPLAY_BRACKET_KEYS = {
    "courts", "total_slots", "rest_between_rounds", "interval_minutes",
    "start_time", "events", "participants", "play_units", "assignments",
    "results",
}


def _put_meet_state_with_operator_material(client, tid: str) -> None:
    """A blob carrying every projected field PLUS operator-only material,
    with finished, scored cross-group pool play (crib of
    ``test_tournaments.py::_meet_state_with_pool_play``)."""
    import uuid as _uuid

    state = {
        "version": 2,
        "config": {
            "tournamentName": "TV Night",
            "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "17:00",
            "breaks": [], "courtCount": 4, "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [
            {"id": "g1", "name": "Riverside"},
            {"id": "g2", "name": "Lakeside"},
        ],
        "players": [
            {"id": "p1", "name": "Alice", "groupId": "g1", "availability": []},
            {"id": "p2", "name": "Bob", "groupId": "g2", "availability": []},
        ],
        "matches": [
            {"id": "m1", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 1},
        ],
        "schedule": None,
        "scheduleIsStale": False,
        # operator-only material — must never reach the public wire
        "scheduleVersion": 3,
        "scheduleHistory": [],
        "planFinalized": True,
        "bracketPlayers": [],
    }
    assert client.put(
        f"/tournaments/{tid}/state", json=state, headers=CSRF
    ).status_code == 200

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        LocalRepository(session).match_states.upsert(
            _uuid.UUID(tid),
            "m1",
            {"status": "finished", "score_side_a": 21, "score_side_b": 15},
        )
    finally:
        session.close()


def test_display_state_key_set_is_exact(client, workspace):
    """A blob carrying EVERY projected field plus operator-only material:
    the response is exactly the seven projected keys, no more and no fewer."""
    tid, token = workspace
    _put_meet_state_with_operator_material(client, tid)

    client.cookies.clear()
    body = client.get(f"/display/{token}/state").json()
    assert set(body) == DISPLAY_STATE_KEYS


def test_display_state_standings_rows_are_the_meet_grain(client, workspace):
    """The one grain the public board sees is groupId (a school), and its
    row keys are exactly MeetStandingRowDTO's — not the participant grain,
    not a superset picked up from the blob."""
    tid, token = workspace
    _put_meet_state_with_operator_material(client, tid)

    client.cookies.clear()
    rows = client.get(f"/display/{token}/state").json()["standings"]
    assert rows, "fixture must produce at least one standings row"
    for row in rows:
        assert set(row) == MEET_STANDING_ROW_KEYS


def test_display_bracket_key_set_is_the_serialized_session(client, workspace):
    """``/display/{token}/bracket`` returns the same projection the
    viewer-gated ``GET /bracket`` does. Pinning its top-level key set is what
    makes the response_model added in P1 provably a no-op on the wire."""
    tid, token = workspace
    assert client.post(
        f"/tournaments/{tid}/bracket",
        json={
            "courts": 2,
            "total_slots": 64,
            "rest_between_rounds": 1,
            "interval_minutes": 30,
            "time_limit_seconds": 2.0,
            "events": [
                {
                    "id": "MS",
                    "discipline": "Mens Singles",
                    "format": "se",
                    "participants": [
                        {"id": "s1", "name": "Seed1"},
                        {"id": "s2", "name": "Seed2"},
                    ],
                    "duration_slots": 1,
                }
            ],
        },
        headers=CSRF,
    ).status_code == 200

    client.cookies.clear()
    body = client.get(f"/display/{token}/bracket").json()
    assert set(body) == DISPLAY_BRACKET_KEYS


# ---- operator-visual-fixes P4: timezone, board settings, score --------


def test_summary_carries_the_workspace_timezone_not_a_hardcoded_utc(client):
    """match-card contract §4.4: "timezone is data, not a constant". Both
    boards used to hardcode ``BOARD_TIME_ZONE = 'UTC'`` because no zone
    reached their wire at all."""
    tid = seed_tournament(client, name="Zoned")
    assert client.patch(
        f"/tournaments/{tid}", json={"timeZone": "Asia/Taipei"}, headers=CSRF
    ).status_code == 200
    token = client.get(f"/tournaments/{tid}/display-token").json()["token"]

    client.cookies.clear()
    assert client.get(f"/display/{token}/summary").json()["timeZone"] == "Asia/Taipei"


def test_board_settings_default_to_next_off_and_round_trip(client, workspace):
    """The Next preview is a persisted board setting defaulting to OFF, on
    Meet, Bracket and hybrid boards alike (contract §4.4)."""
    tid, token = workspace

    defaults = client.get(f"/tournaments/{tid}/board-settings")
    assert defaults.status_code == 200
    assert defaults.json() == {
        "title": None,
        "logoUrl": None,
        "bannerUrl": None,
        "accent": None,
        "showNext": False,
        "showScores": True,
    }

    body = {
        "title": "Riverside Open",
        "logoUrl": "data:image/svg+xml;utf8,<svg/>",
        "bannerUrl": None,
        "accent": "#10b981",
        "showNext": True,
        "showScores": False,
    }
    put = client.put(f"/tournaments/{tid}/board-settings", json=body, headers=CSRF)
    assert put.status_code == 200, put.text
    assert put.json() == body
    # Persisted, not just echoed.
    assert client.get(f"/tournaments/{tid}/board-settings").json() == body

    # …and published to the board through the public capability projection,
    # so the bracket board (which never reads the meet config) gets them too.
    client.cookies.clear()
    assert client.get(f"/display/{token}/summary").json()["board"] == body


def test_board_settings_reject_a_non_hex_accent(client, workspace):
    tid, _ = workspace
    r = client.put(
        f"/tournaments/{tid}/board-settings",
        json={"accent": "javascript:alert(1)"},
        headers=CSRF,
    )
    assert r.status_code == 422


def test_board_settings_are_not_public_writes(client, workspace):
    tid, token = workspace
    client.cookies.clear()
    # The capability token is read-only everywhere; board settings included.
    assert client.put(f"/display/{token}/board-settings", json={}).status_code in (
        404,
        405,
    )
    # A non-member gets the uniform 404, not a 403 that proves the id exists.
    client.post(
        "/auth/register",
        json={"email": "stranger@example.com", "password": "a fine passphrase!"},
    )
    assert client.get(f"/tournaments/{tid}/board-settings").status_code == 404


def test_an_unrecorded_zero_zero_is_not_published_as_a_score(client, workspace):
    """contract §4.4: "absent scores are not zero". The score editor seeds
    blank games as 0, so a running match can carry a stored 0/0 that is not
    a result — the board must not print it as 0–0."""
    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    tid, token = workspace
    assert client.put(
        f"/tournaments/{tid}/state",
        json={
            "config": {
                "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
                "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
                "freezeHorizonSlots": 0,
            },
            "groups": [], "players": [],
            "matches": [
                {"id": "m-live", "sideA": [], "sideB": [], "durationSlots": 1},
                {"id": "m-done", "sideA": [], "sideB": [], "durationSlots": 1},
                {"id": "m-real", "sideA": [], "sideB": [], "durationSlots": 1},
            ],
        },
        headers=CSRF,
    ).status_code == 200

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.match_states.upsert(
            _uuid.UUID(tid),
            "m-live",
            {"status": "started", "score_side_a": 0, "score_side_b": 0},
        )
        repo.match_states.upsert(
            _uuid.UUID(tid),
            "m-done",
            {"status": "finished", "score_side_a": 0, "score_side_b": 0},
        )
        repo.match_states.upsert(
            _uuid.UUID(tid),
            "m-real",
            {"status": "started", "score_side_a": 2, "score_side_b": 1, "notes": "private-medical-note"},
        )
    finally:
        session.close()

    client.cookies.clear()
    body = client.get(f"/display/{token}/match-states").json()
    assert body["m-live"]["score"] is None
    # A recorded 0–0 outcome is a real (if unusual) result; publish it.
    assert body["m-done"]["score"] == {"sideA": 0, "sideB": 0}
    assert body["m-real"]["score"] == {"sideA": 2, "sideB": 1}
    assert "notes" not in body["m-real"]


def test_two_first_display_opens_converge_on_one_capability(client, monkeypatch):
    import uuid
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    from db.models import DisplayToken
    from db.session import SessionLocal
    from repositories import LocalRepository

    tid = uuid.UUID(seed_tournament(client, name="Concurrent display opens"))
    both_read = Barrier(2)
    get = Session.get
    def overlapping_get(session, model, key, *args, **kwargs):
        result = get(session, model, key, *args, **kwargs)
        if model is DisplayToken and not session.info.get("first_token_read"):
            session.info["first_token_read"] = True
            assert result is None
            both_read.wait(timeout=10)
        return result
    monkeypatch.setattr(Session, "get", overlapping_get)
    def open_display(candidate):
        with SessionLocal() as session:
            return LocalRepository(session).get_or_create_display_token(tid, candidate)
    with ThreadPoolExecutor(max_workers=2) as pool:
        tokens = list(pool.map(open_display, ["isolated-candidate-a", "isolated-candidate-b"]))
    assert tokens[0] == tokens[1]
