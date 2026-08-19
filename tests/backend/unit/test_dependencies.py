"""Identity-dependency unit tests (SP-CLOUD-2 — Supabase Auth retired).

``get_current_user`` resolves: session cookie → local bootstrap
(AUTH_MODE=local) → 401 (AUTH_MODE=cloud). The cookie path itself is
exercised end-to-end in tests/test_auth_endpoints.py; here we pin the
mode split and the fallthrough rules against the real app.
"""
from __future__ import annotations

import pytest

from tests.backend._helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def test_local_mode_resolves_bootstrap_without_credentials(client):
    r = client.get("/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "00000000-0000-0000-0000-000000000000"
    assert body["isBootstrap"] is True


def test_local_mode_ignores_stray_bearer_header(client):
    """The bearer path is GONE — a legacy Authorization header is inert
    (neither authenticates nor errors) and local mode still bootstraps."""
    r = client.get(
        "/auth/me", headers={"Authorization": "Bearer literally-anything"}
    )
    assert r.status_code == 200
    assert r.json()["isBootstrap"] is True


def test_dead_cookie_falls_through_to_bootstrap_in_local_mode(client):
    client.cookies.set("sw_session", "stale-token-from-old-db")
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["isBootstrap"] is True


def test_cloud_mode_401_without_session(client, monkeypatch):
    import app.dependencies as deps

    monkeypatch.setattr(deps.settings, "auth_mode", "cloud")
    assert client.get("/auth/me").status_code == 401
    # …and a valid session still works in cloud mode.
    monkeypatch.setattr(deps.settings, "auth_mode", "local")
    client.post(
        "/auth/register",
        json={"email": "c@example.com", "password": "a fine passphrase!"},
    )
    monkeypatch.setattr(deps.settings, "auth_mode", "cloud")
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "c@example.com"


def test_cloud_mode_dead_cookie_is_401(client, monkeypatch):
    import app.dependencies as deps

    monkeypatch.setattr(deps.settings, "auth_mode", "cloud")
    client.cookies.set("sw_session", "stale-token-from-old-db")
    assert client.get("/auth/me").status_code == 401
