"""Solve-job endpoints — the long-running-operation resource (SP-CLOUD-1).

``POST /tournaments/{id}/solve-jobs`` validates + snapshots the solver
input, enqueues transactionally (Rule 9), and returns 202 with the job
DTO; the client polls ``GET …/solve-jobs/{job_id}`` until a terminal
status. Run-time errors and infeasibility live INSIDE the job resource
(AIP-151); only submit-time validation is a transport error here.

Idempotency: Stripe semantics via the ``Idempotency-Key`` header — a
retry with the same key returns the same job, never a second solve.
Concurrency: at most one active job per tournament (enforced by the
``uq_solve_jobs_active`` partial unique index); a conflicting submit
returns 409 carrying the existing active job so the UI can mirror it.

The legacy synchronous solve routes (``POST /schedule`` and
``POST /schedule/stream``) are explicitly 410 Gone — see api/schedule.py.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, Path
from sqlalchemy.exc import IntegrityError

from adapters.badminton import candidate_pool_size_for
from app.config import settings
from app.dependencies import get_current_user, require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import (
    ScheduleDTO,
    SolveJobDTO,
    SolveJobErrorDTO,
    SolveJobListDTO,
)
from api.schedule import GenerateScheduleRequest
from repositories import LocalRepository, get_repository
from services import solve_jobs
from services.solve_jobs import ActiveSolveJobConflict, default_solve_params

router = APIRouter(
    prefix="/tournaments/{tournament_id}/solve-jobs",
    tags=["solve-jobs"],
    dependencies=[Depends(get_current_user)],
)

_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))

log = logging.getLogger("scheduler.solve_jobs_api")


def _job_to_dto(job) -> SolveJobDTO:
    return SolveJobDTO(
        id=str(job.id),
        tournamentId=str(job.tournament_id),
        type=job.type,
        status=job.status,
        attempts=job.attempts,
        maxAttempts=job.max_attempts,
        progress=job.progress,
        result=ScheduleDTO.model_validate(job.result) if job.result else None,
        error=SolveJobErrorDTO.model_validate(job.error) if job.error else None,
        params=job.params or {},
        createdAt=job.created_at.isoformat(),
        startedAt=job.started_at.isoformat() if job.started_at else None,
        finishedAt=job.finished_at.isoformat() if job.finished_at else None,
    )


def _build_params(request: GenerateScheduleRequest) -> dict:
    """Job params = central determinism defaults + per-config overrides.

    Persisted at submit so the worker never consults live settings and
    a job re-run reproduces the original solve (Rule 5a)."""
    params = default_solve_params(settings)
    cfg = request.config
    if cfg.randomSeed is not None:
        params["random_seed"] = int(cfg.randomSeed)
    if cfg.solverTimeLimitSeconds is not None:
        # The legacy knob meant "solve budget in seconds". Deterministic
        # time is calibrated as roughly seconds-on-a-reference-machine,
        # so the value maps onto the deterministic budget; the wall
        # ceiling stays an outer backstop that never binds first.
        budget = float(cfg.solverTimeLimitSeconds)
        params["max_deterministic_time"] = budget
        params["wall_clock_ceiling_seconds"] = max(
            params["wall_clock_ceiling_seconds"], budget * 2
        )
    params["candidate_pool_size"] = candidate_pool_size_for(cfg)
    return params


@router.post("", response_model=SolveJobDTO, status_code=202, dependencies=[_OPERATOR])
def submit_solve_job(
    body: GenerateScheduleRequest,
    tournament_id: uuid.UUID = Path(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    repo: LocalRepository = Depends(get_repository),
) -> SolveJobDTO:
    """Enqueue one solve. 202 always means "accepted, poll the job".

    A replayed ``Idempotency-Key`` returns the original job (200-shaped
    body, still 202 status for uniformity); a different key while a job
    is active is a 409 with the active job's id in the error detail.
    """
    session = repo.session
    try:
        job, created = solve_jobs.enqueue(
            session,
            tournament_id=tournament_id,
            type_=solve_jobs.MEET_SCHEDULE_SOLVE,
            params=_build_params(body),
            input_snapshot=body.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            max_attempts=settings.job_max_attempts,
        )
        session.commit()
    except ActiveSolveJobConflict as exc:
        session.rollback()
        raise http_error(
            409,
            ErrorCode.SOLVE_JOB_ACTIVE,
            "a solve is already running for this tournament",
            extra={
                "activeJobId": str(exc.existing.id),
                "activeJobStatus": exc.existing.status,
            },
        )
    except IntegrityError:
        # Concurrent-submit race lost against the partial unique index —
        # same semantics as the pre-check, without the job handle.
        session.rollback()
        raise http_error(
            409,
            ErrorCode.SOLVE_JOB_ACTIVE,
            "a solve is already running for this tournament",
        )
    if not created:
        log.info("idempotent replay of solve job %s", job.id)
    return _job_to_dto(job)


@router.get("", response_model=SolveJobListDTO, dependencies=[_VIEWER])
def list_solve_jobs(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> SolveJobListDTO:
    jobs = solve_jobs.list_recent(repo.session, tournament_id, limit=20)
    return SolveJobListDTO(jobs=[_job_to_dto(j) for j in jobs])


@router.get("/{job_id}", response_model=SolveJobDTO, dependencies=[_VIEWER])
def get_solve_job(
    tournament_id: uuid.UUID = Path(...),
    job_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> SolveJobDTO:
    job = solve_jobs.get_job(repo.session, tournament_id, job_id)
    if job is None:
        raise http_error(404, ErrorCode.SOLVE_JOB_NOT_FOUND, "solve job not found")
    return _job_to_dto(job)


@router.post("/{job_id}/cancel", response_model=SolveJobDTO, dependencies=[_OPERATOR])
def cancel_solve_job(
    tournament_id: uuid.UUID = Path(...),
    job_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> SolveJobDTO:
    """Cancel a job. Queued → cancelled immediately; claimed/running →
    cancelled now, and the worker kills the solve subprocess on its
    next heartbeat poll. Cancelling a terminal job is a no-op replay of
    its final state (idempotent)."""
    session = repo.session
    job = solve_jobs.get_job(session, tournament_id, job_id)
    if job is None:
        raise http_error(404, ErrorCode.SOLVE_JOB_NOT_FOUND, "solve job not found")
    solve_jobs.cancel(session, job)
    session.commit()
    return _job_to_dto(job)
