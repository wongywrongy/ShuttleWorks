"""Two principals, two credentials, and no path between them.

SP-E1-2 Phase B, task B6 (rule 4's cross-principal control, both
directions; rulings D-A2/D-A3).

The entrant principal is only safe if a session means exactly one kind of
caller. Two failures are possible and they are not the same:

1. **An operator session authorizing an entrant action.** Mild on its own
   — a director acting as an entrant is a product oddity, not an
   escalation — but it is the same defect as (2) seen from the other end,
   and a design that permits it has no property to appeal to.
2. **An entrant session authorizing an operator action.** This is the real
   one, and the Phase A audit named the two concrete routes: `POST
   /tournaments` (an entrant would create and *own* a workspace) and
   `POST /invites/{token}/accept` (an entrant holding a leaked invite link
   would become a member of somebody's event). Both sit outside
   `tests/test_tenant_isolation.py`'s reach, because neither carries a
   `{tournament_id}` path parameter — which is precisely why ruling D-A2
   put entrants in their own table instead of `users`: not "the resolver
   checks a discriminator on 27 untested routes", but "an entrant has no
   row shape that `tournament_members` could hold".

**Every assertion here is a refusal, so every one is paired with a
control.** A 401 proves nothing unless the same cookie authorizes
something — otherwise the test passes just as well against a broken
login. So each direction asserts the refusal *and* shows the credential
working on its own surface, in the same test where possible.

The last test is the derived one: it sweeps every route in the OpenAPI
document with an entrant cookie in the jar and requires all of them —
except the public surface and the entrant's own whoami — to refuse. Three
examples cover the routes we thought of; the sweep covers the ones a
later slice adds.
"""
from __future__ import annotations

import json

import pytest

from tests.test_auth_surface import (
    OPS_TOKEN_GATED,
    PUBLIC_BY_DESIGN,
    _concrete,
    _routes,
)

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"

SIGNUP = "/e/account/signup"
LOGIN = "/e/account/login"
ME = "/e/account/me"

# Reachable *with an entrant cookie* and correctly so: everything an
# anonymous caller may reach (that list is reviewed in test_auth_surface),
# plus the one route the entrant credential is actually for.
ENTRANT_REACHABLE = (
    set(PUBLIC_BY_DESIGN)
    | OPS_TOKEN_GATED
    | {("GET", ME)}
    # SP-P7 §3.1: the entrant's own record — the second route the entrant
    # credential exists for. Like /e/account/me it declares
    # ``get_current_entrant`` itself and reads nothing but the session's
    # own account; an operator cookie on it is refused by the same
    # two-seams construction this file exists to hold.
    | {("GET", "/e/api/me/entries")}
    # SP-E1-2 Phase C: submit left PUBLIC_BY_DESIGN when it acquired the
    # session gate, so it has to be named here instead — a logged-in
    # entrant reaching the route their credential exists for is the
    # intended outcome, not an escalation. The sweep below would in fact
    # tolerate it either way (a random-uuid slug answers the uniform 404,
    # which counts as a refusal), which is exactly why it is written down.
    #
    # Phase 6's cut-over moved the address (``POST /e/{slug}/submit`` is
    # gone) and added the quote route beside it: "Update events and total"
    # is session-gated by ruling R8-C, so it is entrant-reachable **by
    # design** rather than by oversight — an entrant pricing their own
    # basket is the same credential doing the same job one step earlier.
    | {("POST", "/e/api/submit/{slug}"), ("POST", "/e/api/quote/{slug}")}
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Cloud mode — the deployed posture, and the only one where the
    operator side has anything to escalate *to*: in local mode every
    caller is already the bootstrap operator by design."""
    monkeypatch.setenv("AUTH_MODE", "cloud")
    monkeypatch.setenv("ENVIRONMENT", "local")
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from services import turnstile as service
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(
        service, "_post", lambda url, fields, timeout: json.dumps({"success": True})
    )
    return TestClient(app)


def _operator_cookie(client) -> str:
    """A real operator session, minted through the real route."""
    from app.config import settings

    client.cookies.clear()
    r = client.post(
        "/auth/register",
        json={"email": "director@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 201, r.text
    return r.cookies[settings.session_cookie_name]


def _entrant_cookie(client) -> str:
    """A real entrant session, minted through the real routes."""
    from app.config import settings

    client.cookies.clear()
    r = client.post(
        SIGNUP,
        json={
            "email": "parent@example.com",
            "password": GOOD_PW,
            "turnstileToken": "a-solved-token",
        },
        headers=CSRF,
    )
    assert r.status_code == 202, r.text
    client.cookies.clear()
    r = client.post(
        LOGIN,
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    return r.cookies[settings.entrant_session_cookie_name]


def _only(client, name: str, value: str) -> None:
    client.cookies.clear()
    client.cookies.set(name, value)


# ---- Direction 1: operator → entrant surface -------------------------


def test_an_operator_session_does_not_authorize_the_entrant_surface(client):
    """The operator cookie is real — it opens `/auth/me` in the same test —
    and it opens nothing on the entrant side."""
    from app.config import settings

    operator = _operator_cookie(client)

    _only(client, settings.session_cookie_name, operator)
    assert client.get("/auth/me").status_code == 200  # the control
    assert client.get(ME).status_code == 401


def test_an_operator_token_under_the_entrant_cookie_name_resolves_to_nothing(
    client,
):
    """The scoping is the **table**, not the cookie name. Renaming the
    credential must not carry it across, which is the whole difference
    between "two tables" and "one table with a discriminator someone
    remembers to check"."""
    from app.config import settings

    operator = _operator_cookie(client)

    _only(client, settings.entrant_session_cookie_name, operator)

    assert client.get(ME).status_code == 401


# ---- Direction 2: entrant → operator surface -------------------------


def test_an_entrant_session_cannot_create_a_workspace(client):
    """`POST /tournaments` carries no `{tournament_id}`, so it sits outside
    the OpenAPI-derived tenancy test. An entrant reaching it would not
    merely see a workspace — they would *own* one."""
    from app.config import settings

    entrant = _entrant_cookie(client)

    _only(client, settings.entrant_session_cookie_name, entrant)
    assert client.get(ME).status_code == 200  # the control
    r = client.post("/tournaments", json={"name": "Not Yours"}, headers=CSRF)

    assert r.status_code == 401


def test_an_entrant_session_cannot_accept_an_invite(client):
    """The escalation the Phase A audit named. A leaked invite link plus an
    entrant account must not equal membership of someone's event."""
    from app.config import settings

    _operator_cookie(client)
    tid = client.post(
        "/tournaments", json={"name": "Club A Open"}, headers=CSRF
    ).json()["id"]
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"}, headers=CSRF
    ).json()["token"]
    entrant = _entrant_cookie(client)

    _only(client, settings.entrant_session_cookie_name, entrant)
    r = client.post(f"/invites/{token}/accept", headers=CSRF)

    assert r.status_code == 401


def test_the_invite_was_acceptable_all_along(client):
    """Negative control for the test above: the same token, presented by an
    operator session, is accepted. Otherwise the 401 might be an expired
    invite, a revoked one, or a typo in the URL."""
    from app.config import settings

    operator = _operator_cookie(client)
    tid = client.post(
        "/tournaments", json={"name": "Club A Open"}, headers=CSRF
    ).json()["id"]
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"}, headers=CSRF
    ).json()["token"]

    _only(client, settings.session_cookie_name, operator)
    r = client.post(f"/invites/{token}/accept", headers=CSRF)

    assert r.status_code == 200, r.text


def test_an_entrant_never_becomes_a_tournament_members_principal(client):
    """The property stated at the level it actually holds: not "the entrant
    was refused", but "there is no membership row anywhere, and the
    workspace answers the uniform 404 rather than any part of itself"."""
    from app.config import settings
    from database.models import EntrantAccount, TournamentMember
    from database.session import SessionLocal
    from sqlalchemy import func, select

    _operator_cookie(client)
    tid = client.post(
        "/tournaments", json={"name": "Club A Open"}, headers=CSRF
    ).json()["id"]
    entrant = _entrant_cookie(client)

    _only(client, settings.entrant_session_cookie_name, entrant)
    probe = client.get(f"/tournaments/{tid}")

    assert probe.status_code == 401
    session = SessionLocal()
    try:
        account_id = session.execute(
            select(EntrantAccount.id).where(
                func.lower(EntrantAccount.email) == "parent@example.com"
            )
        ).scalar_one()
        members = session.execute(select(TournamentMember)).scalars().all()
    finally:
        session.close()
    # The workspace has exactly its owner, and the entrant's account id
    # appears in no membership row — which, given the FK points at
    # ``users``, it could not do even if something tried.
    assert len(members) == 1
    assert account_id not in {m.user_id for m in members}


def test_an_entrant_token_under_the_operator_cookie_name_resolves_to_nothing(
    client,
):
    """The mirror of the rename test above, and the more dangerous one."""
    from app.config import settings

    entrant = _entrant_cookie(client)

    _only(client, settings.session_cookie_name, entrant)

    assert client.get("/auth/me").status_code == 401
    assert (
        client.post("/tournaments", json={"name": "Not Yours"}, headers=CSRF)
    ).status_code == 401


# ---- The derived sweep ------------------------------------------------


def test_no_route_outside_the_public_surface_answers_an_entrant_cookie(client):
    """Three examples cover the routes we thought of. This covers the ones
    a later slice adds.

    Every path in the OpenAPI document, called with an entrant cookie in
    the jar: the public surface and the entrant's own whoami may answer,
    and nothing else may. Same shape and the same allowlist as
    `test_auth_surface.py`, with the anonymous caller replaced by a
    *wrongly-authenticated* one — which is the case that file cannot see.
    """
    from app.config import settings
    from app.main import app

    entrant = _entrant_cookie(client)
    _only(client, settings.entrant_session_cookie_name, entrant)

    reachable: list[str] = []
    checked = 0
    for method, path in _routes(app):
        if (method, path) in ENTRANT_REACHABLE:
            continue
        checked += 1
        r = client.request(
            method,
            _concrete(path),
            json={} if method in ("POST", "PUT", "PATCH") else None,
            headers=CSRF,
        )
        # 401 = not an operator. 403 = a guard. 404 = the tenancy seam's
        # uniform answer, itself a refusal.
        if r.status_code not in (401, 403, 404):
            reachable.append(f"{method} {path} -> {r.status_code}")

    # A sweep over an empty route table is the failure mode a sweep has.
    assert checked > 50, f"only {checked} routes swept — the scan is broken"
    assert not reachable, (
        "An ENTRANT session reached these operator routes. The entrant "
        "principal must never resolve outside /e/account/me:\n  "
        + "\n  ".join(sorted(reachable))
    )


def test_the_sweep_is_not_vacuous(client):
    """The control for the sweep: with an *operator* cookie the very same
    loop finds plenty of reachable routes. Without this, a sweep that
    refused everything for an unrelated reason — a broken app, an empty
    route list — would look identical to a passing one."""
    from app.config import settings
    from app.main import app

    operator = _operator_cookie(client)
    _only(client, settings.session_cookie_name, operator)

    reachable = 0
    for method, path in _routes(app):
        if (method, path) in ENTRANT_REACHABLE:
            continue
        r = client.request(
            method,
            _concrete(path),
            json={} if method in ("POST", "PUT", "PATCH") else None,
            headers=CSRF,
        )
        if r.status_code not in (401, 403, 404):
            reachable += 1

    assert reachable > 0


# ---- The third caller: a deputy relaying a cookie it did not mint ------


def test_a_relayed_operator_cookie_without_the_header_reaches_no_write(client):
    """**The third caller** (Phase 6, spec section 3, negative control #5).

    The two directions above are the two principals. This is the caller
    ruling R8-A creates: a *deputy* — a node process holding a cookie it
    did not mint, forwarding it to the API. The design forbids the deputy
    outright (the entrant tier relays no credential, and nginx will strip
    ``sw_session`` on the way in — Task 22), and this is the property that
    holds even if one day something does relay one: a cookie without the
    header authorizes no write anywhere in the application.

    That is not a claim about a route list, it is a claim about the whole
    write surface, so it sweeps the OpenAPI document. Writes only — reads
    are not CSRF-gated and never were, which is why the nginx containment
    exists alongside this rather than instead of it.

    It is also the bound on channel two seen from the outside. Channel two
    reads an urlencoded body for a cookie-derived token; this caller sends
    no such token, and `form_csrf.form_csrf_proves` refuses the channel
    outright the moment the operator cookie is in the jar, so no entrant-
    minted proof can rescue this request either.
    """
    from app.config import settings
    from app.main import app

    operator = _operator_cookie(client)
    _only(client, settings.session_cookie_name, operator)

    reachable: list[str] = []
    checked = 0
    # BLIND SPOT, on purpose: ``POST /e/api/submit/{slug}`` passes this
    # sweep *vacuously*. ``_concrete`` fills the slug with a random UUID,
    # which answers the uniform 404 before CSRF matters — so this is no
    # proof of that route's CSRF gate. Its real proofs live in
    # test_form_csrf_channel.py (the middleware's two channels) and in
    # test_entries_submit_api.py (the route's own ``require_form_csrf``).
    for method, path in _routes(app):
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            continue
        if (method, path) in OPS_TOKEN_GATED:
            continue
        checked += 1
        r = client.request(method, _concrete(path), json={})
        if r.status_code not in (401, 403, 404):
            reachable.append(f"{method} {path} -> {r.status_code}")

    assert checked > 20, f"only {checked} writes swept — the scan is broken"
    assert not reachable, (
        "A relayed operator cookie with no CSRF header authorized these "
        "writes:\n  " + "\n  ".join(sorted(reachable))
    )


def test_the_relay_sweep_is_not_vacuous(client):
    """Control for the sweep above, in the shape `:323` uses for its own:
    the identical loop, with the header restored, finds reachable writes.
    Without it a sweep that refused everything for an unrelated reason
    would be indistinguishable from a passing one."""
    from app.config import settings
    from app.main import app

    operator = _operator_cookie(client)
    _only(client, settings.session_cookie_name, operator)

    reachable = 0
    for method, path in _routes(app):
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            continue
        if (method, path) in OPS_TOKEN_GATED:
            continue
        r = client.request(method, _concrete(path), json={}, headers=CSRF)
        if r.status_code not in (401, 403, 404):
            reachable += 1

    assert reachable > 0
