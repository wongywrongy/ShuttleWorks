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
import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    from services import turnstile as service

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

    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(tid)).tournament_date = "2099-01-15"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="winter-cup",
                is_open=True,
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
    from database.models import EntrantAccount, Entry, EntryPlayer, Submission
    from database.session import SessionLocal
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
            account_id=account.id,
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
        return {"entry": str(entry.id), "player": str(player.id)}
    finally:
        session.close()


def _set_tournament_date(page, date_iso):
    from database.models import Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(page["tid"])).tournament_date = date_iso
        session.commit()
    finally:
        session.close()


# ---- identity ------------------------------------------------------------


def test_a_bare_request_is_401(client):
    assert client.get("/e/api/me/entries").status_code == 401


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
    assert body == {"tournaments": []}
    client.cookies.clear()

    _sign_in(client, "parent@example.com")
    body = client.get("/e/api/me/entries").json()
    (card,) = body["tournaments"]
    assert [line["playerName"] for line in card["events"]] == ["Junior Chen"]
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
    _seed_submission(page, "parent@example.com")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]

    assert set(card) == {
        "slug",
        "tournamentName",
        "orgName",
        "date",
        "venueName",
        "status",
        "feeTotalCents",
        "submittedAt",
        "events",
    }
    assert all(
        set(line)
        == {"eventCode", "discipline", "playerName", "state", "resultBadge"}
        for line in card["events"]
    )
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


def test_waitlisted_reads_as_awaiting_to_its_owner(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="waitlisted")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "awaiting"


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
    assert {line["playerName"]: line["state"] for line in card["events"]} == {
        "A Child": "entered",
        "B Child": "awaiting",
    }


def test_played_once_the_date_has_passed(client, page, turnstile):
    _sign_in(client, "parent@example.com")
    _seed_submission(page, "parent@example.com", state="confirmed")
    _set_tournament_date(page, "2020-01-15")
    (card,) = client.get("/e/api/me/entries").json()["tournaments"]
    assert card["status"] == "played"


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

    from database.models import EntryPage
    from database.session import SessionLocal

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
