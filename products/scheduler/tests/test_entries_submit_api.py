"""The entrant write path: ``POST /e/api/submit/{slug}`` and ``/quote/{slug}``.

**Successor file to the write half of ``tests/test_entries_public_routes.py``**
(SP-PROGRAM-1 Phase 6, spec §8/§9). Submission *behaviour* is unchanged —
what moved is the serving context: the f-string HTML form is retired and
RR7 posts to a JSON route. Every test here names the test it supersedes in
``tests/test_entries_migration_parity.py``.

**Three substitutions, applied to every migrated test and no others:**

1. the CSRF token is read off ``GET /e/api/page/{slug}``'s
   ``viewer.formCsrf`` instead of scraped out of markup;
2. the URL is ``/e/api/submit/{slug}`` (or ``/e/api/quote/{slug}`` for what
   used to be the ``action=filter`` round trip);
3. the answer is a ``303`` to the receipt route rather than ``201``/``200``
   HTML — so "created" and "replayed" are no longer distinguishable by
   status, and the claims that rode on that distinction are asserted on the
   ``Location`` and on the stored rows instead.

**The idempotency key travels as a form field.** A native form cannot send
a header, so until this phase the column was NULL for every real entrant
and ``UNIQUE (tournament_id, account_id, idempotency_key)`` guarded nothing
anyone could hit. The loader mints the key and the form carries it, which
is what makes the account scope on ``services.submissions.replay`` load
bearing rather than theoretical.

**Three deviations from the task brief, all because the brief described a
route that is not the shipped one.**

* ``_receipt_id`` cannot be ``location.rsplit("/", 1)[-1]``. The route
  appends ``?totalCents=N`` (the receipt page is rendered by node, which
  holds no entrant credential and so cannot read the amount back), and the
  naive split returns ``"<uuid>?totalCents=5500"``. It is parsed with
  ``urlsplit`` instead — every replay assertion in this file depends on
  that id being the id.
* There is no ``test_the_custom_header_is_still_a_sufficient_proof_on_its_own``.
  The header is sufficient for the **middleware**, and that property is
  pinned where it lives, on the middleware, by
  ``test_form_csrf_channel.py::test_the_header_still_works_for_everyone``.
  It is *not* sufficient for this route, which layers its own
  ``require_form_csrf`` on top and demands the field regardless — so the
  assertion as briefed (``303``) cannot hold. The intent survives inverted
  and sharpened, as the route guard's own negative control:
  ``test_the_header_satisfies_the_middleware_but_not_the_route_guard``.
* The brief's break-it-to-prove-it recipe for
  ``test_a_submit_without_the_form_csrf_token_is_refused`` does not make it
  fail. Run, it stays green: two guards refuse that request identically and
  only removing both changes the answer. The corrected statement is in that
  test's own docstring rather than here, because a false mutation recipe is
  worse than none — it invites the next reader to conclude the control is
  broken when it is the recipe that is.

Two rows in the ledger are not in the brief's list of 47:
``test_a_non_ascii_form_token_is_a_refusal_and_not_a_500`` (the only test of
the route-owned CSRF guard, which every other CSRF row misses because the
middleware answers first) and
``test_a_key_is_scoped_to_the_account_that_minted_it`` (Task 13's, whose
successor is this file's foreign-key test). Both are write-path tests in the
old file that nothing else claims, so without the rows the cut-over would
delete them silently.

Fixtures are the same four as ``test_entries_page_api.py``, lifted from
``test_entries_public_routes.py``, so all three files exercise the same
workspace, schedule and events — a second fixture set would let the
surfaces drift and call it a passing suite.
"""
from __future__ import annotations

import json
import uuid
from urllib.parse import urlsplit

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
    fixture signs up for real and signup is where the challenge lives."""
    from services import turnstile as service

    def fake_post(url, fields, timeout):
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events."""
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


# ---- posting the form ----------------------------------------------------


def _csrf_token(client, page):
    """Read the form token off the loader projection.

    Deliberately fetched rather than recomputed: a test that recomputed the
    digest would pass even if the projection stopped emitting the field,
    and that field is the only thing that lets an unhydrated form post this
    write (channel two, ruling R8-B).
    """
    return client.get(f"/e/api/page/{page['slug']}").json()["viewer"]["formCsrf"]


def _apply(data, overrides):
    """Overrides onto a form body, where ``None`` means **omit the field**.

    A flat form post has no way to say "this input was not present" other
    than not sending it, and several tests here turn on exactly that
    difference — an empty ``gender`` is a refusal for a different reason
    than an absent one, and ``acknowledged=None`` is the whole
    acknowledgment test.
    """
    for key, value in overrides.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    return data


def _submit(client, page, **overrides):
    """A well-formed one-player, one-event submission."""
    headers = overrides.pop("headers", {})
    data = _apply(
        {
            "playerName": "Alice Chen",
            "gender": "F",
            "club": "",
            "birthYear": "",
            "remarks": "can't play before 6pm Saturday",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": _csrf_token(client, page),
        },
        overrides,
    )
    return client.post(
        f"/e/api/submit/{page['slug']}",
        data=data,
        headers=headers,
        follow_redirects=False,
    )


def _quote(client, page, **overrides):
    """Press "Update events and total" — session-gated by ruling R8-C, and
    calling the same ``check_policy`` and ``compute_fee_total`` the write
    calls, so the total shown is the total recorded."""
    return client.post(
        f"/e/api/quote/{page['slug']}",
        data=_apply(
            {
                "playerName": "Alice Chen",
                "gender": "F",
                "events": [f"0:{page['ws']}"],
                "_csrf": _csrf_token(client, page),
            },
            overrides,
        ),
    )


def _receipt_id(response):
    """The submission id out of the 303 ``Location`` — the POST/redirect/GET
    target that makes a reload safe to press.

    Parsed rather than split off the tail: the route appends
    ``?totalCents=N`` for the receipt page to display, so ``rsplit("/", 1)``
    returns the id *with the query string glued on*. Two such strings
    compare equal only when the totals match too, which would quietly turn
    every replay assertion below into a weaker claim than it reads as.
    """
    return urlsplit(response.headers["location"]).path.rsplit("/", 1)[-1]


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
        # the same tick, and this helper is indexed into ([0]) by tests that
        # make exactly that happen. ``id`` is the house tiebreaker.
        return list(
            session.scalars(stmt.order_by(Submission.submitted_at, Submission.id))
        )
    finally:
        session.close()


# ---- the quote route (R14 §1, Seam B's invariant) ------------------------


def test_the_quote_route_writes_nothing(client, page, entrant):
    """Asking for a total is not a submission and must not behave like one
    — no act, no entry, and no acknowledgment required to ask."""
    r = _quote(client, page)
    assert r.status_code == 200, r.text
    assert _submissions(page["tid"]) == []
    assert _entries(page["tid"]) == []


def test_the_quote_is_computed_server_side(client, page, entrant):
    r = _quote(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert r.json()["totalCents"] == 5500


def test_the_total_shown_is_the_total_recorded(client, page, entrant):
    """**Seam B's invariant, asserted end to end.** The quote is a *display*
    of ``services.entry_fees`` and never a second implementation of it: the
    number the entrant agreed to is the number stored on the submission."""
    selection = [f"0:{page['ws']}", f"0:{page['ms']}"]
    shown = _quote(client, page, events=selection).json()["totalCents"]

    assert _submit(client, page, events=selection).status_code == 303
    assert _submissions(page["tid"])[0].fee_total_cents == shown


def test_the_total_covers_every_player_in_the_act(client, page, entrant):
    """Per-person pricing (R14 §1): two single-event children are two
    single-event prices, not one two-event price."""
    r = _quote(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    )
    assert r.json()["totalCents"] == 8000


def test_nothing_selected_quotes_no_total_rather_than_zero(client, page, entrant):
    """``0`` would be a claim about money nobody made: a tournament that has
    configured no prices has not declared its entries free."""
    r = _quote(client, page, events=None)
    assert r.json()["totalCents"] is None


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


def test_the_same_submission_from_a_signed_in_entrant_succeeds(client, page, entrant):
    """Negative control for the gate: one cookie is the only difference."""
    r = _submit(client, page)
    assert r.status_code == 303, r.text
    assert len(_entries(page["tid"])) == 1


def test_an_operator_session_does_not_authorize_a_submit(client, page):
    """Cross-principal, the direction that matters here: an ``app.*``
    operator session must not authorize a ``play.*`` write (spec Q13 §2).

    The operator cookie is minted through the real routes. The old test's
    docstring claimed the workspace fixture created one; it does not —
    only ``POST /auth/login`` sets that cookie — so migrating it verbatim
    would have carried over a cross-principal test with no second principal
    in it. The header is sent so the CSRF middleware is satisfied and the
    refusal is unambiguously the *identity* seam's: ``get_current_entrant``
    reads the entrant cookie and has no bootstrap fallback, so an operator
    session is simply nobody here.

    ``401`` exactly, not the old test's ``in (401, 403)``. The wider
    assertion is satisfied by the route's *CSRF* guard, which also fires on
    this request (no entrant session means no token to present), so it
    passes even when the identity gate is removed entirely — verified: with
    ``entrant_or_back_to_form`` degraded to an optional lookup this test
    stayed green while its two neighbours went red.
    """
    client.post(
        "/auth/register",
        json={"email": "dana@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": "dana@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    from app.config import settings

    assert settings.session_cookie_name in client.cookies

    r = _submit(client, page, headers=CSRF)
    assert r.status_code == 401, r.text
    assert _submissions(page["tid"]) == []


def test_a_garbage_entrant_cookie_does_not_authorize_a_submit(client, page):
    """A forged session token is not a session.

    The header is sent for the same reason as above: without it the CSRF
    middleware refuses a cookie-carrying write *before* the route runs, and
    the test would pass on a 403 that says nothing about whether the
    session lookup rejects an unknown token.
    """
    from app.config import settings

    client.cookies.set(settings.entrant_session_cookie_name, "not-a-real-token")
    assert _submit(client, page, headers=CSRF).status_code == 401


# ---- submit: the form CSRF token (channel two, R8-B) ---------------------


def test_a_submit_without_the_form_csrf_token_is_refused(client, page, entrant):
    """Channel two, refused. This write carries a session cookie and an
    unhydrated form cannot attach the custom header, so the proof is a
    double-submit token derived from the cookie: an attacker's page can make
    the browser send our cookie, it can never read it.

    **This request is refused twice, and the task brief's mutation is
    wrong about which.** It claimed deleting ``csrf_middleware``'s
    ``form_csrf_proves`` clause makes this return 303. It does not:
    executed, that mutation leaves this green, because
    ``api/entries_json.require_form_csrf`` refuses the same request at the
    route with the same status and the same code. Deleting the route guard
    alone leaves it green for the mirror-image reason. Only removing
    **both** returns 303 — which is what was actually run, and is the
    honest statement of this claim: a missing token is refused by two
    independent guards, and neither is load-bearing alone *for this
    input*. Each is load-bearing for an input the other does not see, and
    those are pinned separately:
    ``test_the_header_satisfies_the_middleware_but_not_the_route_guard``
    for the route's, and ``test_form_csrf_channel.py`` for the
    middleware's.
    """
    r = _submit(client, page, _csrf="")
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions(page["tid"]) == []


def test_a_wrong_form_csrf_token_is_refused(client, page, entrant):
    r = _submit(client, page, _csrf="0" * 64)
    assert r.status_code == 403
    assert _submissions(page["tid"]) == []


def test_the_right_token_is_the_negative_control(client, page, entrant):
    """CODE_HEALTH 3b, the non-vacuity half: channel two is not dead. If this
    ever goes red the refusals above stop being evidence, because a route
    that refuses everything passes them."""
    assert _submit(client, page).status_code == 303


def test_the_token_is_bound_to_the_session_that_rendered_the_form(
    client, page, entrant
):
    """A token minted from a *different* session is refused. Logging out
    invalidates it because it is a function of the session token, not a row
    in a table someone has to remember to revoke."""
    stale = _csrf_token(client, page)
    client.post("/e/account/logout", headers=CSRF)
    client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert _submit(client, page, _csrf=stale).status_code == 403


def test_the_header_satisfies_the_middleware_but_not_the_route_guard(
    client, page, entrant
):
    """**Two guards, both live** — and the only test that reaches the second
    one on this route.

    Channel one satisfies ``csrf_middleware``, so the request reaches the
    route; ``api/entries_json.require_form_csrf`` then demands the field
    anyway. Every other CSRF test in this file is answered by the middleware
    before the route runs, so without this the route guard could be deleted
    outright and the suite would stay green.

    (This replaces the brief's
    ``test_the_custom_header_is_still_a_sufficient_proof_on_its_own``, which
    asserted 303 for this exact request. It cannot hold: the header is
    sufficient for the middleware, not for this route. That property is
    pinned on the middleware by
    ``test_form_csrf_channel.py::test_the_header_still_works_for_everyone``.)

    Break it to prove it is not vacuous: delete the ``require_form_csrf``
    call from ``submit_entry_json`` and this returns 303.
    """
    r = _submit(client, page, _csrf="", headers=CSRF)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions(page["tid"]) == []


def test_a_non_ascii_form_token_is_a_refusal_and_not_a_500(client, page, entrant):
    """``secrets.compare_digest`` raises ``TypeError`` on a ``str`` holding
    non-ASCII, so one accented character in the hidden field turns this
    guard into a 500 instead of a 403 — a denial-of-service primitive
    reachable by anyone with the poster URL. The header is what makes this
    the **route's** answer: the middleware channel is satisfied by it and
    never inspects the body.

    Break it to prove it is not vacuous: drop the ``.encode`` calls in
    ``require_form_csrf`` and this raises instead of answering.
    """
    r = _submit(client, page, _csrf="é", headers=CSRF)
    assert r.status_code == 403, r.text
    assert _submissions(page["tid"]) == []


def test_a_large_multi_player_body_still_parses_after_the_middleware(
    client, page, entrant
):
    """**The known implementation trap (spec §3).** Channel two reads an
    urlencoded body inside ``csrf_middleware``; Starlette consumes the
    request stream on read, so unless the receive channel is replayed the
    route sees an empty form — silent truncation, not a loud failure.

    Asserted on the stored rows and on the **tail** of the body, because a
    partial read loses ``remarks`` first: a status-only test would read the
    resulting 400 as "refused for a business reason" and shrug at it.

    Break it to prove it is not vacuous: remove the ``await request.body()``
    replay from ``form_csrf_proves`` and this fails with zero entries
    written rather than with an error.
    """
    from database.models import EntryPlayer
    from database.session import SessionLocal
    from sqlalchemy import select

    r = _submit(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        club=["Riverside BC", "Riverside BC"],
        birthYear=["", ""],
        remarks=["x" * 2000, "y" * 2000],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    )
    assert r.status_code == 303, r.text
    assert len(_entries(page["tid"])) == 2

    session = SessionLocal()
    try:
        remarks = sorted(
            row.remarks
            for row in session.scalars(select(EntryPlayer))
        )
    finally:
        session.close()
    assert remarks == ["x" * 2000, "y" * 2000]


# ---- submit: no challenge here any more (ruling R10) --------------------


def test_submit_requires_no_challenge_token(client, page, entrant):
    """Seam B's floor, restated: **Turnstile at signup, session at submit.**

    The five challenge-refusal and ordering tests that used to live here
    moved to ``tests/test_entrant_auth_routes.py`` with the challenge. A
    puzzle in front of a route that already requires an account charges
    every honest entrant to slow down an attacker who has already signed up.
    """
    assert _submit(client, page).status_code == 303


# ---- submit: what one act records ---------------------------------------


def test_a_valid_submission_lands_a_pending_entry_under_a_submission(
    client, page, entrant
):
    r = _submit(client, page)
    assert r.status_code == 303

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
    assert r.status_code == 303

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
    assert r.status_code == 303, r.text

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
    assert r.status_code == 303
    assert len(_entries(page["tid"])) == 1


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
    assert _submit(client, page).status_code == 303


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
        assert _submit(client, page).status_code == 303


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
    """R13 moved the key up a level, so the claim moved with it: the reply is
    the original submission **and all of its entries**, never a partial
    re-creation. Phase 6 is the first release in which a real entrant's key
    is non-NULL at all — a native form cannot send a header, so the key is
    minted in the loader and carried as a field.

    Both answers are 303 now, so "created" and "replayed" are no longer
    distinguishable by status — which is the point (a retrying client that
    saw a different answer would conclude its first attempt had failed).
    The claim rides on the row counts instead.
    """
    first = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        idempotencyKey="key-1",
    )
    assert first.status_code == 303, first.text

    second = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        idempotencyKey="key-1",
    )
    assert second.status_code == 303
    assert len(_submissions(page["tid"])) == 1
    assert len(_entries(page["tid"])) == 2


def test_a_replay_redirects_to_the_same_receipt(client, page, entrant):
    first = _submit(client, page, idempotencyKey="key-1")
    second = _submit(client, page, idempotencyKey="key-1")
    reference = str(_submissions(page["tid"])[0].id)
    assert _receipt_id(first) == reference
    assert _receipt_id(second) == reference


def test_the_unique_index_is_reachable_for_the_first_time(client, page, entrant):
    """``UNIQUE (tournament_id, account_id, idempotency_key)`` has never been
    exercised by a real entrant: the retired form could not send a header, so
    the column was always NULL outside tests. The loader now mints the key
    and the form carries it, so the constraint is live — and the row it
    protects is the one written.

    Break it to prove it is not vacuous: drop the body fallback from
    ``submit_entry_json``'s ``key = idempotency_key or ...`` and this fails
    with ``None``.
    """
    r = _submit(client, page, idempotencyKey="key-1")
    assert r.status_code == 303
    assert _submissions(page["tid"])[0].idempotency_key == "key-1"


def test_a_different_key_creates_a_second_act(client, page, entrant):
    """Negative control: the key dedups, not the content. Two identical
    entries are legitimate (Q12) and must not be swallowed."""
    _submit(client, page, idempotencyKey="key-1")
    _submit(client, page, idempotencyKey="key-2")
    assert len(_submissions(page["tid"])) == 2


def test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to(client, page, entrant):
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

    r = _submit(client, page, idempotencyKey="shared")
    assert r.status_code == 303
    assert len(_submissions(page["tid"])) == 1


def test_a_foreign_idempotency_key_does_not_resolve_to_someone_elses_receipt(
    client, page, entrant, turnstile
):
    """**The disclosure this phase makes live** (spec §4).
    ``services.submissions.replay`` scoped by ``(tournament_id, key)`` only,
    so a *guessed* key returned another entrant's submission — its
    reference, its entries, its total. Latent while real keys were always
    NULL; Phase 6 mints them, so it is live now.

    ``303`` to a *different* receipt and a *second* submission is the whole
    answer: the guesser learns nothing, because a used key and an unused key
    look identical from outside.

    Break it to prove it is not vacuous: drop ``account_id`` from the
    ``where`` clause in ``find_by_idempotency_key`` and this fails with the
    second entrant redirected to the first entrant's receipt.
    """
    first = _submit(client, page, idempotencyKey="guessable-key")
    victim_receipt = _receipt_id(first)

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

    second = _submit(client, page, playerName="Dara Vo", idempotencyKey="guessable-key")

    assert second.status_code == 303, second.text
    assert _receipt_id(second) != victim_receipt
    assert len(_submissions(page["tid"])) == 2


def test_a_replay_under_the_same_account_still_resolves(client, page, entrant):
    """Non-vacuity control for the scoping above: the tightening must not
    have turned every replay into a fresh act, which would be a silent
    double-charge on a retried submit."""
    first = _submit(client, page, idempotencyKey="key-1")
    second = _submit(client, page, idempotencyKey="key-1")
    assert _receipt_id(first) == _receipt_id(second)
    assert len(_submissions(page["tid"])) == 1


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
    """Negative control, and the case a hard unique index would have broken:
    one parent, two children."""
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
    assert r.status_code == 303
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
    assert r.status_code == 303


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
    assert _submit(client, page).status_code == 303


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
        "/e/api/submit/no-such-page",
        data={
            "playerName": "Alice",
            "gender": "F",
            "acknowledged": "on",
            "_csrf": _csrf_token(client, page),
        },
        follow_redirects=False,
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_a_submission_with_no_events_selected_is_refused(client, page, entrant):
    r = _submit(client, page, events=None)
    assert r.status_code == 400
    assert _submissions(page["tid"]) == []


def test_a_player_without_a_gender_is_refused(client, page, entrant):
    """R12 makes the field required, because MS/WD/XD filtering is impossible
    without it. The *match* stays soft; the field does not."""
    r = _submit(client, page, gender="")
    assert r.status_code == 400
    assert _submissions(page["tid"]) == []


def test_the_global_body_cap_applies_to_this_route_too(client, page, entrant):
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={"playerName": "A", "gender": "F", "remarks": "x" * (5 * 1024 * 1024)},
        follow_redirects=False,
    )
    assert r.status_code == 413


def test_a_body_just_under_the_cap_is_accepted_through_the_same_route(
    client, page, entrant
):
    """Negative control for the cap: the same route, a large-but-legal body,
    accepted rather than refused for its size."""
    r = _submit(client, page, remarks="x" * 1000)
    assert r.status_code == 303
