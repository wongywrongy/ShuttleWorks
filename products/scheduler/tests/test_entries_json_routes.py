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


# ---- GET /e/api/pages -----------------------------------------------------
#
# Task 26's sitemap crawls every public entry page; this is the list it
# crawls. THE WHOLE POINT is ``is_open``: publishing a closed page's slug
# into a crawlable sitemap would disclose that the workspace and its
# address exist before the director has opened entries — worse than the
# uniform 404 a direct request to that slug gets.


@pytest.fixture
def closed_page(client):
    """A second workspace, entries NOT open — the negative control's fixture."""
    tid = client.post(
        "/tournaments", json={"name": "Not Yet Open"}, headers=CSRF
    ).json()["id"]
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(tournament_id=uuid.UUID(tid), slug="not-yet-open", is_open=False)
        )
        session.commit()
    finally:
        session.close()
    return {"tid": tid, "slug": "not-yet-open"}


@pytest.fixture
def second_open_page(client):
    """A second OPEN page whose slug sorts before the ``page`` fixture's
    (``spring-open``) — proves the list actually orders rather than just
    returning insertion order."""
    tid = client.post(
        "/tournaments", json={"name": "Early Alphabet"}, headers=CSRF
    ).json()["id"]
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(tournament_id=uuid.UUID(tid), slug="aaa-open", is_open=True)
        )
        session.commit()
    finally:
        session.close()
    return {"tid": tid, "slug": "aaa-open"}


def test_the_page_list_carries_only_open_pages(client, page, closed_page):
    r = client.get("/e/api/pages")
    assert r.status_code == 200, r.text
    assert [row["slug"] for row in r.json()] == ["spring-open"]


def test_a_closed_pages_slug_never_appears_in_the_list(client, page, closed_page):
    """NEGATIVE CONTROL. To prove this is not vacuous: drop the ``is_open``
    filter from the route's query and this goes red. Put it back."""
    r = client.get("/e/api/pages")
    assert closed_page["slug"] not in [row["slug"] for row in r.json()]


def test_the_list_is_ordered_by_slug(client, page, second_open_page):
    """Ordering has to be stable across SQLite and Postgres. ``slug`` carries
    its own unique index (``uq_entry_pages_slug``), so ordering by it alone
    needs no second tiebreaker — unlike a random-UUID primary key, two rows
    can never share a slug. The ``page`` fixture (``spring-open``) is seeded
    BEFORE ``second_open_page`` (``aaa-open``); insertion order would show
    them in the opposite order to what this asserts."""
    r = client.get("/e/api/pages")
    assert [row["slug"] for row in r.json()] == ["aaa-open", "spring-open"]


def test_the_route_is_registered(client):
    """Route existence via the schema, not ``app.routes`` — newer FastAPI
    keeps ``include_router`` as a nested ``_IncludedRouter``."""
    from app.main import app

    assert "get" in app.openapi()["paths"]["/e/api/pages"]


# ---- POST /e/api/quote/{slug} -------------------------------------------
#
# R8-C: session-gated, matching the incumbent's "Update events and total"
# (api/entries_public.py:1119, the "action=filter" branch). A public fee
# oracle on an unauthenticated route was rejected — the quote reads a
# director's price list against a caller-chosen basket, and that is the
# shape of a scraper.


def _form_token(client, page):
    """The viewer's form token, read off the JSON projection.

    Deliberately read rather than recomputed: a test that recomputed the
    digest would pass even if the surface stopped emitting it, and the
    field is the only thing an unhydrated form can prove itself with.
    """
    return client.get(f"/e/api/page/{page['slug']}").json()["viewer"]["formCsrf"]


def _quote(client, page, events, **overrides):
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "events": events,
        "_csrf": _form_token(client, page),
    }
    data.update(overrides)
    return client.post(f"/e/api/quote/{page['slug']}", data=data, headers=CSRF)


def test_a_quote_prices_the_basket_through_the_fee_schedule(client, page, entrant):
    r = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"])
    assert r.status_code == 200, r.text
    body = r.json()
    # Two events for one person, priced off the CUMULATIVE schedule's "2"
    # tier — not 4000+4000, and not the per-event fallback's 1500.
    assert body["totalCents"] == 5500
    assert body["feeBasis"]["basis"] == "schedule"
    assert body["feeBasis"]["players"][0]["eventCount"] == 2
    assert body["refusal"] is None


def test_the_quoted_total_is_the_total_recorded(client, page, entrant):
    """Seam B, across the two routes that must never disagree.

    The quote and the write call the SAME ``compute_fee_total`` over the
    same per-person grouping. This asserts the end of that promise: the
    number the entrant agreed to is the number on the submission row.
    """
    quoted = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()
    assert quoted["totalCents"] == 5500

    body = client.get(f"/e/{page['slug']}").text
    token = re.search(r'name="_csrf" value="([0-9a-f]*)"', body).group(1)
    r = client.post(
        f"/e/{page['slug']}/submit",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": token,
        },
    )
    assert r.status_code == 201, r.text

    from database.models import Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        rows = session.scalars(select(Submission)).all()
        assert len(rows) == 1
        assert rows[0].fee_total_cents == quoted["totalCents"]
    finally:
        session.close()


def test_a_quote_reports_a_policy_refusal_with_the_rule_stated(
    client, page, entrant
):
    """``check_policy`` is the write's function, not a preview of it. A
    refusal that arrived only at submit would make the quote a lie."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    body = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()
    assert body["refusal"]["code"] == "MAX_EVENTS_PER_PERSON"
    assert "at most 1 event" in body["refusal"]["message"]


def test_an_anonymous_quote_is_refused(client, page):
    """R8-C, the negative control.

    ``get_current_entrant`` has no bootstrap fallback in either mode, so
    the refusal is structural. To prove this is not vacuous: swap the
    dependency for ``_optional_entrant`` and this goes red while
    ``test_a_quote_prices_the_basket_through_the_fee_schedule`` — the same
    request one cookie different — stays green. Put it back.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "A", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=CSRF,
    )
    assert r.status_code == 401


def test_a_quote_without_the_form_token_is_refused(client, page, entrant):
    """Channel two at the route. NEGATIVE CONTROL: delete the
    ``require_form_csrf`` call and this goes red while the priced-basket
    test stays green."""
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "A", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=CSRF,
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_quote_carrying_another_sessions_form_token_is_refused(
    client, page, entrant
):
    """The double-submit's whole claim: an attacker's page can make the
    browser send our cookie, but it can never read it, so it cannot compute
    this value. A token minted from a DIFFERENT session is the closest a
    real attacker gets."""
    stolen = _form_token(client, page)
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    r = _quote(client, page, [f"0:{page['ms']}"], _csrf=stolen)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


# ---- POST /e/api/submit/{slug} ------------------------------------------
#
# The guard order is the contract, and it is the incumbent's verbatim
# (api/entries_public.py's ``submit_entry``): session, slug, form CSRF,
# per-IP throttle, acknowledgment, parse, events-open, policy, fee, write.
# What changes is only the answer shape — 303 to an RR7 receipt route, so a
# reload never re-posts.


def _submit(client, page, **overrides):
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "club": "",
        "birthYear": "",
        "remarks": "cannot play before 6pm Saturday",
        "events": [f"0:{page['ws']}"],
        "acknowledged": "on",
        "_csrf": _form_token(client, page),
    }
    headers = dict(CSRF)
    headers.update(overrides.pop("headers", {}))
    data.update({k: v for k, v in overrides.items() if v is not None})
    for key, value in overrides.items():
        if value is None:
            data.pop(key, None)
    return client.post(
        f"/e/api/submit/{page['slug']}",
        data=data,
        headers=headers,
        follow_redirects=False,
    )


def _submissions():
    from database.models import Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        return list(session.scalars(select(Submission)).all())
    finally:
        session.close()


def test_a_submission_answers_303_to_the_receipt_route(client, page, entrant):
    r = _submit(client, page)
    assert r.status_code == 303, r.text
    rows = _submissions()
    assert len(rows) == 1
    assert r.headers["location"] == (
        f"/e/{page['slug']}/receipt/{rows[0].id}?totalCents=4000"
    )
    # The fee is computed server-side in one place and stored as computed.
    assert rows[0].fee_total_cents == 4000
    # Q11: the version agreed to, recorded at that instant.
    assert rows[0].regulations_version_accepted == 3


def test_the_receipt_redirect_states_the_recorded_total_and_only_that(
    client, page, entrant
):
    """Phase 6 Task 18. The receipt route is server-rendered by node, which
    holds no entrant credential (spec §3) and therefore cannot read the
    submission back — so the one thing the receipt has to say beyond the
    reference has to travel in the ``Location`` the server itself wrote.

    ``totalCents`` is the number ``compute_fee_total`` stored, carried the
    same way ``_echo_redirect`` already carries it (:485-507): DISPLAY, never
    posted onward, never recomputed from. It is asserted against the row
    rather than a literal, so this is the Seam B property (quoted == recorded
    == displayed) and not a restatement of the fixture's arithmetic.

    **And ``replayed`` is deliberately absent.** A replay's Location must be
    byte-identical to the original's, per the ruling on
    ``SubmissionResult.replayed``. NEGATIVE CONTROL: append
    ``&replayed={int(result.replayed)}`` in the route and the second half of
    this test goes red — as do
    ``test_the_idempotency_key_travels_in_the_HIDDEN_FIELD_and_is_honoured``
    and its header twin, which is how the ruling was found.
    """
    key = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
    first = _submit(client, page, idempotencyKey=key)
    assert first.status_code == 303, first.text
    rows = _submissions()
    assert len(rows) == 1
    assert first.headers["location"] == (
        f"/e/{page['slug']}/receipt/{rows[0].id}"
        f"?totalCents={rows[0].fee_total_cents}"
    )

    second = _submit(client, page, idempotencyKey=key)
    assert second.status_code == 303, second.text
    assert len(_submissions()) == 1
    assert second.headers["location"] == first.headers["location"], (
        "a replay's receipt Location must not differ from the original's"
    )


def test_the_quoted_total_is_the_total_the_json_write_records(client, page, entrant):
    """R14 / Seam B across the two JSON routes that must never disagree.

    Nothing is hardcoded on purpose: the assertion is that the number the
    entrant was quoted is the number on their row, whatever the director's
    schedule happens to say. NEGATIVE CONTROL: give the write its own
    arithmetic (e.g. ``total = sum(ev.fee_cents or 0 ...)``) and this goes
    red while the 303 test above stays green.
    """
    quoted = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()
    assert quoted["refusal"] is None
    r = _submit(client, page, events=[f"0:{page['ms']}", f"0:{page['ws']}"])
    assert r.status_code == 303, r.text
    rows = _submissions()
    assert len(rows) == 1
    assert rows[0].fee_total_cents == quoted["totalCents"]


def test_an_anonymous_submission_is_refused(client, page):
    """NEGATIVE CONTROL for the session gate. ``get_current_entrant`` has no
    bootstrap fallback in either mode. To prove it is not vacuous: swap it
    for ``_optional_entrant`` and this goes red while the 303 test — the
    same request, one cookie different — stays green. Put it back."""
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
        },
        headers=CSRF,
        follow_redirects=False,
    )
    assert r.status_code == 401
    assert _submissions() == []


def test_a_submission_with_no_csrf_proof_at_all_is_refused(client, page, entrant):
    """Guard 3 with neither channel present: no form field, and no
    ``X-ShuttleWorks-CSRF`` header for the middleware either."""
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
        },
        follow_redirects=False,
    )
    assert r.status_code == 403
    assert _submissions() == []


def test_a_submission_with_a_foreign_form_token_is_refused_and_writes_nothing(
    client, page, entrant
):
    """NEGATIVE CONTROL for guard 3. A token minted from a DIFFERENT session
    is the closest a real attacker gets — they can make the browser send our
    cookie, they can never read it. Delete the ``require_form_csrf`` call
    and this goes red."""
    stolen = _form_token(client, page)
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    r = _submit(client, page, _csrf=stolen)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions() == []


def test_a_cheap_refusal_short_circuits_before_the_write(
    client, page, entrant, monkeypatch
):
    """GUARD ORDER. The contract is that a refusal reached early never runs
    the expensive tail — here the submission service, the one step that
    touches rows. Sabotage it so reaching it at all is loud, then drive a
    bad-token request: it must still answer 403, from a guard that ran
    first.

    Non-vacuity is the 303 test above, which reaches this same call in the
    green path — move ``require_form_csrf`` below ``create_submission`` and
    this goes red (500, not 403).
    """
    from api import entries_json

    def explode(*args, **kwargs):  # pragma: no cover - must never be reached
        raise AssertionError("the write ran before the CSRF guard refused")

    monkeypatch.setattr(entries_json.submission_service, "create_submission", explode)
    r = _submit(client, page, _csrf="0" * 64)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions() == []


def test_an_unacknowledged_submission_is_refused_and_writes_nothing(
    client, page, entrant
):
    """Guard 5. An acknowledgment given after the fact is not one (Q11) —
    one of the few places this software genuinely refuses."""
    r = _submit(client, page, acknowledged=None)
    assert r.status_code == 400
    assert "regulations" in r.json()["detail"]["message"]
    assert _submissions() == []


def test_a_policy_breach_is_refused_with_the_rule_stated(client, page, entrant):
    """Guard 6, R14 §4: never a silent drop of the selections that did not
    fit, and the refusal carries the number that produced it."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    r = _submit(client, page, events=[f"0:{page['ms']}", f"0:{page['ws']}"])
    assert r.status_code == 400
    assert "at most 1 event" in r.json()["detail"]["message"]
    assert _submissions() == []


def test_the_idempotency_key_travels_in_the_HIDDEN_FIELD_and_is_honoured(
    client, page, entrant
):
    """This makes ``UNIQUE (tournament_id, idempotency_key)`` reachable for
    the first time.

    A native form cannot send a header, so until Phase 6 the key was always
    NULL for a real entrant and the index guarded nothing they could reach.
    The key is minted in the loader that RENDERS the form (not at submit —
    a double-click would mint two) and carried as a hidden field, so it
    works unhydrated. Both posts must answer the SAME receipt: a retrying
    client that saw a different answer would conclude its first attempt had
    failed.
    """
    key = "1f2e3d4c-5b6a-4798-8899-aabbccddeeff"
    first = _submit(client, page, idempotencyKey=key)
    assert first.status_code == 303, first.text
    second = _submit(client, page, idempotencyKey=key)
    assert second.status_code == 303, second.text
    assert second.headers["location"] == first.headers["location"]
    rows = _submissions()
    assert len(rows) == 1
    assert rows[0].idempotency_key == key


def test_the_idempotency_key_is_also_honoured_in_the_header(client, page, entrant):
    """The hydrated-fetch channel. Same key, same receipt, one row."""
    key = "2f2e3d4c-5b6a-4798-8899-aabbccddeeff"
    first = _submit(client, page, headers={"Idempotency-Key": key})
    second = _submit(client, page, headers={"Idempotency-Key": key})
    assert first.status_code == 303, first.text
    assert second.headers["location"] == first.headers["location"]
    assert len(_submissions()) == 1


def test_a_guessed_key_does_not_redirect_to_another_entrants_receipt(
    client, page, entrant, turnstile
):
    """This route is where the defect became reachable (Phase 6 §4).

    The key is minted in the loader and carried as a hidden field, so real
    receipts are keyed for the first time — and the 303 ``Location`` names
    a submission id. A guesser must be redirected to a receipt of their
    own, not handed the first entrant's id in a header.
    """
    key = "3f2e3d4c-5b6a-4798-8899-aabbccddeeff"
    mine = _submit(client, page, idempotencyKey=key)
    assert mine.status_code == 303, mine.text

    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "stranger@example.com",
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
            json={"email": "stranger@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )

    guessed = _submit(client, page, idempotencyKey=key)

    assert guessed.status_code == 303, guessed.text
    assert guessed.headers["location"] != mine.headers["location"], (
        "the guesser was redirected at the other entrant's receipt"
    )
    assert len(_submissions()) == 2


def test_two_submissions_without_a_key_are_two_acts(client, page, entrant):
    """Non-vacuity for the replay above: the route is not collapsing
    everything onto one row. A NULL key is not a key."""
    assert _submit(client, page).status_code == 303
    assert _submit(client, page).status_code == 303
    assert len(_submissions()) == 2


# ---- POST /e/api/quote/{slug}, as a BROWSER navigation --------------------
#
# The no-JS half of R14 (spec §7). A native <form method=post> cannot read
# JSON — pressing "Update events and total" is a navigation — so a browser
# Accept gets a 303 back to the entry page carrying its own body plus the
# server's total. This is what makes the unhydrated round trip a shipped
# path rather than a degraded one, and it is the only shape that gets a
# total onto that page without node relaying the entrant's credential.

# **No X-ShuttleWorks-CSRF here, deliberately.** A native <form method=post>
# cannot set a header — that is the whole reason channel two (the `_csrf` body
# field) exists — so a _BROWSER that sent one would be exercising the header
# path under a name that claims otherwise, and the no-JS wiring would rest on
# nothing asserted. These posts carry the shape a scriptless browser actually
# sends: an Accept header the browser sets itself, and the token in the body.
# The header path is covered by `_quote`.
_BROWSER = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}


def _echo(response):
    """The redirect target's query, parsed."""
    from urllib.parse import parse_qs, urlparse

    return parse_qs(urlparse(response.headers["location"]).query)


def test_a_browser_quote_redirects_back_to_the_entry_page_with_the_total(
    client, page, entrant
):
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "club": "Kingsway",
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "_csrf": _form_token(client, page),
        },
        headers=_BROWSER,
        follow_redirects=False,
    )

    # 303, not 302: the browser must re-issue as GET so a reload never
    # re-posts. Same choice submit_entry_json makes.
    assert r.status_code == 303, r.text
    location = r.headers["location"]
    assert location.startswith(f"/e/{page['slug']}?")
    assert location.endswith("#enter")

    echo = _echo(r)
    # The typing survives...
    assert echo["playerName"] == ["Alice Chen"]
    assert echo["gender"] == ["F"]
    assert echo["club"] == ["Kingsway"]
    assert sorted(echo["events"]) == sorted([f"0:{page['ms']}", f"0:{page['ws']}"])
    # ...and the number is compute_fee_total's, identical to the JSON path's.
    assert echo["totalCents"] == [
        str(_quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()["totalCents"])
    ]


def test_the_browser_echo_drops_the_csrf_token_and_the_idempotency_key(
    client, page, entrant
):
    """Transport, not typing.

    The key especially: it is minted once per rendered form, and echoing a
    spent one into the address bar would pin it across every re-render, so
    the entrant's real submission would replay against a key the round trip
    had already fixed. The token is dropped because a URL is shareable,
    pasteable and logged, and this one is derived from a session cookie.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ms']}"],
            "_csrf": _form_token(client, page),
            "idempotencyKey": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            "action": "filter",
        },
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 303
    echo = _echo(r)
    assert "_csrf" not in echo
    assert "idempotencyKey" not in echo
    assert "action" not in echo
    assert "aaaaaaaa-bbbb" not in r.headers["location"]


def test_a_browser_quote_echoes_a_policy_refusal_as_a_code_not_prose(
    client, page, entrant
):
    """A refusal the entrant can act on has to survive the redirect too —
    otherwise the no-JS path shows a total for a basket that will be
    refused at submit, which is the exact lie the quote exists to prevent.

    It survives as ``check_policy``'s **code** plus its player keys, never
    as the message. The redirect target is a GET on the tournament's own
    host, so its query string is a shareable link: free text in it is text
    a stranger can render on the official entry page by sending someone a
    URL. The client maps the code to fixed copy (``app/lib/echo.ts``).
    """
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "_csrf": _form_token(client, page),
        },
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 303
    echo = _echo(r)
    assert echo["refusalCode"] == ["MAX_EVENTS_PER_PERSON"]
    assert echo["refusalSubjects"] == ["0"]
    # The message itself must NOT be in the URL: it is the free-text field
    # a crafted link would abuse. The rule's number reaches the entrant
    # from the projection the page already renders ("Up to N events per
    # person"), which is the director's configuration, not a query string.
    assert "refusal" not in echo
    assert "at most" not in r.headers["location"]


def test_a_headerless_browser_quote_is_refused_without_the_body_token(
    client, page, entrant
):
    """Non-vacuity for `_BROWSER`: these posts really do rest on channel two.

    Nothing above sends `X-ShuttleWorks-CSRF` — a native form cannot — so
    the only proof carried is the `_csrf` body field. If that field were
    ignored, every browser test here would pass while the route accepted a
    cookie-carrying cross-site post. Remove the token and it must refuse.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code in (401, 403), r.text


def test_a_fetch_still_gets_json(client, page, entrant):
    """The negative control on the branch: content negotiation must not have
    turned the hydrated path into a redirect."""
    r = _quote(client, page, [f"0:{page['ms']}"])

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert "totalCents" in r.json()


def test_a_browser_quote_cannot_inject_a_header_through_the_echo(
    client, page, entrant
):
    """The body is entrant-controlled and it lands in a Location header.

    urlencode percent-encodes CR/LF, so the newline below can never end the
    header — but nothing else in the request path guarantees that, so it is
    asserted here rather than assumed.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice\r\nX-Injected: yes",
            "gender": "F",
            "events": [f"0:{page['ms']}"],
            "_csrf": _form_token(client, page),
        },
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 303
    assert "\r" not in r.headers["location"]
    assert "\n" not in r.headers["location"]
    assert "x-injected" not in {k.lower() for k in r.headers}
    assert _echo(r)["playerName"] == ["Alice\r\nX-Injected: yes"]


def test_an_anonymous_browser_quote_is_still_refused(client, page):
    """R8-C is not weakened by the Accept header. A fee oracle that answered
    anyone would answer a scraper that sent `Accept: text/html`."""
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code in (401, 403), r.text


# ---- R8-E: what an anonymous submitter actually experiences --------------
#
# The entry form is now rendered to everyone, because a server-rendered page
# cannot know who is reading it (see `tests/test_entrant_ssr_contract.py`).
# That moves the sign-in decision to the write, where it can be made — and
# makes the SHAPE of that refusal a user-facing question for the first time.


def test_an_anonymous_browser_submit_is_navigated_back_to_the_form(client, page):
    """A refusal a human can read, instead of a JSON blob in the window.

    A native `<form method=post>` is a navigation: the browser replaces the
    page with whatever comes back. `Depends(get_current_entrant)` answers
    401 with `{"detail": {"code": ...}}`, which is a correct answer to the
    wrong question — nobody typing an entry on a phone can act on it.

    So a caller that says `text/html` is sent back to the entry page with a
    refusal CODE, which `app/lib/echo.ts` maps to fixed local copy. A code,
    never prose: this target is a shareable GET on the tournament's own
    host, so free text in the query string is content a stranger could put
    in front of an entrant by sending a link (`_echo_redirect` argues this
    at length).
    """
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "acknowledged": "on"},
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 303, r.text
    assert r.headers["location"].startswith(f"/e/{page['slug']}?")
    assert _echo(r)["refusalCode"] == ["NOT_SIGNED_IN"]
    # The refusal carries a code and nothing else — no email, no message,
    # nothing an author of a URL wrote.
    assert set(_echo(r)) == {"refusalCode"}


def test_an_anonymous_JSON_submit_is_still_a_plain_401(client, page):
    """**Negative control, and the one that matters.**

    The wrapper changes the SHAPE of the refusal for a navigation and
    nothing else. A programmatic caller — no `text/html` in `Accept` — must
    still get the 401 the identity dependency raises, with the same code.
    Widening the redirect to every caller would turn a refusal into a 3xx
    that a naive client follows to a 200 HTML page and reads as success.
    """
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "acknowledged": "on"},
        headers={"accept": "application/json", "content-type": "application/x-www-form-urlencoded"},
        follow_redirects=False,
    )

    assert r.status_code == 401, r.text
    assert r.json()["detail"]["code"] == "AUTH_NOT_SIGNED_IN"


def test_the_redirect_never_fires_for_a_caller_who_IS_signed_in(client, page, entrant):
    """Non-vacuity from the other side: the wrapper is a pure pass-through
    on the success path. A signed-in browser post reaches the route and is
    answered by the route's own guards — here the CSRF refusal, because this
    post deliberately carries no `_csrf` — and never by the sign-in
    redirect. A wrapper that redirected everyone would leave every test
    above green while silently making the whole route unreachable."""
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "acknowledged": "on"},
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
