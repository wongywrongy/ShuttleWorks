"""The entrant loader projection: ``GET /e/api/page/{slug}``.

**Successor file to the page half of ``tests/test_entries_public_routes.py``**
(SP-PROGRAM-1 Phase 6, spec §8/§9). Submission and publication *behaviour*
is unchanged — what moved is the serving context: the f-string HTML page is
retired and RR7 renders this JSON. Every test here names the test it
supersedes in ``tests/test_entries_migration_parity.py``.

The one claim that genuinely changes shape is escaping. The old file
asserted ``html.escape`` ran over every interpolation in both directions of
hostility. There is no interpolation here, so the claim splits in two: this
file owns the API half (markup arrives as data and leaves as data, on a
response no browser will execute), and the render half is pinned entrant
side by ``entrant/tests/entry.meta.test.ts``. See
``test_the_projection_carries_no_markup_at_all``, which is explicit about
what the JSON encoder does and does not do.

The projection is still strict (Q4/I6): entrant names and event ids, never
contact data, opt-outs absent.

Fixtures are lifted from ``test_entries_public_routes.py`` (prior art:
every entries test file declares its own ``client``/``page``/``entrant``),
so the two files exercise the same workspace, schedule and events — a
second fixture set would let the surfaces drift and call it a passing
suite.
"""
from __future__ import annotations

import json
import re
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

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
    """Cloudflare's dummy-key semantics, without Cloudflare — the entrant
    fixture signs up for real and signup is where the challenge lives."""
    from identity import turnstile as service

    def fake_post(url, fields, timeout):
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events."""
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

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
                # The published baseline (SP-P7 §4): the entrant-list tests
                # exercise the list, so the gate is on; the gate's own
                # off-state tests flip it back deliberately.
                entrants_published=True,
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
    """A signed-in entrant, created and logged in through the real routes."""
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


def _projection(client, page):
    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    return r.json()


def _event(payload, event_id):
    return next(ev for ev in payload["events"] if ev["id"] == event_id)


def _set_fee_schedule(page, schedule):
    """Write a schedule onto the row exactly as stored — the projection has
    to survive a column whose contents it did not choose (hand-edited JSON,
    an older row, a restored backup). The config route's own validation is
    asserted in ``test_entries_config_routes.py``."""
    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).fee_schedule = schedule
        session.commit()
    finally:
        session.close()


def _add_entry(tid, event_id, **kwargs):
    """Seed an entry with its player, at the level boundary R13 drew."""
    from db.models import EntrantAccount, Entry, EntryPlayer, Submission
    from db.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        account = session.scalars(select(EntrantAccount).limit(1)).first()
        if account is None:
            account = EntrantAccount(
                email=f"seed-{uuid.uuid4().hex[:8]}@example.com", password_hash="x"
            )
            session.add(account)
            session.flush()
        submission = Submission(tournament_id=uuid.UUID(tid), account_id=account.id)
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name=kwargs.pop("player_name", "Seeded Player"),
            gender=kwargs.pop("gender", "F"),
            club=kwargs.pop("club", None),
        )
        session.add_all([submission, player])
        session.flush()
        row = Entry(
            tournament_id=uuid.UUID(tid),
            entry_event_id=uuid.UUID(event_id),
            submission_id=submission.id,
            entry_player_id=player.id,
            # ``confirmed`` = the listed state since SP-P7 §3.2 narrowed the
            # public set; tests about the awaiting states pass one in.
            state=kwargs.pop("state", "confirmed"),
            **kwargs,
        )
        session.add(row)
        session.commit()
        return str(row.id)
    finally:
        session.close()


# ---- what the projection publishes --------------------------------------
# Supersedes test_the_page_shows_the_tournament_its_date_and_its_events.


def test_the_projection_carries_the_tournament_its_date_and_its_events(client, page):
    payload = _projection(client, page)
    assert payload["tournament"]["name"] == "Spring Open"
    assert payload["tournament"]["date"] == "2026-09-12"
    assert payload["page"]["introText"] == "All welcome."
    assert {ev["discipline"] for ev in payload["events"]} == {
        "Men's Singles",
        "Women's Singles",
    }


def test_the_projection_carries_the_fee_and_the_regulations_version(client, page):
    payload = _projection(client, page)
    assert _event(payload, page["ms"])["feeCents"] == 1500
    assert payload["page"]["regulationsText"].startswith("Play fair.")
    assert payload["page"]["regulationsVersion"] == 3


def test_the_projection_carries_the_schedule_and_the_payment_instructions(
    client, page
):
    """R14 §1/§2 — the published price list and the manual-payment prose."""
    payload = _projection(client, page)
    assert payload["page"]["feeSchedule"] == {"1": 4000, "2": 5500}
    assert (
        payload["page"]["paymentInstructions"] == "Zelle to treasurer@club.example."
    )


def test_a_malformed_fee_tier_does_not_take_the_projection_down(client, page):
    """A string-valued tier is an unauthenticated 500 if the projection
    reads the raw column. ``fee_schedule`` is free-form JSON and
    ``normalize_fee_schedule`` exists precisely because a director may
    leave anything in it — a bad tier is dropped where the price is
    dropped, not raised at the one point an anonymous visitor can reach."""
    _set_fee_schedule(page, {"1": 4000, "2": "5500", "0": 100, "3": -500, "4": "free"})

    payload = _projection(client, page)
    # "5500" is coerced exactly as the pricing coerces it; the zero count,
    # the negative price and the unparseable tier are dropped, exactly
    # where the pricing drops them.
    assert payload["page"]["feeSchedule"] == {"1": 4000, "2": 5500}


def test_a_clean_schedule_still_projects_every_tier(client, page):
    """Negative control: the dropping is the normalization's, not the
    projection quietly publishing less than it has."""
    _set_fee_schedule(page, {"1": 4000, "2": 5500, "3": 6000})
    assert _projection(client, page)["page"]["feeSchedule"] == {
        "1": 4000,
        "2": 5500,
        "3": 6000,
    }


def test_the_projection_carries_the_venue(client, page):
    """R14 §6: the one block of the incumbent's IA that had no field behind
    it until this slice added two columns."""
    payload = _projection(client, page)
    assert payload["venue"]["name"] == "Riverside Sports Hall"
    assert payload["venue"]["address"] == "12 Mill Lane"


# ---- the strict entrant list (Q4/I6) ------------------------------------


def test_the_projection_lists_entrant_rows_with_exactly_four_fields(client, page):
    """The whole row's key-set, asserted exactly — so a fifth field cannot
    arrive unnoticed (SP-P7 §5's allow-list discipline).

    ``eventCodes`` is SP-P6-2's ruled addition (G5a). ``club`` and
    ``personKey`` are SP-P7's (§3.2/§3.3): the club is licensed by the C4
    consent-copy update in ``enter.tsx`` ("name and club"), and the person
    key is the player-page address — an opaque id, so the assertion below
    checks it parses as a UUID rather than pinning a value.
    """
    _add_entry(page["tid"], page["ms"], player_name="Bo Ferrar", club="Riverside BC")
    payload = _projection(client, page)

    (row,) = payload["entrants"]
    assert set(row) == {"personKey", "name", "club", "eventCodes"}
    assert row["name"] == "Bo Ferrar"
    assert row["club"] == "Riverside BC"
    assert row["eventCodes"] == ["MS"]
    uuid.UUID(row["personKey"])  # opaque, but well-formed
    # The projection reaches the player and stops. The account behind the
    # entry is one hop further out and is never selected.
    assert "@example.com" not in json.dumps(payload)


def test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Shy Person", list_opt_out=True)
    _add_entry(page["tid"], page["ms"], player_name="Loud Person")
    names = [row["name"] for row in _projection(client, page)["entrants"]]
    assert names == ["Loud Person"]


def test_withdrawn_and_rejected_entries_are_not_listed(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Gone Away", state="withdrawn")
    _add_entry(page["tid"], page["ms"], player_name="Turned Down", state="rejected")
    _add_entry(page["tid"], page["ms"], player_name="Still Here")
    names = [row["name"] for row in _projection(client, page)["entrants"]]
    assert names == ["Still Here"]


def test_only_confirmed_entries_are_listed(client, page):
    """SP-P7 §3.2, ruled at the Phase 0 STOP: the public list is the
    processed-only model. A submission awaiting the operator's decision —
    pending or waitlisted — never appears publicly; it is visible to its
    own account alone (the /me half of this claim lives with that route).
    """
    _add_entry(page["tid"], page["ms"], player_name="Ada Waiting", state="pending")
    _add_entry(page["tid"], page["ws"], player_name="Quinn Queued", state="waitlisted")
    _add_entry(page["tid"], page["ms"], player_name="Bo Accepted", state="confirmed")

    payload = _projection(client, page)
    assert [row["name"] for row in payload["entrants"]] == ["Bo Accepted"]
    # And the coupled invariant: the event counts count the same people the
    # list names — the pending and waitlisted rows move neither number.
    assert _event(payload, page["ms"])["entryCount"] == 1
    assert _event(payload, page["ws"])["entryCount"] == 0


def test_the_list_never_reveals_entry_state(client, page):
    """Entry is not acceptance. The list shows who entered, and a public
    'pending' next to a name is a judgment nobody made — at the JSON
    boundary that is a *schema* claim (the row has exactly its four
    published keys) and, as in the old file, an absence claim over the
    serialized list."""
    _add_entry(page["tid"], page["ms"], player_name="Bo Accepted")
    _add_entry(page["tid"], page["ws"], player_name="Cy Cleared")

    rows = _projection(client, page)["entrants"]
    assert {row["name"] for row in rows} == {"Bo Accepted", "Cy Cleared"}
    assert all(
        set(row) == {"personKey", "name", "club", "eventCodes"} for row in rows
    )
    serialized = json.dumps(rows).lower()
    for state in ("pending", "confirmed", "waitlisted"):
        assert state not in serialized


# ---- the entrants publication gate (SP-P7 §4) ----------------------------


def _set_entrants_published(page, value):
    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).entrants_published = value
        session.commit()
    finally:
        session.close()


def test_the_projection_states_the_publication_flags(client, page):
    """The gated-vs-empty protocol is these three booleans and nothing
    else — same 200, no envelope, so an unpublished state cannot be probed
    apart from an unpopular one by status code."""
    assert _projection(client, page)["publication"] == {
        "entrants": True,
        "draws": False,
        "results": False,
    }


def test_an_unpublished_list_is_empty_even_when_entrants_exist(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Early Bird")
    _set_entrants_published(page, False)

    payload = _projection(client, page)
    assert payload["publication"]["entrants"] is False
    assert payload["entrants"] == []
    # Gated at the query, not the renderer: the name is absent from the
    # whole response, not present-but-unrendered.
    assert "Early Bird" not in json.dumps(payload)


def test_unpublishing_actually_stops_the_names_flowing(client, page):
    """SP-P7 §7's verification trap, at the entrants level: publish, see
    the name, unpublish through the real operator route, see it gone. The
    off state is tested, not just the on state."""
    _add_entry(page["tid"], page["ms"], player_name="Briefly Public")
    assert [
        row["name"] for row in _projection(client, page)["entrants"]
    ] == ["Briefly Public"]

    response = client.patch(
        f"/tournaments/{page['tid']}/entry-page/publication",
        json={"entrantsPublished": False},
        headers={"X-ShuttleWorks-CSRF": "1"},
    )
    assert response.status_code == 200

    payload = _projection(client, page)
    assert payload["entrants"] == []
    assert "Briefly Public" not in json.dumps(payload)


def test_the_projection_carries_no_markup_at_all(client, page):
    """**Supersedes ``test_every_interpolated_value_is_escaped``.**

    The old page interpolated director-authored regulations and
    stranger-authored names into an f-string document and escaped both.
    There is no interpolation here, so the claim splits along the tier
    boundary and this half asserts what is true at the API seam:

    * markup arrives as data and leaves as data — verbatim, both
      directions of hostility, so nothing is silently rewritten (a
      projection that mangled the string would hide a rendering bug rather
      than fix one);
    * and the answer is ``application/json``, which is what replaces
      escaping: a document a browser will not execute however it is
      reached.

    **``<`` is deliberately NOT asserted absent from the wire body.**
    ``json.dumps`` does not escape it and the response really does contain
    ``<script>`` — asserting otherwise would be a control that fails today
    for a property nothing implements. The render half of the old claim —
    that these strings reach the DOM as text — is pinned where the render
    happens, in ``entrant/tests/entry.meta.test.ts``.
    """
    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.regulations_text = "<script>alert('director')</script>"
        session.commit()
    finally:
        session.close()
    _add_entry(page["tid"], page["ms"], player_name="<img src=x onerror=alert(1)>")

    r = client.get(f"/e/api/page/{page['slug']}")
    payload = r.json()

    assert payload["page"]["regulationsText"] == "<script>alert('director')</script>"
    assert payload["entrants"][0]["name"] == "<img src=x onerror=alert(1)>"
    assert r.headers["content-type"].startswith("application/json")


# ---- the uniform 404 ----------------------------------------------------


def test_an_unknown_slug_and_a_closed_page_answer_identically(client, page):
    from db.models import EntryPage
    from db.session import SessionLocal

    unknown = client.get("/e/api/page/no-such-page-anywhere")
    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).is_open = False
        session.commit()
    finally:
        session.close()
    closed = client.get(f"/e/api/page/{page['slug']}")

    assert unknown.status_code == closed.status_code == 404
    assert unknown.json() == closed.json()
    assert unknown.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_an_open_page_is_the_negative_control_for_that_404(client, page):
    assert client.get(f"/e/api/page/{page['slug']}").status_code == 200


# ---- the viewer block ---------------------------------------------------


def test_a_signed_out_viewer_is_projected_as_signed_out_not_404(client, page):
    """Seam B's failure mode, stated: no session -> a signed-out viewer,
    never a wall. The events, the money and the regulations are what
    somebody following a poster link came to read. (The old page carried
    the ``/e/account/login`` href itself; the route to sign in is the RR7
    tier's to render now, so what survives here is the fact that a stranger
    is served the page rather than refused it.)"""
    payload = _projection(client, page)
    assert payload["viewer"]["signedIn"] is False
    assert payload["viewer"]["email"] is None
    assert payload["viewer"]["formCsrf"] == ""
    assert payload["events"], "a signed-out viewer still gets the events"
    assert payload["page"]["regulationsText"]


def test_a_signed_in_viewer_carries_an_email_and_a_form_csrf_token(
    client, page, entrant
):
    """Negative control for the test above, and the field the RR7 form
    needs: channel two of the CSRF proof is minted here."""
    viewer = _projection(client, page)["viewer"]
    assert viewer["signedIn"] is True
    assert viewer["email"] == "parent@example.com"
    assert re.fullmatch(r"[0-9a-f]{64}", viewer["formCsrf"])


# ---- the incumbent's IA (R14 §6) ----------------------------------------


def _set_dates(page, *, event="ws", **columns):
    from db.models import EntryEvent
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page[event])))
        for key, value in columns.items():
            setattr(row, key, value)
        session.commit()
    finally:
        session.close()


def test_the_projection_carries_open_close_withdraw_and_the_date(client, page):
    """R14 §3/§6: four moments. The withdrawal deadline is a first-class
    field rather than a footnote, because organisers deliberately separate
    it from the entry close and an entrant reads it as a different
    promise. Each instant names its zone — a deadline read in the wrong
    zone is a missed entry."""
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page,
            event=key,
            opens_at=datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc),
            closes_at=datetime(2026, 9, 1, 23, 59, tzinfo=timezone.utc),
            withdraws_until=datetime(2026, 9, 3, 23, 59, tzinfo=timezone.utc),
        )

    payload = _projection(client, page)
    ev = _event(payload, page["ws"])
    assert ev["opensAt"] == "2026-08-01 09:00 UTC"
    assert ev["closesAt"] == "2026-09-01 23:59 UTC"
    assert ev["withdrawsUntil"] == "2026-09-03 23:59 UTC"
    assert payload["tournament"]["date"] == "2026-09-12"


def test_a_deadline_that_differs_between_events_is_projected_per_event(client, page):
    """Two events, two closing dates. The old page printed "Varies by
    event" because one headline string had to stand for both; the
    projection has no such constraint — it publishes both and RR7 decides
    what to say. The claim that survives is that neither is silently
    dropped in favour of the other."""
    from datetime import datetime, timezone

    _set_dates(page, event="ms", closes_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    _set_dates(page, event="ws", closes_at=datetime(2026, 9, 5, tzinfo=timezone.utc))

    payload = _projection(client, page)
    assert _event(payload, page["ms"])["closesAt"] == "2026-09-01 00:00 UTC"
    assert _event(payload, page["ws"])["closesAt"] == "2026-09-05 00:00 UTC"


def test_one_shared_deadline_is_projected_on_every_event(client, page):
    """Negative control for the line above: two closing dates in the
    projection means two were configured, never one duplicated wrongly."""
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page, event=key, closes_at=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
        )
    payload = _projection(client, page)
    assert {ev["closesAt"] for ev in payload["events"]} == {"2026-09-05 12:00 UTC"}


def test_the_projection_names_the_organisation_running_the_tournament(client, page):
    """R14 §6's organisation card. The org name is the only field behind
    it — the audit found the tree carries nothing else."""
    from db.models import Org, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        org = Org(name="Riverside Badminton Club")
        session.add(org)
        session.flush()
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = org.id
        session.commit()
    finally:
        session.close()

    assert _projection(client, page)["org"] == {"name": "Riverside Badminton Club"}


def test_a_workspace_with_no_org_projects_no_organiser(client, page):
    """Negative control: the card is data, not decoration."""
    from db.models import Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = None
        session.commit()
    finally:
        session.close()

    assert _projection(client, page)["org"] is None


# ---- entry counts and the fee card's agreement with the quote -----------


def test_the_projection_offers_exactly_the_tiers_the_quote_honours(
    client, page, entrant
):
    """The divergence, stated as the invariant it breaks. A tier the
    normalization drops is a price the *quote* will never charge, so
    publishing it is the page quoting a number the submission
    contradicts. Tier 2 is unusable here, so two events fall back to tier
    1 — and the schedule must not be advertising 5500 while the quote
    charges 4000."""
    _set_fee_schedule(page, {"1": 4000, "2": "on request", "3": 6000})

    payload = _projection(client, page)
    assert payload["page"]["feeSchedule"] == {"1": 4000, "3": 6000}
    assert "on request" not in json.dumps(payload)

    quote = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}", f"0:{page['ms']}"],
            "_csrf": payload["viewer"]["formCsrf"],
        },
    )
    assert quote.status_code == 200, quote.text
    assert quote.json()["totalCents"] == 4000


# ---- R12's birth-year trigger, now a projected flag ---------------------


def test_no_event_is_flagged_age_bracketed_when_none_is(client, page):
    """R12: birth year is collected **only where an age-bracketed event
    requires it**. Two open singles events with no age band need nothing,
    and a field nobody needs is data minimization failing quietly (Q10).
    The heuristic stays Python-side; the form reads this flag."""
    payload = _projection(client, page)
    assert payload["events"]
    assert all(ev["ageBracketed"] is False for ev in payload["events"])


def test_an_age_bracketed_event_is_flagged_in_the_projection(client, page):
    """Negative control, and the case the field exists for."""
    from db.models import EntryEvent
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = EntryEvent(
            tournament_id=uuid.UUID(page["tid"]),
            code="U15BS",
            discipline="Under-15 Boys' Singles",
            entry_type="singles",
        )
        session.add(row)
        session.commit()
        bracketed = str(row.id)
    finally:
        session.close()

    payload = _projection(client, page)
    assert _event(payload, bracketed)["ageBracketed"] is True


# ---- registration and the deletion guard --------------------------------


def test_the_entrant_json_routes_are_registered(client):
    """Newer FastAPI keeps each ``include_router`` as a nested
    ``_IncludedRouter``, so the OpenAPI document is the assertion surface,
    not ``app.routes``."""
    from core.main import app

    paths = app.openapi()["paths"]
    assert "get" in paths["/e/api/page/{slug}"]
    assert "get" in paths["/e/api/config"]
    assert "post" in paths["/e/api/quote/{slug}"]
    assert "post" in paths["/e/api/submit/{slug}"]


def test_the_entrant_json_module_mints_no_capability_material_at_all(client):
    """The deletion guard for the manage-token path (R10 / Q13 §6),
    retargeted from the retired HTML module onto the module that replaced
    it — ``entries/entries_json/``, because a guard that reads
    ``entries/entries_public/`` is deleted along with it in the cut-over and
    stops guarding anything. A capability that is never minted cannot be
    leaked by a renderer added later. ``secrets`` itself stays imported —
    for ``compare_digest``, which is a comparison, not a credential."""
    import inspect

    from entries import entries_json

    source = inspect.getsource(entries_json)
    assert "token_urlsafe" not in source
    assert "token_bytes" not in source
    assert "token_hex" not in source
    assert "compare_digest" in source, "the guard must be reading the live module"
