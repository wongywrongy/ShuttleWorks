"""Auth-dependency unit tests for Step 4.

Two modes:
- ``SUPABASE_URL`` blank → ``get_current_user`` returns the synthetic
  local-dev user (no token needed). Lets pytest + local desktop keep
  working without a real Supabase project.
- ``SUPABASE_URL`` configured → the dependency hits the Supabase
  client to verify the JWT; invalid / missing tokens surface as 401.
  Live Supabase calls are mocked here; the production verification path
  is exercised in deployment Step 8.
"""
from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient


def _fresh_module(monkeypatch, **env):
    """Reload app.config + app.dependencies with a fresh env mapping."""
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import app.config as cfg
    importlib.reload(cfg)
    import app.dependencies as deps
    importlib.reload(deps)
    deps.reset_supabase_client()
    return deps


def _client_with_protected_route(deps_module) -> TestClient:
    """Mini FastAPI app: one route guarded by ``get_current_user``."""
    app = FastAPI()

    @app.get("/me")
    def me(user=Depends(deps_module.get_current_user)):
        return {"id": user.id, "email": user.email}

    return TestClient(app)


# ---- Local-dev (no Supabase) mode -------------------------------------


def test_local_dev_mode_returns_synthetic_user_without_token(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    deps = _fresh_module(monkeypatch)
    client = _client_with_protected_route(deps)
    r = client.get("/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "local-dev"
    assert body["email"] == "local@dev"


def test_local_dev_mode_ignores_supplied_token(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    deps = _fresh_module(monkeypatch)
    client = _client_with_protected_route(deps)
    r = client.get("/me", headers={"Authorization": "Bearer literally-anything"})
    assert r.status_code == 200
    assert r.json()["id"] == "local-dev"


# ---- Configured (real Supabase) mode -----------------------------------


def _install_fake_supabase(deps, *, raise_on_call: bool = False, user=None):
    """Bypass real client construction; route ``get_user`` at a fake."""
    class _FakeAuth:
        def get_user(self, token: str):
            if raise_on_call:
                raise RuntimeError("invalid jwt")
            return SimpleNamespace(user=user)

    class _FakeClient:
        auth = _FakeAuth()

    # Skip _get_supabase_client's real ``create_client`` call.
    deps._supabase_client = _FakeClient()


def test_configured_mode_rejects_missing_token(monkeypatch):
    deps = _fresh_module(
        monkeypatch,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-key",
    )
    _install_fake_supabase(deps, user=SimpleNamespace(id="u1", email="a@b.com"))
    client = _client_with_protected_route(deps)
    r = client.get("/me")
    assert r.status_code == 401


def test_configured_mode_rejects_invalid_token(monkeypatch):
    deps = _fresh_module(
        monkeypatch,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-key",
    )
    _install_fake_supabase(deps, raise_on_call=True)
    client = _client_with_protected_route(deps)
    r = client.get("/me", headers={"Authorization": "Bearer bogus"})
    assert r.status_code == 401


def test_configured_mode_accepts_valid_token(monkeypatch):
    deps = _fresh_module(
        monkeypatch,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-key",
    )
    _install_fake_supabase(
        deps,
        user=SimpleNamespace(id="user-123", email="alice@example.com"),
    )
    client = _client_with_protected_route(deps)
    r = client.get("/me", headers={"Authorization": "Bearer good-token"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "user-123"
    assert body["email"] == "alice@example.com"


def test_configured_mode_handles_missing_email(monkeypatch):
    """Supabase users can lack an email until verification — the
    dependency must accept that gracefully rather than 500."""
    deps = _fresh_module(
        monkeypatch,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-key",
    )
    _install_fake_supabase(deps, user=SimpleNamespace(id="user-no-email"))
    client = _client_with_protected_route(deps)
    r = client.get("/me", headers={"Authorization": "Bearer good-token"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "user-no-email"
    assert body["email"] is None


def test_configured_mode_rejects_when_provider_returns_no_user(monkeypatch):
    """The Supabase response can have ``user is None`` for an expired
    refresh token. That maps to 401, not a synthetic success."""
    deps = _fresh_module(
        monkeypatch,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-key",
    )
    _install_fake_supabase(deps, user=None)
    client = _client_with_protected_route(deps)
    r = client.get("/me", headers={"Authorization": "Bearer stale"})
    assert r.status_code == 401


@pytest.fixture(autouse=True)
def _restore_modules():
    """Reload back to clean defaults after each test so the rest of
    the suite isn't polluted with the configured-Supabase env vars."""
    yield
    import app.config as cfg
    importlib.reload(cfg)
    import app.dependencies as deps
    importlib.reload(deps)
    deps.reset_supabase_client()
