"""Channel two: a cookie-derived double-submit token, checked by the
middleware rather than by a route.

SP-PROGRAM-1 Phase 6, ruling R8-B. Until now a write proved it was sent
deliberately in exactly one way — the ``X-ShuttleWorks-CSRF`` header — and
the one surface that cannot send a header (a native ``<form method=post>``
on a page with no script) was let through by a path regex in
``app/main.py`` and made to prove itself inside the route. A path-based
exemption is a hole that grows; a second **enumerated** channel is a
property every write is measured against. This file asserts the channel,
in both directions and on both secrets:

- the **session-derived** token, for a signed-in entrant write;
- the **pre-session** token derived from ``sw_play_csrf``, for the login
  and signup posts that carry no session at all.

Every refusal here is paired with the same request succeeding, because a
403 proves nothing on a route that refuses everything.

**And one claim that is not about CSRF at all.** Channel two reads an
urlencoded body inside the middleware, and Starlette consumes a request
stream on read: without an explicit replay the downstream route sees an
*empty* form. That failure is silent and size-independent in the worst
way — a two-field probe can look fine while a real multi-player family
submission arrives blank. So the last section posts a genuinely large
multi-player entry through the middleware and asserts every player still
lands in the database.
"""
from __future__ import annotations

import json
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
FORM = {"Content-Type": "application/x-www-form-urlencoded"}
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

    monkeypatch.setattr(
        service, "_post", lambda url, fields, timeout: json.dumps({"success": True})
    )


@pytest.fixture
def entrant(client, turnstile):
    """A signed-in entrant, through the real routes — the session cookie
    this file derives tokens from has to be a real one."""
    from app.config import settings

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
    r = client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    return r.cookies[settings.entrant_session_cookie_name]


def _token_for(secret: str) -> str:
    from app.form_csrf import form_csrf_token

    return form_csrf_token(secret)


# ---- the session-derived channel ---------------------------------------


def test_a_form_write_with_a_session_and_no_csrf_field_is_refused(client, entrant):
    """Negative control #2, first half (spec section 3). The cookie is
    real and the route is real; the only thing missing is the proof."""
    r = client.post("/e/account/logout", data={}, headers=FORM)

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_csrf_field_minted_from_a_different_session_is_refused(client, entrant):
    """Negative control #2, second half. A token is only proof if it is
    proof of *this* caller's cookie — a valid-looking digest computed from
    somebody else's session must not pass, or the channel degrades to
    "presented a 64-character hex string"."""
    foreign = _token_for("a-different-entrants-session-token")

    r = client.post("/e/account/logout", data={"_csrf": foreign}, headers=FORM)

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_matching_csrf_field_is_accepted(client, entrant):
    """**Negative control #3 — non-vacuity.** The same write, the same
    cookie, the same route, differing only in a correct token: accepted.
    Without this the two refusals above would pass just as well against a
    channel that was never wired up at all.

    **The accepted answer is a 303, not the 204 this asserted before Phase 6
    Task 12** — that task taught ``/e/account/logout`` to answer an
    urlencoded post the way a browser needs, which is a redirect. Only the
    *value* moved; what this test guards did not, and the assertions below
    make the acceptance claim stronger than a status line did: the session
    is really gone. ``follow_redirects=False`` because otherwise the client
    chases the 303 to ``GET /e/account/login``, which no route serves, and
    the test reports that route's 405 instead of this route's answer.
    """
    r = client.post(
        "/e/account/logout",
        data={"_csrf": _token_for(entrant)},
        headers=FORM,
        follow_redirects=False,
    )

    assert r.status_code == 303, r.text
    assert client.get("/e/account/me").status_code == 401


def test_a_json_body_cannot_carry_the_second_channel(client, entrant):
    """The channel is a form field, not a JSON key. Reading a body to look
    for a token on every cookie-carrying write would be a cost paid by the
    whole API for one surface; the urlencoded content type is the gate."""
    r = client.post("/e/account/logout", json={"_csrf": _token_for(entrant)})

    assert r.status_code == 403


# ---- the pre-session channel (the gap R8-B closes) ---------------------

# A nonce exactly as the SSR tier mints it (``entrant/app/lib/formCsrf.
# server.ts``): 32 random bytes, base64url. A literal here rather than a
# call, because after ruling R8-D the backend does not mint this cookie at
# all — node does, on the SSR document response — and ``issue_play_csrf``
# was deleted as the dead code it had always been. What the backend still
# owns, and what these tests exercise, is the VERIFICATION half.
_NONCE = "vJ8s0rQ2mF7pL4xW1kZ6bN3dT9gY5hC0aE8uI2oP7sM"



def test_a_login_post_carrying_the_nonce_and_no_token_is_refused(client):
    """The pre-session gap, now closed. Before this, a login post carried
    no session, so ``form_csrf_token`` had nothing to derive from and the
    middleware never even looked at the request."""
    from app.form_csrf import PLAY_CSRF_COOKIE

    client.cookies.set(PLAY_CSRF_COOKIE, _NONCE)

    r = client.post(
        "/e/account/login",
        data={"email": "parent@example.com", "password": GOOD_PW},
        headers=FORM,
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_login_post_with_the_nonce_token_reaches_the_route(client):
    """Non-vacuity for the pre-session half: reaching the route *is* the
    outcome under test — the middleware let it past, which a 403 would not
    have.

    **The reached answer is a 401, not the 422 this asserted before Phase 6
    Task 12.** The old value was a statement about a limitation, spelled out
    in the assertion's own comment: "the route declares a JSON body", so an
    urlencoded post could only ever be a validation error. Task 12 removed
    exactly that limitation, so the body now parses and the route answers
    what it has always answered for an address that was never registered.
    A 401 is a *stronger* witness than the 422 was — it proves the request
    reached the credential check, not merely the body parser.
    """
    from app.form_csrf import PLAY_CSRF_COOKIE, form_csrf_token

    client.cookies.set(PLAY_CSRF_COOKIE, _NONCE)
    token = form_csrf_token(_NONCE)

    r = client.post(
        "/e/account/login",
        data={"email": "parent@example.com", "password": GOOD_PW, "_csrf": token},
        headers=FORM,
    )

    assert r.status_code == 401, r.text
    assert r.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"


# ---- operator containment ----------------------------------------------


def _sign_in_an_operator(client) -> None:
    """A REAL operator session, minted through the real routes, left in the
    same jar as the entrant's — the R8-A same-origin collision, built rather
    than imagined."""
    from app.config import settings

    assert (
        client.post(
            "/auth/register",
            json={"email": "director@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 201
    )
    r = client.post(
        "/auth/login",
        json={"email": "director@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    assert client.cookies.get(settings.session_cookie_name), "no operator cookie set"


def test_a_live_operator_session_is_never_rescued_by_channel_two(client, entrant):
    """**The blast-radius bound.** Channel two exists for a surface that
    cannot send a header. The operator SPA can and does, so a request the
    operator cookie *signs in* must prove itself the operator's way —
    always, and regardless of what else is in the jar. Same origin (R8-A)
    means both cookies can ride one request; this is the line that stops a
    proof minted for the entrant tier from authorizing an operator write.

    **The bound is on the session, not on the cookie name** (the 2026-08-10
    browser pass). It used to be enough to *set* ``sw_session`` to any
    string; see the test below for what that cost. What is asserted here is
    the property that actually matters and it is asserted more strongly than
    before: this session is one ``resolve_session`` accepts, so the write is
    genuinely operator-authenticated, and channel two still refuses it.
    """
    _sign_in_an_operator(client)

    r = client.post(
        "/e/account/logout", data={"_csrf": _token_for(entrant)}, headers=FORM
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_dead_operator_cookie_does_not_lock_the_entrant_out(client, entrant):
    """**The regression.** Presence-checking the operator cookie made *any*
    string named ``sw_session`` — a stale cookie from a DB reset, a logged-out
    one the browser still holds, a value a cross-site page planted — disable
    the only CSRF channel a scriptless form has. Every entrant login, signup,
    logout and submission then answered 403 as raw JSON, for any director who
    had ever signed into the console in that browser.

    The cookie below authenticates nobody: no ``auth_sessions`` row hashes to
    it. So it names no operator, bounds no blast radius, and must not be
    allowed to speak for one.
    """
    from app.config import settings

    client.cookies.set(settings.session_cookie_name, "not-a-session-anybody-holds")

    r = client.post(
        "/e/account/logout",
        data={"_csrf": _token_for(entrant)},
        headers=FORM,
        follow_redirects=False,
    )

    assert r.status_code == 303, r.text
    assert client.get("/e/account/me").status_code == 401


def test_the_header_still_works_for_everyone(client, entrant):
    """Channel one is untouched: adding a channel must not cost the one
    that already carries the whole SPA."""
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204


def test_a_cookieless_write_is_still_never_checked(client):
    """The trigger widened to include the nonce, not to include everything.
    A request with no relevant cookie at all is still untouched — that is
    what keeps bearer clients and the local bootstrap flow working."""
    client.cookies.clear()
    r = client.post(
        "/auth/register",
        json={"email": "someone@example.com", "password": GOOD_PW},
    )
    assert r.status_code == 201


# ---- the body the middleware read has to still be there ----------------
#
# The trap this section exists for: ``Request.form()`` drains the receive
# channel, and ``BaseHTTPMiddleware`` forwards what is left. Read the body
# for a token without replaying it and every urlencoded route downstream
# gets an empty form — no exception, no log, just a submission with nobody
# in it. The assertion is therefore on the *stored rows*, not on a status
# code: a truncated body reaches ``services.entry_form.parse_players`` as
# zero players and comes back as a 400, which a status-only test would read
# as "refused for a business reason" and shrug at.


@pytest.fixture
def page(client):
    """A workspace with an open entry page and one open event."""
    created = client.post("/tournaments", json={"name": "Spring Open"}, headers=CSRF)
    tid = created.json()["id"]

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
                regulations_text="Play fair.",
                waiver_required=True,
                regulations_version=1,
            )
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            fee_cents=1500,
        )
        session.add(ws)
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ws": str(ws.id)}
    finally:
        session.close()


def _rendered_csrf(client, page) -> str:
    """Read the token off the real projection rather than recompute it — a
    recomputed digest would pass even if the surface stopped emitting one.

    It used to scrape a hidden field out of the FastAPI-rendered page; the
    Phase 6 cut-over deleted that page, and the field it emitted is now
    minted by the RR7 loader from this same projection value.
    """
    return client.get(f"/e/api/page/{page['slug']}").json()["viewer"]["formCsrf"]


# The payload is deliberately far larger than any probe a middleware test
# would otherwise use. Eight players, each with the maximum-length remarks
# a phone keyboard can actually produce, is ~20 KB of urlencoded body —
# comfortably past a single ASGI chunk and past anything a truncating
# implementation could accidentally get right.
_PLAYERS = 8
_REMARK = "cannot play before six on saturday because of the school run; " * 40


def test_a_large_multi_player_submission_survives_the_middleware_body_read(
    client, page, entrant
):
    """**The replay proof.** The middleware reads this body looking for a
    token; the route then reads the same body for eight players. Both must
    see all of it.

    Asserted on rows rather than on a status code, and with the whole
    remarks text checked for every player, because the interesting failure
    is a body that arrives *partially*: the first fields present, the tail
    gone.
    """
    from database.models import EntryPlayer
    from database.session import SessionLocal
    from sqlalchemy import select

    token = _rendered_csrf(client, page)
    assert token, "the page did not render a CSRF field — fixture is wrong"

    data = {
        "playerName": [f"Player Number {i}" for i in range(_PLAYERS)],
        "gender": ["F"] * _PLAYERS,
        "club": [f"Club {i}" for i in range(_PLAYERS)],
        "birthYear": ["2009"] * _PLAYERS,
        "remarks": [_REMARK] * _PLAYERS,
        "events": [f"{i}:{page['ws']}" for i in range(_PLAYERS)],
        "acknowledged": "on",
        "_csrf": token,
    }

    r = client.post(
        f"/e/api/submit/{page['slug']}", data=data, follow_redirects=False
    )

    assert r.status_code == 303, r.text[:2000]

    session = SessionLocal()
    try:
        players = list(
            session.scalars(select(EntryPlayer).order_by(EntryPlayer.full_name))
        )
    finally:
        session.close()

    assert [p.full_name for p in players] == [
        f"Player Number {i}" for i in range(_PLAYERS)
    ]
    # The tail of the body, not just its head: ``remarks`` is the last
    # repeated field before the token, so a truncated read loses it first.
    assert all(p.remarks == _REMARK.strip()[:2000] for p in players)


def test_a_large_round_trip_that_writes_nothing_also_keeps_its_body(
    client, page, entrant
):
    """The replay on the **non-writing** path, which is the one an entrant
    actually hits most.

    "Update events and total" is the same large form posted to the quote
    route: the page runs no script, so the only way the event list and the
    running total can react to what was typed is a server round trip.

    **The witness changed shape with the route, and got no weaker.** On the
    retired HTML surface this posted ``action=filter`` and asserted all
    eight names came back in the re-rendered form. The quote route answers
    JSON and echoes nothing — the RR7 tier does the echoing — so the
    witness is the *price*: eight one-event players at 1500 each is 12000,
    and a body truncated anywhere returns a smaller number. That is still
    an independent check that the middleware's read did not eat the
    request, on a path with no database row to inspect afterwards.
    """
    data = {
        "playerName": [f"Player Number {i}" for i in range(_PLAYERS)],
        "gender": ["F"] * _PLAYERS,
        "remarks": [_REMARK] * _PLAYERS,
        "events": [f"{i}:{page['ws']}" for i in range(_PLAYERS)],
        "_csrf": _rendered_csrf(client, page),
    }

    r = client.post(f"/e/api/quote/{page['slug']}", data=data)

    assert r.status_code == 200, r.text[:2000]
    assert r.json()["totalCents"] == 1500 * _PLAYERS


def test_an_unreadable_body_is_a_refusal_and_not_a_500(client, entrant, monkeypatch):
    """**Fail closed on the path that cannot answer.** A body the parser
    chokes on — or a client that vanished mid-upload — yields no proof.
    The channel must read that as "not proven" and refuse; an exception
    escaping the security middleware would be a 500, which is a worse
    answer than a 403 and, worse, is the shape that tempts someone to
    "fix" it by letting the request through."""
    from starlette.requests import Request as StarletteRequest

    async def explode(self, *args, **kwargs):
        raise RuntimeError("malformed body")

    monkeypatch.setattr(StarletteRequest, "form", explode)

    r = client.post(
        "/e/account/logout", data={"_csrf": _token_for(entrant)}, headers=FORM
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_non_ascii_csrf_field_is_a_refusal_and_not_a_500(client, entrant):
    """The other half of fail-closed, and the half that is reachable from a
    cross-site page.

    ``secrets.compare_digest`` raises ``TypeError`` on a ``str`` containing
    non-ASCII — it is a bytes-or-ASCII-str API. A single accented character
    in the hidden field is therefore enough to turn the security middleware
    into a 500 for any browser holding an entrant cookie, which an attacker
    can trigger without reading anything. It fails closed, so it is not an
    authorization hole; it is still a denial-of-service primitive handed
    out for free, and it falsifies this module's stated "never raises"
    contract.
    """
    r = client.post("/e/account/logout", data={"_csrf": "é"}, headers=FORM)

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
