"""Director runtime time-axis tools.

Lets the operator account for tournament-day reality without manually
hand-editing every match: arrived late, lunch ran long, equipment swap,
etc. Each action goes through the proposal pipeline so the operator
sees the full impact diff before committing.

Action kinds:
    - ``delay_start { minutes }``      — bump ``config.clockShiftMinutes``
      by N. Pure rendering shift; no solver re-run, no slot moves.
    - ``insert_blackout { fromTime, toTime, reason? }`` — append a
      ``BreakWindow`` to ``config.breaks`` and warm-restart so matches
      avoid the new forbidden window.
    - ``remove_blackout { blackoutIndex }`` — drop a previously
      inserted blackout from ``config.breaks`` and warm-restart so the
      freed window is reused.
    - ``compress_remaining`` is in the planning doc but deferred from
      this initial rollout (intervalMinutes is a global config knob and
      changing it mid-tournament has cross-cutting consequences that
      need their own design pass).
"""
from __future__ import annotations

import logging
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.error_codes import ErrorCode, http_error
from app.schemas import (
    BreakWindow,
    HHMMTime,
    MatchDTO,
    PlayerDTO,
    Proposal,
    ProposalKind,
    ScheduleDTO,
    TournamentConfig,
)
from api.match_state import MatchStateDTO
from api.schedule_proposals import _build_proposal, _evict_expired, _get_lock, _get_store
from api.schedule_warm_restart import WarmRestartRequest, _run_warm_restart


_MAX_CLOCK_SHIFT_MIN = 24 * 60


router = APIRouter(prefix="/schedule", tags=["schedule-director"])
log = logging.getLogger("scheduler.director")


class DirectorAction(BaseModel):
    """A single director-tool invocation. Discriminated by ``kind``.

    Only the fields relevant to the chosen kind need to be set; the
    others are ignored. (We avoid a discriminated-union here because
    the frontend already round-trips a flat dict per the existing
    Disruption shape.)
    """
    kind: Literal[
        "delay_start",
        "insert_blackout",
        "remove_blackout",
        "reopen_court",
    ]
    minutes: Optional[int] = Field(None, ge=1, le=24 * 60)
    fromTime: Optional[HHMMTime] = None
    toTime: Optional[HHMMTime] = None
    reason: Optional[str] = None
    blackoutIndex: Optional[int] = Field(None, ge=0)
    courtId: Optional[int] = Field(None, ge=1)


class DirectorActionRequest(BaseModel):
    action: DirectorAction
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    originalSchedule: ScheduleDTO
    matchStates: Dict[str, MatchStateDTO] = {}


def _apply_delay_start(
    store, request: DirectorActionRequest,
) -> Proposal:
    """Bump ``clockShiftMinutes``; do not re-solve; produce a Proposal."""
    if request.action.minutes is None or request.action.minutes <= 0:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            "delay_start requires a positive `minutes` value",
        )
    accumulated = (request.config.clockShiftMinutes or 0) + request.action.minutes
    if accumulated > _MAX_CLOCK_SHIFT_MIN:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            f"cumulative delay exceeds the {_MAX_CLOCK_SHIFT_MIN}-min cap "
            f"(would be {accumulated} min)",
        )
    new_config = request.config.model_copy(update={"clockShiftMinutes": accumulated})
    from api.schedule_proposals import _read_persisted_state
    persisted = _read_persisted_state()
    from_version = persisted.scheduleVersion if persisted else 0
    groups = list(persisted.groups) if persisted else []

    return _build_proposal(
        store,
        kind=ProposalKind.DIRECTOR_ACTION,
        proposed_schedule=request.originalSchedule,  # unchanged
        committed_schedule=request.originalSchedule,
        matches=request.matches,
        players=request.players,
        groups=groups,
        from_version=from_version,
        proposed_config=new_config,
        extra_clock_shift_delta=request.action.minutes,
        summary=(
            f"Delay tournament start by {request.action.minutes} min "
            f"(no matches move; displayed clocks shift)"
        ),
    )


async def _apply_insert_blackout(
    store, request: DirectorActionRequest,
) -> Proposal:
    """Append a BreakWindow to config and warm-restart around it."""
    if not request.action.fromTime or not request.action.toTime:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            "insert_blackout requires `fromTime` and `toTime`",
        )
    if request.action.fromTime >= request.action.toTime:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            "insert_blackout: `fromTime` must be earlier than `toTime`",
        )
    new_break = BreakWindow(start=request.action.fromTime, end=request.action.toTime)
    new_config = request.config.model_copy(update={
        "breaks": list(request.config.breaks) + [new_break],
    })
    return await _solve_and_propose(
        store,
        request,
        new_config,
        summary=(
            f"Insert blackout {request.action.fromTime}–{request.action.toTime}"
            + (f" ({request.action.reason})" if request.action.reason else "")
        ),
    )


async def _apply_reopen_court(
    store, request: DirectorActionRequest,
) -> Proposal:
    """Drop court closures and warm-restart so matches can flow back
    onto the now-open court. Removes ALL closures (legacy + windowed)
    matching the supplied ``courtId`` — operator can re-close a window
    if they only meant to lift one of several. (Surfacing per-window
    reopen would need a UI for picking which entry; out of scope.)"""
    if request.action.courtId is None:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            "reopen_court requires `courtId`",
        )
    court_id = request.action.courtId
    legacy = list(request.config.closedCourts or [])
    windowed = list(request.config.courtClosures or [])
    if court_id not in legacy and not any(c.courtId == court_id for c in windowed):
        raise http_error(
            404, ErrorCode.STATE_SCHEMA_MISMATCH,
            f"court {court_id} is not currently closed",
        )
    new_legacy = [c for c in legacy if c != court_id]
    new_windowed = [c for c in windowed if c.courtId != court_id]
    new_config = request.config.model_copy(update={
        "closedCourts": new_legacy,
        "courtClosures": new_windowed,
    })
    return await _solve_and_propose(
        store,
        request,
        new_config,
        summary=f"Reopen court {court_id}",
    )


async def _apply_remove_blackout(
    store, request: DirectorActionRequest,
) -> Proposal:
    if request.action.blackoutIndex is None:
        raise http_error(
            422, ErrorCode.STATE_SCHEMA_MISMATCH,
            "remove_blackout requires `blackoutIndex`",
        )
    breaks = list(request.config.breaks)
    if not (0 <= request.action.blackoutIndex < len(breaks)):
        raise http_error(
            404, ErrorCode.STATE_SCHEMA_MISMATCH,
            f"no blackout at index {request.action.blackoutIndex}",
        )
    removed = breaks.pop(request.action.blackoutIndex)
    new_config = request.config.model_copy(update={"breaks": breaks})
    return await _solve_and_propose(
        store,
        request,
        new_config,
        summary=f"Remove blackout {removed.start}–{removed.end}",
    )


async def _solve_and_propose(
    store,
    request: DirectorActionRequest,
    new_config: TournamentConfig,
    *,
    summary: str,
) -> Proposal:
    """Run a warm-restart with the updated config and wrap as a Proposal."""
    from api.schedule_proposals import _read_persisted_state
    persisted = _read_persisted_state()
    from_version = persisted.scheduleVersion if persisted else 0
    groups = list(persisted.groups) if persisted else []

    wr_request = WarmRestartRequest(
        originalSchedule=request.originalSchedule,
        config=new_config,
        players=request.players,
        matches=request.matches,
        matchStates=request.matchStates,
        stayCloseWeight=10,
    )
    new_schedule, _moved = _run_warm_restart(wr_request)
    return _build_proposal(
        store,
        kind=ProposalKind.DIRECTOR_ACTION,
        proposed_schedule=new_schedule,
        committed_schedule=request.originalSchedule,
        matches=request.matches,
        players=request.players,
        groups=groups,
        from_version=from_version,
        proposed_config=new_config,
        summary=summary,
    )


@router.post("/director-action", response_model=Proposal)
async def create_director_action(
    request: DirectorActionRequest, http_request: Request
) -> Proposal:
    """Create a proposal from a director time-axis action.

    Routes through the same proposal pipeline as replan/repair so the
    operator reviews the full impact (which matches move, what the new
    finish time is, any infeasibility warnings) before committing.

    The lock is held only across the proposal-store mutation; the
    solver call itself runs outside the lock so concurrent director
    actions can solve in parallel — they only serialize when storing
    the proposal.
    """
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    kind = request.action.kind
    # Validate input + run solver outside the lock; only the store
    # mutation is serialized.
    if kind == "delay_start":
        async with lock:
            _evict_expired(store)
            return _apply_delay_start(store, request)
    if kind == "insert_blackout":
        async with lock:
            _evict_expired(store)
            return await _apply_insert_blackout(store, request)
    if kind == "remove_blackout":
        async with lock:
            _evict_expired(store)
            return await _apply_remove_blackout(store, request)
    if kind == "reopen_court":
        async with lock:
            _evict_expired(store)
            return await _apply_reopen_court(store, request)
    raise http_error(
        422, ErrorCode.STATE_SCHEMA_MISMATCH,
        f"unknown director-action kind: {kind!r}",
    )
