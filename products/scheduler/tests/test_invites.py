"""HTTP tests for the Step 7 invite-link routes.

Endpoints under test:
- ``POST   /tournaments/{tid}/invites``  — owner-only generate
- ``GET    /tournaments/{tid}/invites``  — owner-only list
- ``GET    /tournaments/{tid}/members``  — viewer-level list
- ``GET    /invites/{token}``            — public lookup
- ``POST   /invites/{token}/accept``     — auth, idempotent, never downgrades
- ``DELETE /invites/{token}``            — owner-only revoke
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import invites, tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    app_.include_router(invites.router)
    return TestClient(app_)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "T1")


def _set_role(role: str, tid_str: str) -> None:
    """Demote (or promote) the local-dev caller for role-matrix tests."""
    from app.dependencies import LOCAL_DEV_USER_UUID
    from database.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.members.set_role(uuid.UUID(tid_str), LOCAL_DEV_USER_UUID, role)
    finally:
        session.close()


def _remove_membership(tid_str: str) -> None:
    from app.dependencies import LOCAL_DEV_USER_UUID
    from database.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.members.remove_member(uuid.UUID(tid_str), LOCAL_DEV_USER_UUID)
    finally:
        session.close()


# ---- Create ------------------------------------------------------------


def test_create_invite_returns_token_and_url(client, tid):
    r = client.post(f"/tournaments/{tid}/invites", json={"role": "operator"})
    assert r.status_code == 201
    body = r.json()
    assert body["token"]
    assert body["url"] == f"/invite/{body['token']}"
    assert body["role"] == "operator"
    assert body["tournamentId"] == tid


def test_create_invite_requires_owner(client, tid):
    _set_role("operator", tid)
    r = client.post(f"/tournaments/{tid}/invites", json={"role": "viewer"})
    assert r.status_code == 403


def test_create_invite_rejects_owner_role(client, tid):
    """Owner can't be granted via invite link — only operator/viewer
    are in the Literal type."""
    r = client.post(f"/tournaments/{tid}/invites", json={"role": "owner"})
    assert r.status_code == 422


# ---- List invites (owner) + list members (viewer) ----------------------


def test_list_invites_returns_active_and_revoked(client, tid):
    t1 = client.post(f"/tournaments/{tid}/invites", json={"role": "viewer"}).json()["token"]
    t2 = client.post(f"/tournaments/{tid}/invites", json={"role": "operator"}).json()["token"]
    client.delete(f"/invites/{t1}")

    listing = client.get(f"/tournaments/{tid}/invites").json()
    by_token = {entry["token"]: entry for entry in listing}
    assert by_token[t1]["valid"] is False  # revoked
    assert by_token[t1]["revokedAt"] is not None
    assert by_token[t2]["valid"] is True


def test_list_invites_requires_owner(client, tid):
    _set_role("viewer", tid)
    r = client.get(f"/tournaments/{tid}/invites")
    assert r.status_code == 403


def test_list_members_includes_owner(client, tid):
    rows = client.get(f"/tournaments/{tid}/members").json()
    assert len(rows) == 1
    assert rows[0]["role"] == "owner"


def test_list_members_visible_to_viewers(client, tid):
    """Members list is viewer-level so non-owner members can see who
    else has access."""
    _set_role("viewer", tid)
    r = client.get(f"/tournaments/{tid}/members")
    assert r.status_code == 200


# ---- Resolve (public) --------------------------------------------------


def test_resolve_returns_tournament_name_and_role(client, tid):
    """The resolve endpoint is public — it lets a recipient preview
    the invite before signing in."""
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"},
    ).json()["token"]

    r = client.get(f"/invites/{token}")
    assert r.status_code == 200
    body = r.json()
    assert body["token"] == token
    assert body["tournamentId"] == tid
    assert body["tournamentName"] == "T1"
    assert body["role"] == "operator"
    # ``valid`` was removed in SP-CLOUD-3: a 200 here now *means* valid,
    # and the lifecycle flags were the invite-existence oracle. See
    # tests/test_invite_oracle.py.
    assert "valid" not in body


def test_resolve_revoked_is_not_resolvable(client, tid):
    """SP-CLOUD-3: a revoked invite answers the uniform 404 rather than
    200-with-``valid: false``, so its holder cannot tell revoked from
    never-existed."""
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    client.delete(f"/invites/{token}")
    r = client.get(f"/invites/{token}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_NOT_FOUND"


def test_resolve_expired_is_not_resolvable(client, tid):
    """Backdate ``expires_at`` directly so we can exercise the expired
    branch without sleeping.

    SP-CLOUD-3: expiry is now indistinguishable from revocation and from
    a token that never existed."""
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]

    from database.models import InviteLink
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(InviteLink, uuid.UUID(token))
        row.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        session.commit()
    finally:
        session.close()

    r = client.get(f"/invites/{token}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_NOT_FOUND"


def test_resolve_unknown_token_returns_404(client):
    r = client.get(f"/invites/{uuid.uuid4()}")
    assert r.status_code == 404


# ---- Accept ------------------------------------------------------------


def test_accept_adds_member_with_invite_role(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"},
    ).json()["token"]
    # Drop local-dev from the tournament so accept actually does something.
    _remove_membership(tid)

    r = client.post(f"/invites/{token}/accept")
    assert r.status_code == 200
    body = r.json()
    assert body["tournamentId"] == tid
    assert body["role"] == "operator"
    assert body["alreadyMember"] is False


def test_accept_is_idempotent_for_existing_member(client, tid):
    """The owner accepts an invite to their own tournament — should
    return 200 with role unchanged."""
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"},
    ).json()["token"]
    r = client.post(f"/invites/{token}/accept")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "owner"  # not downgraded
    assert body["alreadyMember"] is True


def test_accept_upgrades_viewer_to_operator(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "operator"},
    ).json()["token"]
    _set_role("viewer", tid)

    r = client.post(f"/invites/{token}/accept")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "operator"
    assert body["alreadyMember"] is True


def test_accept_does_not_downgrade_operator_to_viewer(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    _set_role("operator", tid)

    r = client.post(f"/invites/{token}/accept")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "operator"


def test_accept_rejects_revoked_invite(client, tid):
    """SP-CLOUD-3: was 410, now the same 404 an unknown token gets —
    accept must not re-leak on a second axis what resolve no longer
    leaks on the first (see test_accept_unknown_token_returns_404)."""
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    client.delete(f"/invites/{token}")
    _remove_membership(tid)

    r = client.post(f"/invites/{token}/accept")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "INVITE_NOT_FOUND"


def test_accept_unknown_token_returns_404(client):
    r = client.post(f"/invites/{uuid.uuid4()}/accept")
    assert r.status_code == 404


# ---- Revoke ------------------------------------------------------------


def test_revoke_makes_invite_unusable(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    r = client.delete(f"/invites/{token}")
    assert r.status_code == 204
    # Revocation is observable to the *owner* via the invite listing
    # (which keeps the lifecycle flags); to the token holder it is
    # simply gone.
    assert client.get(f"/invites/{token}").status_code == 404


def test_revoke_is_idempotent(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    client.delete(f"/invites/{token}")
    r2 = client.delete(f"/invites/{token}")
    assert r2.status_code == 204


def test_revoke_requires_owner(client, tid):
    token = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"},
    ).json()["token"]
    _set_role("operator", tid)
    r = client.delete(f"/invites/{token}")
    assert r.status_code == 403


def test_revoke_unknown_token_returns_404(client):
    r = client.delete(f"/invites/{uuid.uuid4()}")
    # 404 because the resolver dep fires before the role check.
    assert r.status_code == 404
