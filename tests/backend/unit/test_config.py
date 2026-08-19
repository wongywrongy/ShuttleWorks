"""Pydantic Settings + engine-init unit tests for Step 3.

The Step 3 promise is that ``DATABASE_URL=sqlite:///...`` and
``DATABASE_URL=postgresql://...`` both work without code changes.
A live Postgres round-trip needs Docker; this test asserts the
build-time path (env var → Settings → engine dialect) is correct
for both schemes.
"""
from __future__ import annotations

import importlib

import pytest


def _reload_with_env(monkeypatch, **env):
    """Reload config + session modules with a fresh env mapping."""
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import app.config
    importlib.reload(app.config)
    import database.session
    importlib.reload(database.session)
    return app.config.Settings(), database.session.engine


def test_settings_defaults_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings, engine = _reload_with_env(monkeypatch)
    assert settings.database_url.startswith("sqlite")
    assert engine.dialect.name == "sqlite"


def test_settings_picks_postgres_driver(monkeypatch):
    settings, engine = _reload_with_env(
        monkeypatch,
        DATABASE_URL="postgresql://user:pass@localhost:5432/scheduler",
    )
    assert settings.database_url.startswith("postgresql")
    assert engine.dialect.name == "postgresql"


def test_cors_origins_accepts_json_list(monkeypatch):
    settings, _ = _reload_with_env(
        monkeypatch,
        CORS_ORIGINS='["https://a.example.com", "https://b.example.com"]',
    )
    assert settings.cors_origins == [
        "https://a.example.com",
        "https://b.example.com",
    ]


def test_cors_origins_accepts_comma_separated(monkeypatch):
    settings, _ = _reload_with_env(
        monkeypatch,
        CORS_ORIGINS="https://a.example.com,https://b.example.com",
    )
    assert settings.cors_origins == [
        "https://a.example.com",
        "https://b.example.com",
    ]


def test_legacy_backend_data_dir_env_var(monkeypatch):
    monkeypatch.delenv("DATA_DIR", raising=False)
    settings, _ = _reload_with_env(
        monkeypatch,
        BACKEND_DATA_DIR="/tmp/test-legacy",
    )
    assert settings.data_dir == "/tmp/test-legacy"


def test_data_dir_env_var(monkeypatch):
    monkeypatch.delenv("BACKEND_DATA_DIR", raising=False)
    settings, _ = _reload_with_env(monkeypatch, DATA_DIR="/tmp/test-new")
    assert settings.data_dir == "/tmp/test-new"


def test_host_and_port_env_vars(monkeypatch):
    settings, _ = _reload_with_env(
        monkeypatch,
        HOST="127.0.0.1",
        PORT="9001",
    )
    assert settings.host == "127.0.0.1"
    assert settings.port == 9001


@pytest.fixture(autouse=True)
def _restore_modules():
    """Reload back to clean defaults after each test so DB-touching tests
    in the rest of the suite don't see this file's env shim."""
    yield
    import app.config
    importlib.reload(app.config)
    import database.session
    importlib.reload(database.session)


def test_cloud_mode_refuses_console_email_backend(monkeypatch):
    """SP-CLOUD-2: the console backend logs raw reset/invite tokens --
    cloud startup must fail closed without SMTP delivery."""
    from app.config import Settings

    with pytest.raises(Exception) as e:
        Settings(
            environment="cloud",
            database_url="postgresql://u:p@db/x",
            auth_mode="cloud",
            session_cookie_secure=True,
            email_backend="console",
        )
    assert "EMAIL_BACKEND=smtp" in str(e.value)

    # Positive control: an otherwise-complete cloud config still boots.
    # ``ops_token`` joined the cloud requirements on 2026-08-04 (it guards
    # the operational health endpoints) — it is fixture data here, not
    # the subject of this test.
    ok = Settings(
        environment="cloud",
        database_url="postgresql://u:p@db/x",
        auth_mode="cloud",
        session_cookie_secure=True,
        email_backend="smtp",
        smtp_host="smtp.example.com",
        ops_token="an-ops-token",
    )
    assert ok.email_backend == "smtp"
