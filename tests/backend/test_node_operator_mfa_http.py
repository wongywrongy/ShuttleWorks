"""Offline operators enroll individually; a shared node capability is insufficient."""
import base64
from datetime import timedelta
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

PASSWORD = "a private password used only on this event node"
CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def node(tmp_path, monkeypatch):
    node_id, user_id, workspace_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    monkeypatch.setenv("SHUTTLEWORKS_DEPLOYMENT_PROFILE", "event_node")
    monkeypatch.setenv("SHUTTLEWORKS_NODE_ID", str(node_id))
    monkeypatch.setenv("AUTHORITY_SIGNING_PUBLIC_KEY_FILE", str(tmp_path / "trust.pem"))
    monkeypatch.setenv("NODE_SIGNING_KEY_FILE", str(tmp_path / "node.pem"))
    monkeypatch.setenv("EMBEDDED_WORKER", "false")
    isolate_test_database(tmp_path, monkeypatch)
    from core.main import app
    from core.time_utils import _utcnow
    from core.tokens import _hash_token
    from db.session import SessionLocal
    from db.models import Tournament, TournamentMember, TournamentAuthority, User
    from identity.node_identity import provision
    from repositories.local import LocalRepository
    with SessionLocal() as session:
        session.add(User(id=user_id, email="node-operator@example.test"))
        session.add(Tournament(id=workspace_id, name="Offline MFA", data={}, schema_version=1))
        session.flush()
        session.add(TournamentMember(tournament_id=workspace_id, user_id=user_id, role="owner"))
        session.add(TournamentAuthority(tournament_id=workspace_id, epoch=2, node_id=node_id,
            state="active", checkpoint_hash="a" * 64, checkpoint_schema_version=1,
            capability_digest=_hash_token("shared-authority-fixture")))
        session.commit()
        repo = LocalRepository(session)
        with repo.transaction():
            token, _ = provision(repo, user_id=user_id, tournament_id=workspace_id, node_id=node_id, now=_utcnow())
    from fastapi.testclient import TestClient
    with TestClient(app, headers=CSRF) as client:
        yield client, dict(workspaceId=str(workspace_id), email="node-operator@example.test",
                           activationToken=token, newPassword=PASSWORD), node_id, user_id


def activate_and_enroll(client, body):
    from core.time_utils import _utcnow
    from identity.mfa_crypto import totp_code
    response = client.post("/auth/node/activate", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["mfaAuthenticated"] is False
    assert response.json()["offlineWorkspaceId"] == body["workspaceId"]
    assert client.cookies.get("sw_session") is None
    query = {"workspaceId": body["workspaceId"]}
    started = client.post("/auth/mfa/enroll", params=query, json={"currentPassword": PASSWORD})
    assert started.status_code == 201, started.text
    seed = base64.b32decode(started.json()["secret"])
    completed = client.post("/auth/mfa/confirm", params=query, json={"code": totp_code(seed, _utcnow().timestamp())})
    assert completed.status_code == 200, completed.text
    return completed.json()["recoveryCodes"]


def test_individual_node_enrollment_login_and_logout_work_without_cloud_credentials(node):
    client, body, _, _ = node
    recovery = activate_and_enroll(client, body)
    tid = body["workspaceId"]
    assert client.get(f"/tournaments/{tid}").status_code == 200
    assert client.get("/tournaments").status_code == 401  # scoped node credential
    assert client.get(f"/tournaments/{uuid.uuid4()}").status_code == 404
    old_cookie = client.cookies.get("sw_offline_operator")
    assert client.post("/auth/logout").status_code == 204
    client.cookies.set("sw_offline_operator", old_cookie)
    assert client.get(f"/tournaments/{tid}").status_code == 401
    client.cookies.clear()
    signed_in = client.post("/auth/login", params={"workspaceId": tid}, json={"email": body["email"], "password": PASSWORD})
    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json()["mfaAuthenticated"] is False
    assert client.get(f"/tournaments/{tid}").status_code == 401
    completed = client.post("/auth/mfa/verify", params={"workspaceId": tid}, json={"currentPassword": PASSWORD, "code": recovery[0]})
    assert completed.status_code == 200, completed.text
    assert client.get(f"/tournaments/{tid}").status_code == 200
    assert client.cookies.get("sw_session") is None


@pytest.mark.parametrize("failure", ["wrong-token", "wrong-person", "wrong-workspace", "expired", "closed-epoch", "removed-member"])
def test_activation_is_scoped_and_fail_closed(node, failure):
    client, body, _, user_id = node
    from core.time_utils import _utcnow
    from db.models import NodeOperatorEnrollment, TournamentAuthority, TournamentMember
    from db.session import SessionLocal
    from sqlalchemy import select
    tid = uuid.UUID(body["workspaceId"])
    body = dict(body)
    if failure == "wrong-token": body["activationToken"] = "unknown-private-token"
    if failure == "wrong-person": body["email"] = "another@example.test"
    if failure == "wrong-workspace": body["workspaceId"] = str(uuid.uuid4())
    with SessionLocal() as session:
        if failure == "expired":
            row = session.scalar(select(NodeOperatorEnrollment))
            row.created_at = _utcnow() - timedelta(minutes=11)
            row.expires_at = _utcnow() - timedelta(minutes=1)
        if failure == "closed-epoch": session.get(TournamentAuthority, (tid, 2)).state = "closed"
        if failure == "removed-member": session.delete(session.get(TournamentMember, (tid, user_id)))
        session.commit()
    assert client.post("/auth/node/activate", json=body).status_code == 401
    assert client.cookies.get("sw_offline_operator") is None


def test_shared_authority_capability_cannot_enroll_an_individual(node):
    client, body, node_id, user_id = node
    tid = body["workspaceId"]
    boot = client.post(f"/tournaments/{tid}/authority/offline-session/bootstrap",
        headers={"Authorization": "Bearer shared-authority-fixture"},
        json={"operator_id": str(user_id), "node_id": str(node_id), "authority_epoch": 2})
    assert boot.status_code == 200, boot.text
    assert client.get(f"/tournaments/{tid}").status_code == 401
    attempted = client.post("/auth/mfa/enroll", params={"workspaceId": tid}, json={"currentPassword": PASSWORD})
    assert attempted.status_code == 401
    assert client.post("/auth/register", json={"email": body["email"], "password": PASSWORD}).status_code == 404


def test_activation_is_single_use_and_email_reset_never_resets_node_identity(node):
    client, body, _, _ = node
    activate_and_enroll(client, body)
    client.cookies.clear()
    assert client.post("/auth/node/activate", json=body).status_code == 401
    assert client.post("/auth/request-password-reset", json={"email": body["email"]}).status_code == 404


def test_node_denial_is_identical_for_missing_foreign_and_downgraded_workspaces(node):
    client, body, _, user_id = node
    activate_and_enroll(client, body)
    from db.models import Tournament, TournamentMember
    from db.session import SessionLocal
    foreign_id = uuid.uuid4()
    tid = uuid.UUID(body["workspaceId"])
    with SessionLocal() as session:
        session.add(Tournament(id=foreign_id, name="Another event", data={}, schema_version=1))
        session.flush()
        # Membership in another workspace cannot broaden this cookie's scope.
        session.add(TournamentMember(tournament_id=foreign_id, user_id=user_id, role="owner"))
        session.commit()
    missing = client.get(f"/tournaments/{uuid.uuid4()}")
    foreign = client.get(f"/tournaments/{foreign_id}")
    with SessionLocal() as session:
        session.get(TournamentMember, (tid, user_id)).role = "viewer"
        session.commit()
    downgraded = client.get(f"/tournaments/{tid}")
    assert missing.status_code == foreign.status_code == downgraded.status_code == 404
    assert missing.content == foreign.content == downgraded.content


def test_node_password_change_requires_fresh_mfa_and_preserves_the_factor(node, monkeypatch):
    client, body, _, _ = node
    recovery = activate_and_enroll(client, body)
    query = {"workspaceId": body["workspaceId"]}
    new_password = "a replacement private node passphrase"
    changed = client.post("/auth/node/change-password", params=query,
        json={"currentPassword": PASSWORD, "newPassword": new_password})
    assert changed.status_code == 204, changed.text
    assert client.get(f"/tournaments/{body['workspaceId']}").status_code == 200
    client.post("/auth/logout")
    assert client.post("/auth/login", params=query, json={"email": body["email"], "password": PASSWORD}).status_code == 401
    signed_in = client.post("/auth/login", params=query, json={"email": body["email"], "password": new_password})
    assert signed_in.status_code == 200
    assert signed_in.json()["mfaEnrolled"] is True and signed_in.json()["mfaAuthenticated"] is False
    assert client.post("/auth/mfa/verify", params=query, json={"currentPassword": new_password, "code": recovery[0]}).status_code == 200
    from core import dependencies
    from core.time_utils import _utcnow
    later = _utcnow() + timedelta(minutes=5)
    monkeypatch.setattr(dependencies, "_utcnow", lambda: later)
    stale = client.post("/auth/node/change-password", params=query,
        json={"currentPassword": new_password, "newPassword": PASSWORD})
    assert stale.status_code == 401 and stale.json()["detail"]["code"] == "AUTH_REAUTH_REQUIRED"
