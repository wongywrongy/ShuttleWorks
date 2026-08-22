"""E5 (program Phase 10) — money, retention, and the two GDPR rights.

Three independent things, and the invariants that hold each in place:

- **Money.** Payment clears exactly one pending reason and never confirms an
  entry (invariant I4). This is the invariant most likely to erode, because
  an operator recording a payment obviously *wants* the entry to go through.
- **Retention.** Entry PII is anonymized after the event; the aggregate row
  and the ACCOUNT both survive (spec Q10). Two lifetimes, not one.
- **Erasure and export.** Both ride the account (R10), and erasure is a
  SCRUB, not a delete (owner ruling D7) — the cascade would take a director's
  confirmed entries with it.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def mailbox(monkeypatch):
    import core.email

    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        core.email,
        "send_email",
        lambda *, to, subject, body: sent.append((to, subject, body)),
    )
    return sent


@pytest.fixture
def turnstile(monkeypatch):
    import json as _json
    from identity import turnstile as service

    monkeypatch.setattr(
        service, "_post", lambda url, fields, timeout: _json.dumps({"success": True})
    )


@pytest.fixture
def world(client, turnstile, mailbox):
    """An operator's workspace with a priced page, and a verified entrant."""
    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

    client.post(
        "/auth/register", json={"email": "op@example.com", "password": PW}, headers=CSRF
    )
    tid = client.post(
        "/tournaments", json={"name": "Money Open"}, headers=CSRF
    ).json()["id"]

    session = SessionLocal()
    try:
        row = session.get(Tournament, uuid.UUID(tid))
        row.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="money-open",
                is_open=True,
                fee_schedule={"1": 4000},
            )
        )
        event = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            retention_days=30,
        )
        session.add(event)
        session.commit()
        ids = {"tid": tid, "event_id": str(event.id)}
    finally:
        session.close()

    # A verified entrant, through the real loop.
    r = client.post(
        "/e/account/signup",
        json={"email": "parent@example.com", "password": PW, "turnstileToken": "x"},
        headers=CSRF,
    )
    assert r.status_code == 202
    token = mailbox[-1][2].split("token=")[1].split()[0]
    client.post("/e/account/verify", json={"token": token}, headers=CSRF)
    client.cookies.clear()
    client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": PW},
        headers=CSRF,
    )
    return ids


def _submit(world, *, fee=4000, name="Alice Chen"):
    """One act, through the submission service."""
    from sqlalchemy import select
    from db.models import EntrantAccount, EntryEvent, EntryPage
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, create_submission

    session = SessionLocal()
    try:
        account = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "parent@example.com")
        ).one()
        page = session.get(EntryPage, uuid.UUID(world["tid"]))
        event = session.get(
            EntryEvent, (uuid.UUID(world["tid"]), uuid.UUID(world["event_id"]))
        )
        result = create_submission(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            page=page,
            account_id=account.id,
            players=[PlayerInput(full_name=name, gender="M", events=[event])],
            fee_total_cents=fee,
            fee_basis={"basis": "schedule", "players": []},
        )
        return {
            "submission_id": str(result.submission.id),
            "entry_id": str(result.entries[0].id),
            "player_id": str(result.players[0].id),
            "reasons": list(result.entries[0].pending_reasons),
        }
    finally:
        session.close()


def _entry(tid, entry_id):
    from db.models import Entry
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        return session.get(Entry, (uuid.UUID(tid), uuid.UUID(entry_id)))
    finally:
        session.close()


def _player(tid, player_id):
    from db.models import EntryPlayer
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        return session.get(EntryPlayer, (uuid.UUID(tid), uuid.UUID(player_id)))
    finally:
        session.close()


def _as_operator(client):
    client.cookies.clear()
    assert client.post(
        "/auth/login", json={"email": "op@example.com", "password": PW}, headers=CSRF
    ).status_code == 200


# ---- money ---------------------------------------------------------------


def test_an_act_that_owes_money_says_so_from_the_moment_it_exists(client, world):
    """Before E5 the reason was vocabulary nothing produced, which is why
    E4's UNPAID_ENTRIES could never fire."""
    out = _submit(world)
    assert "awaiting_payment" in out["reasons"]


def test_an_unpriced_act_owes_nothing(client, world):
    """NEGATIVE CONTROL — `None` is not zero and neither is a lie.

    A tournament that configured no prices has not declared its entries
    free. Demonstrated failing by flagging on `fee_total_cents is not None`:
    every entry on an unpriced page is marked unpaid forever, and the desk
    grows a permanent UNPAID_ENTRIES flag nobody can clear.
    """
    out = _submit(world, fee=None)
    assert "awaiting_payment" not in out["reasons"]


def test_marking_paid_clears_the_reason(client, world):
    out = _submit(world)
    _as_operator(client)
    r = client.post(
        f"/tournaments/{world['tid']}/submissions/{out['submission_id']}/paid",
        json={"note": "Zelle, ref 4412"},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    assert r.json()["entriesUpdated"] == 1
    assert r.json()["paidAt"] is not None
    assert "awaiting_payment" not in _entry(world["tid"], out["entry_id"]).pending_reasons


def test_marking_paid_does_not_confirm_the_entry(client, world):
    """NEGATIVE CONTROL — invariant I4, and the one most likely to erode.

    An operator marking a payment obviously wants the entry to go through,
    so a helpful edit that also confirmed it is the natural mistake. That
    would make payment a consequential automatic decision. Demonstrated
    failing by setting `entry.state = CONFIRMED` in `money.mark_paid`.
    """
    out = _submit(world)
    _as_operator(client)
    client.post(
        f"/tournaments/{world['tid']}/submissions/{out['submission_id']}/paid",
        headers=CSRF,
    )
    assert _entry(world["tid"], out["entry_id"]).state == "pending"


def test_marking_paid_twice_is_not_an_error(client, world):
    """Two operators on a busy desk is a thing that happens."""
    out = _submit(world)
    _as_operator(client)
    url = f"/tournaments/{world['tid']}/submissions/{out['submission_id']}/paid"
    first = client.post(url, headers=CSRF)
    second = client.post(url, headers=CSRF)
    assert first.status_code == second.status_code == 200
    # The second press cleared nothing, because there was nothing left.
    assert second.json()["entriesUpdated"] == 0


def test_unmarking_restores_the_reason(client, world):
    out = _submit(world)
    _as_operator(client)
    base = f"/tournaments/{world['tid']}/submissions/{out['submission_id']}"
    client.post(f"{base}/paid", headers=CSRF)
    r = client.post(f"{base}/unpaid", headers=CSRF)

    assert r.status_code == 200
    assert "awaiting_payment" in _entry(world["tid"], out["entry_id"]).pending_reasons


def test_unmarking_a_free_act_invents_no_debt(client, world):
    """NEGATIVE CONTROL — the asymmetry is deliberate.

    Demonstrated failing by dropping the `owes_payment` guard from
    `mark_unpaid`: a free entry acquires an `awaiting_payment` reason that
    no payment can ever clear, because there is nothing to pay.
    """
    out = _submit(world, fee=None)
    _as_operator(client)
    base = f"/tournaments/{world['tid']}/submissions/{out['submission_id']}"
    client.post(f"{base}/paid", headers=CSRF)
    client.post(f"{base}/unpaid", headers=CSRF)
    assert "awaiting_payment" not in _entry(world["tid"], out["entry_id"]).pending_reasons


def test_a_viewer_cannot_record_a_payment(client, world):
    out = _submit(world)
    client.cookies.clear()
    client.post(
        "/auth/register", json={"email": "viewer@example.com", "password": PW}, headers=CSRF
    )
    _as_operator(client)
    token = client.post(
        f"/tournaments/{world['tid']}/invites", json={"role": "viewer"}, headers=CSRF
    ).json()["token"]
    client.cookies.clear()
    client.post(
        "/auth/login", json={"email": "viewer@example.com", "password": PW}, headers=CSRF
    )
    client.post(f"/invites/{token}/accept", headers=CSRF)

    r = client.post(
        f"/tournaments/{world['tid']}/submissions/{out['submission_id']}/paid",
        headers=CSRF,
    )
    assert r.status_code == 403


# ---- retention -----------------------------------------------------------


def test_retention_erases_the_person_and_keeps_the_record(client, world):
    from db.session import SessionLocal
    from entries import retention

    out = _submit(world)
    session = SessionLocal()
    try:
        result = retention.sweep_workspace(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2026, 9, 12),
            now=datetime(2026, 12, 1, tzinfo=timezone.utc),
        )
        session.commit()
    finally:
        session.close()

    assert result.erased == 1
    player = _player(world["tid"], out["player_id"])
    assert player.full_name == "(erased)"
    assert player.erased_at is not None
    # The aggregate row survives, with its state and its fee history.
    entry = _entry(world["tid"], out["entry_id"])
    assert entry is not None
    assert entry.state == "pending"


def test_retention_does_not_run_before_it_is_due(client, world):
    """NEGATIVE CONTROL — the clock.

    Demonstrated failing by comparing against the event date rather than
    date + retention_days: every entry is erased the day after the event,
    which is not a retention policy, it is a delete.
    """
    from db.session import SessionLocal
    from entries import retention

    out = _submit(world)
    session = SessionLocal()
    try:
        result = retention.sweep_workspace(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2026, 9, 12),
            now=datetime(2026, 9, 20, tzinfo=timezone.utc),
        )
        session.commit()
    finally:
        session.close()

    assert result.erased == 0
    assert result.skipped_not_due == 1
    assert _player(world["tid"], out["player_id"]).full_name == "Alice Chen"


def test_an_event_with_no_policy_is_never_swept(client, world):
    """A default deletion date the operator never chose is exactly the
    consequential automatic act invariant I4 rules out."""
    from db.models import EntryEvent
    from db.session import SessionLocal
    from entries import retention

    out = _submit(world)
    session = SessionLocal()
    try:
        event = session.get(
            EntryEvent, (uuid.UUID(world["tid"]), uuid.UUID(world["event_id"]))
        )
        event.retention_days = None
        session.commit()
        result = retention.sweep_workspace(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2020, 1, 1),
            now=datetime(2026, 12, 1, tzinfo=timezone.utc),
        )
        session.commit()
    finally:
        session.close()

    assert result.erased == 0
    assert result.skipped_no_policy == 1
    assert _player(world["tid"], out["player_id"]).full_name == "Alice Chen"


def test_the_sweep_is_idempotent(client, world):
    """Scheduled without a cursor or a lock — the state it needs is on the
    rows. A second pass must report zero, not re-erase."""
    from db.session import SessionLocal
    from entries import retention

    _submit(world)
    session = SessionLocal()
    try:
        kwargs = dict(
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2026, 9, 12),
            now=datetime(2026, 12, 1, tzinfo=timezone.utc),
        )
        first = retention.sweep_workspace(session, **kwargs)
        session.commit()
        second = retention.sweep_workspace(session, **kwargs)
        session.commit()
    finally:
        session.close()

    assert first.erased == 1
    assert second.erased == 0


def test_retention_never_touches_the_account(client, world):
    """NEGATIVE CONTROL — the two lifetimes (Q10).

    An account is a live relationship the person may use next season; it is
    deleted only when they ask. Demonstrated failing by scrubbing the
    account alongside the players: an entrant who entered one tournament
    last year silently loses their login.
    """
    from sqlalchemy import select
    from db.models import EntrantAccount
    from db.session import SessionLocal
    from entries import retention

    _submit(world)
    session = SessionLocal()
    try:
        retention.sweep_workspace(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2026, 9, 12),
            now=datetime(2026, 12, 1, tzinfo=timezone.utc),
        )
        session.commit()
        account = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "parent@example.com")
        ).one()
        assert account.password_hash is not None
    finally:
        session.close()

    # And the login still works.
    client.cookies.clear()
    assert client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": PW},
        headers=CSRF,
    ).status_code == 200


# ---- export and erasure --------------------------------------------------


def test_export_returns_the_account_s_own_data(client, world):
    _submit(world)
    r = client.get("/e/api/me/export")
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["email"] == "parent@example.com"
    assert [p["fullName"] for p in body["players"]] == ["Alice Chen"]
    assert len(body["submissions"]) == 1
    assert body["submissions"][0]["feeTotalCents"] == 4000
    assert [e["eventCode"] for e in body["entries"]] == ["MS"]


def test_export_carries_no_credential(client, world):
    """NEGATIVE CONTROL — the hash and the tokens are not personal data,
    they are the account. Exporting them hands a copy of it to whoever
    reads the file."""
    _submit(world)
    body = client.get("/e/api/me/export").text
    for forbidden in ("password_hash", "passwordHash", "$argon2", "token_hash"):
        assert forbidden not in body


def test_export_refuses_an_anonymous_caller(client, world):
    client.cookies.clear()
    assert client.get("/e/api/me/export").status_code == 401


def test_erasure_scrubs_the_person_and_keeps_the_director_s_records(client, world):
    """Owner ruling D7, end to end at the route."""
    from sqlalchemy import select
    from db.models import EntrantAccount, Submission
    from db.session import SessionLocal

    out = _submit(world)
    r = client.post("/e/api/me/erase", headers=CSRF)

    assert r.status_code == 200, r.text
    assert r.json() == {"playersErased": 1, "submissionsKept": 1}

    assert _player(world["tid"], out["player_id"]).full_name == "(erased)"
    # The entry and its act survive — a director's confirmed entry is their
    # record, and it is not the entrant's to delete.
    assert _entry(world["tid"], out["entry_id"]) is not None

    session = SessionLocal()
    try:
        assert (
            session.scalar(
                select(Submission).where(
                    Submission.tournament_id == uuid.UUID(world["tid"])
                )
            )
            is not None
        )
        # NEGATIVE CONTROL for D7: the ACCOUNT ROW survives too. A bare
        # `session.delete(account)` would cascade and take both of the
        # assertions above with it.
        gone = session.scalars(
            select(EntrantAccount).where(
                EntrantAccount.email == "parent@example.com"
            )
        ).first()
        assert gone is None, "the address must not survive erasure"
        remaining = list(session.scalars(select(EntrantAccount)))
        assert len(remaining) == 1
        assert remaining[0].email.startswith("erased+")
        assert remaining[0].password_hash is None
    finally:
        session.close()


def test_erasure_signs_the_caller_out_and_locks_the_account(client, world):
    _submit(world)
    client.post("/e/api/me/erase", headers=CSRF)

    # The scrub revokes every session, so the caller's cookie is dead.
    assert client.get("/e/account/me").status_code == 401
    # And there is no way back in: the password is gone.
    client.cookies.clear()
    assert client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": PW},
        headers=CSRF,
    ).status_code == 401


def test_erasure_is_idempotent_over_already_scrubbed_players(client, world):
    from db.session import SessionLocal
    from entries import retention

    _submit(world)
    session = SessionLocal()
    try:
        retention.sweep_workspace(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            event_date=date(2026, 9, 12),
            now=datetime(2026, 12, 1, tzinfo=timezone.utc),
        )
        session.commit()
    finally:
        session.close()

    r = client.post("/e/api/me/erase", headers=CSRF)
    # Nothing left to scrub, and that is a success rather than a failure.
    assert r.status_code == 200
    assert r.json()["playersErased"] == 0
    assert r.json()["submissionsKept"] == 1


def test_an_unverified_account_cannot_erase(client, world, mailbox, turnstile):
    """NEGATIVE CONTROL — E2's reasoning, applied to the most irreversible
    act on the surface. Anyone can type anyone's address at signup."""
    client.cookies.clear()
    client.post(
        "/e/account/signup",
        json={"email": "unverified@example.com", "password": PW, "turnstileToken": "x"},
        headers=CSRF,
    )
    client.cookies.clear()
    client.post(
        "/e/account/login",
        json={"email": "unverified@example.com", "password": PW},
        headers=CSRF,
    )

    r = client.post("/e/api/me/erase", headers=CSRF)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "ENTRY_ACCOUNT_UNVERIFIED"
