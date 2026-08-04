"""Solve-worker loop tests (SP-CLOUD-1 Phase 2) — stubbed runner.

The runner seam lets these tests drive every outcome path without a
real subprocess; the real-solve pipeline is covered by
``tests/test_solve_job_determinism.py``.
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, SolveJob, Tournament
from services import solve_jobs
from services.solve_runner import RunnerOutcome
from services.solve_worker import SolveWorker

SETTINGS = SimpleNamespace(
    job_poll_interval_seconds=0.01,
    job_lease_seconds=30.0,
    job_retention_days=30,
    solve_memory_limit_mb=512,
)


@pytest.fixture
def Session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    engine.dispose()


@pytest.fixture
def enqueue_job(Session):
    def _enqueue(**kwargs) -> str:
        s = Session()
        try:
            t = Tournament(name="w")
            s.add(t)
            s.commit()
            defaults = dict(
                tournament_id=t.id,
                type_=solve_jobs.MEET_SCHEDULE_SOLVE,
                params={"wall_clock_ceiling_seconds": 5.0},
                input_snapshot={"config": {}},
            )
            defaults.update(kwargs)
            job, _ = solve_jobs.enqueue(s, **defaults)
            s.commit()
            return job.id
        finally:
            s.close()

    return _enqueue


def _worker(Session, runner) -> SolveWorker:
    return SolveWorker(
        settings=SETTINGS,
        session_factory=Session,
        runner=runner,
        worker_id="test-worker",
    )


def _job(Session, job_id) -> SolveJob:
    s = Session()
    try:
        return s.get(SolveJob, job_id)
    finally:
        s.close()


def test_happy_path_executes_and_stores_result(Session, enqueue_job):
    job_id = enqueue_job()
    calls = {}

    def runner(params, input_snapshot, *, heartbeat, cancel_check):
        calls["params"] = params
        calls["snapshot"] = input_snapshot
        heartbeat()  # must not blow up
        assert cancel_check() is False
        return RunnerOutcome(kind="ok", result={"status": "optimal", "assignments": []})

    assert _worker(Session, runner).run_once() is True
    job = _job(Session, job_id)
    assert job.status == "succeeded"
    assert job.result["status"] == "optimal"
    assert job.started_at is not None and job.finished_at is not None
    # The default memory cap flows into the child params.
    assert calls["params"]["memory_limit_mb"] == 512
    assert calls["snapshot"] == {"config": {}}


def test_idle_tick_returns_false(Session):
    runner = lambda *a, **k: pytest.fail("runner must not run on an empty queue")
    assert _worker(Session, runner).run_once() is False


def test_infeasible_result_maps_to_infeasible_status(Session, enqueue_job):
    job_id = enqueue_job()
    runner = lambda *a, **k: RunnerOutcome(
        kind="ok", result={"status": "infeasible", "infeasibleReasons": ["no courts"]}
    )
    _worker(Session, runner).run_once()
    job = _job(Session, job_id)
    assert job.status == "infeasible"
    assert job.result["infeasibleReasons"] == ["no courts"]
    assert job.error is None


def test_child_error_is_terminal_failure(Session, enqueue_job):
    job_id = enqueue_job(max_attempts=3)
    runner = lambda *a, **k: RunnerOutcome(
        kind="error", error={"code": "solve_error", "message": "boom"}
    )
    _worker(Session, runner).run_once()
    job = _job(Session, job_id)
    assert job.status == "failed"
    assert job.attempts == 1  # deterministic error: no retry despite budget


def test_infra_failure_requeues_then_fails_at_budget(Session, enqueue_job):
    job_id = enqueue_job(max_attempts=2)
    runner = lambda *a, **k: RunnerOutcome(
        kind="infra", error={"code": "child_died", "message": "exit -9"}
    )
    worker = _worker(Session, runner)
    worker.run_once()
    assert _job(Session, job_id).status == "queued"
    worker.run_once()
    job = _job(Session, job_id)
    assert job.status == "failed"
    assert job.attempts == 2


def test_cancel_during_run_kills_and_stays_cancelled(Session, enqueue_job):
    job_id = enqueue_job()

    def runner(params, input_snapshot, *, heartbeat, cancel_check):
        # Simulate the user cancelling mid-solve, then the supervisor
        # noticing on its next poll.
        s = Session()
        try:
            solve_jobs.cancel(s, s.get(SolveJob, job_id))
            s.commit()
        finally:
            s.close()
        assert cancel_check() is True
        return RunnerOutcome(kind="cancelled")

    _worker(Session, runner).run_once()
    job = _job(Session, job_id)
    assert job.status == "cancelled"
    assert job.result is None


def test_late_result_after_cancel_is_discarded(Session, enqueue_job):
    """Child finished a nanosecond after the cancel landed: the user's
    decision wins and the result is dropped."""
    job_id = enqueue_job()

    def runner(params, input_snapshot, *, heartbeat, cancel_check):
        s = Session()
        try:
            solve_jobs.cancel(s, s.get(SolveJob, job_id))
            s.commit()
        finally:
            s.close()
        return RunnerOutcome(kind="ok", result={"status": "optimal"})

    _worker(Session, runner).run_once()
    job = _job(Session, job_id)
    assert job.status == "cancelled"
    assert job.result is None


def test_first_tick_maintenance_reaps_orphans(Session, enqueue_job):
    """A job whose worker died (stale heartbeat) is requeued by the
    maintenance pass and immediately re-executed — crash recovery on
    restart, which must work even in local embedded mode."""
    job_id = enqueue_job()
    s = Session()
    try:
        job = solve_jobs.claim_next(s, worker_id="dead-worker")
        solve_jobs.mark_running(s, job)
        job.heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        s.commit()
    finally:
        s.close()

    runner = lambda *a, **k: RunnerOutcome(kind="ok", result={"status": "optimal"})
    assert _worker(Session, runner).run_once() is True
    job = _job(Session, job_id)
    assert job.status == "succeeded"
    assert job.claimed_by == "test-worker"
    assert job.attempts == 2


def test_start_stop_thread_lifecycle(Session, enqueue_job):
    job_id = enqueue_job()
    done = threading.Event()

    def runner(params, input_snapshot, *, heartbeat, cancel_check):
        done.set()
        return RunnerOutcome(kind="ok", result={"status": "optimal"})

    worker = _worker(Session, runner)
    worker.start()
    try:
        assert done.wait(timeout=5.0), "worker thread never executed the job"
    finally:
        worker.stop()
    assert worker._thread is None
    assert _job(Session, job_id).status == "succeeded"


def test_stop_is_idempotent_and_start_twice_is_safe(Session):
    runner = lambda *a, **k: RunnerOutcome(kind="ok")
    worker = _worker(Session, runner)
    worker.start()
    worker.start()  # no second thread
    worker.stop()
    worker.stop()
    assert worker._thread is None
