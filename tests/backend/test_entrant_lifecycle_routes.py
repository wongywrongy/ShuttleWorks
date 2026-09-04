"""E2 (program Phase 7) — the lifecycle at the HTTP surface.

``tests/backend/unit/test_entry_lifecycle.py`` pins the state machine as a
machine. This file pins the four things only a route can get wrong:

1. **Who may act.** The entrant transitions demand a *verified* account and
   the caller's own entry; the operator ones demand the operator role. Both
   are asserted with a negative control — a stranger, and a viewer.
2. **What a refusal looks like.** Status, code and the reason the machine
   gave, because a client branches on those.
3. **Non-enumeration on the two pre-session routes.** R10 extends the rule
   to reset explicitly, and a route is exactly where it gets lost: one
   status code, one body, one redirect target, registered or not.
4. **That the mailed link actually works**, end to end, through the message
   the route really sent.
"""
from __future__ import annotations

import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
PW = "a perfectly fine passphrase"
NEW_PW = "another entirely fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def mailbox(monkeypatch):
    """Every message the app sends, as ``(to, subject, body)``.

    Patches ``core.email.send_email`` itself rather than a caller, so a
    route that stops sending is visible as an empty mailbox instead of a
    passing test.
    """
    import core.email

    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        core.email,
        "send_email",
        lambda *, to, subject, body: sent.append((to, subject, body)),
    )
    return sent


def _token_in(body: str, kind: str) -> str:
    """Pull the token out of a real message body."""
    assert f"/e/{kind}?token=" in body, body
    return body.split("token=")[1].split()[0]


# ---- the entrant side ----------------------------------------------------


def _signup(client, mailbox, email="parent@example.com"):
    r = client.post(
        "/e/account/signup",
        json={"email": email, "password": PW, "turnstileToken": "x"},
        headers=CSRF,
    )
    assert r.status_code == 202, r.text
    return mailbox[-1][2] if mailbox else ""


def _login(client, email="parent@example.com", password=PW):
    client.cookies.clear()
    return client.post(
        "/e/account/login", json={"email": email, "password": password}, headers=CSRF
    )


@pytest.fixture
def workspace_with_an_entry(client, mailbox):
    """A verified entrant holding one pending entry, signed in.

    Built through the real routes wherever a route exists: signup and verify
    are real posts; the workspace, page and event are seeded, because
    configuring a tournament is the operator's surface and has its own file.
    """
    from db.models import EntryEvent, EntryPage
    from db.session import SessionLocal

    # Operator side: a workspace with an open entry page and one event.
    client.post("/auth/register", json={"email": "op@example.com", "password": PW}, headers=CSRF)
    tid = client.post("/tournaments", json={"name": "Lifecycle Open"}, headers=CSRF).json()["id"]
    session = SessionLocal()
    try:
        session.add(EntryPage(tournament_id=uuid.UUID(tid), slug="lifecycle-open", is_open=True))
        event = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(event)
        session.commit()
        event_id = str(event.id)
    finally:
        session.close()

    # Entrant side, through the real loop.
    body = _signup(client, mailbox)
    token = _token_in(body, "verify")
    assert client.post("/e/account/verify", json={"token": token}, headers=CSRF).status_code == 204
    assert _login(client).status_code == 200

    entry_id = _seed_entry(tid, event_id, "parent@example.com")
    return {"tid": tid, "event_id": event_id, "entry_id": entry_id}


def _seed_entry(tid, event_id, email, *, state="pending", name="Alice Chen"):
    """One entry under the given account's own submission."""
    from sqlalchemy import select
    from db.models import EntrantAccount, Entry, EntryPlayer, Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        account = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == email)
        ).one()
        submission = Submission(
            tournament_id=uuid.UUID(tid), account_id=account.id, fee_total_cents=4000
        )
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name=name,
            gender="F",
            club="Riverside",
        )
        session.add_all([submission, player])
        session.flush()
        entry = Entry(
            tournament_id=uuid.UUID(tid),
            entry_event_id=uuid.UUID(event_id),
            submission_id=submission.id,
            entry_player_id=player.id,
            state=state,
        )
        session.add(entry)
        session.commit()
        return str(entry.id)
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


# ---- verification --------------------------------------------------------


def test_signup_sends_a_link_that_verifies_the_account(client, mailbox):
    body = _signup(client, mailbox)
    assert "Confirm" in mailbox[-1][1]
    assert mailbox[-1][1] == "Confirm your email for ShuttleWorks entries"
    assert body.endswith("ShuttleWorks by Yunavero")
    r = client.post(
        "/e/account/verify", json={"token": _token_in(body, "verify")}, headers=CSRF
    )
    assert r.status_code == 204

    assert _login(client).status_code == 200
    assert client.get("/e/account/me").json()["emailVerified"] is True


def test_a_verification_token_is_single_use(client, mailbox):
    """NEGATIVE CONTROL — the token is burned on consumption.

    Demonstrated failing by leaving ``verify_token_hash`` set in
    ``consume_verification_token``: the second post succeeds, so a link
    forwarded to somebody else stays live indefinitely.
    """
    token = _token_in(_signup(client, mailbox), "verify")
    assert client.post("/e/account/verify", json={"token": token}, headers=CSRF).status_code == 204
    second = client.post("/e/account/verify", json={"token": token}, headers=CSRF)
    assert second.status_code == 400
    assert second.json()["detail"]["code"] == "AUTH_RESET_INVALID"


def test_a_forged_verification_token_is_refused(client, mailbox):
    _signup(client, mailbox)
    r = client.post(
        "/e/account/verify", json={"token": "not-a-real-token"}, headers=CSRF
    )
    assert r.status_code == 400


def test_verifying_promotes_entries_that_were_waiting_on_it(client, mailbox):
    """The transition that makes an unverified entry reachable at all.

    Without it the entry sits in ``unverified`` forever, the operator cannot
    confirm it, and Seam A — which commits only ``confirmed`` — never sees
    it. That is the dead end ruling D1 described.
    """
    from db.models import EntryEvent, EntryPage
    from db.session import SessionLocal

    client.post("/auth/register", json={"email": "op@example.com", "password": PW}, headers=CSRF)
    tid = client.post("/tournaments", json={"name": "Promo"}, headers=CSRF).json()["id"]
    session = SessionLocal()
    try:
        session.add(EntryPage(tournament_id=uuid.UUID(tid), slug="promo", is_open=True))
        event = EntryEvent(
            tournament_id=uuid.UUID(tid), code="MS", discipline="MS", entry_type="singles"
        )
        session.add(event)
        session.commit()
        event_id = str(event.id)
    finally:
        session.close()

    body = _signup(client, mailbox)
    entry_id = _seed_entry(tid, event_id, "parent@example.com", state="unverified")

    client.post("/e/account/verify", json={"token": _token_in(body, "verify")}, headers=CSRF)
    assert _entry(tid, entry_id).state == "pending"


def test_resend_verification_needs_a_session(client, mailbox):
    """NEGATIVE CONTROL — the route takes no address, on purpose.

    An address-taking resend would let anyone send our mail to anyone's
    inbox on demand. Anonymous callers are refused by the session gate, and
    that is what makes the mail cannon impossible rather than merely
    rate-limited.
    """
    _signup(client, mailbox)
    client.cookies.clear()
    assert client.post("/e/account/resend-verification", headers=CSRF).status_code == 401


def test_resend_verification_mails_the_signed_in_entrant(client, mailbox):
    _signup(client, mailbox)
    assert _login(client).status_code == 200
    before = len(mailbox)
    assert client.post("/e/account/resend-verification", headers=CSRF).status_code == 202
    assert len(mailbox) == before + 1
    assert mailbox[-1][0] == "parent@example.com"


def test_resending_invalidates_the_previous_link(client, mailbox):
    """The older mail's link must stop working, or a re-send is not a
    replacement — it is a second live credential in a second inbox copy."""
    first = _token_in(_signup(client, mailbox), "verify")
    assert _login(client).status_code == 200
    client.post("/e/account/resend-verification", headers=CSRF)

    assert client.post("/e/account/verify", json={"token": first}, headers=CSRF).status_code == 400
    fresh = _token_in(mailbox[-1][2], "verify")
    assert client.post("/e/account/verify", json={"token": fresh}, headers=CSRF).status_code == 204


# ---- password reset ------------------------------------------------------


def test_reset_request_answers_identically_for_a_stranger(client, mailbox):
    """NEGATIVE CONTROL — R10's extension of the non-enumeration rule.

    Demonstrated failing by answering 404 on the unknown branch: the route
    becomes a free account-existence oracle for anyone with an address list,
    which is exactly what signup pays an Argon2 hash to avoid being.
    """
    _signup(client, mailbox)
    known = client.post(
        "/e/account/request-password-reset",
        json={"email": "parent@example.com"},
        headers=CSRF,
    )
    unknown = client.post(
        "/e/account/request-password-reset",
        json={"email": "nobody@example.com"},
        headers=CSRF,
    )
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_only_a_registered_address_actually_receives_mail(client, mailbox):
    _signup(client, mailbox)
    mailbox.clear()
    client.post(
        "/e/account/request-password-reset",
        json={"email": "nobody@example.com"},
        headers=CSRF,
    )
    assert mailbox == []


def test_a_reset_link_sets_the_password_and_kills_live_sessions(client, mailbox):
    """OWASP: a reset with the attacker's session still alive is theatre."""
    _signup(client, mailbox)
    assert _login(client).status_code == 200
    # This client now holds a live session cookie — the "attacker's".
    assert client.get("/e/account/me").status_code == 200

    client.post(
        "/e/account/request-password-reset",
        json={"email": "parent@example.com"},
        headers=CSRF,
    )
    token = _token_in(mailbox[-1][2], "reset")
    r = client.post(
        "/e/account/reset-password",
        json={"token": token, "newPassword": NEW_PW},
        headers=CSRF,
    )
    assert r.status_code == 204

    assert client.get("/e/account/me").status_code == 401
    assert _login(client, password=PW).status_code == 401
    assert _login(client, password=NEW_PW).status_code == 200


def test_a_reset_token_is_single_use(client, mailbox):
    _signup(client, mailbox)
    client.post(
        "/e/account/request-password-reset",
        json={"email": "parent@example.com"},
        headers=CSRF,
    )
    token = _token_in(mailbox[-1][2], "reset")
    assert client.post(
        "/e/account/reset-password",
        json={"token": token, "newPassword": NEW_PW},
        headers=CSRF,
    ).status_code == 204
    assert client.post(
        "/e/account/reset-password",
        json={"token": token, "newPassword": "yet another fine passphrase"},
        headers=CSRF,
    ).status_code == 400


def test_a_reset_cannot_smuggle_a_weak_password_past_the_policy(client, mailbox):
    """NEGATIVE CONTROL — the front door's policy applies to the back one.

    Demonstrated failing by dropping ``validate_password`` from
    ``consume_reset_token``: "abc" is accepted through reset while signup
    still refuses it, so the policy holds only for people who never forget
    their password.
    """
    _signup(client, mailbox)
    client.post(
        "/e/account/request-password-reset",
        json={"email": "parent@example.com"},
        headers=CSRF,
    )
    token = _token_in(mailbox[-1][2], "reset")
    r = client.post(
        "/e/account/reset-password",
        json={"token": token, "newPassword": "abc"},
        headers=CSRF,
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_WEAK_PASSWORD"


def test_a_verification_token_cannot_be_replayed_as_a_reset(client, mailbox):
    """NEGATIVE CONTROL — the two token columns are separate.

    This is the whole argument for not folding verification onto
    ``reset_token_hash``. Demonstrated failing by pointing both consumers at
    one column: a mailed verification link becomes a password-reset
    credential, which is a privilege escalation by column-sharing.
    """
    verify_token = _token_in(_signup(client, mailbox), "verify")
    r = client.post(
        "/e/account/reset-password",
        json={"token": verify_token, "newPassword": NEW_PW},
        headers=CSRF,
    )
    assert r.status_code == 400
    assert _login(client, password=PW).status_code == 200


# ---- the entrant withdraws ----------------------------------------------


def test_an_entrant_withdraws_their_own_entry(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    r = client.post(f"/e/api/me/entries/{w['entry_id']}/withdraw", headers=CSRF)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "withdrawn"
    assert _entry(w["tid"], w["entry_id"]).state == "withdrawn"


def test_withdraw_and_erase_scrubs_the_player(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    r = client.post(
        f"/e/api/me/entries/{w['entry_id']}/withdraw",
        json={"erase": True},
        headers=CSRF,
    )
    assert r.status_code == 200
    assert r.json()["erased"] is True

    from db.models import EntryPlayer
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        entry = _entry(w["tid"], w["entry_id"])
        player = session.get(EntryPlayer, (uuid.UUID(w["tid"]), entry.entry_player_id))
        assert player.full_name == "(erased)"
        assert player.club is None
        assert player.erased_at is not None
    finally:
        session.close()


def test_a_stranger_cannot_withdraw_somebody_else_s_entry(
    client, mailbox, workspace_with_an_entry
):
    """NEGATIVE CONTROL — the ownership scope, and the shape of its refusal.

    404, not 403: "not yours" and "not there" have to be indistinguishable,
    or the route confirms that an entry id exists to a caller who cannot see
    it. Demonstrated failing by resolving the entry by id alone: the
    stranger's post succeeds and cancels a real entry.

    **The stranger is given an entry of their own, and that detail is the
    test.** Written without it, this passed even with the scope predicate
    deleted — an account with no submissions hits the empty-list
    short-circuit and 404s for a reason that has nothing to do with
    ownership. A caller who legitimately has entries is the only one who can
    prove the filter is doing the work.
    """
    w = workspace_with_an_entry
    body = _signup(client, mailbox, "stranger@example.com")
    client.post("/e/account/verify", json={"token": _token_in(body, "verify")}, headers=CSRF)
    assert _login(client, "stranger@example.com").status_code == 200
    mine = _seed_entry(w["tid"], w["event_id"], "stranger@example.com", name="Mine")

    r = client.post(f"/e/api/me/entries/{w['entry_id']}/withdraw", headers=CSRF)
    assert r.status_code == 404
    assert _entry(w["tid"], w["entry_id"]).state == "pending"
    # And the scope cuts one way only: their own entry still works.
    assert client.post(f"/e/api/me/entries/{mine}/withdraw", headers=CSRF).status_code == 200


def test_an_unverified_account_cannot_withdraw(client, mailbox, workspace_with_an_entry):
    """NEGATIVE CONTROL — verification gates the irreversible acts.

    Anyone can type anyone's address at signup. If an unverified session
    could withdraw, guessing an address would be enough to cancel the real
    owner's entries. Demonstrated failing by removing the
    ``email_verified`` branch from the route.
    """
    w = workspace_with_an_entry
    _signup(client, mailbox, "unverified@example.com")  # never confirms
    assert _login(client, "unverified@example.com").status_code == 200
    entry_id = _seed_entry(w["tid"], w["event_id"], "unverified@example.com", name="Kid")

    r = client.post(f"/e/api/me/entries/{entry_id}/withdraw", headers=CSRF)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "ENTRY_ACCOUNT_UNVERIFIED"


def test_the_withdrawal_deadline_refuses_at_the_route(client, workspace_with_an_entry):
    from datetime import datetime, timedelta, timezone

    from db.models import EntryEvent
    from db.session import SessionLocal

    w = workspace_with_an_entry
    session = SessionLocal()
    try:
        event = session.get(EntryEvent, (uuid.UUID(w["tid"]), uuid.UUID(w["event_id"])))
        event.withdraws_until = datetime.now(timezone.utc) - timedelta(days=1)
        session.commit()
    finally:
        session.close()

    r = client.post(f"/e/api/me/entries/{w['entry_id']}/withdraw", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["detail"]["reason"] == "WITHDRAWAL_CLOSED"


def test_withdrawing_twice_is_a_conflict_not_a_silent_success(
    client, workspace_with_an_entry
):
    w = workspace_with_an_entry
    assert client.post(f"/e/api/me/entries/{w['entry_id']}/withdraw", headers=CSRF).status_code == 200
    second = client.post(f"/e/api/me/entries/{w['entry_id']}/withdraw", headers=CSRF)
    assert second.status_code == 409
    assert second.json()["detail"]["reason"] == "ENTRY_NOT_LIVE"


# ---- the operator's desk transitions ------------------------------------


def _as_operator(client):
    client.cookies.clear()
    assert client.post(
        "/auth/login", json={"email": "op@example.com", "password": PW}, headers=CSRF
    ).status_code == 200


def test_the_desk_rejects_a_pending_entry(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    _as_operator(client)
    r = client.post(f"/tournaments/{w['tid']}/entries/{w['entry_id']}/reject", headers=CSRF)
    assert r.status_code == 200
    assert r.json()["state"] == "rejected"


def test_the_desk_cannot_reject_a_confirmed_entry(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    _as_operator(client)
    client.post(f"/tournaments/{w['tid']}/entries/{w['entry_id']}/confirm", headers=CSRF)
    r = client.post(f"/tournaments/{w['tid']}/entries/{w['entry_id']}/reject", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["detail"]["reason"] == "ENTRY_NOT_REJECTABLE"


def test_the_desk_promotes_a_waitlisted_entry_to_pending(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    waitlisted = _seed_entry(
        w["tid"], w["event_id"], "parent@example.com", state="waitlisted", name="Queued"
    )
    _as_operator(client)
    r = client.post(f"/tournaments/{w['tid']}/entries/{waitlisted}/promote", headers=CSRF)
    assert r.status_code == 200
    assert r.json()["state"] == "pending"


def test_confirming_a_waitlisted_entry_says_promote_first(client, workspace_with_an_entry):
    w = workspace_with_an_entry
    waitlisted = _seed_entry(
        w["tid"], w["event_id"], "parent@example.com", state="waitlisted", name="Queued"
    )
    _as_operator(client)
    r = client.post(f"/tournaments/{w['tid']}/entries/{waitlisted}/confirm", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["detail"]["reason"] == "ENTRY_WAITLISTED"


def test_the_desk_withdraws_past_the_deadline(client, workspace_with_an_entry):
    """The escape hatch the entrant-facing refusal points at (R14 §3, I4)."""
    from datetime import datetime, timedelta, timezone

    from db.models import EntryEvent
    from db.session import SessionLocal

    w = workspace_with_an_entry
    session = SessionLocal()
    try:
        event = session.get(EntryEvent, (uuid.UUID(w["tid"]), uuid.UUID(w["event_id"])))
        event.withdraws_until = datetime.now(timezone.utc) - timedelta(days=1)
        session.commit()
    finally:
        session.close()

    _as_operator(client)
    r = client.post(f"/tournaments/{w['tid']}/entries/{w['entry_id']}/withdraw", headers=CSRF)
    assert r.status_code == 200
    assert r.json()["state"] == "withdrawn"


@pytest.mark.parametrize("action", ["reject", "promote", "withdraw"])
def test_a_viewer_cannot_move_an_entry(client, workspace_with_an_entry, action):
    """NEGATIVE CONTROL — the role matrix on the three new desk routes.

    Every one of them is a decision, and a viewer makes none. Demonstrated
    failing by declaring ``require_tournament_access("viewer")``: the read
    role acquires the ability to reject entries.
    """
    w = workspace_with_an_entry
    client.cookies.clear()
    client.post("/auth/register", json={"email": "viewer@example.com", "password": PW}, headers=CSRF)
    _as_operator(client)
    token = client.post(
        f"/tournaments/{w['tid']}/invites", json={"role": "viewer"}, headers=CSRF
    ).json()["token"]
    client.cookies.clear()
    client.post("/auth/login", json={"email": "viewer@example.com", "password": PW}, headers=CSRF)
    assert client.post(f"/invites/{token}/accept", headers=CSRF).status_code == 200

    r = client.post(f"/tournaments/{w['tid']}/entries/{w['entry_id']}/{action}", headers=CSRF)
    assert r.status_code == 403
