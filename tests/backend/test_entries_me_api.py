"""``GET /e/api/me/entries`` — the entrant's own record (SP-P7 §3.1).

Owns three claims:

- **identity, not publication**: the answer is scoped to the session's
  account, invisible to a stranger (401), and deliberately NOT gated by the
  publication flags — an entrant always sees their own submissions;
- **the lifecycle**: awaiting → entered → played, derived exactly as §3.1
  rules it, with withdrawn/rejected passing through as their own states;
- **the allow-list**: card and line key-sets asserted exactly, so a field
  (an email, another entrant's anything) cannot arrive unnoticed.

Fixture idiom follows ``test_entries_page_api.py`` (each entries test file
declares its own client/page/entrant, lifted not reinvented).
"""
from __future__ import annotations


import json
import re
import uuid
from datetime import datetime, timezone

import pytest

from tests.backend._helpers import isolate_test_database

# V3-24-1: the shape the receipt route accepts, written out here rather than
# imported, so a change to the alphabet has to be made deliberately in both
# places instead of following the implementation silently.
SHORT_REFERENCE = re.compile(r"^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$")

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    from identity import turnstile as service

    def fake_post(url, fields, timeout):
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an entry page and one event; publication all OFF —
    the §4 claim under test is that this route does not care."""
    tid = client.post(
        "/tournaments", json={"name": "Winter Cup"}, headers=CSRF
    ).json()["id"]

    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(tid)).tournament_date = "2099-01-15"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="winter-cup",
                is_open=True,
                audience="public",
                fee_schedule={"1": 4000, "2": 5500},
                venue_name="North Hall",
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(ms)
        session.commit()
        return {"tid": tid, "slug": "winter-cup", "ms": str(ms.id)}
    finally:
        session.close()


def _sign_in(client, email):
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": email,
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": email, "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )


def _seed_submission(page, email, player_name="Robin Seeded", state="pending",
                     fee_total_cents=5500):
    """A submission + entry for the account holding ``email``, seeded at the
    R13 levels directly (the submit form's own behaviour has its own suite).
    """
    from db.models import EntrantAccount, Entry, EntryPlayer, Submission
    from db.session import SessionLocal
    from sqlalchemy import func, select

    session = SessionLocal()
    try:
        account = session.scalars(
            select(EntrantAccount).where(
                func.lower(EntrantAccount.email) == email.lower()
            )
        ).one()
        submission = Submission(
            tournament_id=uuid.UUID(page["tid"]),
            account_id=account.id,
            fee_total_cents=fee_total_cents,
        )
        player = EntryPlayer(
            tournament_id=uuid.UUID(page["tid"]),
            representatives=[EntryPlayer.__mapper__.relationships["representatives"].mapper.class_(account_id=account.id)],
            full_name=player_name,
            gender="X",
        )
        session.add_all([submission, player])
        session.flush()
        entry = Entry(
            tournament_id=uuid.UUID(page["tid"]),
            entry_event_id=uuid.UUID(page["ms"]),
            submission_id=submission.id,
            entry_player_id=player.id,
            state=state,
        )
        session.add(entry)
        session.commit()
        return {
            "submission": str(submission.id),
            # V3-24-1: the handle the receipt route and the receipt page
            # take. Read off the row rather than fabricated, so these tests
            # exercise the generator that actually ran.
            "reference": submission.short_reference,
            "entry": str(entry.id),
            "player": str(player.id),
        }
    finally:
        session.close()


def _age_submission(page, submission_id, moment):
    """Backdate one submission so "newest" is a fact, not a race."""
    from db.models import Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        # Composite primary key: submissions are keyed (tournament, id).
        submission = session.get(
            Submission, (uuid.UUID(page["tid"]), uuid.UUID(submission_id))
        )
        submission.submitted_at = moment
        session.commit()
    finally:
        session.close()


def _set_withdraws_until(page, moment):
    """Give the card's one event a self-serve withdrawal deadline (R14 §3)."""
    from db.models import EntryEvent
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        event = session.get(
            EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page["ms"]))
        )
        event.withdraws_until = moment
        session.commit()
    finally:
        session.close()


def _make_page(client, name, slug):
    """A second (third, ninth...) workspace with an entry page and one event.

    Lifted from the ``page`` fixture rather than parameterised into it: the
    N+1 guard is the only test that needs more than one, and it needs them
    created BEFORE any entrant signs in (workspace creation is an operator
    act).
    """
    from db.models import EntryEvent, EntryPage
    from db.session import SessionLocal

    tid = client.post("/tournaments", json={"name": name}, headers=CSRF).json()["id"]
    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug=slug,
                is_open=True,
                audience="public",
                fee_schedule={"1": 4000},
                venue_name="North Hall",
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(ms)
        session.commit()
        return {"tid": tid, "slug": slug, "ms": str(ms.id)}
    finally:
        session.close()


def _set_tournament_date(page, date_iso):
    from db.models import Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(page["tid"])).tournament_date = date_iso
        session.commit()
    finally:
        session.close()


# ---- identity ------------------------------------------------------------


def test_a_bare_request_is_401(client):
    assert client.get("/e/api/me/entries").status_code == 401


def test_a_bare_receipt_request_is_401(client):
    reference = "H4KJ29QW"
    assert client.get(f"/e/api/me/submissions/{reference}").status_code == 401


def test_receipt_is_complete_private_and_account_scoped(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    seeded = _seed_submission(
        page,
        "parent@example.com",
        player_name="Junior Chen",
        state="confirmed",
        fee_total_cents=5500,
    )

    response = client.get(f"/e/api/me/submissions/{seeded['reference']}")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    body = response.json()
    assert set(body) == {
        "submissionId",
        "shortReference",
        "slug",
        "tournamentName",
        "orgName",
        "venueName",
        "submittedAt",
        "status",
        "feeTotalCents",
        "feeCurrency",
        "paymentState",
        "paidCents", "outstandingCents",
        "paymentInstructions",
        "regulationsVersionAccepted",
        "events",
    }
    assert body["submissionId"] == seeded["submission"]
    # V3-24-1: the receipt's printed "Reference" and its own URL are the
    # same eight characters, and neither is the UUID.
    assert body["shortReference"] == seeded["reference"]
    assert SHORT_REFERENCE.match(body["shortReference"])
    assert body["slug"] == "winter-cup"
    assert body["tournamentName"] == "Winter Cup"
    assert body["venueName"] == "North Hall"
    assert body["status"] == "confirmed"
    assert body["feeTotalCents"] == 5500
    assert body["paymentState"] == "required"
    assert body["events"] == [
        {
            "eventCode": "MS",
            "discipline": "Men's Singles",
            "player": {
                "identity": {"id": seeded["player"], "name": "Junior Chen"},
                "resolution": "resolved",
                "label": None,
            },
            "partner": None,
            "state": "entered",
        }
    ]

    client.cookies.clear()
    _sign_in(client, "stranger@example.com")
    # V3-24-1's load-bearing claim: a reference is an identifier, never
    # access. This one is REAL, WELL-FORMED and belongs to another account -
    # exactly the case a short, guessable handle makes worth stating - and
    # it is answered identically to a string that could not name anything.
    foreign = client.get(f"/e/api/me/submissions/{seeded['reference']}")
    unknown = client.get("/e/api/me/submissions/H4KJ29QW")
    invalid = client.get("/e/api/me/submissions/not-a-reference")
    assert foreign.status_code == unknown.status_code == invalid.status_code == 404
    assert foreign.json() == unknown.json() == invalid.json()
    # And the UUID buys nothing either: the old handle is not a second door.
    stale = client.get(f"/e/api/me/submissions/{seeded['submission']}")
    assert stale.status_code == 404


def test_the_answer_is_private_and_uncacheable(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    r = client.get("/e/api/me/entries")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "private, no-store"


def test_each_account_sees_its_own_acts_and_nothing_else(client, page, turnstile):
    """SP-P7 §7's privacy trap: the unconfirmed submission absent from the
    public page is present for its owner — and only its owner."""
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", player_name="Junior Chen")
    client.cookies.clear()

    _sign_in(client, "stranger@example.com")
    body = client.get("/e/api/me/entries").json()
    # E2 added the account-level verification flag; a stranger with no
    # acts still learns nothing about anyone else from it.
    assert body == {"tournaments": [], "emailVerified": False}
    client.cookies.clear()

    _sign_in(client, "parent@example.com")
    body = client.get("/e/api/me/entries").json()
    (card,) = body["tournaments"]
    assert [line["player"]["identity"]["name"] for line in card["events"]] == ["Junior Chen"]
    # And the public page shows none of it (pending + unpublished).
    assert client.get(f"/e/api/page/{page['slug']}").json()["entrants"] == []


def test_publication_flags_do_not_gate_the_owners_view(client, page, turnstile):
    """§4's carve-out, as a negative control: everything OFF, the entrant
    still sees their card."""
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com")
    body = client.get("/e/api/me/entries").json()
    assert len(body["tournaments"]) == 1


# ---- the allow-list -------------------------------------------------------


def test_card_and_line_key_sets_are_exact(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    seeded = _seed_submission(page, "parent@example.com")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]

    assert set(card) == {
        "isPast",        "slug",
        "tournamentName",
        "orgName",
        "entrantsPublished",
        "resultsPublished",
        "date",
        "venueName",
        "status",
        "feeTotalCents",
        "feeCurrency",
        "submittedAt",
        "events",
        # SP-PUB-AUDIT-1 Phase 3: the act this card stands for, and the
        # moment its withdraw affordance stops working. Neither widens what
        # the projection discloses - both are this account's own facts.
        "submissionId",
        "shortReference",
        "withdrawsUntil",
    }
    assert card["submissionId"] == seeded["submission"]
    assert card["shortReference"] == seeded["reference"]
    # No deadline configured on the event, so none is invented.
    assert card["withdrawsUntil"] is None
    assert all(
        set(line)
        == {
            "eventCode",
            "discipline",
            "player",
            "state",
            # E2: the withdraw affordance's two fields. The id is this
            # account's own entry and the flag is the route's own predicate,
            # so neither widens what the projection discloses.
            "entryId",
            "canWithdraw",
            "pendingReasons",
            "resultBadge",
            # SP-P7 delta (§3.1): the ACCEPTED doubles partner's NAME — never
            # the nominated email, which stays on the entry unprojected. The
            # widening is the STOP-approved ruling this exact-set exists to
            # force; both directions in test_partner_names_on_the_own_card.
            "partner",
            # V3-PE37.1: whether THIS line's partner invite is durably known
            # to have failed to send — an honest account-scoped fact, never
            # widening what the projection discloses.
            "partnerInviteMailFailed",
            # V3-24-1: the reference of the act this line came from. Not a
            # widening - it is a name for this account's own submission,
            # already on the card - but a line and its card can disagree,
            # so it has to be per line.
            "shortReference",
        }
        for line in card["events"]
    )
    for line in card["events"]:
        assert set(line["player"]) == {"identity", "resolution", "label"}
        assert set(line["player"]["identity"]) == {"id", "name"}
        assert line["player"]["resolution"] == "resolved"
        assert line["partner"] is None
    assert card["slug"] == "winter-cup"
    assert card["tournamentName"] == "Winter Cup"
    assert card["venueName"] == "North Hall"


# ---- the lifecycle (§3.1) -------------------------------------------------


def test_awaiting_with_the_quoted_total(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="pending")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "awaiting"
    assert card["feeTotalCents"] == 5500
    assert card["events"][0]["state"] == "awaiting"


def test_waitlisted_keeps_its_capacity_state_for_its_owner(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="waitlisted")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "waitlisted"


def test_entered_once_every_live_entry_is_confirmed(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="confirmed")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "entered"


def test_a_mixed_submission_is_still_awaiting_with_per_line_states(
    client, page, turnstile
):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", player_name="A Child",
                     state="confirmed")
    _seed_submission(page, "parent@example.com", player_name="B Child",
                     state="pending")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "awaiting"
    assert {line["player"]["identity"]["name"]: line["state"] for line in card["events"]} == {
        "A Child": "entered",
        "B Child": "awaiting",
    }


def test_past_date_groups_without_inventing_participation(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="confirmed")
    _set_tournament_date(page, "2020-01-15")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "past"
    assert card["events"][0]["state"] == "entered"
    assert card["isPast"] is True


def test_withdrawn_and_rejected_pass_through(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", player_name="Out Person",
                     state="withdrawn")
    _seed_submission(page, "parent@example.com", player_name="No Person",
                     state="rejected")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    # No live entry remains, so the card is not "awaiting" anything.
    assert card["status"] == "withdrawn"
    assert {line["state"] for line in card["events"]} == {"withdrawn", "rejected"}


def test_result_badges_respect_results_published(client, page, turnstile):
    """§3.1's one gated field, both directions: the badge appears with the
    flag on and disappears — from the entrant's own card — when the TD
    unpublishes results."""
    _sign_in(client, "parent@example.com")
    seeded = _seed_submission(
        page, "parent@example.com", player_name="Ada Chen", state="confirmed"
    )

    # A 2-entrant SE final in the same workspace, the entered person on it.
    body = {
        "courts": 1,
        "total_slots": 16,
        "rest_between_rounds": 0,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"entry-{seeded['player']}", "name": "Ada Chen"},
                    {"id": "P2", "name": "Rival Person"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    assert (
        client.post(
            f"/tournaments/{page['tid']}/bracket", json=body, headers=CSRF
        ).status_code
        == 200
    )
    state = client.get(f"/tournaments/{page['tid']}/bracket", headers=CSRF).json()
    (final,) = [u for u in state["play_units"] if u["event_id"] == "MS"]
    winner = "A" if f"entry-{seeded['player']}" in (final["side_a"] or []) else "B"
    assert (
        client.post(
            f"/tournaments/{page['tid']}/bracket/commands",
            json={
                "id": str(uuid.uuid4()),
                "kind": "record_result",
                "play_unit_id": final["id"],
                "winner_side": winner,
                "seen_version": final["version"],
            },
            headers=CSRF,
        ).status_code
        == 200
    )

    def badge():
        (card,) = client.get("/e/api/me/entries").json()["tournaments"]
        (line,) = card["events"]
        return line["resultBadge"]

    assert badge() is None  # results unpublished

    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).results_published = True
        session.commit()
    finally:
        session.close()
    assert badge() == "Winner"

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).results_published = False
        session.commit()
    finally:
        session.close()
    assert badge() is None  # unpublishing takes it back


def test_two_submissions_fold_into_one_card_with_summed_quotes(
    client, page, turnstile
):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", player_name="A Child",
                     fee_total_cents=5500)
    _seed_submission(page, "parent@example.com", player_name="B Child",
                     fee_total_cents=4000)
    body = client.get("/e/api/me/entries").json()
    (card,) = body["tournaments"]
    assert card["feeTotalCents"] == 9500
    assert len(card["events"]) == 2


# ---- the withdrawal deadline on the card (SP-PUB-AUDIT-1 Phase 3) ---------


def test_withdraws_until_is_the_earliest_open_deadline(client, page, turnstile):
    """The card names the moment its own withdraw buttons stop working.

    The MINIMUM over the withdrawable lines, because the first deadline to
    pass is the first one that changes what the card can offer — and it must
    be the SAME instant the route enforces, not a second copy of the rule.
    """
    from entries.entries_public import _moment_iso

    deadline = datetime(2099, 3, 1, 17, 0, tzinfo=timezone.utc)
    _sign_in(client, "parent@example.com")
    seeded = _seed_submission(page, "parent@example.com", state="pending")
    _set_withdraws_until(page, deadline)

    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["submissionId"] == seeded["submission"]
    assert card["events"][0]["canWithdraw"] is True
    assert card["withdrawsUntil"] == _moment_iso(deadline)


def test_withdraws_until_is_none_when_no_line_can_be_withdrawn(
    client, page, turnstile
):
    """A deadline nobody can act on is not a deadline the card states."""
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="withdrawn")
    _set_withdraws_until(page, datetime(2099, 3, 1, 17, 0, tzinfo=timezone.utc))

    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["events"][0]["canWithdraw"] is False
    assert card["withdrawsUntil"] is None


def test_the_newest_submission_names_the_card(client, page, turnstile):
    """Two acts, one card, one id: the newest act is the one named."""
    _sign_in(client, "parent@example.com")
    older = _seed_submission(page, "parent@example.com", player_name="A Child")
    newer = _seed_submission(page, "parent@example.com", player_name="B Child")
    _age_submission(page, older["submission"], datetime(2020, 1, 1, tzinfo=timezone.utc))

    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert len(card["events"]) == 2
    assert card["submissionId"] == newer["submission"]
    assert card["shortReference"] == newer["reference"]
    # Each LINE names the act it came from, which is not the card's act for
    # the older of the two - the entrant holding two references needs to
    # know which line each one answers for.
    assert {line["shortReference"] for line in card["events"]} == {
        older["reference"],
        newer["reference"],
    }


# ---- the batching claim ---------------------------------------------------


def test_public_my_entries_no_n_plus_one(client, turnstile):
    """The read stays batched as the account's history grows (A6).

    One card and eight cards must cost the same number of statements. A
    per-tournament lookup — the page, the org, the events, the badges — is
    exactly the regression this counts, and it is invisible to every other
    test in this file because they all seed a single workspace.
    """
    from sqlalchemy import event as sqlalchemy_event

    from db.session import SessionLocal

    pages = [
        _make_page(client, f"Cup {index}", f"cup-{index}") for index in range(8)
    ]
    _sign_in(client, "parent@example.com")

    session = SessionLocal()
    bind = session.get_bind()
    statements: list[str] = []

    def record(_connection, _cursor, statement, *_args):
        statements.append(statement)

    def measured_call() -> int:
        statements.clear()
        sqlalchemy_event.listen(bind, "before_cursor_execute", record)
        try:
            body = client.get("/e/api/me/entries").json()
        finally:
            sqlalchemy_event.remove(bind, "before_cursor_execute", record)
        assert body["tournaments"]
        return len(statements)

    try:
        _seed_submission(pages[0], "parent@example.com", player_name="Child 0")
        baseline = measured_call()

        for index, extra in enumerate(pages[1:], start=1):
            _seed_submission(
                extra, "parent@example.com", player_name=f"Child {index}"
            )
        expanded = measured_call()

        assert len(client.get("/e/api/me/entries").json()["tournaments"]) == 8
        # Identity-map warmth may remove a lookup; scale must never add one.
        assert expanded <= baseline
        assert expanded <= 16  # fixed select-in batches for normalized relationships
    finally:
        session.close()
