"""Idempotent operator commands endpoint (Step C).

``POST /tournaments/{tournament_id}/commands`` is the canonical write
path for every operator state-machine action — call to court, start,
finish, retire, uncall. Each request carries a client-generated UUID
as the idempotency key; repeated submissions get the original
outcome (200 with current state on success, 409 with original
rejection reason on failure).

The processing pipeline lives in
``LocalRepository.process_command``; this module is the thin route
surface plus a small adapter that translates the ``action`` string
into a ``MatchStatus`` target via ``ACTION_TO_TARGET_STATUS``. Stale
versions and illegal transitions raise ``ConflictError``, which the
app-level exception handler installed in ``app.main`` translates to
HTTP 409 with the structured body the prompt specifies.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Path

from app.constants import ACTION_TO_TARGET_STATUS
from app.dependencies import AuthUser, get_current_user, require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import CommandRequest, CommandResponse
from repositories import LocalRepository, get_repository


router = APIRouter(
    prefix="/tournaments/{tournament_id}/commands",
    tags=["commands"],
)

_OPERATOR = Depends(require_tournament_access("operator"))
log = logging.getLogger("scheduler.commands")


@router.post("", response_model=CommandResponse, dependencies=[_OPERATOR])
def submit_command(
    body: CommandRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    user: AuthUser = Depends(get_current_user),
) -> CommandResponse:
    """Apply or reject an operator command idempotently.

    The route translates the wire-format ``action`` string into the
    target ``MatchStatus`` and delegates the five-step pipeline
    (idempotency / duplicate-rejection / version / transition guard /
    apply) to ``repo.process_command``. Rejections raise
    ``ConflictError`` (mapped to 409 by ``app.main``); applies and
    idempotent replays return 200 with the current match state.
    """
    # Pydantic validated body.action against the MatchAction enum at
    # parse time; if we got here, the value is legal.
    target_status = ACTION_TO_TARGET_STATUS[body.action]
    submitted_by = user.as_uuid()
    if submitted_by is None:
        raise http_error(
            422,
            ErrorCode.INVALID_INPUT,
            "current user id is not a UUID; cannot stamp command audit row",
        )

    result = repo.process_command(
        tournament_id=tournament_id,
        command_id=body.id,
        match_id=body.match_id,
        action=body.action.value,
        target_status=target_status,
        payload=body.payload,
        seen_version=body.seen_version,
        submitted_by=submitted_by,
    )

    applied_at = result.command.applied_at
    return CommandResponse(
        command_id=result.command.id,
        match_id=result.match.id,
        status=result.match.status,
        version=result.match.version,
        court_id=result.match.court_id,
        time_slot=result.match.time_slot,
        applied_at=applied_at.isoformat() if applied_at else "",
        replay=result.is_replay,
    )
