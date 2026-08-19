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

3. **Liveness is public; the operational endpoints are not.** Added
   2026-08-04 after an audit found the whole ``/health*`` tree
   internet-reachable: the module docstring said it must not be
   published through the tunnel, but the tunnel publishes a hostname,
   not a route list. The asymmetry is load-bearing in both directions —
   gating liveness would make a probe unable to tell "unauthorized"
   from "dead", and not gating the rest hands out worker identities and
   the deployed schema revision to anyone who asks.
"""
from __future__ import annotations

import re

import pytest

from tests.backend._helpers import isolate_test_database


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
    from db.session import engine
    from ops.health import _expected_revision

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
    from core.main import app

    return TestClient(app)


def test_readiness_refuses_an_unmigrated_database(tmp_path, monkeypatch):
    """A schema built without migrations has no ``alembic_version`` and
    must read as not-ready. This is the case the fixture above papers
    over, so it gets its own test rather than being lost."""
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

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
    import db.session as db_session
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
    # Exception CLASS only. ``str()`` on a connection failure carries the
    # DSN — host, port, user, sometimes the password — and this body is
    # served to whoever holds the ops token and logged by whatever
    # scrapes it. The operator needs "the database is down", not "which".
    assert re.fullmatch(r"\w+", body["databaseError"]), (
        f"databaseError leaked detail beyond the exception class: "
        f"{body['databaseError']!r}"
    )


def test_readiness_fails_when_the_schema_is_behind(client, monkeypatch):
    """Reachable but stale is still not ready — a deploy that skipped
    migrations answers queries and then fails on the first new column."""
    import ops.health as health_api

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
    from db.models import SolveJob, Tournament
    from db.session import SessionLocal

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


# ---- Operational-endpoint guard --------------------------------------

OPS_PATHS = ("/health/ready", "/health/deep", "/health/metrics")


@pytest.fixture
def ops_token(monkeypatch):
    """Turn the guard on, the way a cloud deployment does."""
    from core.config import settings

    monkeypatch.setattr(settings, "ops_token", "s3kr3t-ops-token")
    return "s3kr3t-ops-token"


@pytest.mark.parametrize("path", OPS_PATHS)
def test_operational_endpoints_require_the_ops_token(client, ops_token, path):
    """The audit finding, pinned.

    Before this guard these three answered 200 to anyone who could reach
    the host — and the shipped self-host ingress routes a public
    hostname straight at the API, so "anyone" meant the internet.
    """
    assert client.get(path).status_code == 403, (
        f"{path} served operational detail without the ops token"
    )


@pytest.mark.parametrize("path", OPS_PATHS)
def test_a_wrong_ops_token_is_rejected(client, ops_token, path):
    r = client.get(path, headers={"X-ShuttleWorks-Ops-Token": "not-the-token"})
    assert r.status_code == 403


@pytest.mark.parametrize("path", OPS_PATHS)
def test_the_ops_token_opens_the_operational_endpoints(client, ops_token, path):
    r = client.get(path, headers={"X-ShuttleWorks-Ops-Token": ops_token})
    assert r.status_code == 200, r.text


def test_liveness_stays_public_when_the_guard_is_on(client, ops_token):
    """The asymmetry is the design, not an oversight.

    A gated liveness probe cannot distinguish "unauthorized" from
    "dead", so an orchestrator kills a container whose only problem was
    a missing header. Liveness exposes nothing worth gating: up, a
    version, a role.
    """
    r = client.get("/health")
    assert r.status_code == 200, "liveness must never require a credential"
    assert r.json()["status"] == "healthy"


@pytest.mark.parametrize("path", OPS_PATHS)
def test_a_blank_ops_token_disables_the_guard(client, path):
    """Local mode's zero-config promise: one operator, one laptop, no
    ingress, no token to invent. Also what keeps the plain-HTTP compose
    stacks' Docker HEALTHCHECKs working — they curl ``/health/deep``
    with no credentials.

    Explicit rather than implied by the other tests, because "the guard
    is off by default" is the assumption every one of them rests on.
    """
    from core.config import settings

    assert settings.ops_token == ""
    assert client.get(path).status_code == 200


# ---- Role-aware startup validation -----------------------------------


def _settings(**overrides):
    from core.config import Settings

    base = dict(
        environment="cloud",
        database_url="postgresql://u:p@h:5432/db",
        auth_mode="cloud",
        session_cookie_secure=True,
        email_backend="smtp",
        smtp_host="smtp.example.com",
        ops_token="an-ops-token",
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


def test_cloud_api_refuses_to_boot_without_an_ops_token():
    """A cloud API sits behind an ingress, and an ingress publishes a
    hostname rather than a route list. Booting without the token is
    booting with the operational endpoints open."""
    with pytest.raises(ValueError, match="OPS_TOKEN"):
        _settings(ops_token="")


def test_worker_boots_with_database_config_alone():
    """No SMTP, no cookie settings, no auth mode, no ops token — a worker
    reads none of them. It serves no HTTP at all, so it has no health
    endpoints to guard. Requiring them would force fake credentials into
    a config file on the worker host."""
    s = _settings(
        process_role="worker",
        email_backend="console",
        smtp_host="",
        session_cookie_secure=False,
        auth_mode="local",
        ops_token="",
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
    ``core.config`` runs the validator at *its* import — if the worker
    imported config first, the cloud validator would already have
    demanded SMTP."""
    import pathlib

    src = pathlib.Path(__file__).resolve().parents[2] / "apps" / "api" / "src" / "worker.py"
    text = src.read_text(encoding="utf-8")
    role_at = text.index('os.environ.setdefault("PROCESS_ROLE"')
    # No core/services/ import may appear before it.
    head = text[:role_at]
    for forbidden in ("from app", "import app", "from services", "from database"):
        assert forbidden not in head, (
            f"{forbidden!r} appears before PROCESS_ROLE is set — the cloud "
            "validator will have run with the API profile already"
        )
