"""API compatibility layer for converting between app/schemas and scheduler_core domain models.

This module provides bidirectional conversion between the FastAPI schemas
(app/schemas.py) and the core domain models (scheduler_core/domain/models.py).
"""
from typing import List, Optional

from app.schemas import (
    Assignment as APIAssignment,
    HealthResponse,
    MatchInput,
    PlayerInput,
    PreviousAssignment as APIPreviousAssignment,
    ScheduleConfig as APIScheduleConfig,
    ScheduleRequest as APIScheduleRequest,
    ScheduleResponse as APIScheduleResponse,
    SoftViolation as APISoftViolation,
    SolverOptions as APISolverOptions,
    SolverStatus as APISolverStatus,
)

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    ScheduleResult,
    SoftViolation,
    SolverOptions,
    SolverStatus,
)


def _status_to_core(status: APISolverStatus) -> SolverStatus:
    """Convert API SolverStatus to core SolverStatus."""
    return SolverStatus(status.value)


def _status_to_api(status: SolverStatus) -> APISolverStatus:
    """Convert core SolverStatus to API SolverStatus."""
    return APISolverStatus(status.value)


def to_core_request(api_request: APIScheduleRequest) -> ScheduleRequest:
    """Convert API ScheduleRequest to core ScheduleRequest."""
    # Convert config
    config = ScheduleConfig(
        total_slots=api_request.config.totalSlots,
        court_count=api_request.config.courtCount,
        interval_minutes=api_request.config.intervalMinutes,
        default_rest_slots=api_request.config.defaultRestSlots,
        freeze_horizon_slots=api_request.config.freezeHorizonSlots,
        current_slot=api_request.config.currentSlot,
        soft_rest_enabled=api_request.config.softRestEnabled,
        rest_slack_penalty=api_request.config.restSlackPenalty,
        disruption_penalty=api_request.config.disruptionPenalty,
        late_finish_penalty=api_request.config.lateFinishPenalty,
        court_change_penalty=api_request.config.courtChangePenalty,
        enable_game_proximity=api_request.config.enableGameProximity,
        min_game_spacing_slots=api_request.config.minGameSpacingSlots,
        max_game_spacing_slots=api_request.config.maxGameSpacingSlots,
        game_proximity_penalty=api_request.config.gameProximityPenalty,
        enable_compact_schedule=api_request.config.enableCompactSchedule,
        compact_schedule_mode=api_request.config.compactScheduleMode,
        compact_schedule_penalty=api_request.config.compactSchedulePenalty,
        target_finish_slot=api_request.config.targetFinishSlot,
        allow_player_overlap=api_request.config.allowPlayerOverlap,
        player_overlap_penalty=api_request.config.playerOverlapPenalty,
    )
    
    # Convert players
    players = [
        Player(
            id=p.id,
            name=p.name,
            availability=[tuple(avail) for avail in p.availability],
            rest_slots=p.restSlots,
            rest_is_hard=p.restIsHard,
            rest_penalty=p.restPenalty,
        )
        for p in api_request.players
    ]
    
    # Convert matches
    matches = [
        Match(
            id=m.id,
            event_code=m.eventCode,
            duration_slots=m.durationSlots,
            side_a=m.sideA,
            side_b=m.sideB,
        )
        for m in api_request.matches
    ]
    
    # Convert previous assignments
    previous_assignments = [
        PreviousAssignment(
            match_id=pa.matchId,
            slot_id=pa.slotId,
            court_id=pa.courtId,
            locked=pa.locked,
            pinned_slot_id=pa.pinnedSlotId,
            pinned_court_id=pa.pinnedCourtId,
        )
        for pa in api_request.previousAssignments
    ]
    
    # Convert solver options
    solver_options = None
    if api_request.solverOptions:
        solver_options = SolverOptions(
            time_limit_seconds=api_request.solverOptions.timeLimitSeconds,
            num_workers=api_request.solverOptions.numWorkers,
            log_progress=api_request.solverOptions.logProgress,
        )
    
    return ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        previous_assignments=previous_assignments,
        solver_options=solver_options,
    )


def to_api_response(core_result: ScheduleResult) -> APIScheduleResponse:
    """Convert core ScheduleResult to API ScheduleResponse."""
    # Convert assignments
    assignments = [
        APIAssignment(
            matchId=a.match_id,
            slotId=a.slot_id,
            courtId=a.court_id,
            durationSlots=a.duration_slots,
            moved=a.moved,
            previousSlotId=a.previous_slot_id,
            previousCourtId=a.previous_court_id,
        )
        for a in core_result.assignments
    ]
    
    # Convert soft violations
    soft_violations = [
        APISoftViolation(
            type=v.type,
            matchId=v.match_id,
            playerId=v.player_id,
            description=v.description,
            penaltyIncurred=v.penalty_incurred,
        )
        for v in core_result.soft_violations
    ]
    
    return APIScheduleResponse(
        status=_status_to_api(core_result.status),
        objectiveScore=core_result.objective_score,
        runtimeMs=core_result.runtime_ms,
        assignments=assignments,
        softViolations=soft_violations,
        infeasibleReasons=core_result.infeasible_reasons,
        unscheduledMatches=core_result.unscheduled_matches,
        movedCount=core_result.moved_count,
        lockedCount=core_result.locked_count,
    )
