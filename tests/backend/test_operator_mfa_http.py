"""Real cookie/CSRF requests prove pending credentials cannot operate workspaces."""
import base64
from datetime import datetime, timedelta, timezone
from importlib import import_module
import sys
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

PASSWORD = "a private phrase for the operator ceremony"
EMAIL = "mfa-operator@example.test"
CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def authenticated_app(tmp_path, monkeypatch):
    from core.secret_keys import create_secret_keyring
    path = tmp_path / "operator-keys.json"
    create_secret_keyring(path)
    monkeypatch.setenv("MFA_KEYRING_FILE", str(path))
    monkeypatch.setenv("AUTH_MODE", "cloud")
    monkeypatch.setenv("EMBEDDED_WORKER", "false")
    isolate_test_database(tmp_path, monkeypatch)
    from core.main import app
    from fastapi.testclient import TestClient
    clock = {"now": datetime.now(timezone.utc).replace(microsecond=0)}
    for name in ("identity.auth", "identity.mfa_routes", "core.dependencies"):
        if name in sys.modules:
            monkeypatch.setattr(import_module(name), "_utcnow", lambda: clock["now"], raising=False)
    with TestClient(app, headers=CSRF) as client:
        yield client, clock


def register(client):
    response = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 201, response.text
    return response


def enroll(client, clock):
    started = client.post("/auth/mfa/enroll", json={"currentPassword": PASSWORD})
    assert started.status_code == 201, started.text
    assert started.headers["cache-control"] == "no-store"
    seed = base64.b32decode(started.json()["secret"])
    from identity.mfa_crypto import totp_code
    confirmed = client.post("/auth/mfa/confirm", json={"code": totp_code(seed, clock["now"].timestamp())})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.headers["cache-control"] == "no-store"
    assert len(confirmed.json()["recoveryCodes"]) == 8
    return seed, confirmed.json()["recoveryCodes"]


def test_password_only_cookie_is_limited_to_the_mfa_ceremony(authenticated_app):
    client, clock = authenticated_app
    response = register(client)
    assert response.json().get("mfaRequired") is True
    assert response.json()["mfaEnrolled"] is False
    assert response.json()["mfaAuthenticated"] is False
    old_cookie = client.cookies.get("sw_session")
    assert client.get("/auth/me").status_code == 200
    denied = client.get("/tournaments")
    assert denied.status_code == 401 and denied.json()["detail"]["code"] == "AUTH_MFA_REQUIRED"
    assert client.post("/tournaments", json={"name": "Denied pending session"}).status_code == 401
    enroll(client, clock)
    assert client.cookies.get("sw_session") != old_cookie
    assert client.get("/auth/me").json()["mfaAuthenticated"] is True
    assert client.get("/tournaments").status_code == 200
    client.cookies.set("sw_session", old_cookie, domain="testserver.local", path="/")
    assert client.get("/auth/me").status_code == 401


def test_login_mfa_requires_password_and_one_use_factor_and_rotates_cookie(authenticated_app):
    client, clock = authenticated_app
    register(client)
    seed, _ = enroll(client, clock)
    client.post("/auth/logout")
    clock["now"] += timedelta(seconds=30)
    login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200 and login.json()["mfaEnrolled"] is True
    assert login.json()["mfaAuthenticated"] is False
    pending = client.cookies.get("sw_session")
    from identity.mfa_crypto import totp_code
    code = totp_code(seed, clock["now"].timestamp())
    wrong = client.post("/auth/mfa/verify", json={"currentPassword": "incorrect", "code": code})
    assert wrong.status_code == 401
    assert wrong.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"
    assert client.get("/tournaments").status_code == 401
    verified = client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": code})
    assert verified.status_code == 200, verified.text
    assert client.cookies.get("sw_session") != pending
    assert client.get("/tournaments").status_code == 200
    assert client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": code}).status_code == 401


def test_enrollment_with_a_wrong_password_names_the_password(authenticated_app):
    client, _ = authenticated_app
    register(client)
    wrong = client.post("/auth/mfa/enroll", json={"currentPassword": "not the operator password"})
    assert wrong.status_code == 401
    assert wrong.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"


def test_pending_session_expires_after_ten_minutes(authenticated_app):
    client, clock = authenticated_app
    register(client)
    clock["now"] += timedelta(minutes=10)
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/mfa/enroll", json={"currentPassword": PASSWORD}).status_code == 401


def test_polling_does_not_extend_idle_and_expired_activity_does_not_revive_it(authenticated_app):
    client, clock = authenticated_app
    register(client)
    enroll(client, clock)
    for _ in range(3):
        clock["now"] += timedelta(minutes=15)
        assert client.get("/tournaments").status_code == 200
    clock["now"] += timedelta(minutes=15)
    assert client.get("/tournaments").status_code == 401
    assert client.post("/auth/activity").status_code == 401


def test_explicit_activity_is_csrf_protected_and_cannot_extend_absolute_lifetime(authenticated_app):
    client, clock = authenticated_app
    register(client)
    enroll(client, clock)
    # Bypass the fixture's default header to exercise the real middleware.
    del client.headers["X-ShuttleWorks-CSRF"]
    assert client.post("/auth/activity").status_code == 403
    client.headers.update(CSRF)
    for _ in range(23):
        clock["now"] += timedelta(minutes=30)
        assert client.post("/auth/activity").status_code == 204
    clock["now"] += timedelta(minutes=30)
    assert client.post("/auth/activity").status_code == 401
    assert client.get("/tournaments").status_code == 401


def test_recovery_code_cannot_be_reused_or_bypass_password(authenticated_app):
    client, clock = authenticated_app
    register(client)
    _, recovery = enroll(client, clock)
    client.post("/auth/logout")
    client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert client.post("/auth/mfa/verify", json={"currentPassword": "wrong", "code": recovery[0]}).status_code == 401
    verified = client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]})
    assert verified.status_code == 200, verified.text
    client.post("/auth/logout")
    client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]}).status_code == 401
    assert client.get("/tournaments").status_code == 401


@pytest.mark.parametrize("method,suffix,payload,fresh_status", [
    ("DELETE", "", None, 204),
    ("PATCH", "/members/{user_id}", {"role": "owner"}, 200),
    ("DELETE", "/members/{user_id}", None, 409),  # last-owner rule still applies
    ("POST", "/transfer-ownership", {}, 422),
    ("POST", "/invites", {"role": "operator"}, 201),
    ("POST", "/display-token/rotate", "display", 200),
    ("DELETE", "/display-token", None, 204),
    ("POST", "/state/backup", None, 200),
    ("DELETE", "/members/me", None, 409),  # the sole owner cannot leave
    ("POST", "/authority/ready", {}, 422),
    ("GET", "/match-states/export/download", None, 200),
    # Empty workspaces have no bracket or backup; authorization must still
    # precede the ordinary 404 for those absent derived resources.
    ("GET", "/bracket/export.json", None, 404),
    ("GET", "/bracket/export.csv", None, 404),
    ("GET", "/bracket/export.ics", None, 404),
    ("GET", "/state/backups/missing.json", None, 404),
    ("DELETE", "/state/backups/missing.json", None, 404),
    ("POST", "/state/restore/missing.json", {}, 404),
    # Missing handoff evidence deliberately stops at schema validation after
    # fresh authorization. Lifecycle correctness has its own protocol suite.
    ("POST", "/authority/checkout", {}, 422),
    ("POST", "/authority/return", {}, 422),
    ("POST", "/authority/transfer", {}, 422),
    ("POST", "/authority/recover", {}, 422),
    ("POST", "/authority/devices", {}, 422),
    ("POST", "/authority/devices/{user_id}/revoke", {}, 422),
])
def test_sensitive_routes_require_fresh_proof_after_tenant_denial(
    authenticated_app, method, suffix, payload, fresh_status,
):
    client, clock = authenticated_app
    user_id = register(client).json()["id"]
    _, recovery = enroll(client, clock)
    workspace = client.post("/tournaments", json={"name": "Fresh-auth control"})
    assert workspace.status_code == 201, workspace.text
    workspace_id = workspace.json()["id"]
    suffix = suffix.format(user_id=user_id)
    if payload == "display":
        payload = {"expiresAt": (clock["now"] + timedelta(days=1)).isoformat()}
    clock["now"] += timedelta(minutes=5)
    assert client.get(f"/tournaments/{workspace_id}").status_code == 200
    missing = client.get(f"/tournaments/{uuid.uuid4()}")
    foreign = client.request(method, f"/tournaments/{uuid.uuid4()}{suffix}", json=payload)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.content == missing.content
    denied = client.request(method, f"/tournaments/{workspace_id}{suffix}", json=payload)
    assert denied.status_code == 401, denied.text
    assert denied.json()["detail"]["code"] == "AUTH_REAUTH_REQUIRED"
    proved = client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]})
    assert proved.status_code == 200, proved.text
    accepted = client.request(method, f"/tournaments/{workspace_id}{suffix}", json=payload)
    assert accepted.status_code == fresh_status, accepted.text


def test_invite_revocation_requires_fresh_proof_after_owner_denial(authenticated_app):
    client, clock = authenticated_app
    register(client)
    _, recovery = enroll(client, clock)
    workspace_id = client.post("/tournaments", json={"name": "Invite freshness"}).json()["id"]
    issued = client.post(f"/tournaments/{workspace_id}/invites", json={"role": "operator"})
    assert issued.status_code == 201, issued.text
    invite_id = issued.json()["id"]
    clock["now"] += timedelta(minutes=5)
    missing = client.delete(f"/invites/{uuid.uuid4()}")
    assert missing.status_code == 404  # an unknown invite never reaches freshness
    denied = client.delete(f"/invites/{invite_id}")
    assert denied.status_code == 401 and denied.json()["detail"]["code"] == "AUTH_REAUTH_REQUIRED"
    assert client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]}).status_code == 200
    assert client.delete(f"/invites/{invite_id}").status_code == 204


def test_client_side_export_check_requires_fresh_proof(authenticated_app):
    client, clock = authenticated_app
    register(client)
    _, recovery = enroll(client, clock)
    assert client.post("/auth/reauth-check").status_code == 204
    clock["now"] += timedelta(minutes=5)
    denied = client.post("/auth/reauth-check")
    assert denied.status_code == 401 and denied.json()["detail"]["code"] == "AUTH_REAUTH_REQUIRED"
    assert client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]}).status_code == 200
    assert client.post("/auth/reauth-check").status_code == 204


def test_failed_factor_attempts_persist_the_account_throttle(authenticated_app, monkeypatch):
    client, clock = authenticated_app
    register(client)
    _, recovery = enroll(client, clock)
    monkeypatch.setattr(import_module("identity.auth").settings, "auth_throttle_max_failures", 3)
    for _ in range(3):
        assert client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": "invalid-code"}).status_code == 401
    locked = client.post("/auth/mfa/verify", json={"currentPassword": PASSWORD, "code": recovery[0]})
    assert locked.status_code == 429 and locked.json()["detail"]["code"] == "AUTH_THROTTLED"


def test_password_reset_does_not_remove_or_bypass_the_factor(authenticated_app):
    client, clock = authenticated_app
    register(client)
    _, recovery = enroll(client, clock)
    auth = import_module("identity.auth")
    with import_module("db.session").SessionLocal() as session:
        row = auth.get_user_by_email(session, EMAIL)
        token = auth.issue_reset_token(session, row)
        session.commit()
    replacement = "a different private recovery passphrase"
    reset = client.post("/auth/reset-password", json={"token": token, "newPassword": replacement})
    assert reset.status_code == 204, reset.text
    assert client.get("/tournaments").status_code == 401
    login = client.post("/auth/login", json={"email": EMAIL, "password": replacement})
    assert login.status_code == 200 and login.json()["mfaEnrolled"] is True
    assert login.json()["mfaAuthenticated"] is False
    assert client.get("/tournaments").status_code == 401
    assert client.post("/auth/mfa/verify", json={"currentPassword": replacement, "code": recovery[0]}).status_code == 200
    assert client.get("/tournaments").status_code == 200
