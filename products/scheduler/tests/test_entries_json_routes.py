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
    assert r.headers["location"] == f"/e/{page['slug']}/receipt/{rows[0].id}"
    # The fee is computed server-side in one place and stored as computed.
    assert rows[0].fee_total_cents == 4000
    # Q11: the version agreed to, recorded at that instant.
    assert rows[0].regulations_version_accepted == 3


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


def test_two_submissions_without_a_key_are_two_acts(client, page, entrant):
    """Non-vacuity for the replay above: the route is not collapsing
    everything onto one row. A NULL key is not a key."""
    assert _submit(client, page).status_code == 303
    assert _submit(client, page).status_code == 303
    assert len(_submissions()) == 2
