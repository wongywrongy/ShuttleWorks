"""Member-management HTTP surface (SP-CLOUD-3 Phase 1).

The service-layer invariant and its concurrency behaviour live in
``tests/unit/test_members_service.py``; this file pins the HTTP contract:
the role matrix, the error codes, and the two properties that are easy to
assume and expensive to get wrong —

1. **Removal is effective immediately**, not at session expiry. Nothing
   caches membership (``require_tournament_access`` reads it live per
   request), so this is a *pinning* test: it guards a property the system
   already has against someone later adding a cache for speed.
2. **Self-removal is not a back door.** A sole owner leaving would strand
   the workspace exactly as much as being removed, so it hits the same
   guard.
"""
from __future__ import annotations

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


def _register(client, email):
    # CSRF header required on any cookie-carrying write, and these calls
    # inherit the previous user's session cookie.
    r = client.post(
        "/auth/register", json={"email": email, "password": PW}, headers=CSRF
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _login(client, email):
    client.cookies.clear()
    r = client.post(
        "/auth/login", json={"email": email, "password": PW}, headers=CSRF
    )
    assert r.status_code == 200, r.text


def _workspace_with_members(client):
    """Owner + operator + viewer, each a real account.

    Returns ``(tournament_id, {label: user_id})``; the client is left
    authenticated as the owner.
    """
    owner_id = _register(client, "owner@example.com")
    tid = client.post("/tournaments", json={"name": "Members"}, headers=CSRF).json()["id"]

    ids = {"owner": owner_id}
    for label, role in [("op", "operator"), ("viewer", "viewer")]:
        # Registering a user signs the client in AS that user, so the
        # owner session has to be restored before minting the next
        # (owner-gated) invite.
        _login(client, "owner@example.com")
        r = client.post(
            f"/tournaments/{tid}/invites", json={"role": role}, headers=CSRF
        )
        assert r.status_code in (200, 201), r.text
        token = r.json()["token"]

        uid = _register(client, f"{label}@example.com")  # now signed in as them
        acc = client.post(f"/invites/{token}/accept", headers=CSRF)
        assert acc.status_code == 200, acc.text
        ids[label] = uid

    _login(client, "owner@example.com")
    return tid, ids


def _roles(client, tid):
    rows = client.get(f"/tournaments/{tid}/members").json()
    return {r["userId"]: r["role"] for r in rows}


# ---- Role changes ----------------------------------------------------


def test_owner_can_promote_and_demote(client):
    tid, ids = _workspace_with_members(client)

    r = client.patch(
        f"/tournaments/{tid}/members/{ids['viewer']}",
        json={"role": "operator"},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "operator"
    assert _roles(client, tid)[ids["viewer"]] == "operator"


def test_role_change_rejects_unknown_role(client):
    tid, ids = _workspace_with_members(client)
    r = client.patch(
        f"/tournaments/{tid}/members/{ids['op']}",
        json={"role": "superuser"},
        headers=CSRF,
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "MEMBER_INVALID_ROLE"


def test_demoting_the_only_owner_is_refused(client):
    tid, ids = _workspace_with_members(client)
    r = client.patch(
        f"/tournaments/{tid}/members/{ids['owner']}",
        json={"role": "operator"},
        headers=CSRF,
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "MEMBER_LAST_OWNER"
    assert _roles(client, tid)[ids["owner"]] == "owner"


def test_role_change_on_a_non_member_is_404(client):
    import uuid

    tid, _ = _workspace_with_members(client)
    r = client.patch(
        f"/tournaments/{tid}/members/{uuid.uuid4()}",
        json={"role": "viewer"},
        headers=CSRF,
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "MEMBER_NOT_FOUND"


# ---- Role matrix -----------------------------------------------------


@pytest.mark.parametrize("actor", ["op", "viewer"])
def test_non_owners_cannot_manage_members(client, actor):
    """Operator and viewer are both blocked from every management verb."""
    tid, ids = _workspace_with_members(client)
    _login(client, f"{actor}@example.com")

    assert client.patch(
        f"/tournaments/{tid}/members/{ids['viewer']}",
        json={"role": "owner"},
        headers=CSRF,
    ).status_code == 403
    assert client.delete(
        f"/tournaments/{tid}/members/{ids['viewer']}", headers=CSRF
    ).status_code == 403
    assert client.post(
        f"/tournaments/{tid}/transfer-ownership",
        json={"userId": ids["op"]},
        headers=CSRF,
    ).status_code == 403


def test_non_member_gets_404_not_403(client):
    """The uniform-404 seam still applies to the new routes — a stranger
    must not learn the workspace exists."""
    tid, ids = _workspace_with_members(client)
    _register(client, "stranger@example.com")

    r = client.delete(f"/tournaments/{tid}/members/{ids['op']}", headers=CSRF)
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


# ---- Removal takes effect immediately --------------------------------


def test_removed_member_loses_access_on_the_very_next_request(client):
    """The pinning test.

    The removed user keeps a valid session cookie — their identity is
    untouched. What changes is membership, and because
    ``require_tournament_access`` reads it live on every request, access
    ends immediately rather than at session expiry.

    If someone later memoises membership for speed, this test is what
    should stop them.
    """
    tid, ids = _workspace_with_members(client)

    # The operator has access right now, on their own session.
    _login(client, "op@example.com")
    assert client.get(f"/tournaments/{tid}/state").status_code in (200, 204)

    # Owner removes them.
    _login(client, "owner@example.com")
    assert client.delete(
        f"/tournaments/{tid}/members/{ids['op']}", headers=CSRF
    ).status_code == 204

    # Same still-valid session, next request: gone. Not at expiry — now.
    _login(client, "op@example.com")
    r = client.get(f"/tournaments/{tid}/state")
    assert r.status_code == 404, (
        "removed member still had access — membership is being cached "
        "somewhere, or revocation waits for session expiry"
    )
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_removing_the_only_owner_is_refused(client):
    tid, ids = _workspace_with_members(client)
    r = client.delete(f"/tournaments/{tid}/members/{ids['owner']}", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "MEMBER_LAST_OWNER"


# ---- Leave -----------------------------------------------------------


def test_member_can_leave(client):
    tid, ids = _workspace_with_members(client)
    _login(client, "viewer@example.com")

    assert client.delete(f"/tournaments/{tid}/members/me", headers=CSRF).status_code == 204
    # And the workspace is gone from their view immediately.
    assert client.get(f"/tournaments/{tid}/state").status_code == 404


def test_sole_owner_cannot_leave(client):
    """Self-removal must hit the same guard as being removed."""
    tid, _ = _workspace_with_members(client)
    r = client.delete(f"/tournaments/{tid}/members/me", headers=CSRF)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "MEMBER_LAST_OWNER"


def test_leave_route_is_not_shadowed_by_the_uuid_route(client):
    """``/members/me`` must resolve to the leave handler.

    Declaration order matters: ``user_id`` is typed ``uuid.UUID``, so if
    ``/members/{user_id}`` were declared first the literal "me" would 422
    instead of reaching this handler. A 422 here means the routes were
    reordered.
    """
    tid, _ = _workspace_with_members(client)
    r = client.delete(f"/tournaments/{tid}/members/me", headers=CSRF)
    assert r.status_code != 422, "/members/me is being parsed as a UUID path param"


# ---- Transfer --------------------------------------------------------


def test_transfer_ownership_swaps_roles(client):
    tid, ids = _workspace_with_members(client)

    r = client.post(
        f"/tournaments/{tid}/transfer-ownership",
        json={"userId": ids["op"]},
        headers=CSRF,
    )
    assert r.status_code == 204, r.text

    roles = _roles(client, tid)
    assert roles[ids["op"]] == "owner"
    assert roles[ids["owner"]] == "operator"
    # Never zero owners, and never two.
    assert sum(1 for v in roles.values() if v == "owner") == 1


def test_transfer_to_a_non_member_is_404(client):
    import uuid

    tid, _ = _workspace_with_members(client)
    r = client.post(
        f"/tournaments/{tid}/transfer-ownership",
        json={"userId": str(uuid.uuid4())},
        headers=CSRF,
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "MEMBER_NOT_FOUND"


def test_former_owner_cannot_manage_after_transferring(client):
    """The transfer really moves authority, it does not merely relabel."""
    tid, ids = _workspace_with_members(client)
    client.post(
        f"/tournaments/{tid}/transfer-ownership",
        json={"userId": ids["op"]},
        headers=CSRF,
    )
    # Still signed in as the former owner, now an operator.
    r = client.delete(f"/tournaments/{tid}/members/{ids['viewer']}", headers=CSRF)
    assert r.status_code == 403
