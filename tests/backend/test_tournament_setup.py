"""HTTP contract tests for the canonical section-oriented Setup facade."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from workspaces import setup, tournaments

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(setup.router)
    return TestClient(app)


def _create(client: TestClient) -> str:
    response = client.post(
        "/tournaments",
        json={"name": "Summer Open", "tournamentDate": "2026-08-29", "kind": "bracket"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_setup_projects_legacy_identity_and_reports_blockers(client):
    tid = _create(client)

    response = client.get(f"/tournaments/{tid}/setup")

    assert response.status_code == 200
    assert response.headers["etag"]
    payload = response.json()
    assert payload["tournamentId"] == tid
    sections = {section["key"]: section for section in payload["sections"]}
    assert sections["general"]["data"]["name"] == "Summer Open"
    assert sections["dates"]["data"]["tournamentStart"] == "2026-08-29"
    assert sections["venue"]["data"]["courts"][0]["name"] == "Court 1"
    assert sections["events"]["issues"][0]["code"] == "SETUP_EVENTS_REQUIRED"


def test_section_patch_is_etag_guarded_and_survives_legacy_state_write(client):
    tid = _create(client)
    setup = client.get(f"/tournaments/{tid}/setup")

    changed = client.patch(
        f"/tournaments/{tid}/setup/events",
        headers={"If-Match": setup.headers["etag"]},
        json={
            "data": {
                "events": [
                    {"id": "mens-singles", "name": "Men's Singles", "code": "MS"}
                ]
            }
        },
    )

    assert changed.status_code == 200
    sections = {section["key"]: section for section in changed.json()["sections"]}
    assert sections["events"]["status"] == "ready"
    assert sections["events"]["data"]["events"][0]["code"] == "MS"
    renamed = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": changed.headers["etag"]},
        json={"data": {"name": "Canonical tournament name"}},
    )
    assert renamed.status_code == 200
    state = client.get(f"/tournaments/{tid}/state")
    stale_state = state.json()
    stale_state["config"]["tournamentName"] = "Stale browser name"
    written = client.put(
        f"/tournaments/{tid}/state",
        headers={"If-Match": state.headers["etag"]},
        json=stale_state,
    )
    assert written.status_code == 200
    assert client.get(f"/tournaments/{tid}/state").json()["config"]["tournamentName"] == "Canonical tournament name"
    after = client.get(f"/tournaments/{tid}/setup").json()
    events = next(section for section in after["sections"] if section["key"] == "events")
    assert events["data"]["events"][0]["id"] == "mens-singles"
    activity = client.get(f"/tournaments/{tid}/activity").json()["entries"]
    assert activity[0]["action"] == "setup.updated"
    assert activity[0]["target"] == "general"
    assert activity[0]["actorName"]


def test_section_patch_rejects_missing_and_stale_preconditions(client):
    tid = _create(client)
    url = f"/tournaments/{tid}/setup/people"

    missing = client.patch(url, json={"data": {"contacts": []}})
    stale = client.patch(url, headers={"If-Match": '"0"'}, json={"data": {"contacts": []}})

    assert missing.status_code == 412
    assert stale.status_code == 409


def _seed_completed_bracket(tid: str) -> None:
    """Plant real domain rows — events, matches, results — through the
    repository, exactly the way the bracket surfaces create them. No Setup
    PATCH ever runs: the RDY-1 acceptance is that derivation alone reads a
    played workspace as ready (ruling R-M, option A). Same direct-session
    pattern as ``test_tournaments._seed_bracket_schedule``.
    """
    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        t = _uuid.UUID(tid)
        # Evidence fixture: five real draws and 155 played matches. Keeping
        # the exact captured cardinalities prevents a tiny toy tournament
        # from certifying a derivation that accidentally depends on one event
        # or one result.
        for code in ("MS", "WS", "MD", "WD", "XD"):
            repo.brackets.create_event(
                t, code, discipline=code, format="se", duration_slots=2, status="complete"
            )
            matches = [
                {
                    "id": f"{code}-R1-M{number}",
                    "round_index": 0,
                    "match_index": number - 1,
                    "slot_a": number * 2 - 1,
                    "slot_b": number * 2,
                    "expected_duration_slots": 2,
                }
                for number in range(1, 32)
            ]
            repo.brackets.bulk_create_matches(
                t,
                code,
                matches,
            )
            for match in matches:
                repo.brackets.record_result(
                    t, code, match["id"], winner_side="A",
                    score={"sets": [{"sideA": 21, "sideB": 15}]},
                )
    finally:
        session.close()


def test_completed_workspace_reads_ready_from_domain_rows_alone(client):
    """RDY-1 fixture: a played-out workspace must read ready with ZERO
    manual Setup edits — readiness witnesses the same rows the product
    runs on, not the setup document.

    Negative control (CODE_HEALTH.md 3b): with ``_domain_events`` stubbed
    to ``return None`` (the pre-SP-OPCON-1 behavior — readiness blind to
    domain rows), this test fails on the ``events`` status assertion.
    Verified red 2026-08-30, then restored.
    """
    tid = _create(client)
    _seed_completed_bracket(tid)

    payload = client.get(f"/tournaments/{tid}/setup").json()

    sections = {section["key"]: section for section in payload["sections"]}
    for key in ("general", "dates", "venue", "events"):
        assert sections[key]["status"] == "ready", (key, sections[key])
    assert sections["events"]["authority"] == "domain"
    assert [e["code"] for e in sections["events"]["data"]["events"]] == [
        "MD", "MS", "WD", "WS", "XD",
    ]
    assert payload["blockingIssueCount"] == 0
    assert payload["status"] == "ready"


def test_events_patch_refused_once_domain_events_exist(client):
    """Ruling R-N (A): the events section is a read-only projection once
    real events exist — a Setup write would create a diverging shadow copy."""
    tid = _create(client)
    _seed_completed_bracket(tid)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]

    refused = client.patch(
        f"/tournaments/{tid}/setup/events",
        headers={"If-Match": etag},
        json={"data": {"events": []}},
    )

    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "SETUP_SECTION_DOMAIN_OWNED"


@pytest.mark.parametrize("kind", ["meet", "bracket"])
def test_scheduled_venue_is_a_read_only_domain_summary(client, kind):
    """R-N A applies to both schedule projections, not only Events.

    Negative control: delete the assignment before the GET and ``authority``
    becomes ``setup``; the PATCH then succeeds instead of returning 409.
    Verified red 2026-08-30, then restored.
    """
    created = client.post(
        "/tournaments",
        json={"name": f"Scheduled {kind}", "kind": kind, "tournamentDate": "2026-09-05"},
    )
    assert created.status_code == 201
    tid = created.json()["id"]

    import uuid as _uuid
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        row = repo.tournaments.get_by_id(_uuid.UUID(tid))
        assert row is not None
        document = dict(row.data)
        if kind == "bracket":
            document["bracket_session"] = {
                "assignments": [{"play_unit_id": "MS-R1-M1", "slot_id": 0, "court_id": 1}],
            }
        else:
            document["schedule"] = {
                "status": "optimal",
                "assignments": [
                    {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 2},
                ],
            }
        repo.commit_tournament_state(_uuid.UUID(tid), document)
    finally:
        session.close()

    setup = client.get(f"/tournaments/{tid}/setup")
    venue = next(section for section in setup.json()["sections"] if section["key"] == "venue")
    assert venue["authority"] == "domain"
    assert venue["data"]["courts"][0]["name"] == "Court 1"

    refused = client.patch(
        f"/tournaments/{tid}/setup/venue",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"courts": []}},
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "SETUP_SECTION_DOMAIN_OWNED"


def test_meet_divisions_read_as_domain_events(client):
    """Meet-side twin: divisions live in ``config.rankCounts``; readiness
    must see them without a Setup write (absolute rule 4 — both engines)."""
    created = client.post(
        "/tournaments",
        json={"name": "Club Meet", "tournamentDate": "2026-09-05", "kind": "meet"},
    )
    assert created.status_code == 201
    tid = created.json()["id"]
    state = client.get(f"/tournaments/{tid}/state")
    document = state.json()
    document.setdefault("config", {})["rankCounts"] = {"MS": 8, "WD": 4}
    written = client.put(
        f"/tournaments/{tid}/state",
        headers={"If-Match": state.headers["etag"]},
        json=document,
    )
    assert written.status_code == 200

    sections = {
        section["key"]: section
        for section in client.get(f"/tournaments/{tid}/setup").json()["sections"]
    }

    assert sections["events"]["authority"] == "domain"
    assert sections["events"]["status"] == "ready"
    assert [e["code"] for e in sections["events"]["data"]["events"]] == ["MS", "WD"]


def test_section_payload_rejects_unknown_fields(client):
    tid = _create(client)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]

    response = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": etag},
        json={"data": {"name": "Renamed", "mystery": "not persisted"}},
    )

    assert response.status_code == 422
