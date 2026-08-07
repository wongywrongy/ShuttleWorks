"""The entrant tier's JSON surface (Phase 6, spec §4).

The RR7 app renders; **this** is what it renders. Every route here is the
JSON counterpart of something ``api/entries_public.py`` used to emit as
f-string HTML, and the fixtures are lifted from
``tests/test_entries_public_routes.py`` on purpose: the incumbent's
behaviour is the contract, so the two files must be exercising the same
workspace, the same fee schedule and the same events. A second fixture set
would let the surfaces drift and call it a passing suite.

**Invariant I6 has its own test and its own break-it recipe**, because a
projection leak is silent: the page still renders, it just carries a field
nobody meant to publish. See
``test_the_projection_never_carries_an_entrants_contact_data``.
"""
from __future__ import annotations

import json
import re
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
    """Cloudflare's dummy-key semantics, without Cloudflare — the entrant
    fixture below signs up for real, and signup is where the challenge is."""
    from services import turnstile as service

    def fake_post(url, fields, timeout):
        if fields.get("secret", "").startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events.

    Seeded directly, carrying the R14 configuration the projection reports:
    a cumulative fee schedule, payment prose, a venue and a regulations
    version.
    """
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                intro_text="All welcome.",
                regulations_text="Play fair. Bring your own shuttles.",
                waiver_required=True,
                regulations_version=3,
                fee_schedule={"1": 4000, "2": 5500},
                payment_instructions="Zelle to treasurer@club.example.",
                venue_name="Riverside Sports Hall",
                venue_address="12 Mill Lane",
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            fee_cents=1500,
            gender_constraint="M",
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            gender_constraint="F",
        )
        session.add_all([ms, ws])
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ms": str(ms.id), "ws": str(ws.id)}
    finally:
        session.close()


@pytest.fixture
def entrant(client, turnstile):
    """A signed-in entrant, created through the real routes.

    No fixture shortcut: a shortcut would mean the session gate these tests
    exist to assert was never crossed for real.
    """
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "parent@example.com",
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
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    return "parent@example.com"


def _html_submit(client, page):
    """Write one entry through the INCUMBENT route.

    Used only to put a row on the entrant list so the projection has
    something to project. Deliberately the old route: at this task the new
    one does not exist yet, and using the shipped path keeps the fixture
    honest about what the list is built from.
    """
    body = client.get(f"/e/{page['slug']}").text
    token = re.search(r'name="_csrf" value="([0-9a-f]*)"', body).group(1)
    return client.post(
        f"/e/{page['slug']}/submit",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": token,
        },
    )


# ---- GET /e/api/page/{slug} ---------------------------------------------


def test_the_page_projection_carries_the_public_blocks(client, page):
    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tournament"] == {"name": "Spring Open", "date": "2026-09-12"}
    assert body["page"]["slug"] == "spring-open"
    assert body["page"]["introText"] == "All welcome."
    assert body["page"]["regulationsVersion"] == 3
    # Read through normalize_fee_schedule, never off the raw column: the
    # card the entrant reads must quote the tiers the pricing actually uses.
    assert body["page"]["feeSchedule"] == {"1": 4000, "2": 5500}
    assert body["page"]["paymentInstructions"] == "Zelle to treasurer@club.example."
    assert body["venue"] == {"name": "Riverside Sports Hall", "address": "12 Mill Lane"}
    assert body["policy"]["waiverRequired"] is True
    assert body["policy"]["maxEventsPerPerson"] is None
    by_code = {ev["code"]: ev for ev in body["events"]}
    assert set(by_code) == {"MS", "WS"}
    assert by_code["MS"]["feeCents"] == 1500
    assert by_code["MS"]["genderConstraint"] == "M"
    assert by_code["MS"]["isOpen"] is True
    assert by_code["MS"]["ageBracketed"] is False
    assert by_code["MS"]["entryCount"] == 0
    assert body["entrants"] == []
    assert body["viewer"] == {"signedIn": False, "email": None, "formCsrf": ""}


def test_an_unknown_slug_answers_the_uniform_404(client, page):
    """The same answer as a CLOSED page, so nobody can enumerate workspaces
    that exist but are not taking entries."""
    r = client.get(f"/e/api/page/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_a_signed_in_viewer_gets_their_email_and_a_form_token(
    client, page, entrant
):
    """The non-vacuity control for the leak test below: the viewer block is
    genuinely populated for the person it is about."""
    body = client.get(f"/e/api/page/{page['slug']}").json()
    assert body["viewer"]["signedIn"] is True
    assert body["viewer"]["email"] == "parent@example.com"
    assert re.fullmatch(r"[0-9a-f]{64}", body["viewer"]["formCsrf"])


def test_the_projection_never_carries_an_entrants_contact_data(
    client, page, entrant
):
    """Invariant I6 — the strict two-column projection, at the JSON seam.

    NEGATIVE CONTROL. To prove this is not vacuous: add ``"email":
    entrant_account.email`` to ``EntrantRowDTO`` and populate it in
    ``entry_page_projection`` (or widen ``_entrants``' SELECT past its two
    columns). Both assertions below go red. Put it back.
    """
    assert _html_submit(client, page).status_code == 201
    # A STRANGER reads the page — the viewer block legitimately carries the
    # signed-in reader's own address, so it must not be in the frame.
    client.cookies.clear()

    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["name"] for row in body["entrants"]] == ["Alice Chen"]
    assert all(set(row) == {"name", "eventId"} for row in body["entrants"])
    assert "parent@example.com" not in r.text
    assert body["viewer"] == {"signedIn": False, "email": None, "formCsrf": ""}
    # The count over the list and the names under it are one query apart and
    # must not disagree.
    by_id = {ev["id"]: ev for ev in body["events"]}
    assert by_id[page["ws"]]["entryCount"] == 1


# ---- GET /e/api/config ---------------------------------------------------


def test_the_config_route_publishes_the_site_key_and_the_auth_mode(client):
    """``turnstile_site_key`` is exposed to no client today and the signup
    widget needs it. A second env var on node would be a second source of
    truth for a value the backend already validates."""
    r = client.get("/e/api/config")
    assert r.status_code == 200, r.text
    assert r.json() == {
        # Cloudflare's documented always-pass dummy sitekey (app/config.py:248).
        "turnstileSiteKey": "1x00000000000000000000AA",
        "authMode": "local",
    }


def test_the_config_route_never_publishes_the_turnstile_secret(client, monkeypatch):
    """NEGATIVE CONTROL. The site key and the secret key are adjacent
    settings with near-identical names and near-identical dummy values —
    exactly the pair a copy-paste swaps. Verifying a *server* secret is what
    the secret is for; publishing it hands anyone a free pass over signup.

    To prove this is not vacuous: change the route to return
    ``settings.turnstile_secret_key`` and this goes red. Put it back.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "turnstile_secret_key", "2xSECRET-do-not-publish")
    r = client.get("/e/api/config")
    assert r.status_code == 200, r.text
    assert "do-not-publish" not in r.text
    assert r.json()["turnstileSiteKey"] == settings.turnstile_site_key


def test_the_config_route_reports_the_deployed_auth_mode(client, monkeypatch):
    """Non-vacuity for the field above: it reads the setting, it is not a
    literal. Cloud mode is the deployed posture the entrant app renders for."""
    from app.config import settings

    monkeypatch.setattr(settings, "auth_mode", "cloud")
    assert client.get("/e/api/config").json()["authMode"] == "cloud"
