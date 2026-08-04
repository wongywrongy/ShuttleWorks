"""Health surface + role-aware startup validation (SP-CLOUD-3 Phase 3).

Two properties here are the point, and both are the kind that quietly
stop holding:

1. **Readiness can fail.** The endpoint it replaces checked data-dir
   writability and that ortools imported — it never touched the
   database, so it answered ``healthy`` with Postgres unreachable. A
   health check that cannot fail converts an outage into a silent
   outage. These tests break the database *for real* (point the engine
   at an unopenable path) rather than mocking a failure, because a
   mocked failure proves the mock works, not the check.

2. **A worker validates only what it uses.** Otherwise a worker-only
   host must carry SMTP credentials it never reads to get past startup,
   and fake credentials in a config file are how real ones eventually
   end up there.
"""
from __future__ import annotations

import pytest

from tests._helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A client whose database looks like production's.

    ``isolate_test_database`` builds the schema with
    ``Base.metadata.create_all``, which leaves no ``alembic_version``
    row. Readiness deliberately treats that as **not ready** — a
    database nobody migrated is exactly the deploy that answers simple
    queries and then fails on the first new column — so the fixture
    stamps the head, which is what the API's lifespan does for real.
    """
    isolate_test_database(tmp_path, monkeypatch)
    from sqlalchemy import text
    from database.session import engine
    from api.health import _expected_revision

    head = _expected_revision()
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))")
        )
        conn.execute(text("DELETE FROM alembic_version"))
        conn.execute(
            text("INSERT INTO alembic_version (version_num) VALUES (:v)"), {"v": head}
        )

    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def test_readiness_refuses_an_unmigrated_database(tmp_path, monkeypatch):
    """A schema built without migrations has no ``alembic_version`` and
    must read as not-ready. This is the case the fixture above papers
    over, so it gets its own test rather than being lost."""
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    r = TestClient(app).get("/health/ready")
    assert r.status_code == 503
    assert r.json()["schemaCurrent"] is False


# ---- Liveness --------------------------------------------------------


def test_liveness_is_dependency_free(client):
    """Liveness must stay true during a database outage.

    Killing a container because its database is down turns a recoverable
    outage into a restart loop, so this probe deliberately checks
    nothing but "the process answers".
    """
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"
    assert body["role"] == "api"


# ---- Readiness -------------------------------------------------------


def test_readiness_passes_on_a_healthy_database(client):
    r = client.get("/health/ready")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ready"
    assert body["databaseReachable"] is True
    assert body["schemaCurrent"] is True
    # The revision is read from the DB and compared against the shipped
    # migration head — not hard-coded, which would be one more thing to
    # forget to bump.
    assert body["schemaRevision"] == body["expectedRevision"]
    assert body["schemaRevision"]


def test_readiness_fails_when_the_database_is_genuinely_down(client, monkeypatch):
    """The Rule 3b control for this endpoint.

    The database is broken for real — the engine is repointed at a path
    that cannot be opened — rather than patching the health handler to
    return False. Mocking the failure would only prove the mock works.
    """
    import database.session as db_session
    from sqlalchemy import create_engine

    dead = create_engine("sqlite:////nonexistent-dir/definitely-not-here.db")
    monkeypatch.setattr(db_session, "engine", dead)
    monkeypatch.setattr(
        db_session.SessionLocal, "kw", {**db_session.SessionLocal.kw, "bind": dead}
    )

    r = client.get("/health/ready")
    assert r.status_code == 503, (
        "readiness reported OK with an unusable database — this endpoint "
        "cannot fail, which makes an outage silent"
    )
    body = r.json()
    assert body["status"] == "not_ready"
    assert body["databaseReachable"] is False
    assert body["databaseError"]


def test_readiness_fails_when_the_schema_is_behind(client, monkeypatch):
    """Reachable but stale is still not ready — a deploy that skipped
    migrations answers queries and then fails on the first new column."""
    import api.health as health_api

    monkeypatch.setattr(health_api, "_expected_revision", lambda: "zz_future_head")
    r = client.get("/health/ready")
    assert r.status_code == 503
    body = r.json()
    assert body["databaseReachable"] is True
    assert body["schemaCurrent"] is False


def test_deep_alias_still_answers_for_the_docker_healthcheck(client):
    """The image's HEALTHCHECK greps this path for ``status == healthy``."""
    r = client.get("/health/deep")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "healthy"
    assert body["dataDirWritable"] is True
    assert body["solverLoaded"] is True
    # But it is now a real readiness check underneath.
    assert body["databaseReachable"] is True


# ---- Metrics ---------------------------------------------------------


def test_metrics_reports_queue_shape_on_an_empty_queue(client):
    r = client.get("/health/metrics")
    assert r.status_code == 200
    body = r.json()
    assert body["queued"] == 0
    assert body["running"] == 0
    assert body["workers"] == []
    assert body["workerCount"] == 0
    assert body["oldestQueuedAgeSeconds"] is None
    assert body["leaseSeconds"] > 0


def test_metrics_surfaces_a_queued_job_and_its_age(client):
    """The numbers behind the alert that matters: work arriving with
    nothing claiming it."""
    from datetime import datetime, timedelta, timezone
    from database.models import SolveJob, Tournament
    from database.session import SessionLocal

    s = SessionLocal()
    try:
        t = Tournament(name="metrics")
        s.add(t)
        s.commit()
        s.add(
            SolveJob(
                tournament_id=t.id,
                type="meet_batch",
                status="queued",
                params={},
                input_snapshot={},
                created_at=datetime.now(timezone.utc) - timedelta(seconds=90),
            )
        )
        s.commit()
    finally:
        s.close()

    body = client.get("/health/metrics").json()
    assert body["queued"] == 1
    assert body["running"] == 0
    assert body["oldestQueuedAgeSeconds"] >= 60
    # queued > 0 AND running == 0 AND age > N is the stalled-queue alert.


# ---- Role-aware startup validation -----------------------------------


def _settings(**overrides):
    from app.config import Settings

    base = dict(
        environment="cloud",
        database_url="postgresql://u:p@h:5432/db",
        auth_mode="cloud",
        session_cookie_secure=True,
        email_backend="smtp",
        smtp_host="smtp.example.com",
    )
    base.update(overrides)
    return Settings(**base)


def test_api_still_fails_closed_without_smtp_or_secure_cookies():
    """The API profile is unchanged — this is the regression guard on
    not having loosened it while making it role-aware."""
    with pytest.raises(ValueError, match="EMAIL_BACKEND=smtp"):
        _settings(email_backend="console")
    with pytest.raises(ValueError, match="SESSION_COOKIE_SECURE"):
        _settings(session_cookie_secure=False)
    with pytest.raises(ValueError, match="AUTH_MODE=cloud"):
        _settings(auth_mode="local")
    with pytest.raises(ValueError, match="DATABASE_URL"):
        _settings(database_url="sqlite:///./local.db")


def test_worker_boots_with_database_config_alone():
    """No SMTP, no cookie settings, no auth mode — a worker reads none of
    them. Requiring them would force fake credentials into a config file
    on the worker host."""
    s = _settings(
        process_role="worker",
        email_backend="console",
        smtp_host="",
        session_cookie_secure=False,
        auth_mode="local",
    )
    assert s.process_role == "worker"


def test_worker_still_refuses_sqlite_in_cloud_mode():
    """The one thing a worker genuinely needs: the API's database.
    SQLite is per-process, so a worker on SQLite would poll an empty
    queue forever while jobs pile up elsewhere — a silent no-op."""
    with pytest.raises(ValueError, match="DATABASE_URL"):
        _settings(process_role="worker", database_url="sqlite:///./local.db")


def test_worker_entrypoint_declares_its_role_before_config_import():
    """`worker.py` must set PROCESS_ROLE at module import, because
    ``app.config`` runs the validator at *its* import — if the worker
    imported config first, the cloud validator would already have
    demanded SMTP."""
    import pathlib

    src = pathlib.Path(__file__).resolve().parents[1] / "backend" / "worker.py"
    text = src.read_text(encoding="utf-8")
    role_at = text.index('os.environ.setdefault("PROCESS_ROLE"')
    # No app/services import may appear before it.
    head = text[:role_at]
    for forbidden in ("from app", "import app", "from services", "from database"):
        assert forbidden not in head, (
            f"{forbidden!r} appears before PROCESS_ROLE is set — the cloud "
            "validator will have run with the API profile already"
        )
