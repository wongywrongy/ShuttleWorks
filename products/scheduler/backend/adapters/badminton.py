"""Badminton tournament adapter.

This module is the boundary between FastAPI DTOs (``app.schemas``)
and engine domain models (``scheduler_core.domain.models``). The
schedule routes used to inline these conversions; centralising them
here means:

  - Future adapters (different sports, room scheduling, …) live as
    sibling modules.
  - The route files become thin DTO ↔ engine boundaries.
  - Tests can drive the adapter directly without spinning up FastAPI.

Public API (used by ``backend/api/schedule.py``,
``backend/api/schedule_repair.py``, ``backend/api/schedule_warm_restart.py``):

  - ``DEFAULT_SOLVER_OPTIONS``, ``CANDIDATE_POOL_SIZE``  (constants)
  - ``solver_options_for(config)``  (honours the Reproducible-run flag)
  - ``prepare_solver_input(request)``
  - ``schedule_config_from_dto(config)``
  - ``players_from_dto(players, config)``
  - ``matches_from_dto(matches)``
  - ``previous_assignments_from_dto(assignments_data)``
  - ``result_to_dto(result)``
"""
from __future__ import annotations

from typing import List, Optional, Tuple

from fastapi import HTTPException

from app.schemas import (
    MatchDTO,
    PlayerDTO,
    ScheduleAssignment,
    ScheduleCandidate,
    ScheduleDTO,
    SoftViolation,
    SolverStatus,
    TournamentConfig,
)
from scheduler_core.domain.models import (  # noqa: E402
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    SolverOptions,
)


# Default tuning for both sync and streaming endpoints. 30 s is a
# tournament-day-friendly upper bound; 4 workers keeps the box
# responsive while letting CP-SAT explore in parallel.
DEFAULT_SOLVER_OPTIONS = SolverOptions(
    time_limit_seconds=30,
    num_workers=4,
    log_progress=False,
)

# How many near-optimal alternatives the candidate collector keeps
# during the initial solve. Each is one assignment-list-sized payload
# of memory; 5 is a generous default that fits comfortably in a
# tournament JSON file.
CANDIDATE_POOL_SIZE = 5


def _time_to_minutes(time: str) -> int:
    """Convert HH:mm to minutes since midnight.

    Pydantic's HHMMTime validator on TournamentConfig already
    guarantees shape, but tests + legacy callers may pass raw
    strings — keep a defensive 422 so a malformed value is a clean
    error rather than an unhandled 500.
    """
    try:
        hours, minutes = map(int, time.split(":"))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail=f"invalid time string: {time!r}")
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise HTTPException(status_code=422, detail=f"time out of range: {time!r}")
    return hours * 60 + minutes


def _time_to_slot(time: str, day_start: str, interval_minutes: int) -> int:
    start_minutes = _time_to_minutes(day_start)
    time_minutes = _time_to_minutes(time)
    if time_minutes < start_minutes:
        # Overnight schedule: time is the next day.
        time_minutes += 24 * 60
    return (time_minutes - start_minutes) // interval_minutes


# ---- Public API ----------------------------------------------------------


def solver_options_for(
    config: TournamentConfig,
    time_limit_override: float | None = None,
) -> SolverOptions:
    """Pick solver options honouring the config's engine settings.

    - ``solverTimeLimitSeconds`` overrides the default 30 s cap.
    - ``time_limit_override`` (caller-supplied, in seconds) overrides
      the config's value too — used by the proposal pipeline so the
      advisor's quick-look solves get a tight budget while
      operator-initiated reviews get the full 30 s.
    - ``deterministic`` forces single-worker mode (CP-SAT only
      guarantees byte-identical output under one search worker).
    - ``randomSeed`` sets the deterministic seed (default 42).
    """
    if time_limit_override is not None:
        time_limit = time_limit_override
    elif config.solverTimeLimitSeconds is not None:
        time_limit = config.solverTimeLimitSeconds
    else:
        time_limit = DEFAULT_SOLVER_OPTIONS.time_limit_seconds
    if config.deterministic:
        return SolverOptions(
            time_limit_seconds=time_limit,
            num_workers=1,
            random_seed=config.randomSeed if config.randomSeed is not None else 42,
            log_progress=False,
            deterministic=True,
        )
    return SolverOptions(
        time_limit_seconds=time_limit,
        num_workers=DEFAULT_SOLVER_OPTIONS.num_workers,
        random_seed=DEFAULT_SOLVER_OPTIONS.random_seed,
        log_progress=False,
        deterministic=False,
    )


def candidate_pool_size_for(config: TournamentConfig) -> int:
    """Resolve the candidate-pool size, honouring the operator override."""
    if config.candidatePoolSize is not None and config.candidatePoolSize >= 1:
        return config.candidatePoolSize
    return CANDIDATE_POOL_SIZE


def schedule_config_from_dto(config: TournamentConfig) -> ScheduleConfig:
    """Convert TournamentConfig to scheduler_core ScheduleConfig."""
    start_minutes = _time_to_minutes(config.dayStart)
    end_minutes = _time_to_minutes(config.dayEnd)
    if end_minutes <= start_minutes:
        end_minutes += 24 * 60  # overnight schedule

    total_slots = (end_minutes - start_minutes) // config.intervalMinutes
    default_rest_slots = config.defaultRestMinutes // config.intervalMinutes

    break_slots: List[Tuple[int, int]] = []
    for b in (config.breaks or []):
        s = _time_to_slot(b.start, config.dayStart, config.intervalMinutes)
        e = _time_to_slot(b.end, config.dayStart, config.intervalMinutes)
        if e > s:
            break_slots.append((s, e))

    return ScheduleConfig(
        total_slots=total_slots,
        court_count=config.courtCount,
        interval_minutes=config.intervalMinutes,
        default_rest_slots=default_rest_slots,
        freeze_horizon_slots=config.freezeHorizonSlots,
        current_slot=0,
        soft_rest_enabled=False,
        rest_slack_penalty=10.0,
        disruption_penalty=5.0,
        late_finish_penalty=1.0,
        court_change_penalty=2.0,
        enable_court_utilization=config.enableCourtUtilization if config.enableCourtUtilization is not None else True,
        court_utilization_penalty=config.courtUtilizationPenalty if config.courtUtilizationPenalty is not None else 50.0,
        enable_game_proximity=config.enableGameProximity if config.enableGameProximity is not None else False,
        min_game_spacing_slots=config.minGameSpacingSlots,
        max_game_spacing_slots=config.maxGameSpacingSlots,
        game_proximity_penalty=config.gameProximityPenalty if config.gameProximityPenalty is not None else 5.0,
        enable_compact_schedule=config.enableCompactSchedule if config.enableCompactSchedule is not None else False,
        compact_schedule_mode=config.compactScheduleMode if config.compactScheduleMode is not None else "minimize_makespan",
        compact_schedule_penalty=config.compactSchedulePenalty if config.compactSchedulePenalty is not None else 100.0,
        target_finish_slot=config.targetFinishSlot,
        allow_player_overlap=config.allowPlayerOverlap if config.allowPlayerOverlap is not None else False,
        player_overlap_penalty=config.playerOverlapPenalty if config.playerOverlapPenalty is not None else 50.0,
        break_slots=break_slots,
        # Defensive copy — only keep court ids that fall inside the
        # configured court range; ignore stale entries from a previous
        # tournament with more courts.
        closed_court_ids=[
            c for c in (config.closedCourts or []) if 1 <= c <= config.courtCount
        ],
        closed_court_windows=_build_closed_court_windows(config, total_slots),
    )


def _build_closed_court_windows(
    config: TournamentConfig, total_slots: int
) -> List[Tuple[int, int, int]]:
    """Merge legacy ``closedCourts`` (full-day) and ``courtClosures``
    (time-bounded) into a single list of ``(court_id, from_slot, to_slot)``
    half-open windows. Out-of-range courts and inverted/empty windows
    are dropped so the solver never sees garbage.
    """
    out: List[Tuple[int, int, int]] = []

    # Legacy: every entry in ``closedCourts`` is an all-day closure.
    for c in (config.closedCourts or []):
        if 1 <= c <= config.courtCount and total_slots > 0:
            out.append((c, 0, total_slots))

    # Time-bounded closures.
    for closure in (config.courtClosures or []):
        if not (1 <= closure.courtId <= config.courtCount):
            continue
        from_slot = (
            _time_to_slot(closure.fromTime, config.dayStart, config.intervalMinutes)
            if closure.fromTime
            else 0
        )
        to_slot = (
            _time_to_slot(closure.toTime, config.dayStart, config.intervalMinutes)
            if closure.toTime
            else total_slots
        )
        from_slot = max(0, min(from_slot, total_slots))
        to_slot = max(0, min(to_slot, total_slots))
        if to_slot > from_slot:
            out.append((closure.courtId, from_slot, to_slot))

    return out


def players_from_dto(players: List[PlayerDTO], config: TournamentConfig) -> List[Player]:
    """Convert PlayerDTOs to scheduler_core Player objects."""
    out: List[Player] = []
    for player in players:
        availability_slots = []
        for window in player.availability:
            start_slot = _time_to_slot(window.start, config.dayStart, config.intervalMinutes)
            end_slot = _time_to_slot(window.end, config.dayStart, config.intervalMinutes)
            availability_slots.append((start_slot, end_slot))

        rest_minutes = player.minRestMinutes if player.minRestMinutes is not None else config.defaultRestMinutes
        rest_slots = rest_minutes // config.intervalMinutes

        out.append(Player(
            id=player.id,
            name=player.name,
            availability=availability_slots,
            rest_slots=rest_slots,
            rest_is_hard=True,
            rest_penalty=10.0,
        ))
    return out


def matches_from_dto(matches: List[MatchDTO]) -> List[Match]:
    """Convert MatchDTOs to scheduler_core Match objects."""
    return [
        Match(
            id=m.id,
            event_code=m.eventRank if m.eventRank else f"MATCH-{m.id[:8]}",
            duration_slots=m.durationSlots,
            side_a=m.sideA if m.sideA else [],
            side_b=m.sideB if m.sideB else [],
        )
        for m in matches
    ]


def previous_assignments_from_dto(assignments_data) -> List[PreviousAssignment]:
    """Convert previous assignments to core ``PreviousAssignment`` objects.

    Accepts either a list of ``PreviousAssignmentDTO`` (typed) or a
    list of raw dicts — legacy clients before the DTO was introduced
    send dicts.
    """
    if not assignments_data:
        return []

    out: List[PreviousAssignment] = []
    for pa in assignments_data:
        if hasattr(pa, "model_dump"):
            pa = pa.model_dump()
        out.append(PreviousAssignment(
            match_id=pa.get("matchId", ""),
            slot_id=pa.get("slotId", 0),
            court_id=pa.get("courtId", 0),
            locked=pa.get("locked", False),
            pinned_slot_id=pa.get("pinnedSlotId"),
            pinned_court_id=pa.get("pinnedCourtId"),
        ))
    return out


def prepare_solver_input(config: TournamentConfig, players, matches, previous_assignments=None):
    """Convert request DTOs into the solver's domain objects.

    Returns ``(schedule_config, players, matches, previous_assignments)``
    in the shape ``ScheduleRequest`` and ``CPSATScheduler`` consume.
    """
    return (
        schedule_config_from_dto(config),
        players_from_dto(players, config),
        matches_from_dto(matches),
        previous_assignments_from_dto(previous_assignments),
    )


def _assignment_to_dto(a) -> ScheduleAssignment:
    return ScheduleAssignment(
        matchId=a.match_id,
        slotId=a.slot_id,
        courtId=a.court_id,
        durationSlots=a.duration_slots,
    )


def result_to_dto(result) -> ScheduleDTO:
    """Convert scheduler_core ``ScheduleResult`` to ``ScheduleDTO``."""
    assignments = [_assignment_to_dto(a) for a in result.assignments]

    soft_violations = [
        SoftViolation(
            type=v.type,
            matchId=v.match_id if v.match_id else None,
            playerId=v.player_id if v.player_id else None,
            description=v.description,
            penaltyIncurred=v.penalty_incurred,
        )
        for v in result.soft_violations
    ]

    candidates = [
        ScheduleCandidate(
            solutionId=snap.solution_id,
            assignments=[_assignment_to_dto(a) for a in snap.assignments],
            objectiveScore=snap.objective_value,
            foundAtSeconds=snap.found_at_seconds,
        )
        for snap in (result.candidates or [])
    ]

    # Pin the top-level ``assignments`` to ``candidates[0]`` when a
    # pool was captured. ``result.assignments`` is the solver's *final*
    # assignment list and ``candidates[0]`` is the best one in the
    # captured heap; for OPTIMAL solves they match, but a FEASIBLE
    # result whose final solution wasn't an improvement on a prior
    # pool entry could otherwise show a top-level schedule that
    # disagrees with ``activeCandidateIndex=0``.
    if candidates:
        assignments = list(candidates[0].assignments)

    status_map = {
        "optimal": SolverStatus.OPTIMAL,
        "feasible": SolverStatus.FEASIBLE,
        "infeasible": SolverStatus.INFEASIBLE,
        "unknown": SolverStatus.UNKNOWN,
        "model_invalid": SolverStatus.UNKNOWN,
    }
    status = status_map.get(result.status.value.lower(), SolverStatus.UNKNOWN)

    return ScheduleDTO(
        assignments=assignments,
        unscheduledMatches=result.unscheduled_matches,
        softViolations=soft_violations,
        objectiveScore=result.objective_score,
        infeasibleReasons=result.infeasible_reasons,
        status=status,
        solverSeed=result.solver_seed,
        candidates=candidates,
        activeCandidateIndex=0 if candidates else None,
    )


# Optional: a Pydantic-shaped previous-assignments param matches what
# the schedule routes accept on ingress. Re-exporting so downstream
# importers don't need to reach into ``app.schemas``.
__all__ = [
    "CANDIDATE_POOL_SIZE",
    "DEFAULT_SOLVER_OPTIONS",
    "candidate_pool_size_for",
    "matches_from_dto",
    "players_from_dto",
    "prepare_solver_input",
    "previous_assignments_from_dto",
    "result_to_dto",
    "schedule_config_from_dto",
    "solver_options_for",
]
