"""E3 (program Phase 8) — doubles: nomination, invite, acceptance, conflict.

The claims this file exists to hold, in the order they matter:

1. **An invite is not a capability.** Possession of the link buys a preview
   and nothing else; acceptance needs a verified entrant principal. This is
   the property R10 retired the capability path to get, and it is asserted
   with a negative control rather than assumed.
2. **The preview discloses only what the inviter already shared.** Notably
   not the invited address — an unauthenticated echo would let anyone
   holding a forwarded link confirm who it went to.
3. **Acceptance builds the partner's OWN record** and links the pair both
   ways, so either half can find the other.
4. **Unpartnered is not over-cap.** The two states stay independent; that
   separation is the incumbent-beating design point and is easy to lose.
5. **Conflicts flag, never resolve** (invariant I4).
"""
from __future__ import annotations

import uuid

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


def _verified_entrant(client, mailbox, email):
    """Sign up, verify through the mailed link, sign in. Returns the email."""
    r = client.post(
        "/e/account/signup",
        json={"email": email, "password": PW, "turnstileToken": "x"},
        headers=CSRF,
    )
    assert r.status_code == 202, r.text
    token = mailbox[-1][2].split("token=")[1].split()[0]
    assert client.post("/e/account/verify", json={"token": token}, headers=CSRF).status_code == 204
    client.cookies.clear()
    assert client.post(
        "/e/account/login", json={"email": email, "password": PW}, headers=CSRF
    ).status_code == 200
    return email


@pytest.fixture
def world(client, turnstile, mailbox):
    """A workspace with one DOUBLES event and an open page."""
    from db.models import EntryEvent, EntryPage
    from db.session import SessionLocal

    client.post("/auth/register", json={"email": "op@example.com", "password": PW}, headers=CSRF)
    tid = client.post("/tournaments", json={"name": "Pairs Open"}, headers=CSRF).json()["id"]
    session = SessionLocal()
    try:
        session.add(EntryPage(tournament_id=uuid.UUID(tid), slug="pairs-open", is_open=True))
        event = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="XD",
            discipline="Mixed Doubles",
            entry_type="doubles",
        )
        singles = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add_all([event, singles])
        session.commit()
        ids = {"tid": tid, "xd": str(event.id), "ms": str(singles.id)}
    finally:
        session.close()
    client.cookies.clear()
    return ids


def _nominate(client, world, *, partner_email, event_key="xd", name="Alex Kim"):
    """Submit one doubles entry naming a partner, through the service.

    The HTTP submit path carries its own CSRF and Turnstile choreography and
    is exercised by `test_entries_submit_api`; what this file is about starts
    at the invite, so the act itself is built through the service the route
    calls.
    """
    from sqlalchemy import select
    from db.models import EntrantAccount, EntryEvent, EntryPage
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, create_submission

    session = SessionLocal()
    try:
        account = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "alex@example.com")
        ).one()
        page = session.get(EntryPage, uuid.UUID(world["tid"]))
        event = session.get(
            EntryEvent, (uuid.UUID(world["tid"]), uuid.UUID(world[event_key]))
        )
        result = create_submission(
            session,
            tournament_id=uuid.UUID(world["tid"]),
            page=page,
            account_id=account.id,
            players=[
                PlayerInput(
                    full_name=name,
                    gender="M",
                    events=[event],
                    partners={str(event.id): partner_email},
                )
            ],
            fee_total_cents=4000,
            fee_basis={"basis": "schedule", "players": []},
        )
        return {
            "entry_id": str(result.entries[0].id),
            "invites": [(str(e.id), t) for e, t in result.invites],
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


# ---- nomination ----------------------------------------------------------


def test_naming_a_partner_parks_the_entry_on_awaiting_partner(client, world, mailbox):
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")

    assert "awaiting_partner" in out["reasons"]
    # `pending`, NOT `waitlisted`: unpartnered is a partner problem, over-cap
    # is a capacity problem, and the incumbent's mistake is conflating them.
    assert _entry(world["tid"], out["entry_id"]).state == "pending"
    assert len(out["invites"]) == 1


def test_a_singles_event_never_mints_an_invite(client, world, mailbox):
    """NEGATIVE CONTROL — the doubles gate.

    Demonstrated failing by dropping the `is_doubles` branch in the write: a
    singles entry acquires a partner invite and an `awaiting_partner` reason
    it can never clear, so it can never be confirmed.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com", event_key="ms")

    assert out["invites"] == []
    assert "awaiting_partner" not in out["reasons"]


def test_a_malformed_partner_address_leaves_an_unpartnered_entry(
    client, world, mailbox
):
    """Not a refusal. The entry stands, unpartnered, and the desk can help —
    refusing a whole submission over a typo in one optional box would be the
    software taking the strictest possible reading of an optional rule."""
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="not an address")

    assert out["invites"] == []
    assert _entry(world["tid"], out["entry_id"]).state == "pending"


def test_the_stored_invite_is_a_hash_not_the_token(client, world, mailbox):
    """Invariant I5: any token that survives is stored hashed.

    The operator invite (`invite_links`) uses its plaintext row id, which was
    tolerable for a link a director pastes into a chat. This one is mailed to
    a member of the public, so it follows `auth_sessions` instead.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    row = _entry(world["tid"], out["entry_id"])
    assert row.partner_invite_hash
    assert token not in row.partner_invite_hash
    assert len(row.partner_invite_hash) == 64
    assert row.partner_invite_expires_at is not None


# ---- the preview ---------------------------------------------------------


def test_anyone_holding_the_link_may_preview_it(client, world, mailbox):
    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    client.cookies.clear()  # no account at all — the normal case
    r = client.get(f"/e/api/partner-invites/{token}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["eventCode"] == "XD"
    assert body["tournamentName"] == "Pairs Open"
    assert body["invitedBy"] == "alex@example.com"


def test_the_preview_does_not_echo_the_invited_address(client, world, mailbox):
    """NEGATIVE CONTROL — the disclosure line on an unauthenticated route.

    Demonstrated failing by adding `invitedEmail` to the DTO: anyone holding
    a forwarded link can then confirm who it was sent to.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    client.cookies.clear()
    body = client.get(f"/e/api/partner-invites/{token}").text
    assert "sam@example.com" not in body


def test_an_unknown_token_is_the_same_404_as_an_expired_one(client, world, mailbox):
    from datetime import datetime, timedelta, timezone
    from db.models import Entry
    from db.session import SessionLocal

    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    unknown = client.get("/e/api/partner-invites/not-a-real-token")

    session = SessionLocal()
    try:
        row = session.get(Entry, (uuid.UUID(world["tid"]), uuid.UUID(out["entry_id"])))
        row.partner_invite_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        session.commit()
    finally:
        session.close()
    expired = client.get(f"/e/api/partner-invites/{token}")

    assert unknown.status_code == expired.status_code == 404
    assert unknown.json() == expired.json()


def test_an_invite_dies_with_the_entry_that_sent_it(client, world, mailbox):
    """The nominator withdrew. Accepting would attach a partner to something
    nobody is playing."""
    from db.models import Entry
    from db.session import SessionLocal

    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    session = SessionLocal()
    try:
        row = session.get(Entry, (uuid.UUID(world["tid"]), uuid.UUID(out["entry_id"])))
        row.state = "withdrawn"
        session.commit()
    finally:
        session.close()

    assert client.get(f"/e/api/partner-invites/{token}").status_code == 404


# ---- acceptance ----------------------------------------------------------


def _accept(client, token, **over):
    body = {"fullName": "Sam Ali", "gender": "F", **over}
    return client.post(f"/e/api/partner-invites/{token}/accept", json=body, headers=CSRF)


def test_accepting_requires_a_principal_not_just_the_link(client, world, mailbox):
    """NEGATIVE CONTROL — the whole invite-vs-capability distinction.

    Demonstrated failing by dropping `get_current_entrant` from the accept
    route: possession of a forwarded URL becomes the authority to enter
    somebody into a tournament under a name of the holder's choosing.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    client.cookies.clear()
    assert _accept(client, token).status_code == 401


def test_accepting_requires_a_verified_account(client, world, mailbox, turnstile):
    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    client.post(
        "/e/account/signup",
        json={"email": "sam@example.com", "password": PW, "turnstileToken": "x"},
        headers=CSRF,
    )
    client.cookies.clear()
    client.post(
        "/e/account/login", json={"email": "sam@example.com", "password": PW}, headers=CSRF
    )

    r = _accept(client, token)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "ENTRY_ACCOUNT_UNVERIFIED"


def test_acceptance_builds_the_partner_s_own_record_and_links_both_halves(
    client, world, mailbox
):
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    _verified_entrant(client, mailbox, "sam@example.com")
    r = _accept(client, token, club="Riverside")
    assert r.status_code == 200, r.text
    partner_entry_id = r.json()["entryId"]

    mine = _entry(world["tid"], out["entry_id"])
    theirs = _entry(world["tid"], partner_entry_id)

    # Linked both ways: either half can find the other.
    assert str(mine.partner_entry_id) == partner_entry_id
    assert str(theirs.partner_entry_id) == out["entry_id"]
    # The partner question is answered on the nominator's half.
    assert "awaiting_partner" not in mine.pending_reasons
    assert mine.partner_accepted_at is not None
    # And the partner's own record is theirs: their name, their account.
    assert theirs.player_name == "Sam Ali"
    assert theirs.state == "pending"


def test_acceptance_does_not_confirm_anything(client, world, mailbox):
    """A partner accepting is not an operator confirming.

    Ruling I4's line: the only thing acceptance settles is the partner
    question. Confirmation stays an operator's judgement, made against
    whatever else the entry is still carrying.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    _verified_entrant(client, mailbox, "sam@example.com")
    _accept(client, token)

    assert _entry(world["tid"], out["entry_id"]).state == "pending"


def test_an_invite_is_spent_by_the_first_acceptance(client, world, mailbox):
    """NEGATIVE CONTROL — single use, and it is guarded TWICE.

    `accept` spends the hash, and `resolve` refuses an entry that already
    carries `partner_accepted_at`. Loosening either one alone still refuses —
    demonstrated, both ways — so this test only goes red with both removed.
    That redundancy is deliberate and worth stating rather than trimming: the
    failure it prevents is a forwarded link staying live, a second stranger
    attaching themselves to the same entry, and one pair quietly acquiring
    three people.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    _verified_entrant(client, mailbox, "sam@example.com")
    assert _accept(client, token).status_code == 200

    _verified_entrant(client, mailbox, "third@example.com")
    assert _accept(client, token).status_code == 404


# ---- conflicts -----------------------------------------------------------


def test_naming_someone_already_spoken_for_flags_both_halves(client, world, mailbox):
    """Invariant I4: the software cannot know which pairing is the mistake.

    Guessing would silently break a pair that had already agreed, so both are
    flagged and an operator decides.
    """
    from sqlalchemy import select
    from db.models import Entry
    from db.session import SessionLocal

    _verified_entrant(client, mailbox, "alex@example.com")
    first = _nominate(client, world, partner_email="sam@example.com", name="Alex Kim")
    second = _nominate(client, world, partner_email="sam@example.com", name="Robin Ng")

    session = SessionLocal()
    try:
        rows = {
            str(row.id): row
            for row in session.scalars(select(Entry))
        }
    finally:
        session.close()

    assert "pair_conflict" in rows[second["entry_id"]].pending_reasons
    assert "pair_conflict" in rows[first["entry_id"]].pending_reasons


def test_a_conflict_refuses_nobody(client, world, mailbox):
    """Both entries survive and stay live. A flag is a question for an
    operator, not a rejection."""
    _verified_entrant(client, mailbox, "alex@example.com")
    first = _nominate(client, world, partner_email="sam@example.com", name="Alex Kim")
    second = _nominate(client, world, partner_email="sam@example.com", name="Robin Ng")

    assert _entry(world["tid"], first["entry_id"]).state == "pending"
    assert _entry(world["tid"], second["entry_id"]).state == "pending"


def test_two_different_partners_are_not_a_conflict(client, world, mailbox):
    _verified_entrant(client, mailbox, "alex@example.com")
    a = _nominate(client, world, partner_email="sam@example.com", name="Alex Kim")
    b = _nominate(client, world, partner_email="jo@example.com", name="Robin Ng")

    assert "pair_conflict" not in _entry(world["tid"], a["entry_id"]).pending_reasons
    assert "pair_conflict" not in _entry(world["tid"], b["entry_id"]).pending_reasons


# ---- the mail ------------------------------------------------------------


def test_the_invite_mail_names_the_inviter_and_the_event_and_nothing_more(
    client, world, mailbox
):
    """It goes to an address a stranger typed into a form. If it was
    mistyped, the worst it discloses is that somebody entered a tournament."""
    from entries.entries_json import _send_partner_invite

    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    entry_id, token = out["invites"][0]

    mailbox.clear()
    _send_partner_invite(
        entry=_entry(world["tid"], entry_id),
        token=token,
        tournament_name="Pairs Open",
        inviter="Alex Kim",
    )

    to, subject, body = mailbox[-1]
    assert to == "sam@example.com"
    assert "Alex Kim" in subject
    assert token in body
    assert "Pairs Open" in body
    # No fee, no other entrants, no workspace id.
    assert "40.00" not in body
    assert world["tid"] not in body
