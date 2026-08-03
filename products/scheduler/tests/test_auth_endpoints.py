"""Auth endpoint flows (SP-CLOUD-2 Phase 1): register/login/logout/me,
password change, reset, throttle, cookie flags, CSRF middleware, and
the preserved local zero-friction path.

Runs against the real app with an isolated SQLite file. Dialect
coverage for the underlying service lives in
tests/unit/test_auth_service.py; these tests pin the HTTP semantics.
"""
from __future__ import annotations

import pytest

from tests._helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _register(client, email="dana@example.com", password=GOOD_PW, name="Dana"):
    r = client.post(
        "/auth/register",
        json={"email": email, "password": password, "displayName": name},
    )
    assert r.status_code == 201, r.text
    return r


def test_register_sets_cookie_with_owasp_flags(client):
    r = _register(client)
    body = r.json()
    assert body["email"] == "dana@example.com"
    assert body["displayName"] == "Dana"
    assert body["isBootstrap"] is False
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie
    # secure is off by default in plain-HTTP local dev (cloud validator
    # enforces SESSION_COOKIE_SECURE=true).
    assert "sw_session=" in set_cookie


def test_register_rejects_weak_password_and_dup_email(client):
    r = client.post(
        "/auth/register", json={"email": "a@example.com", "password": "short"}
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_WEAK_PASSWORD"

    _register(client, email="b@example.com")
    client.cookies.clear()  # fresh browser — no session, no CSRF needed
    r = client.post(
        "/auth/register", json={"email": "B@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_EMAIL_TAKEN"


def test_login_logout_me_roundtrip(client):
    _register(client)
    client.cookies.clear()

    r = client.post(
        "/auth/login", json={"email": "DANA@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 200

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "dana@example.com"
    assert me.json()["isBootstrap"] is False

    r = client.post("/auth/logout", headers=CSRF)
    assert r.status_code == 204
    client.cookies.clear()
    # Back to the bootstrap identity in local mode.
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["isBootstrap"] is True


def test_login_failure_is_uniform_and_throttled(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 3)
    _register(client)
    client.cookies.clear()

    r1 = client.post(
        "/auth/login", json={"email": "dana@example.com", "password": "wrong-pass"}
    )
    r2 = client.post(
        "/auth/login", json={"email": "ghost@example.com", "password": "wrong-pass"}
    )
    # Wrong password vs nonexistent account: identical status + code.
    assert r1.status_code == r2.status_code == 401
    assert (
        r1.json()["detail"]["code"]
        == r2.json()["detail"]["code"]
        == "AUTH_INVALID_CREDENTIALS"
    )

    client.post("/auth/login", json={"email": "dana@example.com", "password": "wrong-pass"})
    client.post("/auth/login", json={"email": "dana@example.com", "password": "wrong-pass"})
    r = client.post("/auth/login", json={"email": "dana@example.com", "password": GOOD_PW})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "AUTH_THROTTLED"
    assert r.json()["detail"]["retryAfterSeconds"] >= 1


def test_session_revoked_server_side_on_logout(client):
    _register(client)
    token = client.cookies.get("sw_session")
    client.post("/auth/logout", headers=CSRF)
    # Re-present the old cookie: session must be dead server-side, so
    # local mode falls back to the bootstrap identity.
    client.cookies.set("sw_session", token)
    me = client.get("/auth/me")
    assert me.json()["isBootstrap"] is True


def test_change_password_revokes_other_sessions(client):
    _register(client)
    first_token = client.cookies.get("sw_session")
    client.cookies.clear()
    client.post("/auth/login", json={"email": "dana@example.com", "password": GOOD_PW})

    r = client.post(
        "/auth/change-password",
        json={"currentPassword": GOOD_PW, "newPassword": "an even finer passphrase"},
        headers=CSRF,
    )
    assert r.status_code == 204

    # The register-time session (a different device) is now dead…
    client.cookies.clear()
    client.cookies.set("sw_session", first_token)
    assert client.get("/auth/me").json()["isBootstrap"] is True
    # …and only the new password logs in.
    client.cookies.clear()
    assert (
        client.post(
            "/auth/login", json={"email": "dana@example.com", "password": GOOD_PW}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": "dana@example.com", "password": "an even finer passphrase"},
        ).status_code
        == 200
    )


def test_change_password_requires_current(client):
    _register(client)
    r = client.post(
        "/auth/change-password",
        json={"currentPassword": "wrong-pass", "newPassword": "an even finer passphrase"},
        headers=CSRF,
    )
    assert r.status_code == 401


def test_password_reset_flow(client, caplog):
    import logging

    _register(client)
    client.cookies.clear()
    with caplog.at_level(logging.INFO, logger="scheduler.api.auth"):
        r = client.post(
            "/auth/request-password-reset", json={"email": "dana@example.com"}
        )
    assert r.status_code == 202
    # Token is logged (the Phase 3 email seam replaces this), never
    # returned in the response.
    assert "token" not in r.text.lower()
    token_lines = [m for m in caplog.messages if "password-reset token" in m]
    assert token_lines, "reset token should be logged in local mode"
    token = token_lines[0].split(": ")[-1]

    r = client.post(
        "/auth/reset-password",
        json={"token": token, "newPassword": "a brand new passphrase"},
    )
    assert r.status_code == 204
    assert (
        client.post(
            "/auth/login",
            json={"email": "dana@example.com", "password": "a brand new passphrase"},
        ).status_code
        == 200
    )


def test_password_reset_no_account_oracle(client):
    r = client.post(
        "/auth/request-password-reset", json={"email": "nobody@example.com"}
    )
    assert r.status_code == 202  # same as the existing-account response

    r = client.post(
        "/auth/reset-password",
        json={"token": "bogus-token", "newPassword": "a brand new passphrase"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "AUTH_RESET_INVALID"


def test_csrf_required_for_cookie_authenticated_writes(client):
    _register(client)
    # Cookie present + write + no header → blocked by the middleware.
    r = client.post("/tournaments", json={"name": "csrf-check"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    # Same request with the header → passes.
    r = client.post("/tournaments", json={"name": "csrf-check"}, headers=CSRF)
    assert r.status_code == 201
    # Reads never need the header.
    assert client.get("/tournaments").status_code == 200


def test_local_bootstrap_flow_unchanged_without_cookies(client):
    """Rule 3: the solo operator path — no signup, no cookie, no CSRF."""
    tid = seed_tournament(client, name="local-zero-friction")
    r = client.get("/tournaments")
    assert [t["id"] for t in r.json()] == [tid]
    me = client.get("/auth/me")
    assert me.json()["isBootstrap"] is True
    assert me.json()["authMode"] == "local"


def test_session_identity_scopes_the_hub(client):
    """A cookie-authenticated account sees its own workspaces, not the
    bootstrap operator's — the first taste of real tenancy."""
    bootstrap_tid = seed_tournament(client, name="bootstrap-owned")

    _register(client, email="tenant@example.com")
    r = client.post("/tournaments", json={"name": "tenant-owned"}, headers=CSRF)
    assert r.status_code == 201
    tenant_tid = r.json()["id"]

    listed = [t["id"] for t in client.get("/tournaments").json()]
    assert listed == [tenant_tid]

    client.post("/auth/logout", headers=CSRF)
    client.cookies.clear()
    listed = [t["id"] for t in client.get("/tournaments").json()]
    assert listed == [bootstrap_tid]
