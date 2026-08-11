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


def _seed_one_entry(client, page):
    """Write one entry through the real write route.

    Used only to put a row on the entrant list so the projection has
    something to project. It went through ``POST /e/{slug}/submit`` until
    the Phase 6 cut-over deleted that route; the shipped path is the JSON
    one, and using it keeps the fixture honest about what the list is
    built from.
    """
    return client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": _form_token(client, page),
        },
        follow_redirects=False,
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


def test_every_event_moment_ships_iso_beside_its_display_string(client, page):
    """SP-P6-2 G3: the countdown, the entry timeline and the date facets do
    arithmetic on these instants, and ``_moment`` emits a display string.

    **Additive, and the test says so in both directions.** The display string
    is a shipped contract — ``entrant/tests/phase.test.ts`` pins its exact
    format against the Python source — so the ISO field stands beside it
    rather than replacing it: the same instant, twice, in two registers.
    Absent moments stay absent on both fields; a null deadline must not
    become an epoch.
    """
    from datetime import datetime, timezone

    from sqlalchemy import select

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        ev = session.execute(
            select(EntryEvent).where(EntryEvent.id == uuid.UUID(page["ms"]))
        ).scalar_one()
        ev.opens_at = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
        ev.closes_at = datetime(2026, 8, 14, 23, 59, tzinfo=timezone.utc)
        ev.withdraws_until = datetime(2026, 8, 20, 12, 30, tzinfo=timezone.utc)
        session.commit()
    finally:
        session.close()

    by_code = {ev["code"]: ev for ev in client.get(f"/e/api/page/{page['slug']}").json()["events"]}
    ms = by_code["MS"]
    assert (ms["opensAt"], ms["opensAtIso"]) == (
        "2026-07-01 09:00 UTC",
        "2026-07-01T09:00:00+00:00",
    )
    assert (ms["closesAt"], ms["closesAtIso"]) == (
        "2026-08-14 23:59 UTC",
        "2026-08-14T23:59:00+00:00",
    )
    assert (ms["withdrawsUntil"], ms["withdrawsUntilIso"]) == (
        "2026-08-20 12:30 UTC",
        "2026-08-20T12:30:00+00:00",
    )
    # WS carries no moments at all: null stays null on both registers.
    assert [by_code["WS"][k] for k in ("opensAt", "opensAtIso", "closesAt")] == [
        None,
        None,
        None,
    ]


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
    """Invariant I6 — the strict one-column projection, at the JSON seam.

    NEGATIVE CONTROL. To prove this is not vacuous: add ``"email":
    entrant_account.email`` to ``EntrantRowDTO`` and populate it in
    ``entry_page_projection`` (or publish the ``entry_player_id``
    ``_entrants`` groups on, or the club sitting beside the name on
    ``entry_players``). Both assertions below go red. Put it back.

    The key set is asserted EXACTLY rather than by absence of known-bad
    names, which is why it moved when SP-P6-2's ruled addition landed
    (``eventCodes``, G5a) instead of quietly tolerating it: a third field
    still fails here, and a field the consent copy does not cover is a
    ruling, not a refactor.
    """
    assert _seed_one_entry(client, page).status_code == 303
    # A STRANGER reads the page — the viewer block legitimately carries the
    # signed-in reader's own address, so it must not be in the frame.
    client.cookies.clear()

    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["name"] for row in body["entrants"]] == ["Alice Chen"]
    assert all(set(row) == {"name", "eventCodes"} for row in body["entrants"])
    assert "parent@example.com" not in r.text
    assert body["viewer"] == {"signedIn": False, "email": None, "formCsrf": ""}
    # The count over the list and the names under it are one query apart and
    # must not disagree.
    by_id = {ev["id"]: ev for ev in body["events"]}
    assert by_id[page["ws"]]["entryCount"] == 1


def test_one_person_entering_two_events_is_listed_once(client, page, entrant):
    """Regression (real-browser demo pass, 2026-08-10): "Who has entered"
    named the same person once per EVENT they entered.

    The list is of PEOPLE, and the page renders it flat — so a projection
    shaped per-entry printed one entrant three times over. Deduplicating on
    the name alone would be the wrong fix: two entrants sharing a name is
    routine at a club (the reason ``_entrants`` orders by name *and* id), so
    the grouping key is the person, ``entries.entry_player_id``.
    """
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            # "<player index>:<event id>" — same player, two events.
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": _form_token(client, page),
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    client.cookies.clear()

    body = client.get(f"/e/api/page/{page['slug']}").json()
    assert [row["name"] for row in body["entrants"]] == ["Alice Chen"]
    # Negative control: the per-event counts are a different query and must
    # still see BOTH entries.
    counts = {ev["id"]: ev["entryCount"] for ev in body["events"]}
    assert counts[page["ms"]] == 1 and counts[page["ws"]] == 1


def test_two_entrants_who_share_a_name_are_both_listed(client, page, entrant):
    """Negative control for the grouping above: the list must not collapse
    two different people who happen to be called the same thing."""
    for _ in range(2):
        assert (
            client.post(
                f"/e/api/submit/{page['slug']}",
                data={
                    "playerName": "Alice Chen",
                    "gender": "F",
                    "events": [f"0:{page['ws']}"],
                    "acknowledged": "on",
                    "_csrf": _form_token(client, page),
                },
                follow_redirects=False,
            ).status_code
            == 303
        )
    client.cookies.clear()

    body = client.get(f"/e/api/page/{page['slug']}").json()
    assert [row["name"] for row in body["entrants"]] == ["Alice Chen", "Alice Chen"]


def test_an_entrants_row_carries_their_event_codes_without_re_duplicating(
    client, page, entrant
):
    """SP-P6-2 G5a: the Entrants tab groups by event, so a row must say which
    events its person entered — **without undoing the 2026-08-10 dedup.**

    The dropped dimension came back as codes ON the person's row rather than
    as a row per person-per-event, because a row per person-per-event IS the
    defect: it printed 42 rows for 23 people on the live page. So this test
    asserts all three properties at once, and the second and third are the
    ones that go red if the fan-out returns:

    - one row per PERSON, carrying every code they entered (Alice, twice
      entered, once listed);
    - two people who share a name are still two rows (the grouping key is
      ``entry_player_id``, never the name);
    - each row's codes are that person's own.

    Both Bobs render identically, so the pair's internal order — a random
    UUID tiebreaker — cannot make this flake.
    """
    def submit(name, events):
        assert (
            client.post(
                f"/e/api/submit/{page['slug']}",
                data={
                    "playerName": name,
                    "gender": "F",
                    "events": events,
                    "acknowledged": "on",
                    "_csrf": _form_token(client, page),
                },
                follow_redirects=False,
            ).status_code
            == 303
        )

    submit("Alice Chen", [f"0:{page['ms']}", f"0:{page['ws']}"])
    submit("Bob Lee", [f"0:{page['ws']}"])
    submit("Bob Lee", [f"0:{page['ws']}"])
    client.cookies.clear()

    body = client.get(f"/e/api/page/{page['slug']}").json()
    assert [(row["name"], row["eventCodes"]) for row in body["entrants"]] == [
        ("Alice Chen", ["MS", "WS"]),
        ("Bob Lee", ["WS"]),
        ("Bob Lee", ["WS"]),
    ]
    # Negative control on the count query, which is independent of the list:
    # three people entered WS and one entered MS, whatever the rows say.
    counts = {ev["code"]: ev["entryCount"] for ev in body["events"]}
    assert counts == {"MS": 1, "WS": 3}


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

    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": _form_token(client, page),
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text

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
# Accept gets a 307 back to the entry page: method and body preserved, so the
# entrant's own typing is re-posted there and only the server's total is in
# the URL. This is what makes the unhydrated round trip a shipped path rather
# than a degraded one, and it is the only shape that gets a total onto that
# page without node relaying the entrant's credential.
#
# **It was a 303 until the 2026-08-10 browser pass**, which read the address
# bar back and found the entrant's name, club, birth year and free-text
# remarks in it. See `_echo_redirect`'s docstring, and
# `test_a_browser_quote_never_puts_entrant_detail_in_a_url` below, which is
# the control that fails if any of it ever returns.

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

    # 307, not 303: 303 re-issues as GET, and a form body can only survive
    # that as a query string — which is how the typing ended up in browser
    # history and nginx logs. 307 preserves the method and the body, so the
    # browser re-posts the same fields to the page it came from.
    assert r.status_code == 307, r.text
    location = r.headers["location"]
    # `/enter` since SP-P6-2 G0: the form lives on its own route, and the 307
    # must land where the form renders. `#total` scrolls to the total bar.
    assert location.startswith(f"/e/{page['slug']}/enter?")
    assert location.endswith("#total")

    # The number is compute_fee_total's, identical to the JSON path's — and
    # it is the ONLY thing here that came from the entrant's press.
    assert _echo(r)["totalCents"] == [
        str(_quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()["totalCents"])
    ]


def test_a_browser_quote_never_puts_entrant_detail_in_a_url(client, page, entrant):
    """**The privacy control (2026-08-10 browser demo pass).**

    Found by driving the real stack, not by reading the code: pressing
    "Update events and total" left

        /e/{slug}?playerName=Rin+Matsuda&gender=F&club=Kingsway+BC
                 &birthYear=2012&remarks=cannot+play+before+6pm+Saturday

    in the address bar. A URL is written to the browser's history, to every
    nginx access log and to any intermediary's — none of which is scoped to
    hold an entrant's name, club or free-text notes. Age-bracketed events
    make ``birthYear`` mandatory, so that is personal data of MINORS in logs
    that were never designed to carry it.

    Asserted as an **allowlist over the whole query string**, not as a list
    of today's field names: a redaction denylist has to be kept in step with
    every field the form grows, and the day it is not is silent. Three keys,
    all server-authored, and the values are checked too — a field renamed on
    both sides would slip past a key-only check.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Rin Matsuda",
            "gender": "F",
            "club": "Kingsway BC",
            "birthYear": "2012",
            "remarks": "cannot play before 6pm Saturday",
            "events": [f"0:{page['ms']}"],
            "_csrf": _form_token(client, page),
            "idempotencyKey": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            "action": "filter",
        },
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 307, r.text
    location = r.headers["location"]

    # Nothing but the three the server itself wrote.
    assert set(_echo(r)) <= {"totalCents", "refusalCode", "refusalSubjects"}
    # And no posted VALUE reached the header by any spelling — including the
    # transport fields, which are not typing but are still a spent
    # idempotency key and a session-derived CSRF digest in a shareable URL.
    for leaked in (
        "playerName",
        "club",
        "birthYear",
        "remarks",
        "Rin",
        "Matsuda",
        "Kingsway",
        "2012",
        "6pm",
        "aaaaaaaa-bbbb",
        "idempotencyKey",
        "_csrf",
    ):
        assert leaked not in location, f"{leaked!r} reached the redirect Location"


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

    assert r.status_code == 307
    echo = _echo(r)
    assert echo["refusalCode"] == ["MAX_EVENTS_PER_PERSON"]
    assert echo["refusalSubjects"] == ["0"]
    # The message itself must NOT be in the URL: it is the free-text field
    # a crafted link would abuse. The rule's number reaches the entrant
    # from the projection the page already renders ("Up to N events per
    # person"), which is the director's configuration, not a query string.
    assert "refusal" not in echo
    assert "at most" not in r.headers["location"]


def test_a_refusal_names_the_block_that_breached_it_not_the_one_that_survived(
    client, page, entrant
):
    """**The wrong player, blamed** (code review, F2).

    ``parse_players`` DROPS a block with no name, no gender or no events —
    the second block is optional and an empty one is the normal case. The
    refusal subjects were then numbered by ``enumerate`` over what
    *survived* that drop, while ``app/lib/echo.ts`` renders them as ``Player
    ${n + 1}`` against the blocks the page RENDERED. So a first block that
    was typed into but ticked nothing shifted every later player up one, and
    the page told the entrant that Player 1 — the one that selected nothing
    — had picked too many events.

    Here block 0 has a name and a gender and no events (dropped), and block
    1 breaches the cap. The subject must be ``1``: the block the entrant can
    see the problem in.

    To prove it is not vacuous: number ``grouped`` with ``enumerate``
    (``api/entries_json.py``) instead of the parsed block index and this goes
    red with ``["0"]`` — while the single-player refusal test above, where
    the two numberings agree, stays green.
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

    body = {
        # Block 0: typed into, nothing ticked. Dropped by ``parse_players``.
        # Block 1: the breach.
        "playerName": ["Alice Chen", "Ben Ito"],
        "gender": ["F", "M"],
        "events": [f"1:{page['ms']}", f"1:{page['ws']}"],
        "_csrf": _form_token(client, page),
    }

    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data=body,
        headers=_BROWSER,
        follow_redirects=False,
    )
    assert r.status_code == 307
    echo = _echo(r)
    assert echo["refusalCode"] == ["MAX_EVENTS_PER_PERSON"]
    assert echo["refusalSubjects"] == ["1"]

    # The JSON surface carries the same keys, so a hydrated client cannot be
    # told a different player is at fault than the unhydrated one is.
    body["_csrf"] = _form_token(client, page)
    refusal = client.post(
        f"/e/api/quote/{page['slug']}", data=body, headers=CSRF
    ).json()["refusal"]
    assert refusal["subjects"] == ["1"]
    # Still numeric, never a name: the echo is a shareable GET on the
    # tournament's own host and nothing an author of a URL writes may become
    # prose on it.
    assert all(s.isdigit() for s in refusal["subjects"])


def test_a_dropped_block_does_not_misprice_the_players_that_survive_it(
    client, page, entrant
):
    """The other half of the same numbering, on the write path.

    The player keys are also what ``compute_fee_total`` labels its per-player
    basis rows with, and ``services/submissions._write`` splits each person's
    price across their entries from that basis. Numbering the keys by the
    posted block rather than by position in the surviving list must not cost
    the entrant their per-entry fee: one dropped block, and every share after
    it would come back ``None`` if anything paired the two lists by key.
    """
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": ["Alice Chen", "Ben Ito"],
            "gender": ["F", "M"],
            "events": [f"1:{page['ms']}", f"1:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": _form_token(client, page),
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text

    from database.models import Entry, Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        submission = session.scalars(select(Submission)).one()
        entries = session.scalars(select(Entry)).all()
        # Two events for one person, off the cumulative schedule's "2" tier.
        assert submission.fee_total_cents == 5500
        assert sorted(e.fee_cents for e in entries) == [2750, 2750]
    finally:
        session.close()


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
    """The body is entrant-controlled and it used to land in a Location header.

    It no longer reaches that header at all — the 307 leaves the body in the
    body — so injection is now structurally impossible rather than merely
    escaped. Kept, and strengthened to say exactly that: the crafted name is
    absent from the header entirely, not present-and-encoded.
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

    assert r.status_code == 307
    assert "\r" not in r.headers["location"]
    assert "\n" not in r.headers["location"]
    assert "x-injected" not in {k.lower() for k in r.headers}
    assert "Alice" not in r.headers["location"]
    assert "Injected" not in r.headers["location"]


def test_a_recalculation_comes_back_to_the_page_it_was_pressed_on(
    client, page, entrant
):
    """`/e/{slug}/signed-in` is the whole of E3.

    A tier that cannot read the session cookie can say a sign-in worked in
    exactly one way: by the URL the 303 from `POST /e/account/login` lands
    on. Redirecting a recalculation to the bare `/e/{slug}` silently
    retracted that, so pressing "Update events and total" made the banner
    vanish and left the reader unable to tell whether they were still signed
    in — on the one page where that decides whether their entry records.

    Presence, not value: the flag picks between two paths written in Python,
    so it can never name a third.
    """
    body = {
        "playerName": "Alice Chen",
        "gender": "F",
        "events": [f"0:{page['ms']}"],
        "_csrf": _form_token(client, page),
    }
    kwargs = dict(data=body, headers=_BROWSER, follow_redirects=False)

    plain = client.post(f"/e/api/quote/{page['slug']}", **kwargs)
    signed_in = client.post(f"/e/api/quote/{page['slug']}?signedIn=1", **kwargs)
    crafted = client.post(
        f"/e/api/quote/{page['slug']}?signedIn=https://evil.example", **kwargs
    )

    assert plain.headers["location"].startswith(f"/e/{page['slug']}/enter?")
    assert signed_in.headers["location"].startswith(
        f"/e/{page['slug']}/enter/signed-in?"
    )
    assert crafted.headers["location"] == signed_in.headers["location"]
    assert "evil.example" not in crafted.headers["location"]


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
    assert r.headers["location"].startswith(f"/e/{page['slug']}/enter?")
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


def test_a_non_401_from_the_identity_dependency_is_not_dressed_as_signed_out(
    client, page, monkeypatch
):
    """**The bound on what the wrapper is allowed to claim.**

    `entrant_or_back_to_form` builds a redirect that says exactly one thing:
    `NOT_SIGNED_IN`. Today `get_current_entrant` raises only 401, so a bare
    `except HTTPException` was correct — and would stop being correct in
    silence the day that dependency grows a 403 for an unverified or a
    locked account. The browser would then be navigated back to the form and
    told "this browser is not signed in": false, and unactionable, because
    signing in is not what fixes it, and the entrant would loop.

    Simulated rather than waited for: the dependency is patched to raise the
    403 it does not raise yet, and the refusal must arrive as itself.
    """
    from fastapi import HTTPException

    import api.entries_json as mod

    def locked(_request, _repo):
        raise HTTPException(status_code=403, detail={"code": "AUTH_ACCOUNT_LOCKED"})

    monkeypatch.setattr(mod, "get_current_entrant", locked)

    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={"playerName": "Alice Chen", "gender": "F", "acknowledged": "on"},
        headers=_BROWSER,
        follow_redirects=False,
    )

    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "AUTH_ACCOUNT_LOCKED"
    assert "location" not in r.headers


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
