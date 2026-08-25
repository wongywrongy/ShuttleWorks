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


def test_the_preview_asks_for_a_birth_year_only_when_an_OPEN_event_is_age_bracketed(
    client, world, mailbox
):
    """Carried from SP-DM-3 P3 (ledger): the preview computed over ALL
    events while the entry page computes over OPEN ones, so an invite could
    ask for a year the nominator's own form never collected - or, worse,
    not ask where the form did. The entry page is the authority: it is the
    surface that collects the field (R12 posture unchanged - the field
    appears only where the page already asks).

    This is also the FIRST test of the true branch; the shipped
    ``askBirthYear`` had coverage on the False side only."""
    from datetime import datetime, timedelta, timezone

    from db.models import EntryEvent
    from db.session import SessionLocal

    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    # `world` carries XD and MS — neither age-bracketed, which is why the
    # shipped test only ever saw the False side.
    client.cookies.clear()
    assert client.get(f"/e/api/partner-invites/{token}").json()["askBirthYear"] is False

    session = SessionLocal()
    try:
        junior = EntryEvent(
            tournament_id=uuid.UUID(world["tid"]),
            code="U15XD",
            discipline="U15 Mixed Doubles",
            entry_type="doubles",
        )
        session.add(junior)
        session.commit()
        junior_key = (junior.tournament_id, junior.id)
    finally:
        session.close()

    assert client.get(f"/e/api/partner-invites/{token}").json()["askBirthYear"] is True

    # Same event, entries closed. The page would no longer offer it, so the
    # invite must no longer ask for it.
    session = SessionLocal()
    try:
        session.get(EntryEvent, junior_key).closes_at = datetime.now(
            timezone.utc
        ) - timedelta(days=1)
        session.commit()
    finally:
        session.close()

    assert client.get(f"/e/api/partner-invites/{token}").json()["askBirthYear"] is False


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


def test_accepting_under_the_same_account_adopts_the_existing_person(
    client, world, mailbox
):
    """R-DM-1 gap (ii), ruled 2026-08-24 (DM1_RULINGS.md NC 3): enter alone,
    then accept a doubles invite under the same account with a matching
    birth year -> ONE person row, not two. Before this, ``accept()`` minted
    unconditionally and a partner-minted person could never be the certain
    match in either direction.

    The club/remarks half is the fix-round-1 guard: the accept form asks for
    neither remarks nor a mandatory club, so adopting with the entry form's
    blank-means-clear would null what Sam recorded on their own entry.
    ``blank_clears=False`` is what keeps them."""
    import uuid as _uuid

    from sqlalchemy import select

    from db.models import EntrantAccount, EntryEvent, EntryPage, EntryPlayer
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, create_submission

    # Sam enters the singles event on their own account, with a birth year.
    _verified_entrant(client, mailbox, "sam@example.com")
    session = SessionLocal()
    try:
        sam = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "sam@example.com")
        ).one()
        page = session.get(EntryPage, _uuid.UUID(world["tid"]))
        ms = session.get(EntryEvent, (_uuid.UUID(world["tid"]), _uuid.UUID(world["ms"])))
        own = create_submission(
            session,
            tournament_id=_uuid.UUID(world["tid"]),
            page=page,
            account_id=sam.id,
            players=[
                PlayerInput(
                    "Sam Ali",
                    "F",
                    club="Riverside",
                    birth_year=2000,
                    remarks="Left-handed",
                    events=[ms],
                )
            ],
            fee_total_cents=2000,
            fee_basis={"basis": "schedule", "players": []},
        )
        session.commit()
        own_person_id = str(own.players[0].id)
    finally:
        session.close()

    # Alex nominates sam@example.com for the doubles event.
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    # Sam accepts with the same name and the same birth year. Re-signing up
    # would mail nothing (the account exists), so `mailbox[-1]` would be
    # Alex's spent token — sign back in the way the own-card test does.
    client.cookies.clear()
    assert client.post(
        "/e/account/login",
        json={"email": "sam@example.com", "password": PW},
        headers=CSRF,
    ).status_code == 200
    r = _accept(client, token, birthYear="2000")
    assert r.status_code == 200, r.text

    theirs = _entry(world["tid"], r.json()["entryId"])
    assert str(theirs.entry_player_id) == own_person_id

    # The accept form asked for neither, so neither is cleared.
    session = SessionLocal()
    try:
        person = session.get(
            EntryPlayer, (_uuid.UUID(world["tid"]), _uuid.UUID(own_person_id))
        )
        assert person.club == "Riverside"
        assert person.remarks == "Left-handed"
    finally:
        session.close()


def test_an_unresolvable_namesake_flags_the_accepted_entry(client, world, mailbox):
    """Carried from SP-DM-3 P3 (debt-log; ruled P4's to close). The entry
    form flags a year-less collision with an existing namesake under the
    same account; acceptance through an invite reached the same
    ``adopt_or_mint`` and never asked. Same fork, one path silent."""
    import uuid as _uuid

    from sqlalchemy import select

    from db.models import EntrantAccount, EntryEvent, EntryPage
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, create_submission

    # Sam enters the singles event on their own account with NO birth year,
    # so nothing can later be distinguished from this row.
    _verified_entrant(client, mailbox, "sam@example.com")
    session = SessionLocal()
    try:
        sam = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "sam@example.com")
        ).one()
        page = session.get(EntryPage, _uuid.UUID(world["tid"]))
        ms = session.get(EntryEvent, (_uuid.UUID(world["tid"]), _uuid.UUID(world["ms"])))
        own = create_submission(
            session,
            tournament_id=_uuid.UUID(world["tid"]),
            page=page,
            account_id=sam.id,
            players=[PlayerInput("Sam Ali", "F", events=[ms])],
            fee_total_cents=2000,
            fee_basis={"basis": "schedule", "players": []},
        )
        session.commit()
        own_person_id = str(own.players[0].id)
    finally:
        session.close()

    _verified_entrant(client, mailbox, "alex@example.com")
    _, token = _nominate(client, world, partner_email="sam@example.com")["invites"][0]

    client.cookies.clear()
    assert client.post(
        "/e/account/login",
        json={"email": "sam@example.com", "password": PW},
        headers=CSRF,
    ).status_code == 200
    r = _accept(client, token)
    assert r.status_code == 200, r.text

    theirs = _entry(world["tid"], r.json()["entryId"])
    # A fork, not a merge (I4): the second row stands and is flagged.
    assert str(theirs.entry_player_id) != own_person_id
    assert "needs_review_person" in theirs.pending_reasons


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


# ---- the names reach the projections (SP-P7 delta, §3.1/§3.3) -------------
#
# E3 shipped the pairing and SP-P7 shipped the surfaces, and neither ever
# told the other: entries_site and entries_me carried no partner reference
# at all, so "CXD with Prashant Vurikiti" (§3.3) and the §3.1 partner lines
# rendered without the "with". These live HERE because this file owns the
# nominate→accept fixtures; the exact-key-set guards that forced the widening
# to be a ruling live with their surfaces (test_entries_me_api,
# test_entries_site_api).


def _publish_and_confirm(world):
    """Flip the public gates on and confirm every entry — the desk's act."""
    from sqlalchemy import select
    from db.models import Entry, EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        page = session.get(EntryPage, uuid.UUID(world["tid"]))
        page.entrants_published = True
        for entry in session.scalars(
            select(Entry).where(Entry.tournament_id == uuid.UUID(world["tid"]))
        ):
            entry.state = "confirmed"
        session.commit()
    finally:
        session.close()


def test_partner_names_on_the_own_card(client, world, mailbox):
    """§3.1: the own card names an ACCEPTED partner — and nothing sooner.

    Acceptance is the own-view's whole gate: a nomination is a claim about
    somebody else, so before it the line carries None; after it, both halves
    see each other by name (playing doubles together is mutual visibility).
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    # Nominated, not accepted: no name yet.
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert [line["partnerName"] for line in card["events"]] == [None]

    _verified_entrant(client, mailbox, "sam@example.com")
    _accept(client, token)

    # Sam's own card names Alex…
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert [line["partnerName"] for line in card["events"]] == ["Alex Kim"]
    # …and never the address the invite travelled through.
    assert "sam@example.com" not in str(card)

    # Alex's names Sam.
    client.cookies.clear()
    client.post(
        "/e/account/login",
        json={"email": "alex@example.com", "password": PW},
        headers=CSRF,
    )
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert [line["partnerName"] for line in card["events"]] == ["Sam Ali"]


def test_partner_names_on_the_player_page(client, world, mailbox):
    """§3.3: the public page says "with <partner>" — behind the public gates.

    The public view is stricter than the own card: the partner's entry must
    itself be CONFIRMED (pending people never appear publicly, on a partner
    line no less than on the list). Both directions asserted: the name is
    absent while the partner is pending, present once the desk confirms.
    """
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]
    _verified_entrant(client, mailbox, "sam@example.com")
    _accept(client, token)

    # Publish + confirm ALEX only: Sam stays pending.
    from db.models import Entry, EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        page = session.get(EntryPage, uuid.UUID(world["tid"]))
        page.entrants_published = True
        mine = session.get(
            Entry, (uuid.UUID(world["tid"]), uuid.UUID(out["entry_id"]))
        )
        mine.state = "confirmed"
        alex_key = str(mine.entry_player_id)
        session.commit()
    finally:
        session.close()

    client.cookies.clear()
    body = client.get(f"/e/api/page/pairs-open/players/{alex_key}").json()
    (xd,) = [ev for ev in body["events"] if ev["code"] == "XD"]
    assert xd["partnerName"] is None  # accepted, but not confirmed → not public

    _publish_and_confirm(world)
    body = client.get(f"/e/api/page/pairs-open/players/{alex_key}").json()
    (xd,) = [ev for ev in body["events"] if ev["code"] == "XD"]
    assert xd["partnerName"] == "Sam Ali"
