"""The solve-job worker loop (SP-CLOUD-1 Phase 2).

ONE implementation for both process topologies (Rule 7):

- **Embedded** (local mode, default): ``core/main.py``'s lifespan starts
  one ``SolveWorker`` thread inside the API process — zero-config,
  ``docker compose up`` behaves as today with the solve async under
  the hood.
- **Standalone** (cloud mode): ``python -m worker`` (backend root) runs
  the same class against ``DATABASE_URL``, one thread per
  ``WORKER_CONCURRENCY`` unit.

Thread-based rather than asyncio (the loop is blocking DB I/O plus a
subprocess wait — asyncio buys nothing), with testability seams:
injectable ``session_factory``/``runner`` resolved at call time, and a
synchronous ``run_once()`` tests drive without any thread.

Sessions are short: claim in one transaction, then a fresh session per
heartbeat and per completion write, so Postgres row locks never span a
solve and a mid-solve worker crash loses nothing but its lease.
"""
from __future__ import annotations

import logging
import socket
import threading
import uuid
from typing import Callable, Optional

from solve_rail import solve_jobs
from solve_rail.solve_runner import RunnerOutcome, run_solve_subprocess

log = logging.getLogger("scheduler.solve_worker")

# Reap/prune are cheap single queries but don't need to run every
# claim-poll tick; once every N ticks keeps the loop legible in logs.
_MAINTENANCE_EVERY_TICKS = 10


def default_worker_id() -> str:
    return f"{socket.gethostname()}-{uuid.uuid4().hex[:6]}"


class SolveWorker:
    """Claim → subprocess-solve → heartbeat → complete, forever."""

    def __init__(
        self,
        *,
        settings=None,
        session_factory: Optional[Callable] = None,
        runner: Callable[..., RunnerOutcome] = run_solve_subprocess,
        worker_id: Optional[str] = None,
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._runner = runner
        self.worker_id = worker_id or default_worker_id()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tick = 0

    # ---- wiring (resolved at call time, for testability) ---------------

    def _resolve_settings(self):
        if self._settings is not None:
            return self._settings
        from core.config import settings

        return settings

    def _open_session(self):
        if self._session_factory is not None:
            return self._session_factory()
        from db.session import SessionLocal

        return SessionLocal()

    # ---- lifecycle -----------------------------------------------------

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop, name=f"solve-worker-{self.worker_id}", daemon=True
        )
        self._thread.start()
        log.info("solve worker %s started", self.worker_id)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            # Generous join: a running child is killed by the runner's
            # BaseException guard only on supervisor crash — on a clean
            # stop we let the current solve finish its completion write
            # if it's quick, otherwise the lease/reap machinery recovers
            # the job after restart.
            self._thread.join(timeout=10.0)
            if self._thread.is_alive():
                log.warning(
                    "solve worker %s still busy at shutdown; its job will "
                    "be reaped via the lease",
                    self.worker_id,
                )
        self._thread = None

    def _run_loop(self) -> None:
        settings = self._resolve_settings()
        while not self._stop_event.is_set():
            try:
                worked = self.run_once()
            except Exception:
                log.exception("solve worker %s iteration failed", self.worker_id)
                worked = False
            if not worked:
                self._stop_event.wait(timeout=settings.job_poll_interval_seconds)

    # ---- one iteration (public: tests call this synchronously) ---------

    def run_once(self) -> bool:
        """Maintain the queue and execute at most one job.

        Returns True when a job was executed (the loop immediately polls
        again), False on an idle tick.
        """
        settings = self._resolve_settings()

        self._tick += 1
        if self._tick % _MAINTENANCE_EVERY_TICKS == 1:
            self._maintenance(settings)

        session = self._open_session()
        try:
            job = solve_jobs.claim_next(session, worker_id=self.worker_id)
            if job is None:
                session.commit()
                return False
            try:
                solve_jobs.mark_running(session, job)
            except solve_jobs.SolveJobTransitionError:
                # Cancelled between claim and start — leave it terminal.
                session.commit()
                return True
            session.commit()
            job_id = job.id
            params = dict(job.params)
            input_snapshot = job.input_snapshot
            params.setdefault("memory_limit_mb", settings.solve_memory_limit_mb)
        finally:
            session.close()

        log.info("solve worker %s executing job %s", self.worker_id, job_id)
        outcome = self._runner(
            params,
            input_snapshot,
            heartbeat=lambda: self._beat(job_id),
            cancel_check=lambda: self._is_cancelled(job_id),
        )
        self._record_outcome(job_id, outcome)
        return True

    # ---- helpers -------------------------------------------------------

    def _maintenance(self, settings) -> None:
        session = self._open_session()
        try:
            solve_jobs.reap_expired(
                session, lease_seconds=settings.job_lease_seconds
            )
            solve_jobs.prune_terminal(
                session, retention_days=settings.job_retention_days
            )
            session.commit()
        except Exception:
            session.rollback()
            log.exception("solve-job maintenance failed")
        finally:
            session.close()

    def _beat(self, job_id) -> None:
        session = self._open_session()
        try:
            from db.models import SolveJob

            job = session.get(SolveJob, job_id)
            if job is not None:
                # ``worker_id`` gates the lease refresh — see the ownership
                # note on ``solve_jobs.heartbeat``. Without it a worker that
                # lost and regained its database link would keep a stranger's
                # lease alive.
                solve_jobs.heartbeat(session, job, worker_id=self.worker_id)
                session.commit()
        except Exception:
            session.rollback()
            log.exception("heartbeat failed for job %s", job_id)
        finally:
            session.close()

    def _is_cancelled(self, job_id) -> bool:
        session = self._open_session()
        try:
            from db.models import SolveJob

            job = session.get(SolveJob, job_id)
            return job is None or job.status == "cancelled"
        except Exception:
            log.exception("cancel check failed for job %s", job_id)
            return False
        finally:
            session.close()

    def _record_outcome(self, job_id, outcome: RunnerOutcome) -> None:
        session = self._open_session()
        try:
            from db.models import SolveJob

            job = session.get(SolveJob, job_id)
            if job is None:
                log.warning("job %s vanished before completion write", job_id)
                return
            if job.status == "cancelled":
                # The cancel landed while the child was finishing; the
                # user's decision wins — discard the result.
                session.commit()
                return

            # LEASE OWNERSHIP — the duplicate-write guard.
            #
            # Losing the database mid-solve (a tailnet blip between this
            # worker and Postgres) stops our heartbeats. After
            # ``job_lease_seconds`` the reaper requeues the job and
            # another worker claims it. Our child, meanwhile, is still
            # solving happily — it never touches the database — and
            # eventually finishes and arrives here.
            #
            # Without this check we would write our result over a job
            # someone else now owns: the other worker is mid-solve and
            # will write its own result afterwards, so the job completes
            # twice and the surviving result is whichever raced last.
            # `_transition` cannot catch it — running → succeeded is a
            # perfectly legal move; what is illegal is *us* making it.
            #
            # Rejecting also covers the reaped-but-not-yet-reclaimed
            # window (status back to `queued`). Discarding a good result
            # costs one redundant solve; accepting it risks two writers.
            # Determinism means the re-run produces the same schedule.
            #
            # Negative control (2026-08-04, CODE_HEALTH rule 3b): removing
            # this check fails 4 tests in tests/unit/test_lease_recovery.py.
            # Note the FIRST version of those tests passed without it —
            # they let worker B *finish* before A's late write arrived, so
            # `_transition` rejected it as succeeded -> succeeded and the
            # ownership check was never reached. The window only opens
            # while B is mid-solve, where running -> succeeded is legal.
            if job.claimed_by != self.worker_id:
                log.warning(
                    "discarding completion for job %s: lease now held by %s "
                    "(status=%s). This worker lost its lease — most likely a "
                    "database outage stopped its heartbeats mid-solve.",
                    job_id,
                    job.claimed_by,
                    job.status,
                )
                session.commit()
                return

            if outcome.kind == "ok":
                result = outcome.result or {}
                if result.get("status") == "infeasible":
                    solve_jobs.complete_infeasible(session, job, result)
                else:
                    solve_jobs.complete_success(session, job, result)
            elif outcome.kind == "error":
                solve_jobs.fail(session, job, outcome.error or {}, retryable=False)
            elif outcome.kind == "infra":
                solve_jobs.fail(session, job, outcome.error or {}, retryable=True)
            elif outcome.kind == "cancelled":
                # Runner killed the child on our own cancel_check; the
                # status is already terminal — nothing to write.
                pass
            else:  # unknown outcome kind — treat as infra, don't lose the job
                solve_jobs.fail(
                    session,
                    job,
                    {"code": "unknown_outcome", "message": outcome.kind},
                    retryable=True,
                )
            session.commit()
            log.info("job %s finished: %s", job_id, job.status)
        except Exception:
            session.rollback()
            log.exception("failed to record outcome for job %s", job_id)
        finally:
            session.close()
