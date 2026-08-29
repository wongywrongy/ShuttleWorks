"""Operator-only normalized entry batch import seam."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}


def _workspace(client):
    tid = client.post("/tournaments", json={"name": "Import Open"}, headers=CSRF).json()["id"]
    from db.models import EntryEvent, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        tournament = session.get(Tournament, uuid.UUID(tid))
        event = EntryEvent(
            tournament_id=tournament.id,
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(event)
        session.commit()
        return tid, str(event.id)
    finally:
        session.close()


def _client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


def _entrant_account():
    from db.session import SessionLocal
    from identity.entrants import create_account

    session = SessionLocal()
    try:
        account = create_account(
            session,
            email="importer-entrant@example.com",
            password="a perfectly fine passphrase",
            display_name="Imported Entrant",
        )
        session.commit()
        return str(account.id)
    finally:
        session.close()


def _body(tid, event_id, account_id, *, key="import-1"):
    return {
        "sourceKey": "bwf-dataset",
        "submissions": [
            {
                "sourceKey": "M0001",
                "idempotencyKey": key,
                "accountId": account_id,
                "players": [
                    {
                        "sourceKey": "P0001",
                        "fullName": "Imported Player",
                        "gender": "M",
                        "eventIds": [event_id],
                    }
                ],
                "feeTotalCents": 2500,
                "feeBasis": {"basis": "import"},
            }
        ],
    }


def test_operator_imports_through_submission_seam_and_replays(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, event_id = _workspace(client)
    account_id = _entrant_account()

    response = client.post(
        f"/tournaments/{tid}/entries/import",
        json=_body(tid, event_id, account_id),
        headers=CSRF,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sourceKey"] == "bwf-dataset"
    assert payload["replayed"] is False
    item = payload["submissions"][0]
    assert item["sourceKey"] == "M0001"
    assert item["idempotencyKey"] == "import-1"
    assert item["replayed"] is False
    assert item["playersCreated"] == 1
    assert item["entriesCreated"] == 1

    replay = client.post(
        f"/tournaments/{tid}/entries/import",
        json=_body(tid, event_id, account_id),
        headers=CSRF,
    )
    assert replay.status_code == 200, replay.text
    replay_item = replay.json()["submissions"][0]
    assert replay.json()["replayed"] is True
    assert replay_item["replayed"] is True
    assert replay_item["submissionId"] == item["submissionId"]

    from db.models import Entry, EntryPlayer, Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        assert session.scalar(select(func.count()).select_from(Submission)) == 1
        assert session.scalar(select(func.count()).select_from(EntryPlayer)) == 1
        assert session.scalar(select(func.count()).select_from(Entry)) == 1
    finally:
        session.close()


def test_import_preflights_every_event_before_writing(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, event_id = _workspace(client)
    account_id = _entrant_account()
    body = _body(tid, event_id, account_id)
    body["submissions"].append(
        {
            "sourceKey": "M0002",
            "idempotencyKey": "import-2",
            "accountId": account_id,
            "players": [
                {
                    "sourceKey": "P0002",
                    "fullName": "Invalid Event Player",
                    "gender": "M",
                    "eventIds": [str(uuid.uuid4())],
                }
            ],
        }
    )

    response = client.post(f"/tournaments/{tid}/entries/import", json=body, headers=CSRF)
    assert response.status_code == 400
    assert "entry event not found" in response.json()["detail"]["message"]

    from db.models import Entry, Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        assert session.scalar(select(func.count()).select_from(Submission)) == 0
        assert session.scalar(select(func.count()).select_from(Entry)) == 0
    finally:
        session.close()


def test_import_rolls_back_when_second_submission_fails(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, event_id = _workspace(client)
    account_id = _entrant_account()
    body = _body(tid, event_id, account_id)
    body["submissions"].append(
        {
            "sourceKey": "M0002",
            "idempotencyKey": "import-2",
            "accountId": account_id,
            "players": [
                {
                    "sourceKey": "P0002",
                    "fullName": "Second Player",
                    "gender": "M",
                    "eventIds": [event_id],
                }
            ],
        }
    )

    from entries import entries_routes
    from fastapi import HTTPException

    real_create = entries_routes.submissions.create_submission
    calls = 0

    def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise HTTPException(status_code=422, detail="forced import failure")
        return real_create(*args, **kwargs)

    monkeypatch.setattr(entries_routes.submissions, "create_submission", fail_second)
    response = client.post(f"/tournaments/{tid}/entries/import", json=body, headers=CSRF)
    assert response.status_code == 422

    from db.models import Entry, EntryPlayer, Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        assert session.scalar(select(func.count()).select_from(Submission)) == 0
        assert session.scalar(select(func.count()).select_from(EntryPlayer)) == 0
        assert session.scalar(select(func.count()).select_from(Entry)) == 0
    finally:
        session.close()


def test_import_rejects_event_from_another_tournament(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, _ = _workspace(client)
    foreign_tid, foreign_event_id = _workspace(client)
    assert foreign_tid != tid
    account_id = _entrant_account()
    body = _body(tid, foreign_event_id, account_id)

    response = client.post(f"/tournaments/{tid}/entries/import", json=body, headers=CSRF)
    assert response.status_code == 400
    assert "entry event not found" in response.json()["detail"]["message"]


def test_import_rejects_non_member_before_payload_validation(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, event_id = _workspace(client)
    account_id = _entrant_account()

    from core.dependencies import LOCAL_DEV_USER_UUID
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        LocalRepository(session).members.remove_member(uuid.UUID(tid), LOCAL_DEV_USER_UUID)
    finally:
        session.close()

    response = client.post(
        f"/tournaments/{tid}/entries/import",
        # Deliberately invalid event id: the tenant dependency must answer
        # uniformly before the handler can disclose payload details.
        json=_body(tid, str(uuid.uuid4()), account_id),
        headers=CSRF,
    )
    assert response.status_code == 404


def test_import_is_operator_only_and_csrf_protected(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    tid, event_id = _workspace(client)
    account_id = _entrant_account()

    from core.dependencies import LOCAL_DEV_USER_UUID
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        LocalRepository(session).members.set_role(uuid.UUID(tid), LOCAL_DEV_USER_UUID, "viewer")
    finally:
        session.close()

    viewer = client.post(
        f"/tournaments/{tid}/entries/import",
        json=_body(tid, event_id, account_id, key="viewer-key"),
    )
    assert viewer.status_code == 403

    # Restore operator membership so the request reaches the route's global
    # cookie-write CSRF guard in a future configuration where local bootstrap
    # writes are cookie-backed.
    session = SessionLocal()
    try:
        LocalRepository(session).members.set_role(uuid.UUID(tid), LOCAL_DEV_USER_UUID, "operator")
    finally:
        session.close()
    # A cookie-backed operator request is the middleware's CSRF trigger. The
    # local bootstrap request above is intentionally exempt because it has no
    # session cookie.
    from core.config import settings
    from db.models import TournamentMember, User
    from identity.auth import create_session

    user_id = uuid.uuid4()
    session = SessionLocal()
    try:
        session.add(User(id=user_id, email="operator@example.com"))
        session.flush()
        LocalRepository(session).members.remove_member(uuid.UUID(tid), LOCAL_DEV_USER_UUID)
        session.add(
            TournamentMember(tournament_id=uuid.UUID(tid), user_id=user_id, role="operator")
        )
        token, _ = create_session(session, user_id)
        session.commit()
    finally:
        session.close()
    client.cookies.set(settings.session_cookie_name, token)

    missing_csrf = client.post(
        f"/tournaments/{tid}/entries/import",
        json=_body(tid, event_id, account_id, key="csrf-key"),
    )
    assert missing_csrf.status_code == 403
