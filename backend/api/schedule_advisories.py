"""Live-operations advisory pipeline (`GET /schedule/advisories`).

Surfaces actionable recommendations to the operator based on the current
match-state snapshot vs. the committed schedule. Each heuristic is a
small pure function so it can be unit-tested in isolation; the FastAPI
endpoint just glues them together over real persisted state.

Heuristic kinds (initial set):
- ``overrun``       — a started match exceeded its expected duration
- ``no_show``       — a called match never started after the threshold
- ``running_behind``— actual completion cadence trails the scheduled cadence

Director-aware heuristics (start_delay_detected, approaching_blackout)
are added in the director-tools work and consume the same plumbing.

The endpoint never mutates state; clients poll it.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Request

from app.schemas import (
    Advisory,
    MatchDTO,
    ScheduleDTO,
    SuggestedAction,
    TournamentConfig,
    TournamentStateDTO,
)
from app.time_utils import now_iso, time_to_minutes

# Defaults that should eventually become tunable via TournamentConfig.
OVERRUN_GRACE_MINUTES = 5          # started > expected + this → overrun
NO_SHOW_THRESHOLD_MINUTES = 3      # called for > this without start → no_show
RUNNING_BEHIND_THRESHOLD_MIN = 10  # actual cadence trails scheduled by >= this → running_behind


router = APIRouter(prefix="/schedule", tags=["schedule-advisories"])
log = logging.getLogger("scheduler.advisories")


# ---------- helpers --------------------------------------------------------


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp (with optional Z suffix) into UTC.

    Returns None on any parse failure so heuristics can degrade silently
    instead of 500-ing the whole advisory endpoint over one stale row.
    """
    if not ts:
        return None
    try:
        normalized = ts.replace("Z", "+00:00") if ts.endswith("Z") else ts
        dt = datetime.fromisoformat(normalized)
    except (ValueError, AttributeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _expected_duration_minutes(
    match: MatchDTO,
    config: TournamentConfig,
) -> int:
    """A match's expected wall-clock duration based on slot count + interval."""
    slots = max(1, match.durationSlots or 1)
    return slots * max(1, config.intervalMinutes or 1)


def _scheduled_match_start_dt(
    match: MatchDTO,
    schedule: ScheduleDTO,
    config: TournamentConfig,
) -> Optional[datetime]:
    """Compute the scheduled wall-clock start of ``match`` in UTC.

    Returns None unless ``config.tournamentDate`` is set and the match
    has a slot assignment.
    """
    if not config.tournamentDate or not config.dayStart:
        return None
    assignment = next(
        (a for a in schedule.assignments if a.matchId == match.id),
        None,
    )
    if assignment is None:
        return None
    try:
        date = datetime.fromisoformat(config.tournamentDate)
    except ValueError:
        return None
    minutes_from_day_start = (
        time_to_minutes(config.dayStart)
        + assignment.slotId * (config.intervalMinutes or 1)
    )
    base = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)
    return base.replace(
        hour=minutes_from_day_start // 60,
        minute=minutes_from_day_start % 60,
        second=0,
        microsecond=0,
    )


# ---------- heuristics -----------------------------------------------------


def detect_overruns(
    matches_by_id: Dict[str, MatchDTO],
    match_states: Dict[str, dict],
    config: TournamentConfig,
    now: datetime,
) -> List[Advisory]:
    """A started match whose elapsed time exceeds expected + grace."""
    out: List[Advisory] = []
    for match_id, ms in match_states.items():
        if ms.get("status") != "started":
            continue
        actual_start = _parse_iso(ms.get("actualStartTime"))
        if actual_start is None:
            continue
        match = matches_by_id.get(match_id)
        if match is None:
            continue
        expected = _expected_duration_minutes(match, config)
        elapsed_min = (now - actual_start).total_seconds() / 60.0
        delay = elapsed_min - expected
        if delay <= OVERRUN_GRACE_MINUTES:
            continue
        # Severity ladders: 5–10 min over = warn, > 10 min = critical.
        severity = "critical" if delay > 10 else "warn"
        ordinal = (
            f"#{match.matchNumber}" if match.matchNumber is not None else match.id[:6]
        )
        out.append(
            Advisory(
                id=f"overrun:{match_id}",
                kind="overrun",
                severity=severity,
                summary=(
                    f"Match {ordinal} has run {int(delay)} min over its "
                    f"expected {expected}-min duration"
                ),
                detail=None,
                matchId=match_id,
                suggestedAction=SuggestedAction(
                    kind="repair",
                    payload={
                        "type": "overrun",
                        "matchId": match_id,
                        "extraMinutes": int(delay),
                    },
                ),
                detectedAt=now_iso(),
            )
        )
    return out


def detect_no_shows(
    matches_by_id: Dict[str, MatchDTO],
    match_states: Dict[str, dict],
    config: TournamentConfig,
    now: datetime,
) -> List[Advisory]:
    """A called match never transitioned to started after the grace window."""
    out: List[Advisory] = []
    for match_id, ms in match_states.items():
        if ms.get("status") != "called":
            continue
        called_at = _parse_iso(ms.get("calledAt"))
        if called_at is None:
            continue
        idle_min = (now - called_at).total_seconds() / 60.0
        if idle_min < NO_SHOW_THRESHOLD_MINUTES:
            continue
        match = matches_by_id.get(match_id)
        ordinal = (
            f"#{match.matchNumber}"
            if match and match.matchNumber is not None
            else match_id[:6]
        )
        severity = "critical" if idle_min > 5 else "warn"
        out.append(
            Advisory(
                id=f"no_show:{match_id}",
                kind="no_show",
                severity=severity,
                summary=(
                    f"Match {ordinal} was called {int(idle_min)} min ago and "
                    f"has not started"
                ),
                matchId=match_id,
                suggestedAction=SuggestedAction(
                    kind="repair",
                    payload={
                        "type": "withdrawal",
                        "matchId": match_id,
                    },
                ),
                detectedAt=now_iso(),
            )
        )
    return out


def detect_running_behind(
    matches_by_id: Dict[str, MatchDTO],
    schedule: ScheduleDTO,
    match_states: Dict[str, dict],
    config: TournamentConfig,
    now: datetime,
) -> List[Advisory]:
    """The fleet's actual finish cadence trails the scheduled cadence.

    Strategy: for each finished match, compute (actualEnd − scheduledEnd)
    in minutes and average across the most recent batch. If the average
    exceeds the threshold, surface one tournament-wide advisory.
    """
    if not schedule or not schedule.assignments or not config.tournamentDate:
        return []
    deltas: List[float] = []
    for match_id, ms in match_states.items():
        if ms.get("status") != "finished":
            continue
        actual_end = _parse_iso(ms.get("actualEndTime"))
        if actual_end is None:
            continue
        match = matches_by_id.get(match_id)
        if match is None:
            continue
        scheduled_start = _scheduled_match_start_dt(match, schedule, config)
        if scheduled_start is None:
            continue
        expected_min = _expected_duration_minutes(match, config)
        scheduled_end = scheduled_start + timedelta(minutes=expected_min)
        deltas.append((actual_end - scheduled_end).total_seconds() / 60.0)

    if not deltas:
        return []
    # Look at the most recent 10 finished matches to keep the signal local.
    recent = deltas[-10:]
    avg_delay = sum(recent) / len(recent)
    if avg_delay < RUNNING_BEHIND_THRESHOLD_MIN:
        return []
    severity = "critical" if avg_delay > 20 else "warn"
    return [
        Advisory(
            id="running_behind",
            kind="running_behind",
            severity=severity,
            summary=(
                f"Tournament is running {int(avg_delay)} min behind schedule "
                f"(over the last {len(recent)} matches)"
            ),
            detail=(
                "Consider compressing remaining transitions or warm-restarting "
                "with a stay-close bias."
            ),
            suggestedAction=SuggestedAction(
                kind="warm_restart",
                payload={"stayCloseWeight": 5},
            ),
            detectedAt=now_iso(),
        )
    ]


def detect_start_delay(
    matches_by_id: Dict[str, MatchDTO],
    schedule,
    match_states: Dict[str, dict],
    config: TournamentConfig,
    now: datetime,
) -> List[Advisory]:
    """Tournament started later than its scheduled wall-clock start.

    Looks at the *earliest* match that's been called or started: if
    its actual start (or call) is more than 5 min after the scheduled
    wall-clock start, suggest a ``delay_start`` action for the
    detected delay.
    """
    if not schedule or not schedule.assignments or not config.tournamentDate:
        return []
    earliest_assignment = min(schedule.assignments, key=lambda a: a.slotId)
    match_id = earliest_assignment.matchId
    match = matches_by_id.get(match_id)
    if match is None:
        return []
    state = match_states.get(match_id)
    if not state:
        return []
    actual_start_ts = state.get("actualStartTime") or state.get("calledAt")
    actual_start = _parse_iso(actual_start_ts)
    if actual_start is None:
        return []
    scheduled_start = _scheduled_match_start_dt(match, schedule, config)
    if scheduled_start is None:
        return []
    delay_min = (actual_start - scheduled_start).total_seconds() / 60.0
    if delay_min < 5:
        return []
    severity = "critical" if delay_min > 20 else "warn"
    return [
        Advisory(
            id="start_delay_detected",
            kind="start_delay_detected",
            severity=severity,
            summary=(
                f"Tournament started {int(delay_min)} min late "
                f"({actual_start.strftime('%H:%M')} vs scheduled "
                f"{scheduled_start.strftime('%H:%M')})"
            ),
            detail=(
                "Apply a clock-shift to keep displayed match times in sync "
                "with reality without re-solving the schedule."
            ),
            suggestedAction=SuggestedAction(
                kind="delay_start",
                payload={"minutes": int(delay_min)},
            ),
            detectedAt=now_iso(),
        )
    ]


def detect_approaching_blackout(
    matches_by_id: Dict[str, MatchDTO],
    schedule,
    match_states: Dict[str, dict],
    config: TournamentConfig,
    now: datetime,
) -> List[Advisory]:
    """A started match's expected finish overlaps an upcoming break.

    Reuses the existing ``config.breaks`` list — director ``insert_blackout``
    actions append to that same list, so this heuristic covers both
    setup-time and runtime-inserted blackouts.
    """
    if (
        not schedule
        or not schedule.assignments
        or not config.tournamentDate
        or not config.breaks
        or not config.dayStart
    ):
        return []
    out: List[Advisory] = []
    try:
        date = datetime.fromisoformat(config.tournamentDate)
    except ValueError:
        return []
    base = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)

    def _at(hh_mm: str) -> datetime:
        h, m = hh_mm.split(":")
        return base.replace(hour=int(h), minute=int(m), second=0, microsecond=0)

    for match_id, ms in match_states.items():
        if ms.get("status") != "started":
            continue
        actual_start = _parse_iso(ms.get("actualStartTime"))
        if actual_start is None:
            continue
        match = matches_by_id.get(match_id)
        if match is None:
            continue
        expected_end = actual_start + timedelta(
            minutes=_expected_duration_minutes(match, config)
        )
        for blackout in config.breaks:
            blackout_start = _at(blackout.start)
            blackout_end = _at(blackout.end)
            if expected_end <= blackout_start:
                continue  # match finishes before the blackout
            if actual_start >= blackout_end:
                continue  # match started after this blackout
            overlap_min = (
                expected_end - blackout_start
            ).total_seconds() / 60.0
            if overlap_min < 1:
                continue
            ordinal = (
                f"#{match.matchNumber}"
                if match.matchNumber is not None else match_id[:6]
            )
            out.append(
                Advisory(
                    id=f"approaching_blackout:{match_id}:{blackout.start}",
                    kind="approaching_blackout",
                    severity="warn",
                    summary=(
                        f"Match {ordinal} expected to finish "
                        f"{int(overlap_min)} min into the {blackout.start}–"
                        f"{blackout.end} break"
                    ),
                    matchId=match_id,
                    suggestedAction=SuggestedAction(
                        kind="repair",
                        payload={
                            "type": "overrun",
                            "matchId": match_id,
                            "extraMinutes": int(overlap_min),
                        },
                    ),
                    detectedAt=now_iso(),
                )
            )
            break  # don't double-fire on multiple blackouts for one match
    return out


def collect_advisories(
    state: Optional[TournamentStateDTO],
    match_states: Dict[str, dict],
    *,
    now: Optional[datetime] = None,
) -> List[Advisory]:
    """Run every heuristic against the current snapshot and return the union.

    Pure function — `now` defaults to the real wall-clock UTC, but tests
    inject a fixed datetime so deterministic fixtures stay deterministic.
    """
    if state is None or state.config is None or state.schedule is None:
        return []
    now = now or datetime.now(timezone.utc)
    matches_by_id: Dict[str, MatchDTO] = {m.id: m for m in state.matches}
    advisories: List[Advisory] = []
    advisories.extend(
        detect_overruns(matches_by_id, match_states, state.config, now)
    )
    advisories.extend(
        detect_no_shows(matches_by_id, match_states, state.config, now)
    )
    advisories.extend(
        detect_running_behind(
            matches_by_id, state.schedule, match_states, state.config, now
        )
    )
    advisories.extend(
        detect_start_delay(
            matches_by_id, state.schedule, match_states, state.config, now
        )
    )
    advisories.extend(
        detect_approaching_blackout(
            matches_by_id, state.schedule, match_states, state.config, now
        )
    )
    # Severity ordering: critical > warn > info; secondary by kind, then id.
    severity_rank = {"critical": 0, "warn": 1, "info": 2}
    advisories.sort(key=lambda a: (severity_rank.get(a.severity, 3), a.kind, a.id))
    return advisories


# ---------- endpoint -------------------------------------------------------


@router.get("/advisories", response_model=List[Advisory])
async def get_schedule_advisories(http_request: Request) -> List[Advisory]:
    """Return current advisories computed from tournament + match state.

    Reads both files via the existing helpers in tournament_state /
    match_state. Returns ``[]`` when nothing actionable is detected (or
    when the tournament hasn't been configured yet).

    Also posts REPAIR triggers to the SuggestionsWorker for any advisory
    whose suggestedAction.kind is 'repair', and attaches a ``suggestionId``
    to advisories that already have a pre-baked suggestion stamped by the
    worker.
    """
    # Late imports to avoid circulars and to allow tests to monkeypatch
    # the file paths via BACKEND_DATA_DIR before the helpers resolve.
    from api import match_state as match_state_mod
    from api import tournament_state as tournament_state_mod

    # Tournament state — may be None when nothing has been saved yet.
    state: Optional[TournamentStateDTO] = None
    try:
        path = tournament_state_mod._state_path()
        if path.exists():
            data, _ = tournament_state_mod._read_with_recovery(path)
            data = tournament_state_mod._migrate(data)
            state = TournamentStateDTO(**{
                k: v for k, v in data.items() if k != "_integrity"
            })
    except Exception as e:  # noqa: BLE001 — advisor must never 500 on read failure
        log.warning("advisories: tournament state unreadable: %s", e)
        return []

    if state is None:
        return []

    # Match states — empty dict when no live state file yet.
    try:
        ms_file = match_state_mod._read_state_file()
        match_states_dict = {
            mid: ms.model_dump() for mid, ms in ms_file.matchStates.items()
        }
    except Exception as e:  # noqa: BLE001
        log.warning("advisories: match state unreadable: %s", e)
        match_states_dict = {}

    advisories = collect_advisories(state, match_states_dict)

    # Attach suggestionId for advisories whose worker already produced
    # a pre-baked suggestion. Index the suggestion store once so we
    # don't run an O(advisories × suggestions) scan.
    from api.schedule_proposals import _get_suggestion_store
    suggestion_store = _get_suggestion_store(http_request.app)
    sug_by_fingerprint = {s.fingerprint: s.id for s in suggestion_store.values()}
    for a in advisories:
        sug_id = sug_by_fingerprint.get(f"repair:{a.id}")
        if sug_id is not None:
            a.suggestionId = sug_id

    # Post REPAIR triggers for repair-kind advisories that DON'T already
    # have a stamped suggestion. The worker's per-fingerprint cooldown
    # (30s) would dedup duplicate posts anyway, but skipping the post
    # here saves the round-trip and keeps the worker queue cleaner.
    worker = getattr(http_request.app.state, "suggestions_worker", None)
    if worker is not None:
        from services.suggestions_worker import TriggerEvent, TriggerKind
        for a in advisories:
            if (
                a.suggestedAction
                and a.suggestedAction.kind == "repair"
                and a.suggestionId is None
            ):
                try:
                    await worker.post(TriggerEvent(
                        kind=TriggerKind.REPAIR,
                        fingerprint=f"repair:{a.id}",
                        payload={"suggestedAction": a.suggestedAction.model_dump()},
                    ))
                except Exception:
                    log.exception("advisories: post REPAIR trigger failed")

    return advisories
