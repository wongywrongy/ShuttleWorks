"""Golden master for the two *application-level* seams SP-E1-2 touches.

Companion to ``tests/unit/test_auth_characterization.py``, which pins the
service-level primitives. This file pins the two seams that only exist as
behaviour of the running app, and that the entrant principal is about to
run through (SP-E1-2 rule 5):

1. **The CSRF middleware's trigger condition** (``core/main.py``). Today it
   fires on one cookie name. The entrant cookie arrives under a *different*
   name, and a middleware keyed to a single name would let every entrant
   write fall silently outside CSRF enforcement — the trap spec Q13 §2 names
   explicitly. What is pinned below is the *shape* of the rule, which
   survives the fix: writes carrying a **session** cookie need the header;
   reads never do; writes carrying no session cookie never do. The fix
   widens "the session cookie" from one name to a registry of names; it does
   not change any assertion here.
2. **``require_tournament_access``'s uniform 404** (``core/dependencies.py``).
   An entrant principal must be *provably outside* this seam. That proof is
   only meaningful against a pinned statement of what the seam does for the
   principals it already knows — a non-member gets 404 (never 403, never
   data), an under-privileged member gets 403, and a nonexistent workspace
   is indistinguishable from someone else's.

Both are run against the real app with an isolated SQLite file, in the mode
each seam actually governs.
"""
from __future__ import annotations

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


# ---- 1. The CSRF middleware trigger -----------------------------------


def test_a_write_carrying_the_session_cookie_needs_the_header(client):
    """The rule itself: SameSite=Lax lets a cross-site form send our cookie
    on a top-level POST, but it can never attach a custom header without a
    preflight we do not approve."""
    r = client.post(
        "/auth/register", json={"email": "dana@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 201  # the register call itself carried no cookie

    r = client.post("/tournaments", json={"name": "no-header"})

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_same_write_with_the_header_is_accepted(client):
    """Negative control for the refusal above — same cookie, same route,
    only the header differs."""
    client.post(
        "/auth/register", json={"email": "dana@example.com", "password": GOOD_PW}
    )

    r = client.post("/tournaments", json={"name": "with-header"}, headers=CSRF)

    assert r.status_code == 201


def test_a_read_carrying_the_session_cookie_never_needs_the_header(client):
    client.post(
        "/auth/register", json={"email": "dana@example.com", "password": GOOD_PW}
    )

    assert client.get("/auth/me").status_code == 200


def test_a_write_with_no_session_cookie_is_not_gated_by_csrf(client):
    """Cookie-less writes are outside the mechanism by construction: there
    is no ambient credential for a cross-site page to borrow. This is why
    the *public* entry write was never CSRF-gated — and precisely why the
    entrant session cookie, once it exists, must be."""
    client.cookies.clear()

    r = client.post(
        "/auth/register", json={"email": "erin@example.com", "password": GOOD_PW}
    )

    assert r.status_code == 201


def test_a_cookie_that_is_not_a_session_cookie_does_not_trigger_csrf(client):
    """The trigger is the *session* cookie, not "any cookie". A theme
    preference must not make an unauthenticated public write unanswerable.

    This assertion is the one that constrains the SP-E1-2 fix: widening the
    trigger to a registry of session cookie names must not widen it to every
    cookie in the jar."""
    client.cookies.clear()
    client.cookies.set("sw_theme", "dark")

    r = client.post(
        "/auth/register", json={"email": "fran@example.com", "password": GOOD_PW}
    )

    assert r.status_code == 201


def test_the_trigger_reads_the_configured_cookie_name(client, monkeypatch):
    """Pinned because the fix edits exactly this line: the middleware asks
    configuration for the name(s), never a literal."""
    from core.config import settings

    assert settings.session_cookie_name == "sw_session"
    client.cookies.clear()
    client.cookies.set(settings.session_cookie_name, "not-a-live-session")

    r = client.post("/tournaments", json={"name": "dead-cookie"})

    # A dead session still triggers the check — the middleware runs before
    # anything resolves the token, which is what makes it cheap.
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


# ---- 2. require_tournament_access's uniform 404 -----------------------


@pytest.fixture
def two_tenants(client):
    """A workspace owned by one account, and a second account that is not
    a member of it."""
    r = client.post(
        "/auth/register", json={"email": "owner@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 201
    r = client.post("/tournaments", json={"name": "owned"}, headers=CSRF)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]

    client.cookies.clear()
    r = client.post(
        "/auth/register", json={"email": "stranger@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 201
    return tid


def test_a_non_member_gets_404_not_403(client, two_tenants):
    """Existence is information. "Doesn't exist" and "exists but not yours"
    must be one answer."""
    r = client.get(f"/tournaments/{two_tenants}")

    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_a_nonexistent_workspace_answers_identically(client, two_tenants):
    """The other half of the uniformity claim: the two answers are the same
    bytes, so a probe cannot distinguish them."""
    real = client.get(f"/tournaments/{two_tenants}")
    fake = client.get("/tournaments/00000000-0000-0000-0000-0000000000ff")

    assert real.status_code == fake.status_code == 404
    assert real.json() == fake.json()


def test_a_member_reaches_their_own_workspace(client, two_tenants):
    """Negative control: the 404 above is the tenancy seam, not a route that
    404s for everyone."""
    client.cookies.clear()
    client.post(
        "/auth/login", json={"email": "owner@example.com", "password": GOOD_PW}
    )

    r = client.get(f"/tournaments/{two_tenants}")

    assert r.status_code == 200
    assert r.json()["name"] == "owned"


def test_an_insufficient_role_is_403_because_membership_is_already_known(
    client, two_tenants
):
    """403 is reserved for a caller who already knows the workspace exists.
    Pinned so the entrant work cannot quietly turn a 404 into a 403 by
    introducing a principal the role lookup half-recognizes."""
    from db.models import TournamentMember, User
    from db.session import SessionLocal
    from sqlalchemy import select
    import uuid as _uuid

    session = SessionLocal()
    try:
        stranger = session.execute(
            select(User).where(User.email == "stranger@example.com")
        ).scalar_one()
        session.add(
            TournamentMember(
                tournament_id=_uuid.UUID(two_tenants),
                user_id=stranger.id,
                role="viewer",
            )
        )
        session.commit()
    finally:
        session.close()

    # The stranger's session is the live one on the client (registered last).
    r = client.delete(f"/tournaments/{two_tenants}", headers=CSRF)

    assert r.status_code == 403
    assert client.get(f"/tournaments/{two_tenants}").status_code == 200
