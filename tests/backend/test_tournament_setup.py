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
def test_scheduled_venue_stays_editable_and_the_plan_absorbs_the_change(client, kind):
    """Descriptive information is not locked by the existence of a plan.

    Venue name, address, accessibility notes and the court list are things a
    director corrects on the day. Locking the whole page because a schedule
    refers to a court is a worse failure than a schedule that needs
    revalidating, so the edit is accepted here and reconciliation belongs in
    Plan. The structural lock that IS real — a generated draw — is asserted by
    ``test_events_patch_refused_once_domain_events_exist``.
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
    assert venue["authority"] == "setup"

    accepted = client.patch(
        f"/tournaments/{tid}/setup/venue",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"venueName": "Hall B", "courts": venue["data"]["courts"]}},
    )
    assert accepted.status_code == 200
    saved = next(
        section for section in accepted.json()["sections"] if section["key"] == "venue"
    )
    assert saved["data"]["venueName"] == "Hall B"


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


def test_meet_rules_without_draw_format_does_not_block_readiness(client):
    """Meet divisions have no bracket draw format, so Rules stays optional."""
    created = client.post(
        "/tournaments",
        json={"name": "Track Meet", "tournamentDate": "2026-09-05", "kind": "meet"},
    )
    assert created.status_code == 201
    tid = created.json()["id"]
    state = client.get(f"/tournaments/{tid}/state")
    document = state.json()
    document.setdefault("config", {})["rankCounts"] = {"MS": 8}
    assert client.put(
        f"/tournaments/{tid}/state",
        headers={"If-Match": state.headers["etag"]},
        json=document,
    ).status_code == 200

    payload = client.get(f"/tournaments/{tid}/setup").json()
    rules = next(section for section in payload["sections"] if section["key"] == "rules")
    assert rules["status"] == "ready"
    assert not any(issue["code"] == "SETUP_RULES_FORMAT_MISSING" for issue in rules["issues"])
    assert payload["blockingIssueCount"] == 0


def test_bracket_event_projection_uses_configured_capacity(client):
    """A draw's capacity is its configured limit, independent of live seeds."""
    import uuid as _uuid
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    tid = _create(client)
    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        event = repo.brackets.create_event(
            _uuid.UUID(tid), "MS", discipline="Men's Singles", format="se",
            duration_slots=2, bracket_size=32, status="draft",
        )
        # A participant count must never replace the configured capacity.
        assert event.bracket_size == 32
    finally:
        session.close()

    payload = client.get(f"/tournaments/{tid}/setup").json()
    events = next(section for section in payload["sections"] if section["key"] == "events")
    assert events["data"]["events"] == [{
        "id": "MS", "code": "MS", "name": "Men's Singles",
        "discipline": "Men's Singles", "format": "se", "capacity": 32,
        "status": "draft",
    }]


def test_bracket_without_draw_format_reports_missing_rule(client):
    import uuid as _uuid
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    tid = _create(client)
    session = SessionLocal()
    try:
        LocalRepository(session).brackets.create_event(
            _uuid.UUID(tid), "MS", discipline="Men's Singles", format="",
            duration_slots=2, status="draft",
        )
    finally:
        session.close()

    payload = client.get(f"/tournaments/{tid}/setup").json()
    rules = next(section for section in payload["sections"] if section["key"] == "rules")
    assert rules["status"] == "blocked"
    issue = next(issue for issue in rules["issues"] if issue["code"] == "SETUP_RULES_FORMAT_MISSING")
    assert issue["severity"] == "blocking"


def test_explicit_shared_format_is_preserved_when_event_format_differs(client):
    import uuid as _uuid
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    tid = _create(client)
    setup = client.get(f"/tournaments/{tid}/setup")
    patched = client.patch(
        f"/tournaments/{tid}/setup/rules",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"format": "se"}},
    )
    assert patched.status_code == 200
    session = SessionLocal()
    try:
        LocalRepository(session).brackets.create_event(
            _uuid.UUID(tid), "MS", discipline="Men's Singles", format="rr",
            duration_slots=2, status="draft",
        )
    finally:
        session.close()

    payload = client.get(f"/tournaments/{tid}/setup").json()
    rules = next(section for section in payload["sections"] if section["key"] == "rules")
    assert rules["data"]["format"] == "se"


def test_section_payload_rejects_unknown_fields(client):
    tid = _create(client)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]

    response = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": etag},
        json={"data": {"name": "Renamed", "mystery": "not persisted"}},
    )

    assert response.status_code == 422


def test_setup_patch_records_actor_section_and_field_diff(client):
    """V3-OC28.1 / ruling R2: a setup PATCH must record enough for the
    console to show an old -> new field diff without inventing one."""
    tid = _create(client)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]

    changed = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": etag},
        json={"data": {"name": "Canonical tournament name"}},
    )
    assert changed.status_code == 200

    entries = client.get(f"/tournaments/{tid}/activity").json()["entries"]
    entry = entries[0]
    assert entry["target"] == "general"
    assert entry["actorName"] == "Local operator"  # never the bootstrap "local@dev" address
    assert "General" in entry["summary"]
    assert "name" in entry["summary"] or any(f["key"] == "name" for f in entry["fields"])
    field = next(f for f in entry["fields"] if f["key"] == "name")
    assert field["old"] is None  # the setup document had no prior stored value for this section
    assert field["new"] == "Canonical tournament name"
    assert entry["payloadHash"]  # diagnostic, available behind expansion

    # A second edit to the same section now has a real old value to diff against.
    second = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": changed.headers["etag"]},
        json={"data": {"name": "Renamed again"}},
    )
    assert second.status_code == 200
    latest = client.get(f"/tournaments/{tid}/activity").json()["entries"][0]
    latest_field = next(f for f in latest["fields"] if f["key"] == "name")
    assert latest_field["old"] == "Canonical tournament name"
    assert latest_field["new"] == "Renamed again"


def test_downstream_impact_declarations_avoid_internal_jargon(client):
    """V3-OC06.1: the impact sentence the console renders next to Save must
    never say "public identity" — a plain destination name instead."""
    tid = _create(client)
    payload = client.get(f"/tournaments/{tid}/setup").json()
    general = next(s for s in payload["sections"] if s["key"] == "general")
    assert general["downstreamImpact"] == ["Overview", "the public site", "exports"]
    assert "public identity" not in general["downstreamImpact"]


def test_rules_point_cap_round_trips_and_is_never_invented(client):
    """Ruling C3: the only cap that exists is whatever the operator sets
    here — absent by default, and dropped again once a PATCH omits it."""
    tid = _create(client)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]
    baseline = client.get(f"/tournaments/{tid}/setup").json()
    rules = next(s for s in baseline["sections"] if s["key"] == "rules")
    assert "pointCap" not in rules["data"]

    patched = client.patch(
        f"/tournaments/{tid}/setup/rules",
        headers={"If-Match": etag},
        json={"data": {"scoring": "badminton", "deuceEnabled": True, "pointCap": 30}},
    )
    assert patched.status_code == 200
    rules = next(s for s in patched.json()["sections"] if s["key"] == "rules")
    assert rules["data"]["pointCap"] == 30

    cleared = client.patch(
        f"/tournaments/{tid}/setup/rules",
        headers={"If-Match": patched.headers["etag"]},
        json={"data": {"scoring": "badminton", "deuceEnabled": True}},
    )
    assert cleared.status_code == 200
    rules = next(s for s in cleared.json()["sections"] if s["key"] == "rules")
    assert "pointCap" not in rules["data"]


def test_rules_point_cap_is_bounded(client):
    tid = _create(client)
    etag = client.get(f"/tournaments/{tid}/setup").headers["etag"]
    response = client.patch(
        f"/tournaments/{tid}/setup/rules",
        headers={"If-Match": etag},
        json={"data": {"pointCap": 0}},
    )
    assert response.status_code == 422


def test_out_of_window_daily_session_blocks_readiness_with_a_precise_message(client):
    """V3-OC07.1: a competition session starting before the tournament's own
    start (or ending after its end) must be a precise, per-session blocking
    issue — never a silently accepted conflicting date."""
    tid = _create(client)
    setup = client.get(f"/tournaments/{tid}/setup")
    general_patch = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"name": "Summer Open", "timezone": "UTC"}},
    )
    assert general_patch.status_code == 200
    dates_patch = client.patch(
        f"/tournaments/{tid}/setup/dates",
        headers={"If-Match": general_patch.headers["etag"]},
        json={"data": {
            "tournamentStart": "2026-07-28T17:00:00Z",
            "tournamentEnd": "2026-07-29T20:00:00Z",
            "dailySessions": [
                {"id": "day-1", "date": "2026-07-28", "name": "Competition day 1", "startTime": "09:00", "endTime": "18:00"},
            ],
        }},
    )
    assert dates_patch.status_code == 200
    payload = dates_patch.json()
    dates = next(s for s in payload["sections"] if s["key"] == "dates")
    assert dates["status"] == "blocked"
    issue = next(i for i in dates["issues"] if i["code"] == "SETUP_DATES_SESSION_OUT_OF_WINDOW")
    assert issue["severity"] == "blocking"
    assert "Competition day 1" in issue["message"]
    assert issue["path"] == "dailySessions.day-1"
    assert payload["status"] == "blocked"


def test_session_inside_the_tournament_window_has_no_conflict(client):
    tid = _create(client)
    setup = client.get(f"/tournaments/{tid}/setup")
    dates_patch = client.patch(
        f"/tournaments/{tid}/setup/dates",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {
            "tournamentStart": "2026-07-28T09:00:00Z",
            "tournamentEnd": "2026-07-29T20:00:00Z",
            "dailySessions": [
                {"id": "day-1", "date": "2026-07-28", "name": "Competition day 1", "startTime": "09:00", "endTime": "18:00"},
            ],
        }},
    )
    assert dates_patch.status_code == 200
    dates = next(s for s in dates_patch.json()["sections"] if s["key"] == "dates")
    assert not any(i["code"] == "SETUP_DATES_SESSION_OUT_OF_WINDOW" for i in dates["issues"])
    assert dates["status"] == "ready"


def test_activity_feed_reports_its_own_retention_limit(client):
    from workspaces.setup import ACTIVITY_MAX_ENTRIES

    tid = _create(client)
    feed = client.get(f"/tournaments/{tid}/activity").json()
    assert feed["retentionLimit"] == ACTIVITY_MAX_ENTRIES


def test_naive_window_bounds_are_read_in_the_tournament_timezone(client):
    """A naive tournamentStart is a wall-clock time in the tournament zone —
    the same reading a session's date + time gets — never UTC. Otherwise a
    09:00 Seoul session compares against 09:00 UTC and every competition day
    "starts before the tournament" (the Korea fixture regression)."""
    tid = _create(client)
    setup = client.get(f"/tournaments/{tid}/setup")
    general = client.patch(
        f"/tournaments/{tid}/setup/general",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"timezone": "Asia/Seoul"}},
    )
    assert general.status_code == 200
    dates_patch = client.patch(
        f"/tournaments/{tid}/setup/dates",
        headers={"If-Match": general.headers["etag"]},
        json={"data": {
            "tournamentStart": "2026-08-04T09:00:00",
            "tournamentEnd": "2026-08-09T19:00:00",
            "dailySessions": [
                {"id": "day-1", "date": "2026-08-04", "name": "Competition day 1", "startTime": "09:00", "endTime": "19:00"},
                {"id": "day-6", "date": "2026-08-09", "name": "Finals", "startTime": "09:00", "endTime": "17:00"},
            ],
        }},
    )
    assert dates_patch.status_code == 200
    dates = next(s for s in dates_patch.json()["sections"] if s["key"] == "dates")
    assert not any(i["code"] == "SETUP_DATES_SESSION_OUT_OF_WINDOW" for i in dates["issues"])


def _entry_page(tid: str) -> dict:
    """The stored entry-page row — the one `/e/SLUG/regulations` reads."""
    import uuid as _uuid

    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, _uuid.UUID(tid))
        assert row is not None
        return {
            "slug": row.slug,
            "regulations_text": row.regulations_text,
            "regulations_version": row.regulations_version,
        }
    finally:
        session.close()


def test_regulations_text_is_written_to_the_page_the_public_reader_reads(client):
    """Setup · Public site is where regulations are authored.

    The document itself lives on ``entry_pages`` — the row ``/e/SLUG/
    regulations`` reads — so writing it from Setup must reach that row and not
    a second copy in the setup blob. The page is created on demand from the
    public address the same save carries: otherwise the control would be
    visible and inert on every workspace without an entry page.
    """
    created = client.post(
        "/tournaments",
        json={"name": "Regulations", "kind": "bracket", "tournamentDate": "2026-09-05"},
    )
    tid = created.json()["id"]
    setup = client.get(f"/tournaments/{tid}/setup")
    saved = client.patch(
        f"/tournaments/{tid}/setup/public-info",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"publicSlug": "regs-open", "regulationsText": "1. Warm-up\nTwo minutes."}},
    )
    assert saved.status_code == 200
    info = next(s for s in saved.json()["sections"] if s["key"] == "public-info")
    assert info["data"]["regulationsText"].startswith("1. Warm-up")

    stored = _entry_page(tid)
    assert stored["regulations_text"].startswith("1. Warm-up")
    first_version = stored["regulations_version"]

    # An unrelated save must not bump the version: every entry records the
    # version it accepted.
    unchanged = client.patch(
        f"/tournaments/{tid}/setup/public-info",
        headers={"If-Match": saved.headers["etag"]},
        json={"data": {
            "publicSlug": "regs-open",
            "description": "Open to all",
            "regulationsText": "1. Warm-up\nTwo minutes.",
        }},
    )
    assert unchanged.status_code == 200
    assert _entry_page(tid)["regulations_version"] == first_version

    edited = client.patch(
        f"/tournaments/{tid}/setup/public-info",
        headers={"If-Match": unchanged.headers["etag"]},
        json={"data": {"publicSlug": "regs-open", "regulationsText": "1. Warm-up\nThree minutes."}},
    )
    assert edited.status_code == 200
    assert _entry_page(tid)["regulations_version"] == first_version + 1
    assert _entry_page(tid)["regulations_text"].endswith("Three minutes.")


def test_regulations_without_a_public_address_refuses_rather_than_silently_dropping(client):
    created = client.post(
        "/tournaments",
        json={"name": "No address", "kind": "bracket", "tournamentDate": "2026-09-05"},
    )
    tid = created.json()["id"]
    setup = client.get(f"/tournaments/{tid}/setup")
    refused = client.patch(
        f"/tournaments/{tid}/setup/public-info",
        headers={"If-Match": setup.headers["etag"]},
        json={"data": {"regulationsText": "1. Warm-up"}},
    )
    assert refused.status_code == 409
    assert "page address" in refused.json()["detail"]["message"]
