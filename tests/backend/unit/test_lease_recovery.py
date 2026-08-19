"""Reap-exactly-once when a worker loses the database mid-solve.

SP-CLOUD-3 Phase 3.4. The scenario is the deployment's real failure
mode: the worker runs on a different site from Postgres, joined by a
tailnet, and that link can drop while a solve is in flight.

**Why the obvious test proves nothing.** `database/session.py` already
sets `pool_pre_ping=True`, so a connection that died *at checkout* is
transparently replaced. Killing connectivity *between* jobs therefore
passes without exercising anything. The interesting window is narrow and
specific: a worker holding a claimed job with a live lease, whose
heartbeats stop while its child keeps solving — because the child is a
subprocess that never touches the database and neither knows nor cares
that the queue has moved on.

Sequence under test:

    A claims job ──> heartbeats stop (link down)
                     lease expires ──> reaper requeues
                                       B claims and completes
    A's child finishes ──> A tries to write ──> MUST be rejected

That last arrow is the actual duplicate-write path and the easy one to
miss: `running -> succeeded` is a legal transition, so the state machine
cannot catch it. What is illegal is *A* making it, once the lease is no
longer A's.

There are **two** lease-mutating writes, and both need the same
ownership check. The completion path is above. The other is the
heartbeat: if A's link comes back while B is still solving, A's next
beat would refresh `heartbeat_at` on B's job. That write looks harmless
— until B dies for real and A's ghost beats keep the lease looking
fresh forever, so the reaper never reclaims the job. A stuck job that
reports a healthy heartbeat is worse than one that reports a stale one.

Runs on both dialects — the lease logic is shared, and Postgres is where
it will actually run.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, SolveJob, Tournament
from services import solve_jobs
from services.solve_runner import RunnerOutcome
from services.solve_worker import SolveWorker

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")

SETTINGS = SimpleNamespace(
    job_poll_interval_seconds=0.01,
    job_lease_seconds=30.0,
    job_retention_days=30,
    solve_memory_limit_mb=0,
)


@pytest.fixture(params=["sqlite", "postgres"])
def db(request):
    if request.param == "postgres":
        if not POSTGRES_URL:
            pytest.skip("TEST_POSTGRES_URL not set")
        from database.session import normalize_database_url

        engine = create_engine(normalize_database_url(POSTGRES_URL), future=True)
    else:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
    Base.metadata.create_all(engine)
    Session = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    try:
        yield Session, request.param
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def queued_job(db):
    Session, _ = db
    s = Session()
    try:
        t = Tournament(name="lease")
        s.add(t)
        s.commit()
        job, _created = solve_jobs.enqueue(
            s,
            tournament_id=t.id,
            type_="meet_batch",
            params={},
            input_snapshot={"config": {}, "players": [], "matches": []},
        )
        s.commit()
        return job.id
    finally:
        s.close()


def _worker(Session, worker_id, outcome=None):
    """A worker whose child always 'succeeds' instantly — the solve
    itself is not what these tests are about."""
    result = outcome or RunnerOutcome(kind="ok", result={"status": "optimal", "by": worker_id})

    def runner(params, input_snapshot, **kwargs):
        return result

    w = SolveWorker(
        settings=SETTINGS,
        session_factory=Session,
        runner=lambda *a, **k: result,
        worker_id=worker_id,
    )
    return w


def _age_out_lease(Session, job_id):
    """Stop the world: make the job look like its worker went silent."""
    s = Session()
    try:
        job = s.get(SolveJob, job_id)
        job.heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=3600)
        s.commit()
    finally:
        s.close()


def _claim_without_finishing(Session, worker_id, job_id):
    """Claim + mark running, as a worker does before handing off to its
    child — but stop there, standing in for 'the child is still solving
    when the link drops'."""
    s = Session()
    try:
        job = solve_jobs.claim_next(s, worker_id=worker_id)
        assert job is not None and job.id == job_id
        solve_jobs.mark_running(s, job)
        s.commit()
    finally:
        s.close()


def test_lease_expiry_requeues_the_job_for_another_worker(db, queued_job):
    Session, dialect = db
    _claim_without_finishing(Session, "worker-A", queued_job)
    _age_out_lease(Session, queued_job)

    s = Session()
    try:
        reaped = solve_jobs.reap_expired(s, lease_seconds=SETTINGS.job_lease_seconds)
        s.commit()
        assert reaped == 1, f"[{dialect}] a silent worker's job was not reaped"
        assert s.get(SolveJob, queued_job).status == "queued"
    finally:
        s.close()

    # B picks it up and finishes it.
    assert _worker(Session, "worker-B").run_once() is True
    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        assert job.status == "succeeded"
        assert job.claimed_by == "worker-B"
        assert job.result["by"] == "worker-B"
    finally:
        s.close()


def test_recovering_worker_completion_is_rejected(db, queued_job):
    """The duplicate-write path, in the window where it is actually open.

    B must still be **mid-solve** when A's late completion arrives. If B
    has already finished, the job is terminal and `_transition` rejects
    A's write on its own — so a test written that way passes with the
    ownership guard removed, certifying a protection it never
    exercised. (Observed: the first version of this test did exactly
    that.) With B running, `running -> succeeded` is a legal transition
    and only lease ownership stands between A and a stolen job.
    """
    Session, dialect = db
    _claim_without_finishing(Session, "worker-A", queued_job)
    _age_out_lease(Session, queued_job)

    s = Session()
    try:
        solve_jobs.reap_expired(s, lease_seconds=SETTINGS.job_lease_seconds)
        s.commit()
    finally:
        s.close()

    # B claims and starts solving — but has NOT finished.
    _claim_without_finishing(Session, "worker-B", queued_job)

    # A's child finishes and A reports it.
    _worker(Session, "worker-A")._record_outcome(
        queued_job, RunnerOutcome(kind="ok", result={"status": "optimal", "by": "worker-A"})
    )

    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        assert job.claimed_by == "worker-B", f"[{dialect}] lease ownership moved"
        assert job.status == "running", (
            f"[{dialect}] a worker that lost its lease completed a job another "
            f"worker is still solving (status={job.status})"
        )
        assert job.result is None, (
            f"[{dialect}] the recovering worker wrote its result over a job it "
            "no longer owned — B is mid-solve and will write again, so this "
            "job completes twice"
        )
    finally:
        s.close()


def test_exactly_one_completion_lands_overall(db, queued_job):
    """End to end: one job, one terminal write, and it is B's."""
    Session, dialect = db
    _claim_without_finishing(Session, "worker-A", queued_job)
    _age_out_lease(Session, queued_job)

    s = Session()
    try:
        solve_jobs.reap_expired(s, lease_seconds=SETTINGS.job_lease_seconds)
        s.commit()
    finally:
        s.close()

    # B takes over and is mid-solve; A's late results arrive meanwhile.
    _claim_without_finishing(Session, "worker-B", queued_job)
    for _ in range(2):
        _worker(Session, "worker-A")._record_outcome(
            queued_job, RunnerOutcome(kind="ok", result={"by": "worker-A"})
        )

    # Then B finishes properly.
    _worker(Session, "worker-B")._record_outcome(
        queued_job, RunnerOutcome(kind="ok", result={"by": "worker-B"})
    )

    s = Session()
    try:
        rows = list(s.execute(select(SolveJob)).scalars())
        assert len(rows) == 1, f"[{dialect}] expected one job row, got {len(rows)}"
        assert rows[0].status == "succeeded"
        assert rows[0].result["by"] == "worker-B", (
            f"[{dialect}] the surviving result came from the worker that lost "
            "its lease"
        )
        assert rows[0].finished_at is not None
    finally:
        s.close()


def test_ghost_worker_heartbeat_does_not_refresh_the_lease(db, queued_job):
    """The *other* lease-mutating write: the beat.

    A loses its link, the lease expires, B claims the job — then A's
    link comes back while B is still solving. A's next heartbeat must
    not touch a lease it no longer holds.

    Why this matters more than it looks: a rejected beat costs nothing,
    but an accepted one is permanent damage. Should B die later, A's
    periodic beats keep `heartbeat_at` fresh, `reap_expired` never sees
    an expired lease, and the job sits in `running` forever while
    `/health/metrics` reports a healthy `lastHeartbeatAgeSeconds`. The
    outage becomes invisible.

    Negative control (2026-08-04, CODE_HEALTH rule 3b): dropping the
    `claimed_by` check in `solve_jobs.heartbeat` fails this test —
    verified by removing the guard and re-running, on both dialects.
    """
    Session, dialect = db
    _claim_without_finishing(Session, "worker-A", queued_job)
    _age_out_lease(Session, queued_job)

    s = Session()
    try:
        solve_jobs.reap_expired(s, lease_seconds=SETTINGS.job_lease_seconds)
        s.commit()
    finally:
        s.close()

    # B claims and is mid-solve — the window where the beat is legal for
    # B and illegal for A.
    _claim_without_finishing(Session, "worker-B", queued_job)

    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        b_heartbeat = job.heartbeat_at
        # A's link is back; its supervise loop beats as if nothing happened.
        status = solve_jobs.heartbeat(s, job, worker_id="worker-A")
        s.commit()
    finally:
        s.close()

    assert status == "running", (
        f"[{dialect}] the ghost must still learn the live status — the cancel "
        "signal rides this return value"
    )

    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        assert job.claimed_by == "worker-B", f"[{dialect}] lease ownership moved"
        assert job.heartbeat_at == b_heartbeat, (
            f"[{dialect}] a worker that lost its lease extended it anyway — if "
            "worker-B now dies, the reaper will never reclaim this job"
        )
    finally:
        s.close()


def test_owner_heartbeat_still_refreshes(db, queued_job):
    """The guard must not break the normal beat — the lease holder
    refreshes its own lease and records progress as usual."""
    Session, dialect = db
    _claim_without_finishing(Session, "worker-A", queued_job)

    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        job.heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        s.commit()
        before = job.heartbeat_at

        status = solve_jobs.heartbeat(
            s, job, worker_id="worker-A", progress={"phase": "search"}
        )
        s.commit()

        assert status == "running"
        assert job.heartbeat_at > before, (
            f"[{dialect}] the ordinary beat regressed — the lease holder could "
            "not refresh its own lease"
        )
        assert job.progress == {"phase": "search"}
    finally:
        s.close()


def test_owner_completion_still_works(db, queued_job):
    """The guard must not break the normal path — a worker that still
    holds its lease writes its result as usual."""
    Session, dialect = db
    w = _worker(Session, "worker-A")
    assert w.run_once() is True

    s = Session()
    try:
        job = s.get(SolveJob, queued_job)
        assert job.status == "succeeded", f"[{dialect}] the ordinary path regressed"
        assert job.result["by"] == "worker-A"
    finally:
        s.close()


def test_unknown_job_id_is_survivable(db):
    """A completion for a job that no longer exists (pruned) must not
    raise — the worker loop has to keep going."""
    Session, _ = db
    _worker(Session, "worker-A")._record_outcome(
        uuid.uuid4(), RunnerOutcome(kind="ok", result={})
    )
