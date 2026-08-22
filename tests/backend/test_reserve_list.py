"""E4 (program Phase 9) — the post-close reserve list on the public page.

The accepted half of spec §7's "acceptance and reserve lists in order" has
shipped since SP-P7: `_entrants` publishes the confirmed. What this file
covers is the queue behind it, and the three properties that make a queue
worth publishing at all:

1. **It has an ORDER, and the order is stable.** "You are on the waitlist"
   is unanswerable; "you are second reserve in MS" is something a person can
   plan around — but only if it means the same thing on the next reload.
2. **It appears only once entries have closed.** A moving queue published as
   a number is an invitation to plan around a value that changes underneath
   you.
3. **Publication and participation stay separate.** An opted-out reserve
   holds their place and is simply not printed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

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


def _world(client, *, closes_at):
    """One workspace, one capped event, entrants published."""
    from db.models import EntrantAccount, EntryEvent, EntryPage
    from db.session import SessionLocal

    client.post(
        "/auth/register", json={"email": "op@example.com", "password": PW}, headers=CSRF
    )
    tid = client.post(
        "/tournaments", json={"name": "Queue Open"}, headers=CSRF
    ).json()["id"]

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="queue-open",
                is_open=True,
                entrants_published=True,
            )
        )
        event = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            cap=1,
            closes_at=closes_at,
        )
        account = EntrantAccount(
            email="parent@example.com", password_hash="x", email_verified=True
        )
        session.add_all([event, account])
        session.commit()
        return {"tid": tid, "event_id": str(event.id), "account_id": account.id}
    finally:
        session.close()


def _seed(world, name, *, state, minutes_ago, opt_out=False):
    """One entry, at a controlled point in the queue.

    `submitted_at` is set explicitly because the ordering claim is the
    subject here: rows written in one tick would tie, and a test that
    happened to pass on insertion order would be asserting nothing.
    """
    from db.models import Entry, EntryPlayer, Submission
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        when = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        submission = Submission(
            tournament_id=uuid.UUID(world["tid"]),
            account_id=world["account_id"],
            submitted_at=when,
        )
        player = EntryPlayer(
            tournament_id=uuid.UUID(world["tid"]),
            account_id=world["account_id"],
            full_name=name,
            gender="M",
            club="Riverside",
        )
        session.add_all([submission, player])
        session.flush()
        entry = Entry(
            tournament_id=uuid.UUID(world["tid"]),
            entry_event_id=uuid.UUID(world["event_id"]),
            submission_id=submission.id,
            entry_player_id=player.id,
            state=state,
            list_opt_out=opt_out,
            submitted_at=when,
        )
        session.add(entry)
        session.commit()
        return str(entry.id)
    finally:
        session.close()


def _page(client):
    return client.get("/e/api/page/queue-open").json()


CLOSED = datetime.now(timezone.utc) - timedelta(days=1)
OPEN = datetime.now(timezone.utc) + timedelta(days=7)


def test_the_queue_publishes_in_arrival_order_after_the_close(client):
    world = _world(client, closes_at=CLOSED)
    _seed(world, "Ada Chen", state="confirmed", minutes_ago=60)
    _seed(world, "First Reserve", state="waitlisted", minutes_ago=40)
    _seed(world, "Second Reserve", state="waitlisted", minutes_ago=20)

    body = _page(client)

    assert [(r["position"], r["name"]) for r in body["reserves"]] == [
        (1, "First Reserve"),
        (2, "Second Reserve"),
    ]
    # And the accepted list is unchanged by any of it.
    assert [e["name"] for e in body["entrants"]] == ["Ada Chen"]


def test_nothing_is_published_while_entries_are_still_open(client):
    """NEGATIVE CONTROL — the close gate.

    Demonstrated failing by dropping `_entries_have_closed` from the
    condition: a queue that is still moving is published as a position, and
    an entrant plans around a number that changes under them.
    """
    world = _world(client, closes_at=OPEN)
    _seed(world, "Ada Chen", state="confirmed", minutes_ago=60)
    _seed(world, "First Reserve", state="waitlisted", minutes_ago=40)

    assert _page(client)["reserves"] == []


def test_an_undated_event_never_publishes_a_queue(client):
    """The director has not said when entries stop, so nothing has closed.
    Same reading `shared/entries_facts` takes for the control plane."""
    world = _world(client, closes_at=None)
    _seed(world, "First Reserve", state="waitlisted", minutes_ago=40)

    assert _page(client)["reserves"] == []


def test_an_unpublished_entrant_list_publishes_no_queue(client):
    """NEGATIVE CONTROL — the reserve list is part of the entrant list.

    Demonstrated failing by gating only on the close: a director who has
    deliberately not published their entrants finds the waitlist published
    anyway, which is the same disclosure through a second door.
    """
    from db.models import EntryPage
    from db.session import SessionLocal

    world = _world(client, closes_at=CLOSED)
    _seed(world, "First Reserve", state="waitlisted", minutes_ago=40)

    session = SessionLocal()
    try:
        page = session.get(EntryPage, uuid.UUID(world["tid"]))
        page.entrants_published = False
        session.commit()
    finally:
        session.close()

    assert _page(client)["reserves"] == []


def test_an_opted_out_reserve_holds_their_place_and_is_not_printed(client):
    """Publication governs publication; it never governs participation.

    The printed positions therefore SKIP the opted-out entrant's number.
    That is deliberate: a dense rank would tell the person behind them they
    are second when they are third, which is a subtler and worse lie than a
    gap.
    """
    world = _world(client, closes_at=CLOSED)
    _seed(world, "Quiet One", state="waitlisted", minutes_ago=40, opt_out=True)
    _seed(world, "Second Reserve", state="waitlisted", minutes_ago=20)

    reserves = _page(client)["reserves"]

    assert [(r["position"], r["name"]) for r in reserves] == [(2, "Second Reserve")]
    assert "Quiet One" not in _page(client).__str__()


def test_a_withdrawn_or_rejected_entry_is_not_a_reserve(client):
    world = _world(client, closes_at=CLOSED)
    _seed(world, "Gone", state="withdrawn", minutes_ago=40)
    _seed(world, "Refused", state="rejected", minutes_ago=30)
    _seed(world, "Actually Waiting", state="waitlisted", minutes_ago=20)

    assert [r["name"] for r in _page(client)["reserves"]] == ["Actually Waiting"]


def test_the_queue_carries_no_contact_data(client):
    """The same strict projection as the entrant list: name, club, event,
    position. An address on a public page is the disclosure invariant I6
    exists to prevent."""
    world = _world(client, closes_at=CLOSED)
    _seed(world, "First Reserve", state="waitlisted", minutes_ago=40)

    body = _page(client)
    assert set(body["reserves"][0]) == {"eventCode", "position", "name", "club"}
    assert "parent@example.com" not in str(body)
