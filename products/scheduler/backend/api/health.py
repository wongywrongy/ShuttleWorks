"""Liveness, readiness, and queue metrics (SP-CLOUD-3 Phase 3.2).

Three endpoints with deliberately different jobs:

- ``GET /health``        — **liveness**. The process is up and serving.
  No dependencies, so it stays true during a database outage: killing a
  container because its database is down turns a recoverable outage into
  a restart loop.
- ``GET /health/ready``  — **readiness**. The database answers *and* the
  schema is at the revision this code expects. Fails (503) when either
  is false. This is the one a load balancer or a deploy gate should read.
- ``GET /health/metrics``— queue depth, oldest-queued age, and per-worker
  heartbeat age. Enough to alert on *"no worker has claimed anything in
  N minutes"*, which is the alert that actually matters: a stalled queue
  is invisible from the outside, because the API stays perfectly healthy
  while nothing gets solved.

**Why readiness had to change.** The previous ``/health/deep`` checked
data-dir writability and that ortools imported — it never touched the
database, so it reported ``healthy`` with Postgres unreachable. A health
check that cannot fail is worse than none: it converts an outage into a
*silent* outage. ``/health/deep`` is kept as an alias for the existing
Docker HEALTHCHECK and compose files, but now performs the real check.

**Access.** These carry operational detail (worker ids, queue shape) and
must not be published through the tunnel. The Cloudflare ingress rule
exposes the application only; scrape these over the tailnet.

**Metrics format.** Plain JSON rather than a Prometheus exposition
format: the collector on the monitoring host ingests OTLP, nothing in
this repo currently speaks Prometheus, and adding a client library to
serve three numbers would be a dependency for its own sake. A collector
scrape job can read JSON directly. If a real Prometheus ever appears,
this shape maps onto it without changing the endpoint.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import func, select, text

from app.config import settings
from database.models import SolveJob
from repositories import LocalRepository, get_repository
from repositories.local import (
    CURRENT_TOURNAMENT_SCHEMA_VERSION as _CURRENT_TOURNAMENT_SCHEMA_VERSION,
)

router = APIRouter(tags=["health"])
log = logging.getLogger("scheduler.health")

_VERSION = "2.0.0"


def _expected_revision() -> Optional[str]:
    """The Alembic head this codebase ships, read from the migration
    scripts rather than hard-coded — a hard-coded revision is one more
    thing to forget to bump, and forgetting silently disables the check."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        backend_dir = Path(__file__).resolve().parent.parent
        cfg = Config(str(backend_dir / "alembic.ini"))
        cfg.set_main_option("script_location", str(backend_dir / "alembic"))
        return ScriptDirectory.from_config(cfg).get_current_head()
    except Exception:  # pragma: no cover - defensive
        log.exception("could not resolve expected alembic head")
        return None


@router.get("/health")
async def health_check():
    """Liveness. Intentionally dependency-free — see the module docstring."""
    return {"status": "healthy", "version": _VERSION, "role": settings.process_role}


@router.get("/health/ready")
def health_ready(response: Response, repo: LocalRepository = Depends(get_repository)):
    """Readiness: database reachable AND schema current.

    Returns 503 when either fails, so this endpoint can actually go red.

    Negative control (2026-08-04, CODE_HEALTH rule 3b): forcing
    ``db_ok = True`` in the except branch fails
    ``test_readiness_fails_when_the_database_is_genuinely_down``. That
    test breaks the database for real rather than mocking the handler,
    because a mocked failure proves the mock works, not the check.
    """
    db_ok = False
    db_error: str | None = None
    revision: str | None = None
    try:
        repo.session.execute(text("SELECT 1"))
        row = repo.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).first()
        revision = row[0] if row else None
        db_ok = True
    except Exception as exc:
        db_error = f"{type(exc).__name__}: {exc}"

    expected = _expected_revision()
    # Only judge the revision when we could read both sides; an
    # unreadable expectation must not manufacture a false failure.
    schema_ok = bool(db_ok and expected and revision == expected)

    ready = db_ok and schema_ok
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if ready else "not_ready",
        "version": _VERSION,
        "databaseReachable": db_ok,
        "databaseError": db_error,
        "schemaRevision": revision,
        "expectedRevision": expected,
        "schemaCurrent": schema_ok,
    }


# The Docker HEALTHCHECK and the existing compose files call
# ``/health/deep``. Kept as an alias so they keep working, but it now
# performs the real readiness check rather than the old
# writability-and-imports probe that could not fail on a database outage.
@router.get("/health/deep")
def health_deep(
    request: Request, response: Response, repo: LocalRepository = Depends(get_repository)
):
    """Deep readiness. Alias of ``/health/ready`` plus the legacy fields
    (data-dir writability, solver import) that existing tooling reads."""
    body: dict[str, Any] = dict(health_ready(response, repo))

    data_dir = Path(settings.data_dir)
    data_dir_writable = False
    data_error: str | None = None
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        probe = data_dir / ".healthcheck.tmp"
        probe.write_text("ok")
        probe.unlink()
        data_dir_writable = True
    except OSError as e:
        data_error = str(e)

    solver_loaded = False
    solver_error: str | None = None
    try:
        from ortools.sat.python import cp_model  # noqa: F401

        solver_loaded = True
    except Exception as e:  # pragma: no cover - import should never fail in prod
        solver_error = str(e)

    healthy = (
        body["status"] == "ready" and data_dir_writable and solver_loaded
    )
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    body.update(
        {
            # Preserved spelling: the existing HEALTHCHECK greps for
            # ``status == "healthy"``.
            "status": "healthy" if healthy else "degraded",
            # Consumed by the frontend's AppStatusPopover ("Data format")
            # via useDeepHealth — unrelated to the Alembic revision above,
            # which is the DB schema rather than the tournament blob's.
            "schemaVersion": _CURRENT_TOURNAMENT_SCHEMA_VERSION,
            "dataDirWritable": data_dir_writable,
            "solverLoaded": solver_loaded,
            "dataDirError": data_error,
            "solverError": solver_error,
            "requestId": getattr(request.state, "request_id", None),
        }
    )
    return body


@router.get("/health/metrics")
def health_metrics(repo: LocalRepository = Depends(get_repository)):
    """Queue shape and worker liveness, from ``solve_jobs`` alone.

    No new table and no new bookkeeping: every number here is derivable
    from columns the queue already maintains.

    The alert worth wiring is ``queued > 0 AND running == 0 AND
    oldestQueuedAgeSeconds > N`` — work arriving and nothing picking it
    up. Per-worker, ``lastHeartbeatAgeSeconds > JOB_LEASE_SECONDS`` means
    that worker is about to have its job reaped.
    """
    now = datetime.now(timezone.utc)

    counts = {
        row[0]: row[1]
        for row in repo.session.execute(
            select(SolveJob.status, func.count()).group_by(SolveJob.status)
        ).all()
    }

    oldest_queued = repo.session.execute(
        select(func.min(SolveJob.created_at)).where(SolveJob.status == "queued")
    ).scalar()

    def _age(ts) -> Optional[float]:
        if ts is None:
            return None
        if ts.tzinfo is None:  # SQLite hands back naive datetimes
            ts = ts.replace(tzinfo=timezone.utc)
        return max(0.0, (now - ts).total_seconds())

    workers = [
        {
            "workerId": r.claimed_by,
            "jobId": str(r.id),
            "lastHeartbeatAgeSeconds": _age(r.heartbeat_at),
        }
        for r in repo.session.execute(
            select(SolveJob).where(SolveJob.status == "running")
        ).scalars()
    ]

    return {
        "queued": counts.get("queued", 0),
        "running": counts.get("running", 0),
        "succeeded": counts.get("succeeded", 0),
        "failed": counts.get("failed", 0),
        "oldestQueuedAgeSeconds": _age(oldest_queued),
        "leaseSeconds": settings.job_lease_seconds,
        "workers": workers,
        "workerCount": len({w["workerId"] for w in workers if w["workerId"]}),
    }
