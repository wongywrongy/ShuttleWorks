"""DB-backed solve-job queue — enqueue / claim / heartbeat / complete / reap.

SP-CLOUD-1 Phase 1. The queue rides the primary database (SQLite in
local mode, Postgres in cloud mode) — no broker, no new daemon. Design
borrows from Solid Queue / procrastinate (claiming, lease semantics)
and from the outbox pattern (enqueue in the caller's transaction,
injectable session factory, synchronous testable functions).

Transaction contract: **no function here commits or rolls back.** The
caller owns the transaction. The API layer enqueues in the same
transaction as any related business writes (Rule 9 — a job can never
exist for state that was rolled back); the worker loop commits after
each claim / heartbeat / completion so Postgres row locks are released
promptly.

Retry policy: only infrastructure failures (dead worker, killed
subprocess, unhandled exception) requeue, bounded by ``max_attempts``.
``infeasible`` is a *domain outcome* — terminal on first completion,
never retried, never an HTTP 500.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from database.models import SolveJob, SolveJobStatus

log = logging.getLogger("scheduler.solve_jobs")

# Job types. Initially only the meet batch solve rides the rail
# (Phase 0 decision C3); bracket solves are a later slice.
MEET_SCHEDULE_SOLVE = "meet_schedule_solve"

ACTIVE_STATUSES: tuple[str, ...] = (
    SolveJobStatus.QUEUED.value,
    SolveJobStatus.CLAIMED.value,
    SolveJobStatus.RUNNING.value,
)

TERMINAL_STATUSES: tuple[str, ...] = (
    SolveJobStatus.SUCCEEDED.value,
    SolveJobStatus.FAILED.value,
    SolveJobStatus.INFEASIBLE.value,
    SolveJobStatus.CANCELLED.value,
)

# Every legal edge of the job state machine. ``queued`` re-entry from
# claimed/running is the lease-reap / retry path.
VALID_TRANSITIONS: dict[str, frozenset[str]] = {
    SolveJobStatus.QUEUED.value: frozenset(
        {SolveJobStatus.CLAIMED.value, SolveJobStatus.CANCELLED.value}
    ),
    SolveJobStatus.CLAIMED.value: frozenset(
        {
            SolveJobStatus.RUNNING.value,
            SolveJobStatus.QUEUED.value,
            SolveJobStatus.FAILED.value,
            SolveJobStatus.CANCELLED.value,
        }
    ),
    SolveJobStatus.RUNNING.value: frozenset(
        {
            SolveJobStatus.SUCCEEDED.value,
            SolveJobStatus.INFEASIBLE.value,
            SolveJobStatus.FAILED.value,
            SolveJobStatus.QUEUED.value,
            SolveJobStatus.CANCELLED.value,
        }
    ),
    SolveJobStatus.SUCCEEDED.value: frozenset(),
    SolveJobStatus.FAILED.value: frozenset(),
    SolveJobStatus.INFEASIBLE.value: frozenset(),
    SolveJobStatus.CANCELLED.value: frozenset(),
}


class SolveJobTransitionError(ValueError):
    """An illegal state-machine edge was attempted."""

    def __init__(self, current: str, target: str) -> None:
        super().__init__(f"illegal solve-job transition {current!r} -> {target!r}")
        self.current = current
        self.target = target


class ActiveSolveJobConflict(Exception):
    """A submit tripped the one-active-job-per-(tournament, type) rule.

    Carries the existing active job so the API layer can return it in
    the 409 body (the UI mirrors the constraint by disabling the solve
    button and showing which job is active).
    """

    def __init__(self, existing: SolveJob) -> None:
        super().__init__(
            f"tournament {existing.tournament_id} already has an active "
            f"{existing.type} job ({existing.id}, status={existing.status})"
        )
        self.existing = existing


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def assert_valid_transition(current: str, target: str) -> None:
    if target not in VALID_TRANSITIONS.get(current, frozenset()):
        raise SolveJobTransitionError(current, target)


def _transition(job: SolveJob, target: str) -> None:
    assert_valid_transition(job.status, target)
    job.status = target


def is_terminal(status: str) -> bool:
    return status in TERMINAL_STATUSES


# ---- submit path (API-owned transaction) --------------------------------


def enqueue(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    type_: str,
    params: dict,
    input_snapshot: dict,
    idempotency_key: Optional[str] = None,
    priority: int = 100,
    max_attempts: int = 2,
) -> tuple[SolveJob, bool]:
    """Insert a job in the caller's transaction.

    Returns ``(job, created)``. Stripe idempotency semantics: a resubmit
    with a previously seen ``idempotency_key`` returns the original job
    (whatever its state) with ``created=False`` and inserts nothing.
    Raises :class:`ActiveSolveJobConflict` when another job for this
    ``(tournament_id, type_)`` is still active; the partial unique index
    ``uq_solve_jobs_active`` backstops the rare concurrent-submit race
    (the resulting ``IntegrityError`` surfaces at flush/commit and maps
    to the same 409 at the API layer).
    """
    if idempotency_key:
        existing = session.execute(
            select(SolveJob).where(SolveJob.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False

    active = session.execute(
        select(SolveJob).where(
            SolveJob.tournament_id == tournament_id,
            SolveJob.type == type_,
            SolveJob.status.in_(ACTIVE_STATUSES),
        )
    ).scalar_one_or_none()
    if active is not None:
        raise ActiveSolveJobConflict(active)

    job = SolveJob(
        tournament_id=tournament_id,
        type=type_,
        status=SolveJobStatus.QUEUED.value,
        params=params,
        input_snapshot=input_snapshot,
        idempotency_key=idempotency_key,
        priority=priority,
        max_attempts=max_attempts,
    )
    session.add(job)
    # Flush now so the unique indexes fire inside the submit request
    # rather than at some later autoflush, and the row has its defaults.
    session.flush()
    return job, True


def cancel(session: Session, job: SolveJob) -> SolveJob:
    """Cancel a queued/claimed/running job (caller's transaction).

    A queued job just transitions. For claimed/running jobs the status
    flip is the cancellation *request*: the worker observes it on its
    next heartbeat and kills the solve subprocess (Phase 2). Cancelling
    an already-terminal job is a no-op (idempotent cancel).
    """
    if is_terminal(job.status):
        return job
    _transition(job, SolveJobStatus.CANCELLED.value)
    job.finished_at = _utcnow()
    return job


def get_job(
    session: Session, tournament_id: uuid.UUID, job_id: uuid.UUID
) -> Optional[SolveJob]:
    return session.execute(
        select(SolveJob).where(
            SolveJob.id == job_id, SolveJob.tournament_id == tournament_id
        )
    ).scalar_one_or_none()


def list_recent(
    session: Session, tournament_id: uuid.UUID, *, limit: int = 20
) -> Sequence[SolveJob]:
    # ``id`` tiebreaker: ``created_at`` alone ties non-deterministically
    # across SQLite/Postgres (repo-wide ordering hazard).
    return (
        session.execute(
            select(SolveJob)
            .where(SolveJob.tournament_id == tournament_id)
            .order_by(SolveJob.created_at.desc(), SolveJob.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )


# ---- worker path (worker-owned transaction; commit after each call) -----


def claim_next(
    session: Session, *, worker_id: str, now: Optional[datetime] = None
) -> Optional[SolveJob]:
    """Atomically claim the oldest highest-priority queued job.

    Postgres: ``SELECT … FOR UPDATE SKIP LOCKED`` with explicit ordering
    (SKIP LOCKED alone guarantees no double-claim, not fairness).
    SQLite: plain candidate select + a guarded ``UPDATE … WHERE
    status='queued'`` — the write lock plus the status re-check make the
    claim atomic without emulating SKIP LOCKED.

    ``attempts`` counts claims: it is incremented here, so "attempts"
    means "execution attempts started", and retry budgets compare
    against it directly.
    """
    now = now or _utcnow()
    candidate_stmt = (
        select(SolveJob.id)
        .where(SolveJob.status == SolveJobStatus.QUEUED.value)
        .order_by(SolveJob.priority, SolveJob.created_at, SolveJob.id)
        .limit(1)
    )
    if session.get_bind().dialect.name == "postgresql":
        candidate_stmt = candidate_stmt.with_for_update(skip_locked=True)

    job_id = session.execute(candidate_stmt).scalar_one_or_none()
    if job_id is None:
        return None

    claimed = session.execute(
        update(SolveJob)
        .where(SolveJob.id == job_id, SolveJob.status == SolveJobStatus.QUEUED.value)
        .values(
            status=SolveJobStatus.CLAIMED.value,
            claimed_by=worker_id,
            claimed_at=now,
            heartbeat_at=now,
            attempts=SolveJob.attempts + 1,
        )
    ).rowcount
    if claimed != 1:
        # Lost a race with another claimer between select and update
        # (SQLite path only) — treat as "nothing available this tick".
        return None
    return session.get(SolveJob, job_id)


def mark_running(session: Session, job: SolveJob) -> SolveJob:
    _transition(job, SolveJobStatus.RUNNING.value)
    job.started_at = _utcnow()
    job.heartbeat_at = job.started_at
    return job


def heartbeat(
    session: Session, job: SolveJob, *, worker_id: str, progress: Optional[dict] = None
) -> str:
    """Refresh the lease; returns the job's *current* status.

    The worker inspects the returned status each beat — seeing
    ``cancelled`` is how a kill request reaches the solve subprocess.

    LEASE OWNERSHIP — the same invariant ``_record_outcome`` enforces on
    the completion path (see the long rationale in
    ``services/solve_worker.py``), applied to the *other* lease-mutating
    write. A heartbeat is not a read: it extends a lease.

    A worker whose database link drops mid-solve stops beating, the
    reaper requeues the job and another worker claims it. If the first
    worker's link then comes back *while the new owner is still
    solving* — a flapping tailnet link, not a permanent outage — its
    next beat would find the job ``running`` and refresh
    ``heartbeat_at`` on a lease it no longer holds. That write is worse
    than useless: should the real owner die later, the ghost's beats
    keep ``heartbeat_at`` fresh forever, so ``reap_expired`` never
    reclaims the job and ``/health/metrics`` reports a healthy
    heartbeat for a job nobody is working on. A stuck job that looks
    alive is the failure shape monitoring cannot see.

    ``worker_id`` is required rather than optional on purpose: a guard
    callers may omit is a guard callers will omit.
    """
    session.refresh(job)
    if job.claimed_by != worker_id:
        log.warning(
            "refusing heartbeat for job %s: lease now held by %s (status=%s). "
            "This worker lost its lease — most likely a database outage "
            "stopped its heartbeats mid-solve.",
            job.id,
            job.claimed_by,
            job.status,
        )
        # Still return the live status: the caller's cancel signal rides
        # this return value, and a ghost worker learning it should stop
        # is exactly what we want.
        return job.status
    if job.status in (SolveJobStatus.CLAIMED.value, SolveJobStatus.RUNNING.value):
        job.heartbeat_at = _utcnow()
        if progress is not None:
            job.progress = progress
    return job.status


def complete_success(session: Session, job: SolveJob, result: dict) -> SolveJob:
    _transition(job, SolveJobStatus.SUCCEEDED.value)
    job.result = result
    job.finished_at = _utcnow()
    return job


def complete_infeasible(session: Session, job: SolveJob, result: dict) -> SolveJob:
    """Terminal domain outcome — the solver proved infeasibility (or
    exhausted its budget without a solution). Never retried."""
    _transition(job, SolveJobStatus.INFEASIBLE.value)
    job.result = result
    job.finished_at = _utcnow()
    return job


def fail(
    session: Session, job: SolveJob, error: dict, *, retryable: bool
) -> SolveJob:
    """Record a failure; requeue when it's a retryable infra failure.

    ``retryable=True`` covers infrastructure deaths (worker crash, child
    killed by the memory guard, unhandled exception). Validation
    failures and domain outcomes are not retryable — validation belongs
    at submit time and infeasibility goes through
    :func:`complete_infeasible`.
    """
    if retryable and job.attempts < job.max_attempts:
        _transition(job, SolveJobStatus.QUEUED.value)
        job.error = error  # kept for observability; cleared on success
        job.claimed_by = None
        job.claimed_at = None
        job.heartbeat_at = None
        job.started_at = None
        job.progress = None
        return job
    _transition(job, SolveJobStatus.FAILED.value)
    job.error = error
    job.finished_at = _utcnow()
    return job


def reap_expired(
    session: Session,
    *,
    lease_seconds: float,
    now: Optional[datetime] = None,
) -> int:
    """Return jobs whose worker stopped heartbeating to the queue.

    This is how a dead worker's job survives — it must run even in
    local mode (crash recovery on restart). Jobs past their retry
    budget fail terminally instead of looping forever.
    """
    now = now or _utcnow()
    cutoff = now - timedelta(seconds=lease_seconds)
    stale = (
        session.execute(
            select(SolveJob).where(
                SolveJob.status.in_(
                    (SolveJobStatus.CLAIMED.value, SolveJobStatus.RUNNING.value)
                ),
                SolveJob.heartbeat_at < cutoff,
            )
        )
        .scalars()
        .all()
    )
    for job in stale:
        log.warning(
            "reaping solve job %s (worker=%s, heartbeat_at=%s, attempts=%d/%d)",
            job.id,
            job.claimed_by,
            job.heartbeat_at,
            job.attempts,
            job.max_attempts,
        )
        fail(
            session,
            job,
            {
                "code": "lease_expired",
                "message": "worker stopped heartbeating; lease reclaimed",
                "detail": {"claimed_by": job.claimed_by},
            },
            retryable=True,
        )
    return len(stale)


def prune_terminal(
    session: Session,
    *,
    retention_days: int,
    now: Optional[datetime] = None,
) -> int:
    """Delete terminal jobs older than the retention window."""
    now = now or _utcnow()
    cutoff = now - timedelta(days=retention_days)
    result = session.execute(
        delete(SolveJob).where(
            SolveJob.status.in_(TERMINAL_STATUSES),
            SolveJob.finished_at < cutoff,
        )
    )
    return result.rowcount


# ---- determinism defaults (Rule 5) --------------------------------------


def default_solve_params(settings) -> dict:
    """Central solver-param defaults persisted into each job at submit.

    The worker reads ONLY the job's stored params — never live settings
    — so re-running a job reproduces the original solve even after the
    deployment's defaults change. Model-build order is not a param: the
    engine sorts its own iteration (SP-CLOUD-3), so determinism does not
    depend on the execution environment at all.
    """
    return {
        "random_seed": settings.solve_random_seed,
        "num_workers": settings.solve_num_workers,
        "max_deterministic_time": settings.solve_max_deterministic_time,
        "wall_clock_ceiling_seconds": settings.solve_wall_clock_ceiling_seconds,
        "deterministic": True,
    }
