"""The public entry surface: the slug page and the session-gated write.

**This file was written for an anonymous write and has been unwound onto a
gated one** (SP-E1-2 Phase C; rulings R10, R12, R13, R14). SP-E1-1 shipped
``POST /e/{slug}/submit`` as the first route in ShuttleWorks that let a
stranger with no account write to workspace data, justified by "an entrant
has no account and never will (spec Q4)". R10 reversed that premise. What
changed here, group by group:

- **the session gate (R10).** The headline behavior inverts: the old
  "anonymous submit succeeds" tests are replaced in place by
  "anonymous submit is rejected", with the signed-in submit as their
  negative control. That replacement is required — a superseded negative
  control is never deleted, it becomes its successor.
- **Turnstile at submit (R10).** The challenge moved to signup, where the
  unauthenticated act now is. Its five refusal/ordering tests moved with
  it to ``tests/test_entrant_auth_routes.py``; what remains here is the
  claim that submit does **not** require one, plus the page carrying no
  challenge widget and no script at all.
- **idempotency, acceptance and the fee (R13/R14).** All three moved up to
  the submission, so their tests assert at that level: a replay returns the
  original act *and all of its entries*, the acceptance pair sits on the
  submission, and the total is the one the fee schedule produces.
- **the contact block (Q13 §6).** ``contactName`` / ``contactEmail`` are
  not form fields any more; the account is who submitted. The soft
  duplicate flag's conjunction loses the email half and gains the player
  level (R7 preserved, retargeted).
- **the manage token (R10).** Gone. Managing an entry is login-gated "my
  entries", which E2 builds.

**Phase D adds, rather than unwinds, four groups**: the incumbent's
information architecture (R14 §6 — timeline, organisation, venue, entry
counts), ruling **R11**'s two co-equal widths asserted the only way a text
assertion honestly can (the breakpoint exists, and nothing is sized in
pixels), the **gender filter and its override** (R12 / Q14 §5), and the
**running total** — which is pinned to the thing that actually matters:
the number rendered is the number stored on the submission.

**No test reaches Cloudflare.** The turnstile fixture stays because signup
runs through it, and the entrant fixture here signs up for real.
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
    """Cloudflare's dummy-key semantics, without Cloudflare.

    Kept even though submit no longer challenges: the entrant fixture below
    signs up, and signup is where the challenge lives now.
    """
    from services import turnstile as service

    state = {"raises": None}

    def fake_post(url, fields, timeout):
        if state["raises"] is not None:
            raise state["raises"]
        secret = fields.get("secret", "")
        if secret.startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)
    return state


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events.

    Seeded directly: the operator authoring surface is a later slice, and
    the public contract is worth pinning before it exists rather than
    after. Carries the R14 configuration the page now renders.
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
    """A signed-in entrant, created and logged in through the real routes.

    Signup and login are the only way in — there is no fixture shortcut,
    because a shortcut would mean the gate this file exists to assert was
    never crossed for real.
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


def _csrf_token(client, page):
    """Read the form's hidden CSRF field off the rendered page.

    Deliberately scraped rather than computed: a test that recomputed the
    digest would pass even if the page stopped emitting the field, and the
    field is the only thing that lets a real browser post this form.
    """
    body = client.get(f"/e/{page['slug']}").text
    match = re.search(r'name="_csrf" value="([0-9a-f]*)"', body)
    return match.group(1) if match else ""


def _submit(client, page, **overrides):
    """A well-formed one-player, one-event submission."""
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "club": "",
        "birthYear": "",
        "remarks": "can't play before 6pm Saturday",
        "events": [f"0:{page['ws']}"],
        "acknowledged": "on",
        "_csrf": _csrf_token(client, page),
    }
    headers = overrides.pop("headers", {})
    data.update({k: v for k, v in overrides.items() if v is not None})
    for k, v in overrides.items():
        if v is None:
            data.pop(k, None)
    return client.post(f"/e/{page['slug']}/submit", data=data, headers=headers)


def _refresh(client, page, **overrides):
    """Press "Update events" — the script-free round trip (Phase D).

    The page has ``script-src 'none'``, so the only way a filtered event
    list and a running total can react to what the entrant typed is to ask
    the server. This is the same form, posted with ``action=filter``: it
    re-renders and writes nothing.
    """
    overrides.setdefault("acknowledged", None)
    return _submit(client, page, action="filter", **overrides)


def _events_offered(body, index=0):
    """The event ids whose checkbox is rendered for player ``index``."""
    return set(re.findall(rf'name="events" value="{index}:([0-9a-f-]+)"', body))


def _entries(tid=None):
    from database.models import Entry
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        stmt = select(Entry)
        if tid is not None:
            stmt = stmt.where(Entry.tournament_id == uuid.UUID(tid))
        return list(session.scalars(stmt.order_by(Entry.submitted_at, Entry.id)))
    finally:
        session.close()


def _submissions(tid=None):
    from database.models import Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        stmt = select(Submission)
        if tid is not None:
            stmt = stmt.where(Submission.tournament_id == uuid.UUID(tid))
        # ``submitted_at`` alone ties: two submissions of one test land in
        # the same tick, and this helper is now indexed into ([0]) by a test
        # that makes exactly that happen. ``id`` is the house tiebreaker.
        return list(
            session.scalars(stmt.order_by(Submission.submitted_at, Submission.id))
        )
    finally:
        session.close()


def _add_entry(tid, event_id, **kwargs):
    """Seed an entry with its player, at the level boundary R13 drew."""
    from database.models import EntrantAccount, Entry, EntryPlayer, Submission
    from database.session import SessionLocal
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
        submission = Submission(
            tournament_id=uuid.UUID(tid), account_id=account.id
        )
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name=kwargs.pop("player_name", "Seeded Player"),
            gender=kwargs.pop("gender", "F"),
            remarks=kwargs.pop("remarks", None),
        )
        session.add_all([submission, player])
        session.flush()
        row = Entry(
            tournament_id=uuid.UUID(tid),
            entry_event_id=uuid.UUID(event_id),
            submission_id=submission.id,
            entry_player_id=player.id,
            state=kwargs.pop("state", "pending"),
            **kwargs,
        )
        session.add(row)
        session.commit()
        return str(row.id)
    finally:
        session.close()


# ---- the page -----------------------------------------------------------


def test_the_page_shows_the_tournament_its_date_and_its_events(client, page):
    r = client.get(f"/e/{page['slug']}")
    assert r.status_code == 200
    body = r.text
    assert "Spring Open" in body
    assert "2026-09-12" in body
    assert "All welcome." in body
    assert "Men&#x27;s Singles" in body
    assert "Women&#x27;s Singles" in body


def test_the_page_shows_the_fee_and_the_regulations_with_their_version(client, page):
    body = client.get(f"/e/{page['slug']}").text
    assert "15.00" in body
    assert "Play fair." in body
    assert "Version 3" in body


def test_the_page_shows_the_fee_schedule_and_the_payment_instructions(client, page):
    """R14 §1/§2. The schedule is published as the cumulative price list a
    director copies, and the payment instructions are prose because v1
    payment is manual (Q8's boundary untouched)."""
    body = client.get(f"/e/{page['slug']}").text
    assert "40.00" in body and "55.00" in body
    assert "Zelle to treasurer@club.example." in body
    assert "per player" in body


def _set_fee_schedule(page, schedule):
    """Write a fee schedule onto the page row, exactly as stored.

    Through the database rather than through the config route on purpose:
    this section is about what the *renderer* does with a column whose
    contents it did not choose. A director editing JSON by hand, an older
    row written before the config route validated anything, a restored
    backup — the page has to survive all three, and the route's own
    validation is asserted in ``test_entries_config_routes.py``.
    """
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.fee_schedule = schedule
        session.commit()
    finally:
        session.close()


def _fee_tiers(body):
    """The tiers the Fees card actually prints, as ``{count: "40.00"}``."""
    card = re.search(r"<h2>Fees</h2><ul>(.*?)</ul>", body, re.S)
    if card is None:
        return {}
    return {
        int(count): amount
        for count, amount in re.findall(
            r"<li>(\d+) event\(s\) <span class=\"fee\">([0-9.]+)</span></li>",
            card.group(1),
        )
    }


def test_a_malformed_fee_tier_does_not_take_the_public_page_down(client, page):
    """A string-valued tier is an unauthenticated 500 if the card iterates
    the raw column: ``_money`` divides by 100 and a string does not divide.

    Nothing about this row is exotic — ``fee_schedule`` is free-form JSON
    and the normalization in ``services/entry_fees`` exists precisely
    because a director may leave anything in it. The renderer reads the
    column through that same normalization now, so a bad tier is dropped
    exactly where the price is dropped, not raised at the one point in the
    stack an anonymous visitor can reach.
    """
    _set_fee_schedule(
        page, {"1": 4000, "2": "5500", "0": 100, "3": -500, "4": "free"}
    )

    r = client.get(f"/e/{page['slug']}")

    assert r.status_code == 200, r.text
    # "5500" is coerced, exactly as the pricing coerces it; the zero count,
    # the negative price and the unparseable tier are dropped, exactly
    # where the pricing drops them.
    assert _fee_tiers(r.text) == {1: "40.00", 2: "55.00"}


def test_the_card_shows_exactly_the_tiers_the_total_honours(client, page, entrant):
    """The divergence, stated as the invariant it breaks.

    A tier the normalization drops is a price the *total* will never
    charge — so printing it is the page quoting a number the submission
    contradicts. R14's rule is that the total shown is the total recorded;
    a price list that outruns the schedule is the same lie one screen
    earlier. Here tier 2 is unusable, so two events fall back to tier 1 —
    and the card must not be advertising 55.00 while the form charges
    40.00.
    """
    _set_fee_schedule(page, {"1": 4000, "2": "on request", "3": 6000})

    body = client.get(f"/e/{page['slug']}").text
    assert _fee_tiers(body) == {1: "40.00", 3: "60.00"}
    assert "on request" not in body

    shown = _refresh(
        client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"], showAllEvents="on"
    ).text
    assert _total_shown(shown) == 4000


def test_a_clean_schedule_still_prints_every_tier(client, page):
    """Negative control for both refusals above: the dropping is the
    normalization's, not the renderer quietly printing less than it has."""
    _set_fee_schedule(page, {"1": 4000, "2": 5500, "3": 6000})

    tiers = _fee_tiers(client.get(f"/e/{page['slug']}").text)
    assert tiers == {1: "40.00", 2: "55.00", 3: "60.00"}


def test_the_page_shows_the_venue(client, page):
    """R14 §6: the one block of the incumbent's IA that had no field behind
    it until this slice added two columns."""
    body = client.get(f"/e/{page['slug']}").text
    assert "Riverside Sports Hall" in body
    assert "12 Mill Lane" in body


def test_the_page_lists_entrant_names_and_events_only(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Bo Ferrar")
    body = client.get(f"/e/{page['slug']}").text
    assert "Bo Ferrar" in body
    # The projection reaches the player and stops. The account behind the
    # entry is one hop further out and is never selected.
    assert "@example.com" not in body


def test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Shy Person", list_opt_out=True)
    _add_entry(page["tid"], page["ms"], player_name="Loud Person")
    body = client.get(f"/e/{page['slug']}").text
    assert "Loud Person" in body
    assert "Shy Person" not in body


def test_withdrawn_and_rejected_entries_are_not_listed(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Gone Away", state="withdrawn")
    _add_entry(page["tid"], page["ms"], player_name="Turned Down", state="rejected")
    _add_entry(page["tid"], page["ms"], player_name="Still Here")
    body = client.get(f"/e/{page['slug']}").text
    assert "Still Here" in body
    assert "Gone Away" not in body
    assert "Turned Down" not in body


def test_the_list_never_reveals_entry_state(client, page):
    """Entry is not acceptance. The list shows who entered, and a public
    'pending' next to a name is a judgment nobody made."""
    _add_entry(page["tid"], page["ms"], player_name="Ada Waiting", state="pending")
    _add_entry(page["tid"], page["ms"], player_name="Bo Accepted", state="confirmed")
    body = client.get(f"/e/{page['slug']}").text
    listing = body.lower().split("<h2>who has entered</h2>")[1]
    assert "ada waiting" in listing and "bo accepted" in listing
    for state in ("pending", "confirmed", "waitlisted"):
        assert state not in listing


def test_every_interpolated_value_is_escaped(client, page):
    """Both directions of hostility: a director-authored regulations text
    and a stranger-authored player name, on a page that publishes the
    second to the first's audience."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.regulations_text = "<script>alert('director')</script>"
        session.commit()
    finally:
        session.close()
    _add_entry(page["tid"], page["ms"], player_name="<img src=x onerror=alert(1)>")

    body = client.get(f"/e/{page['slug']}").text
    assert "<script>alert('director')</script>" not in body
    assert "<img src=x onerror=alert(1)>" not in body
    assert "&lt;script&gt;" in body
    assert "&lt;img" in body


def test_an_unknown_slug_and_a_closed_page_answer_identically(client, page):
    from database.models import EntryPage
    from database.session import SessionLocal

    unknown = client.get("/e/no-such-page-anywhere")
    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.is_open = False
        session.commit()
    finally:
        session.close()
    closed = client.get(f"/e/{page['slug']}")

    assert unknown.status_code == closed.status_code == 404
    assert unknown.json() == closed.json()


def test_an_open_page_is_the_negative_control_for_that_404(client, page):
    assert client.get(f"/e/{page['slug']}").status_code == 200


def test_the_page_carries_its_own_security_headers(client, page):
    r = client.get(f"/e/{page['slug']}")
    csp = r.headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Cache-Control"] == "no-store"


def test_the_page_now_allows_no_script_at_all(client, page):
    """R10's second-order effect, and a real tightening.

    Turnstile was the only reason this page ever needed ``script-src``.
    With the challenge moved to signup there is no script on the page and
    none is permitted — the acknowledgment gate is the HTML ``required``
    attribute, which is why this was always achievable.
    """
    r = client.get(f"/e/{page['slug']}")
    assert "script-src 'none'" in r.headers["Content-Security-Policy"]
    assert "challenges.cloudflare.com" not in r.headers["Content-Security-Policy"]
    assert "<script" not in r.text


def test_the_page_is_built_for_a_390px_screen(client, page):
    body = client.get(f"/e/{page['slug']}").text
    assert 'name="viewport"' in body
    assert "font-size: 16px" in body


def test_a_signed_out_visitor_is_offered_the_login_path_not_a_404(
    client, page
):
    """Seam B's failure mode, stated: no session -> the login/signup path.

    A poster link that answers 404 to someone without an account teaches
    them nothing about what to do next, and the events, the money and the
    regulations are what they came to read anyway.
    """
    r = client.get(f"/e/{page['slug']}")
    assert r.status_code == 200
    assert "/e/account/login" in r.text
    assert "Men&#x27;s Singles" in r.text
    assert 'name="playerName"' not in r.text


def test_a_signed_in_entrant_sees_the_form(client, page, entrant):
    """Negative control for the test above."""
    body = client.get(f"/e/{page['slug']}").text
    assert 'name="playerName"' in body
    assert 'name="gender"' in body
    assert "parent@example.com" in body


def test_the_acknowledgment_checkbox_gates_submit_in_the_browser_too(
    client, page, entrant
):
    body = client.get(f"/e/{page['slug']}").text
    assert re.search(r'name="acknowledged"[^>]*required', body)


def test_the_form_offers_a_checkbox_per_open_event_carrying_the_player_index(
    client, page, entrant
):
    """R13's transport shape: 1-N events per person in a flat form post."""
    body = client.get(f"/e/{page['slug']}").text
    assert f'value="0:{page["ms"]}"' in body
    assert f'value="0:{page["ws"]}"' in body
    assert f'value="1:{page["ms"]}"' in body


# ---- the page: the incumbent's IA (R14 §6) ------------------------------


def _set_dates(page, *, event="ws", **columns):
    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(
            EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page[event]))
        )
        for key, value in columns.items():
            setattr(row, key, value)
        session.commit()
    finally:
        session.close()


def test_the_timeline_runs_open_close_withdraw_then_the_tournament(client, page):
    """R14 §3/§6: four moments in the order the incumbent renders them.

    The withdrawal deadline is a first-class row rather than a footnote,
    because organisers deliberately separate it from the entry close
    (Badminton Ontario closes entries Tuesday, accepts withdrawals until
    Wednesday) and an entrant reads it as a different promise.
    """
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page,
            event=key,
            opens_at=datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc),
            closes_at=datetime(2026, 9, 1, 23, 59, tzinfo=timezone.utc),
            withdraws_until=datetime(2026, 9, 3, 23, 59, tzinfo=timezone.utc),
        )

    body = client.get(f"/e/{page['slug']}").text
    positions = [
        body.index(label)
        for label in ("Entries open", "Entries close", "Withdrawal deadline")
    ]
    assert positions == sorted(positions)
    assert "2026-08-01" in body and "2026-09-01" in body and "2026-09-03" in body
    assert "UTC" in body
    # The tournament date closes the timeline.
    assert body.index("Withdrawal deadline") < body.index("Tournament date")
    assert "2026-09-12" in body


def test_a_deadline_that_differs_between_events_says_so_rather_than_picking_one(
    client, page
):
    """Two events, two closing dates: a single headline date would be a
    statement about the other event that is simply false."""
    from datetime import datetime, timezone

    _set_dates(page, event="ms", closes_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    _set_dates(page, event="ws", closes_at=datetime(2026, 9, 5, tzinfo=timezone.utc))

    body = client.get(f"/e/{page['slug']}").text
    assert "Varies by event" in body


def test_one_shared_deadline_is_stated_plainly(client, page):
    """Negative control for the line above."""
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page, event=key, closes_at=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
        )
    body = client.get(f"/e/{page['slug']}").text
    assert "2026-09-05 12:00 UTC" in body
    assert "Varies by event" not in body


def test_the_page_names_the_organisation_running_the_tournament(client, page):
    """R14 §6's organization card. The org name is the only field behind
    it — the audit found the tree carries nothing else."""
    from database.models import Org, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        org = Org(name="Riverside Badminton Club")
        session.add(org)
        session.flush()
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = org.id
        session.commit()
    finally:
        session.close()

    body = client.get(f"/e/{page['slug']}").text
    assert "Riverside Badminton Club" in body
    assert "Organiser" in body


def test_a_workspace_with_no_org_renders_no_organiser_card(client, page):
    """Negative control: the card is data, not decoration."""
    from database.models import Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = None
        session.commit()
    finally:
        session.close()

    body = client.get(f"/e/{page['slug']}").text
    assert "<h2>Organiser</h2>" not in body


# ---- the page: R11's two co-equal widths --------------------------------


def test_the_page_carries_both_a_phone_layout_and_a_desktop_layout(client, page):
    """**Ruling R11.** SP-E1-1's bar was "usable at 390px — that is the
    bar"; R11 makes the two widths co-equal, so the page carries its own
    scoped grid and a width breakpoint rather than one column forever.
    """
    body = client.get(f"/e/{page['slug']}").text
    # The phone half, retained verbatim from E1.
    assert 'name="viewport"' in body
    assert "font-size: 16px" in body
    # The desktop half, new.
    assert "@media (min-width:" in body
    assert "grid-template-columns" in body


def test_nothing_in_the_stylesheet_fixes_a_pixel_width(client, page):
    """The mechanical half of "no horizontal scrolling at 390px".

    A rule that pins a container to a pixel width is how a page acquires a
    sideways scrollbar on a phone, and it is the one class of mistake a
    text assertion can catch without a browser. Long unbroken strings —
    a pasted address, a URL in the regulations — are the other, and
    ``overflow-wrap`` is what stops them.
    """
    body = client.get(f"/e/{page['slug']}").text
    style = body.split("<style>")[1].split("</style>")[0]
    assert not re.search(r"[^-]width:\s*\d+px", style), "a fixed pixel width"
    assert "overflow-wrap" in style
    assert "max-width: 100%" in style


# ---- the form: gender filtering and its override (R12 / Q14 §5) ---------


def test_the_event_list_narrows_to_the_players_gender(client, page, entrant):
    """R12: the form filters eligible events by gender **by default**.

    The page has no script, so the narrowing is a server round trip the
    entrant asks for — which also means the filtered list is rendered by
    the same code that flags a mismatch, rather than by a second opinion
    written in JavaScript.
    """
    body = _refresh(client, page, gender="F", events=None).text
    assert _events_offered(body) == {page["ws"]}


def test_the_override_control_puts_every_event_back(client, page, entrant):
    """Q14 §5's explicit override path. The filter is a default, never a
    block: the research could verify no in-form eligibility refusal on the
    incumbent, and a hard block here would be the software making a
    director's judgment."""
    body = _refresh(client, page, gender="F", events=None, showAllEvents="on").text
    assert _events_offered(body) == {page["ms"], page["ws"]}
    assert "not usually open" in body


def test_an_event_already_chosen_is_never_hidden_by_the_filter(client, page, entrant):
    """The silent-drop guard. An entrant who ticks MS and then sets their
    gender to F must not have that tick disappear off the screen while it
    is still in the form — a selection that vanishes is exactly the silent
    drop R14 §4 refuses to make about caps."""
    body = _refresh(client, page, gender="F", events=[f"0:{page['ms']}"]).text
    assert page["ms"] in _events_offered(body)


def test_no_gender_chosen_yet_offers_every_event(client, page, entrant):
    """Negative control: with nothing to filter on the form hides nothing,
    and says which control narrows the list."""
    body = client.get(f"/e/{page['slug']}").text
    assert _events_offered(body) == {page["ms"], page["ws"]}
    assert "Update events" in body


def test_the_refresh_round_trip_writes_nothing(client, page, entrant):
    """Pressing "Update events" is not a submission and must not behave
    like one — no act, no entry, and no acknowledgment required to press
    it."""
    r = _refresh(client, page, gender="F")
    assert r.status_code == 200
    assert _submissions(page["tid"]) == []
    assert _entries(page["tid"]) == []


def test_the_refresh_keeps_what_the_entrant_already_typed(client, page, entrant):
    body = _refresh(
        client, page, playerName="Alice Chen", gender="F", club="Riverside BC"
    ).text
    assert 'value="Alice Chen"' in body
    assert 'value="Riverside BC"' in body


# ---- the form: the running total (R14 §1, Seam B's invariant) -----------


def _total_shown(body):
    match = re.search(r'data-total="(\d*)"', body)
    return int(match.group(1)) if match and match.group(1) else None


def test_the_running_total_is_shown_from_the_server_side_computation(
    client, page, entrant
):
    body = _refresh(
        client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"], showAllEvents="on"
    ).text
    assert _total_shown(body) == 5500
    assert "55.00" in body


def test_the_total_shown_is_the_total_recorded(client, page, entrant):
    """**Seam B's invariant, asserted end to end.** The running total is a
    *display* of ``services.entry_fees`` and never a second implementation
    of it: the number the entrant agreed to is the number stored on the
    submission."""
    selection = [f"0:{page['ws']}", f"0:{page['ms']}"]
    shown = _total_shown(_refresh(client, page, events=selection, showAllEvents="on").text)

    assert _submit(client, page, events=selection).status_code == 201
    assert _submissions(page["tid"])[0].fee_total_cents == shown


def test_the_total_covers_every_player_in_the_act(client, page, entrant):
    """Per-person pricing (R14 §1): two single-event children are two
    single-event prices, not one two-event price."""
    body = _refresh(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    ).text
    assert _total_shown(body) == 8000


def test_nothing_selected_shows_no_total_rather_than_zero(client, page, entrant):
    """``0.00`` would be a claim about money nobody made."""
    body = client.get(f"/e/{page['slug']}").text
    assert _total_shown(body) is None
    line = body.split('class="total"')[1].split("</p>")[0]
    assert "0.00" not in line
    assert "Select events" in line


# ---- the form: R12's field policy ---------------------------------------


def test_the_birth_year_field_is_absent_when_no_event_is_age_bracketed(
    client, page, entrant
):
    """R12: birth year is collected **only where an age-bracketed event
    requires it**. Two open singles events with no age band need nothing,
    and a field nobody needs is data minimization failing quietly (Q10).

    The input still exists as a hidden empty field, because the transport
    reads the player lists positionally and a block that dropped it would
    shift the next player's year onto the wrong person. What must be
    absent is the *question*.
    """
    body = client.get(f"/e/{page['slug']}").text
    assert "Birth year" not in body
    assert 'id="p0year"' not in body


def test_the_birth_year_field_appears_for_an_age_bracketed_event(
    client, page, entrant
):
    """Negative control, and the case the field exists for."""
    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryEvent(
                tournament_id=uuid.UUID(page["tid"]),
                code="U15BS",
                discipline="Under-15 Boys' Singles",
                entry_type="singles",
            )
        )
        session.commit()
    finally:
        session.close()

    body = client.get(f"/e/{page['slug']}").text
    assert 'name="birthYear"' in body
    assert "age" in body.lower()


def test_the_gender_field_is_required_and_the_club_field_is_not(client, page, entrant):
    body = client.get(f"/e/{page['slug']}").text
    assert re.search(r'name="gender"[^>]*required', body)
    assert not re.search(r'name="club"[^>]*required', body)


def test_the_acknowledgment_notice_names_the_public_entrant_list(
    client, page, entrant
):
    """Notice belongs at the point of consent, not in a policy page nobody
    opens (Q4)."""
    body = client.get(f"/e/{page['slug']}").text
    checkbox = body.split('name="acknowledged"')[1][:400]
    assert "entrant list" in checkbox


# ---- submit: the session gate (ruling R10) -------------------------------


def test_an_anonymous_submit_is_rejected(client, page):
    """**The inversion of E1's headline behavior.**

    SP-E1-1's ``test_a_valid_submission_lands_a_pending_entry`` proved a
    stranger could write here. R10 makes that a defect, so the assertion is
    replaced rather than deleted: the same request, refused, and nothing
    written at any level.
    """
    r = _submit(client, page)
    assert r.status_code == 401
    assert _entries(page["tid"]) == []
    assert _submissions(page["tid"]) == []


def test_the_same_submission_from_a_signed_in_entrant_succeeds(
    client, page, entrant
):
    """Negative control for the gate: one cookie is the only difference."""
    r = _submit(client, page)
    assert r.status_code == 201, r.text
    assert len(_entries(page["tid"])) == 1


def test_an_operator_session_does_not_authorize_a_submit(client, page):
    """Cross-principal, the direction that matters here: an ``app.*``
    operator session must not authorize a ``play.*`` write (spec Q13 §2).
    The operator cookie is real — the workspace fixture created it."""
    r = _submit(client, page, headers=CSRF)
    assert r.status_code in (401, 403)
    assert _submissions(page["tid"]) == []


def test_a_garbage_entrant_cookie_does_not_authorize_a_submit(client, page):
    from app.config import settings

    client.cookies.set(settings.entrant_session_cookie_name, "not-a-real-token")
    assert _submit(client, page).status_code == 401


# ---- submit: the form CSRF token ----------------------------------------


def test_a_submit_without_the_form_csrf_token_is_refused(client, page, entrant):
    """This write carries a session cookie and cannot send the custom
    header a native form post has no way to attach, so the form carries a
    double-submit token derived from the cookie instead. An attacker's page
    can make the browser send our cookie; it can never read it."""
    r = _submit(client, page, _csrf="")
    assert r.status_code == 403
    assert _submissions(page["tid"]) == []


def test_a_wrong_form_csrf_token_is_refused(client, page, entrant):
    r = _submit(client, page, _csrf="0" * 64)
    assert r.status_code == 403
    assert _submissions(page["tid"]) == []


def test_the_right_token_is_the_negative_control(client, page, entrant):
    assert _submit(client, page).status_code == 201


def test_the_token_is_bound_to_the_session_that_rendered_the_form(
    client, page, entrant
):
    """Logging out invalidates it, because it is a function of the session
    token rather than a value in a table someone has to remember to
    revoke."""
    stale = _csrf_token(client, page)
    client.post("/e/account/logout", headers=CSRF)
    client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert _submit(client, page, _csrf=stale).status_code == 403


# ---- submit: no challenge here any more (ruling R10) --------------------


def test_submit_requires_no_challenge_token(client, page, entrant):
    """Seam B's floor, restated: **Turnstile at signup, session at submit.**

    The five challenge-refusal and ordering tests that used to live here
    moved to ``tests/test_entrant_auth_routes.py`` with the challenge. A
    puzzle in front of a route that already requires an account charges
    every honest entrant to slow down an attacker who has already signed
    up.
    """
    r = _submit(client, page)
    assert r.status_code == 201


def test_the_page_carries_no_challenge_widget(client, page, entrant):
    body = client.get(f"/e/{page['slug']}").text
    assert "cf-turnstile" not in body


# ---- submit: what one act records ---------------------------------------


def test_a_valid_submission_lands_a_pending_entry_under_a_submission(
    client, page, entrant
):
    r = _submit(client, page)
    assert r.status_code == 201

    entries = _entries(page["tid"])
    submissions = _submissions(page["tid"])
    assert len(entries) == 1 and len(submissions) == 1
    assert entries[0].state == "pending"
    assert entries[0].submission_id == submissions[0].id
    assert entries[0].entry_player_id is not None


def test_the_player_carries_the_name_gender_and_remarks(client, page, entrant):
    """R12's field set, at the level R13 put it on."""
    from database.models import EntryPlayer
    from database.session import SessionLocal
    from sqlalchemy import select

    _submit(client, page, club="Riverside BC", birthYear="2011")
    session = SessionLocal()
    try:
        player = session.scalars(select(EntryPlayer)).one()
        assert player.full_name == "Alice Chen"
        assert player.gender == "F"
        assert player.club == "Riverside BC"
        assert player.birth_year == 2011
        assert player.remarks == "can't play before 6pm Saturday"
    finally:
        session.close()


def test_the_acknowledgment_is_recorded_on_the_submission_with_its_version(
    client, page, entrant
):
    """Q11, moved up a level by R13: one act, one agreement."""
    _submit(client, page)
    submission = _submissions(page["tid"])[0]
    assert submission.regulations_accepted_at is not None
    assert submission.regulations_version_accepted == 3


def test_the_fee_total_is_the_schedule_price_and_lives_on_the_submission(
    client, page, entrant
):
    """R14 §1 through the route. One event -> the first tier, recorded on
    the act rather than on each entry."""
    _submit(client, page)
    submission = _submissions(page["tid"])[0]
    assert submission.fee_total_cents == 4000
    assert submission.fee_basis["basis"] == "schedule"


def test_two_events_for_one_player_are_one_act_at_the_tiered_price(
    client, page, entrant
):
    r = _submit(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert r.status_code == 201

    assert len(_submissions(page["tid"])) == 1
    assert len(_entries(page["tid"])) == 2
    assert _submissions(page["tid"])[0].fee_total_cents == 5500


def test_two_players_in_one_act_share_one_acceptance_and_one_total(
    client, page, entrant
):
    """The case R13 built the submission level for: a parent entering two
    children in one sitting."""
    r = _submit(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        club=["", ""],
        birthYear=["", ""],
        remarks=["", ""],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    )
    assert r.status_code == 201, r.text

    assert len(_submissions(page["tid"])) == 1
    entries = _entries(page["tid"])
    assert len(entries) == 2
    assert len({e.entry_player_id for e in entries}) == 2
    # Per-person pricing: two single-event players, not one two-event one.
    assert _submissions(page["tid"])[0].fee_total_cents == 8000


def test_an_empty_second_player_block_is_ignored_not_refused(client, page, entrant):
    r = _submit(
        client,
        page,
        playerName=["Alice Chen", ""],
        gender=["F", ""],
        events=[f"0:{page['ws']}"],
    )
    assert r.status_code == 201
    assert len(_entries(page["tid"])) == 1


def test_the_success_page_lists_every_entry_of_the_act_and_the_total(
    client, page, entrant
):
    r = _submit(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert "WS" in r.text and "MS" in r.text
    assert "55.00" in r.text


def test_the_success_page_carries_no_manage_code(client, page, entrant):
    """R10 retired the capability token. Managing an entry is login-gated
    'my entries', which E2 builds; nothing here mints, stores or prints a
    credential."""
    r = _submit(client, page)
    assert "Keep this code" not in r.text
    assert "data-manage-token" not in r.text


def test_the_public_module_mints_no_capability_material_at_all(client, page):
    """The deletion guard for the manage-token path (R10 / Q13 §6).

    The success-page card and the column are gone, and the two tests above
    and in ``test_entries_desk_routes.py`` pin their absence from the
    *output*. This pins the absence of the *mint*: E1 called
    ``secrets.token_urlsafe`` here to create the token it printed once, and
    a capability that is never minted cannot be leaked by a renderer added
    later. ``secrets`` itself stays imported — for ``compare_digest`` on the
    form CSRF token, which is a comparison, not a credential.
    """
    import inspect

    from api import entries_public

    source = inspect.getsource(entries_public)
    assert "token_urlsafe" not in source
    assert "token_bytes" not in source
    assert "token_hex" not in source


def test_the_success_page_points_at_my_entries_without_pretending_it_exists(
    client, page, entrant
):
    """R10's replacement is an account, not another code. The success state
    says where the entry lives — and does **not** link a page this slice
    did not build, because a dead link is a worse answer than a sentence."""
    r = _submit(client, page)
    assert "my entries" in r.text
    assert 'href="/e/account' not in r.text


def test_the_entry_lands_under_the_tournament_the_slug_resolves_to(
    client, page, entrant
):
    _submit(client, page)
    assert str(_entries()[0].tournament_id) == page["tid"]


# ---- submit: the acknowledgment -----------------------------------------


def test_submission_without_the_acknowledgment_is_refused(client, page, entrant):
    r = _submit(client, page, acknowledged=None)
    assert r.status_code == 400
    assert "accept the regulations" in r.text
    assert _submissions(page["tid"]) == []


def test_the_same_submission_with_the_box_ticked_succeeds(client, page, entrant):
    assert _submit(client, page).status_code == 201


# ---- submit: the throttle ------------------------------------------------


def test_a_flood_from_one_ip_is_locked_out(client, page, entrant, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 3)
    for _ in range(3):
        _submit(client, page)
    r = _submit(client, page)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "AUTH_THROTTLED"


def test_under_the_budget_nothing_is_locked(client, page, entrant, monkeypatch):
    """Negative control for the lockout."""
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 50)
    for _ in range(4):
        assert _submit(client, page).status_code == 201


def test_the_throttle_bucket_is_its_own_namespace():
    """An entry flood must not lock a venue out of *signing in*."""
    from services import auth as auth_service

    assert auth_service.entries_key("1.2.3.4").startswith("entry:")
    assert auth_service.registration_key("1.2.3.4").startswith("reg:")
    assert auth_service.entrant_signup_key("1.2.3.4").startswith("esignup:")
    assert (
        len({
            auth_service.entries_key("1.2.3.4"),
            auth_service.registration_key("1.2.3.4"),
            auth_service.entrant_signup_key("1.2.3.4"),
        })
        == 3
    )


# ---- submit: idempotency at the submission level (D4 / R13) -------------


def test_a_replayed_key_returns_the_original_act_and_creates_nothing(
    client, page, entrant
):
    """R13 moved the key up a level, so the claim moved with it: the reply
    is the original submission **and all of its entries**, never a partial
    re-creation."""
    first = _submit(
        client,
        page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        headers={"Idempotency-Key": "key-1"},
    )
    assert first.status_code == 201

    second = _submit(
        client,
        page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        headers={"Idempotency-Key": "key-1"},
    )
    assert second.status_code == 200
    assert len(_submissions(page["tid"])) == 1
    assert len(_entries(page["tid"])) == 2


def test_a_replay_answers_with_the_same_reference(client, page, entrant):
    first = _submit(client, page, headers={"Idempotency-Key": "key-1"})
    second = _submit(client, page, headers={"Idempotency-Key": "key-1"})
    reference = str(_submissions(page["tid"])[0].id)
    assert reference in first.text
    assert reference in second.text


def test_a_different_key_creates_a_second_act(client, page, entrant):
    """Negative control: the key dedups, not the content. Two identical
    entries are legitimate (Q12) and must not be swallowed."""
    _submit(client, page, headers={"Idempotency-Key": "key-1"})
    _submit(client, page, headers={"Idempotency-Key": "key-2"})
    assert len(_submissions(page["tid"])) == 2


def test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to(
    client, page, entrant
):
    """Ruling D4, one level up. A key used in another workspace must not
    resolve here — a global lookup on a route anyone with a poster URL can
    reach is a cross-tenant disclosure vector."""
    from database.models import EntrantAccount, EntryPage, Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    other_tid = client.post(
        "/tournaments", json={"name": "Autumn Open"}, headers=CSRF
    ).json()["id"]
    session = SessionLocal()
    try:
        account = session.scalars(select(EntrantAccount).limit(1)).one()
        session.add(
            EntryPage(tournament_id=uuid.UUID(other_tid), slug="autumn", is_open=True)
        )
        session.add(
            Submission(
                tournament_id=uuid.UUID(other_tid),
                account_id=account.id,
                idempotency_key="shared",
            )
        )
        session.commit()
    finally:
        session.close()

    r = _submit(client, page, headers={"Idempotency-Key": "shared"})
    assert r.status_code == 201
    assert len(_submissions(page["tid"])) == 1


def test_a_key_is_scoped_to_the_account_that_minted_it(client, page, entrant, turnstile):
    """The disclosure the tenant-only scope left open (Phase 6 §4).

    Phase 6 mints the ``Idempotency-Key`` in the loader and carries it as a
    hidden field, so for the first time a real key travels. A second
    entrant posting a key they guessed must not be handed the first
    entrant's submission reference — the receipt names who entered what.

    ``201`` and a *second* submission is the whole answer: the guesser
    learns nothing, because a used key and an unused key look identical
    from outside.
    """
    assert _submit(client, page, headers={"Idempotency-Key": "key-1"}).status_code == 201
    mine = str(_submissions(page["tid"])[0].id)

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

    guessed = _submit(client, page, headers={"Idempotency-Key": "key-1"})

    assert guessed.status_code == 201
    assert mine not in guessed.text, "the guesser was handed the other entrant's receipt"
    assert len(_submissions(page["tid"])) == 2


# ---- submit: the soft flags ---------------------------------------------


def test_a_repeat_of_the_same_player_and_event_flags_the_new_entry(
    client, page, entrant
):
    """R7 preserved verbatim by R13, retargeted onto the player level: the
    email half of the old conjunction is gone, because one account is now
    *expected* to appear repeatedly."""
    _submit(client, page)
    _submit(client, page)

    entries = _entries(page["tid"])
    assert entries[0].pending_reasons == []
    assert "needs_review" in entries[1].pending_reasons


def test_a_second_player_under_one_account_is_not_flagged(client, page, entrant):
    """Negative control, and the case a hard unique index would have
    broken: one parent, two children."""
    _submit(client, page)
    _submit(client, page, playerName="Cleo Chen")
    assert _entries(page["tid"])[1].pending_reasons == []


def test_the_same_player_in_a_different_event_is_not_flagged(client, page, entrant):
    _submit(client, page)
    _submit(client, page, gender="M", events=[f"0:{page['ms']}"])
    assert _entries(page["tid"])[1].pending_reasons == []


def test_a_gender_mismatch_is_accepted_with_a_flag(client, page, entrant):
    """Q14 §5: accepted with an attention flag, **never refused**. The
    research could verify no in-form eligibility refusal on the incumbent,
    and a hard block here would be the software making a director's
    judgment."""
    r = _submit(client, page, events=[f"0:{page['ms']}"])
    assert r.status_code == 201
    assert "gender_mismatch" in _entries(page["tid"])[0].pending_reasons


def test_a_matching_gender_is_unflagged(client, page, entrant):
    """Negative control."""
    _submit(client, page)
    assert _entries(page["tid"])[0].pending_reasons == []


# ---- submit: entry policy (R14 §4) --------------------------------------


def test_over_the_per_person_cap_is_refused_with_the_rule_stated(
    client, page, entrant
):
    """Never a silent drop of the selections that did not fit."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    r = _submit(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert r.status_code == 400
    assert "at most 1 event" in r.text
    assert _submissions(page["tid"]) == []


def test_under_the_cap_is_accepted(client, page, entrant):
    """Negative control for the refusal above."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 2
        session.commit()
    finally:
        session.close()

    r = _submit(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert r.status_code == 201


# ---- submit: the event, and cross-tenant probing -------------------------


def test_an_event_from_another_workspace_is_refused_and_leaks_nothing(
    client, page, entrant
):
    from database.models import EntryEvent
    from database.session import SessionLocal

    other_tid = client.post(
        "/tournaments", json={"name": "Autumn Open"}, headers=CSRF
    ).json()["id"]
    session = SessionLocal()
    try:
        foreign = EntryEvent(
            tournament_id=uuid.UUID(other_tid),
            code="XS",
            discipline="Secret Event",
            entry_type="singles",
        )
        session.add(foreign)
        session.commit()
        foreign_id = str(foreign.id)
    finally:
        session.close()

    r = _submit(client, page, events=[f"0:{foreign_id}"])
    assert r.status_code == 400
    assert "Secret Event" not in r.text
    assert "Autumn Open" not in r.text
    assert _submissions(page["tid"]) == []


def test_an_event_of_this_workspace_is_the_negative_control(client, page, entrant):
    assert _submit(client, page).status_code == 201


def test_a_closed_event_is_refused(client, page, entrant):
    from datetime import datetime, timedelta, timezone

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page["ws"])))
        row.closes_at = datetime.now(timezone.utc) - timedelta(hours=1)
        session.commit()
    finally:
        session.close()

    r = _submit(client, page)
    assert r.status_code == 400
    assert "not taking entries" in r.text
    assert _submissions(page["tid"]) == []


def test_an_event_that_has_not_opened_yet_is_refused(client, page, entrant):
    from datetime import datetime, timedelta, timezone

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page["ws"])))
        row.opens_at = datetime.now(timezone.utc) + timedelta(days=1)
        session.commit()
    finally:
        session.close()

    assert _submit(client, page).status_code == 400


def test_a_submission_to_an_unknown_slug_is_the_uniform_404(client, page, entrant):
    r = client.post(
        "/e/no-such-page/submit",
        data={"playerName": "Alice", "gender": "F", "acknowledged": "on"},
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_a_submission_with_no_events_selected_is_refused(client, page, entrant):
    r = _submit(client, page, events=None)
    assert r.status_code == 400
    assert _submissions(page["tid"]) == []


def test_a_player_without_a_gender_is_refused(client, page, entrant):
    """R12 makes the field required, because MS/WD/XD filtering is
    impossible without it. The *match* stays soft; the field does not."""
    r = _submit(client, page, gender="")
    assert r.status_code == 400
    assert _submissions(page["tid"]) == []


def test_the_global_body_cap_applies_to_this_route_too(client, page, entrant):
    r = client.post(
        f"/e/{page['slug']}/submit",
        data={"playerName": "A", "gender": "F", "remarks": "x" * (5 * 1024 * 1024)},
    )
    assert r.status_code == 413


def test_a_body_just_under_the_cap_is_accepted_through_the_same_route(
    client, page, entrant
):
    """Negative control for the cap: the same route, a large-but-legal
    body, refused for a *content* reason rather than a size one."""
    r = _submit(client, page, remarks="x" * 1000)
    assert r.status_code == 201


# ---- registration --------------------------------------------------------


def test_both_public_routes_are_registered(client):
    from app.main import app

    paths = app.openapi()["paths"]
    assert "get" in paths["/e/{slug}"]
    assert "post" in paths["/e/{slug}/submit"]
