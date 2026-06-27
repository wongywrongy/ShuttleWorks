"""Bracket routes — the tournament product's API surface, ported into
the scheduler backend under ``/tournaments/{tournament_id}/bracket/*``
with Supabase-JWT auth + role gates.

PR 2 (T-B + T-C + T-D) of the backend-merge arc. Mirrors the existing
``products/tournament/backend/main.py`` route shape so the tournament
frontend's apiClient can swap base URLs cleanly. Persistence goes
through ``_LocalBracketRepo`` (PR 1's schema), and every repo write
stages an outbox row so operator browsers see live updates via
Supabase Realtime.

Routes (all tournament-scoped via the path's ``tournament_id``):

  POST   /tournaments/{tid}/bracket            — create session + events
  GET    /tournaments/{tid}/bracket            — read full state
  DELETE /tournaments/{tid}/bracket            — clear all bracket data
  POST   /tournaments/{tid}/bracket/schedule-next
                                               — solve next ready round
  POST   /tournaments/{tid}/bracket/results    — record result
  POST   /tournaments/{tid}/bracket/match-action
                                               — start / finish / reset
  POST   /tournaments/{tid}/bracket/validate   — feasibility check (drag)
  POST   /tournaments/{tid}/bracket/pin        — re-pin + re-solve
  POST   /tournaments/{tid}/bracket/import     — import pre-paired (JSON)
  POST   /tournaments/{tid}/bracket/import.csv — import pre-paired (CSV)
  GET    /tournaments/{tid}/bracket/export.json
                                               — alias for GET
  GET    /tournaments/{tid}/bracket/export.csv — order-of-play CSV
  GET    /tournaments/{tid}/bracket/export.ics — iCalendar feed

Tournament-product backend (:8765) continues to run unchanged in
parallel through PR 2. PR 3 retires it after the frontend folds into
the scheduler shell.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app.dependencies import (
    AuthUser,
    get_current_user,
    require_tournament_access,
)
from app.exceptions import ConflictError
from repositories import LocalRepository, get_repository
from scheduler_core.domain.models import (
    SolverOptions,
    SolverStatus,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler
from scheduler_core.domain.tournament import (
    Event as EngineEvent,
    Participant,
    ParticipantType,
    PlayUnit,
    PlayUnitKind,
    Result,
    TournamentAssignment,
    TournamentState,
    WinnerSide,
)
from services.bracket import (
    BracketSlot,
    Draw,
    TournamentDriver,
    generate_round_robin,
    generate_single_elimination,
    record_result,
)
from services.bracket.io.export_schedule import to_csv, to_ics
from services.bracket.io.import_matches import (
    parse_csv_payload,
    parse_json_payload,
)
from services.bracket.state import (
    BracketSession,
    EventMeta,
    find_ready_play_units,
    is_assignment_locked,
    register_draw,
)
from services.bracket.validation import BracketConflict, validate_bracket_move
from services.scheduling.params import SchedulingParams, build_schedule_config

router = APIRouter(
    prefix="/tournaments/{tournament_id}/bracket",
    tags=["brackets"],
)

_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))

log = logging.getLogger("scheduler.brackets")

# Upper bound on the SSE progress queue — same rationale as the meet's
# ``schedule.py``: bound memory if a client stops draining (the
# disconnect poll in the generator notices a closed tab within ~1 s).
_SSE_QUEUE_MAX = 512

# Default near-optimal candidate pool the streaming solve keeps, when the
# caller doesn't override it via the ``candidate_pool_size`` query param
# or the persisted bracket-session blob. Matches the meet default.
_DEFAULT_CANDIDATE_POOL_SIZE = 5


# ---------------------------------------------------------------------------
# Pydantic DTOs — ported from products/tournament/backend/schemas.py.
# ---------------------------------------------------------------------------


class ParticipantIn(BaseModel):
    id: str
    name: str
    members: Optional[List[str]] = Field(
        None,
        description=(
            "If present, this participant is a TEAM and these are the "
            "individual player ids (e.g. doubles pair)."
        ),
    )
    seed: Optional[int] = Field(
        None,
        description=(
            "Optional seed number (1=top seed). Participants are sorted "
            "by ascending seed for placement; unseeded entries trail."
        ),
    )


class EventIn(BaseModel):
    id: str
    discipline: str = Field("GEN", description="MS/WS/MD/WD/XD or short code.")
    format: Literal["se", "rr"] = "se"
    participants: List[ParticipantIn]
    seeded_count: Optional[int] = None
    bracket_size: Optional[int] = None
    rr_rounds: int = Field(1, ge=1)
    duration_slots: int = Field(1, ge=1)
    randomize: bool = False


class CreateTournamentIn(BaseModel):
    courts: int = Field(2, ge=1, le=64)
    total_slots: int = Field(128, ge=1)
    rest_between_rounds: int = Field(1, ge=0)
    interval_minutes: int = Field(30, ge=1)
    time_limit_seconds: float = Field(5.0, gt=0)
    start_time: Optional[datetime] = None
    events: List[EventIn]


class ParticipantOut(BaseModel):
    id: str
    name: str
    members: Optional[List[str]] = None


class BracketSlotOut(BaseModel):
    participant_id: Optional[str] = None
    feeder_play_unit_id: Optional[str] = None


class PlayUnitOut(BaseModel):
    id: str
    event_id: str
    round_index: int
    match_index: int
    side_a: Optional[List[str]] = None
    side_b: Optional[List[str]] = None
    duration_slots: int
    dependencies: List[str] = []
    slot_a: BracketSlotOut
    slot_b: BracketSlotOut
    # Optimistic-concurrency token (SP-F3): the client echoes this back as
    # ``seen_version`` when recording a result so concurrent writes from a
    # second operator are rejected with a stale-version conflict. Defaults to
    # 1 (a freshly generated match) when version tracking has no row yet.
    version: int = 1


class AssignmentOut(BaseModel):
    play_unit_id: str
    slot_id: int
    court_id: int
    duration_slots: int
    actual_start_slot: Optional[int] = None
    actual_end_slot: Optional[int] = None
    started: bool = False
    finished: bool = False


class ResultOut(BaseModel):
    play_unit_id: str
    winner_side: str
    walkover: bool = False
    finished_at_slot: Optional[int] = None
    # Opaque set-by-set score JSON (Sets mode). None for winner-only results.
    score: Optional[dict] = None


class EventOut(BaseModel):
    id: str
    discipline: str
    format: str
    bracket_size: Optional[int] = None
    participant_count: int
    rounds: List[List[str]]
    # Per-event lifecycle status: 'draft' | 'generated' | 'started'.
    # Drives the Draws-page status pill + Generate/Open affordances.
    status: Optional[str] = None


class TournamentOut(BaseModel):
    courts: int
    total_slots: int
    rest_between_rounds: int
    interval_minutes: int
    start_time: Optional[datetime] = None
    events: List[EventOut]
    participants: List[ParticipantOut]
    play_units: List[PlayUnitOut]
    assignments: List[AssignmentOut]
    results: List[ResultOut]


class BracketAssignmentIn(BaseModel):
    """One solver-produced (or operator-chosen) assignment cell."""
    play_unit_id: str
    slot_id: int
    court_id: int
    duration_slots: int = 1


class BracketScheduleCandidate(BaseModel):
    """One near-optimal alternative the solver kept while improving.

    Mirrors the meet's ``ScheduleCandidate`` (SP-F1) in the bracket's
    snake_case wire dialect: the operator can pick any of the captured
    candidates before committing the round (Task F2's
    candidate-selection-before-commit step). ``candidates[0]`` is the
    best one found.
    """
    solution_id: str
    objective_score: float = 0.0
    found_at_seconds: float = 0.0
    assignments: List[BracketAssignmentIn] = Field(default_factory=list)


class ScheduleNextRoundOut(BaseModel):
    status: str
    play_unit_ids: List[str]
    started_at_current_slot: int
    runtime_ms: float = 0.0
    infeasible_reasons: List[str] = []
    # Top-N near-optimal alternatives the solver kept (empty when no
    # pool was requested). The streaming endpoint always populates it;
    # the batch endpoint leaves it empty to preserve its wire shape.
    candidates: List[BracketScheduleCandidate] = Field(default_factory=list)


class CommitRoundIn(BaseModel):
    """Persist the operator-chosen candidate's assignments for a round."""
    assignments: List[BracketAssignmentIn]


class RecordResultIn(BaseModel):
    play_unit_id: str
    winner_side: Literal["A", "B"]
    finished_at_slot: Optional[int] = None
    walkover: bool = False
    # Opaque set-by-set score JSON for Sets-mode brackets (see ADR 0006:
    # the bracket carries an opaque score blob + winner_side, the meet
    # carries integer side scores). Omitted in winner-only / simple mode.
    score: Optional[dict] = None
    # Optimistic-concurrency token (SP-F3). When present, the route rejects
    # the write with 409 stale_version if it doesn't match the match's
    # current ``BracketMatch.version``. Omitted by legacy callers, which keep
    # the un-guarded behavior.
    seen_version: Optional[int] = None


class MatchActionIn(BaseModel):
    play_unit_id: str
    action: Literal["start", "finish", "reset"]
    slot: Optional[int] = None


class BracketValidateIn(BaseModel):
    """A single proposed drag target evaluated by /bracket/validate."""
    play_unit_id: str
    slot_id: int
    court_id: int


class BracketPinIn(BaseModel):
    """A single proposed drag target committed by /bracket/pin."""
    play_unit_id: str
    slot_id: int
    court_id: int


class EventUpsertIn(BaseModel):
    """Body of POST /bracket/events/{event_id} — upsert one event."""
    discipline: str
    format: Literal["se", "rr"] = "se"
    bracket_size: Optional[int] = None
    seeded_count: int = 0
    rr_rounds: int = Field(1, ge=1)
    duration_slots: int = Field(1, ge=1)
    participants: List[ParticipantIn] = Field(default_factory=list)


class GenerateEventIn(BaseModel):
    wipe: bool = False


class BracketValidationConflictOut(BaseModel):
    """One reason a proposed bracket move is infeasible.

    Snake-case sibling of the meet's ``ValidationConflict`` — the
    bracket API surface is snake_case throughout.
    """
    type: str
    description: str
    play_unit_id: Optional[str] = None
    other_play_unit_id: Optional[str] = None
    player_id: Optional[str] = None
    court_id: Optional[int] = None
    slot_id: Optional[int] = None


class BracketValidationOut(BaseModel):
    feasible: bool
    conflicts: List[BracketValidationConflictOut] = Field(default_factory=list)


class ImportPlayUnitIn(BaseModel):
    id: str
    side_a: Optional[List[str]] = None
    side_b: Optional[List[str]] = None
    feeder_a: Optional[str] = None
    feeder_b: Optional[str] = None
    duration_slots: int = 1


class ImportEventIn(BaseModel):
    id: str
    discipline: str = "GEN"
    format: Literal["se", "rr"] = "se"
    participants: List[ParticipantIn]
    rounds: List[List[ImportPlayUnitIn]]


class ImportTournamentIn(BaseModel):
    courts: int = Field(..., ge=1)
    total_slots: int = Field(..., ge=1)
    rest_between_rounds: int = Field(1, ge=0)
    interval_minutes: int = Field(30, ge=1)
    time_limit_seconds: float = Field(5.0, gt=0)
    start_time: Optional[datetime] = None
    events: List[ImportEventIn]


# ---------------------------------------------------------------------------
# In-memory session representation — assembled from DB rows on each request.
# The dataclass itself (``BracketSession``) lives in
# ``services.bracket.state`` so both backends describe sessions with the
# same shape; ``time_limit_seconds`` is tracked separately on the few
# routes that need it (schedule-next).
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Hydration: DB rows → BracketSession (the in-memory shape the
# pure-Python bracket logic expects).
# ---------------------------------------------------------------------------


def _pick(camel_cfg: dict, session_cfg: dict, camel_key: str, legacy_key: str, default):
    """Resolve a config value from camelCase TournamentConfig (preferred)
    or the legacy bracket_session blob, falling back to *default*.

    Priority: ``camel_cfg[camel_key]`` (if present and not None) >
    ``session_cfg[legacy_key]`` > *default*.
    """
    if camel_key in camel_cfg and camel_cfg[camel_key] is not None:
        return camel_cfg[camel_key]
    return session_cfg.get(legacy_key, default)


def _meet_occupied_windows(
    data_blob: dict, court_count: int
) -> List[Tuple[int, int, int]]:
    """Cross-engine court coordination (hybrid workspaces).

    Meet and Bracket schedule the same physical courts independently. To
    stop them double-booking, a bracket solve treats every court+slot the
    MEET schedule already occupies as a closed ``(court, from, to)`` window,
    so the CP-SAT engine never places a bracket match where a meet match
    already sits. Reads the meet schedule from the tournament ``data`` blob
    (``schedule.assignments``); returns ``[]`` when there's no meet schedule.
    """
    sched = (data_blob or {}).get("schedule") or {}
    out: List[Tuple[int, int, int]] = []
    for a in sched.get("assignments", []) or []:
        court = a.get("courtId")
        slot = a.get("slotId")
        dur = a.get("durationSlots", 1) or 1
        if court is None or slot is None:
            continue
        try:
            c, s, d = int(court), int(slot), int(dur)
        except (TypeError, ValueError):
            continue
        if 1 <= c <= court_count and d > 0:
            out.append((c, s, s + d))
    return out


def _hydrate_session(
    repo: LocalRepository, tournament_id: uuid.UUID
) -> Optional[BracketSession]:
    """Reconstruct the in-memory bracket session from persisted rows.

    Returns ``None`` if no bracket events exist for this tournament.
    """
    event_rows = repo.brackets.list_events(tournament_id)
    if not event_rows:
        return None

    tournament = repo.tournaments.get_by_id(tournament_id)
    data_blob = (tournament.data or {}) if tournament else {}
    camel_cfg = data_blob.get("config") or {}
    session_cfg = data_blob.get("bracket_session") or {}

    court_count = int(_pick(camel_cfg, session_cfg, "courtCount", "courts", 2))
    interval_minutes = int(_pick(camel_cfg, session_cfg, "intervalMinutes", "interval_minutes", 30))
    # total_slots is a derived scheduler constant, not a TournamentConfig field — bracket_session only
    total_slots = int(session_cfg.get("total_slots", 128))
    rest = int(_pick(camel_cfg, session_cfg, "restBetweenRounds", "rest_between_rounds", 1))

    # Built through the shared scheduling-parameter builder so courts /
    # time window / slot duration are read into a ``ScheduleConfig`` the
    # same way the meet path reads them (see
    # ``services/scheduling/params.py``).
    config = build_schedule_config(
        SchedulingParams(
            court_count=court_count,
            total_slots=total_slots,
            interval_minutes=interval_minutes,
            # Hybrid coordination: schedule bracket matches AROUND the meet
            # schedule so the two engines never double-book a court.
            closed_court_windows=_meet_occupied_windows(data_blob, court_count),
        )
    )

    start_time_iso = session_cfg.get("start_time")
    start_time = (
        datetime.fromisoformat(start_time_iso)
        if isinstance(start_time_iso, str) and start_time_iso
        else None
    )

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}
    match_versions: Dict[str, int] = {}

    for event_row in event_rows:
        # Participants for this event.
        participant_rows = repo.brackets.list_participants(
            tournament_id, event_row.id
        )
        event_participants: Dict[str, Participant] = {}
        for p in participant_rows:
            participant = Participant(
                id=p.id,
                name=p.name,
                type=_parse_participant_type(p.type),
                member_ids=list(p.member_ids or []),
                metadata={
                    **(dict(p.meta) if p.meta else {}),
                    **({"seed": p.seed} if p.seed is not None else {}),
                },
            )
            state.participants[p.id] = participant
            event_participants[p.id] = participant

        # Engine Event placeholder (the format generators set this up
        # when first run; we keep it consistent here for round-trip).
        # ``event_row.config`` round-trips any format-specific knobs
        # the original generator stored (randomize-seed flag, etc.) so
        # the rebuilt state matches the original.
        engine_event = EngineEvent(
            id=event_row.id,
            type_tags=[],
            format_plugin_name=event_row.format,
            parameters=dict(event_row.config or {}),
        )
        state.events[event_row.id] = engine_event

        # Matches → PlayUnits + Draw slots + rounds.
        match_rows = repo.brackets.list_matches(tournament_id, event_row.id)
        slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
        round_buckets: Dict[int, List[Tuple[int, str]]] = defaultdict(list)
        event_play_units: Dict[str, PlayUnit] = {}
        for m in match_rows:
            pu = PlayUnit(
                id=m.id,
                event_id=event_row.id,
                side_a=list(m.side_a) if m.side_a else None,
                side_b=list(m.side_b) if m.side_b else None,
                expected_duration_slots=m.expected_duration_slots,
                duration_variance_slots=m.duration_variance_slots,
                dependencies=list(m.dependencies or []),
                metadata=dict(m.meta or {}),
                kind=_parse_play_unit_kind(m.kind),
                child_unit_ids=list(m.child_unit_ids or []),
            )
            state.play_units[m.id] = pu
            event_play_units[m.id] = pu
            match_versions[m.id] = m.version
            slots[m.id] = (
                _dict_to_slot(m.slot_a),
                _dict_to_slot(m.slot_b),
            )
            round_buckets[m.round_index].append((m.match_index, m.id))

        rounds = [
            [pu_id for _, pu_id in sorted(round_buckets[r])]
            for r in sorted(round_buckets.keys())
        ]

        draws[event_row.id] = Draw(
            event=engine_event,
            participants=event_participants,
            play_units=event_play_units,
            slots=slots,
            rounds=rounds,
        )

        events_meta[event_row.id] = EventMeta(
            id=event_row.id,
            discipline=event_row.discipline,
            format=event_row.format,
            duration_slots=event_row.duration_slots,
            bracket_size=event_row.bracket_size,
            participant_count=len(participant_rows),
            status=event_row.status or "draft",
        )

        # Results.
        result_rows = repo.brackets.list_results(tournament_id, event_row.id)
        for r in result_rows:
            state.results[r.bracket_match_id] = Result(
                winner_side=WinnerSide(r.winner_side),
                score=r.score,
                finished_at_slot=r.finished_at_slot,
                walkover=r.walkover,
            )

    # Assignments live in tournaments.data["bracket_session"]["assignments"]
    # — they're not normalised into their own table in PR 1; PR 3 may
    # promote them to ``bracket_assignments`` if granular Realtime
    # ordering becomes useful.
    for a in session_cfg.get("assignments") or []:
        if not isinstance(a, dict) or "play_unit_id" not in a:
            continue
        state.assignments[a["play_unit_id"]] = TournamentAssignment(
            play_unit_id=a["play_unit_id"],
            slot_id=int(a.get("slot_id", 0)),
            court_id=int(a.get("court_id", 0)),
            duration_slots=int(a.get("duration_slots", 1)),
            actual_start_slot=a.get("actual_start_slot"),
            actual_end_slot=a.get("actual_end_slot"),
        )

    return BracketSession(
        state=state,
        draws=draws,
        config=config,
        rest_between_rounds=rest,
        start_time=start_time,
        events=events_meta,
        match_versions=match_versions,
    )


# ---------------------------------------------------------------------------
# Persistence helpers — write a freshly-built or freshly-mutated session
# back to the bracket_* tables + tournaments.data["bracket_session"].
# ---------------------------------------------------------------------------


def _persist_session_metadata(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    *,
    session: BracketSession,
    time_limit_seconds: Optional[float] = None,
) -> None:
    """Write the schedule-config + assignments blob into tournaments.data.

    The bracket_* tables hold the per-event / per-match shape; the
    session-wide knobs (courts / total_slots / interval_minutes / rest /
    start_time / assignments) live as a JSON blob on the parent
    tournament row so reads of the bracket reconstruct them in
    ``_hydrate_session``. ``time_limit_seconds`` rides along here even
    though it isn't on the lightweight session dataclass; we preserve
    whatever was stored last if the caller doesn't pass a fresh value.
    """
    tournament = repo.tournaments.get_by_id(tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="tournament not found")
    existing = dict(tournament.data or {})
    prior_cfg = existing.get("bracket_session") or {}
    if time_limit_seconds is None:
        time_limit_seconds = float(prior_cfg.get("time_limit_seconds", 5.0))
    existing["bracket_session"] = {
        "courts": session.config.court_count,
        "total_slots": session.config.total_slots,
        "interval_minutes": session.config.interval_minutes,
        "rest_between_rounds": session.rest_between_rounds,
        "time_limit_seconds": time_limit_seconds,
        "start_time": (
            session.start_time.isoformat() if session.start_time else None
        ),
        "assignments": [
            {
                "play_unit_id": a.play_unit_id,
                "slot_id": a.slot_id,
                "court_id": a.court_id,
                "duration_slots": a.duration_slots,
                "actual_start_slot": a.actual_start_slot,
                "actual_end_slot": a.actual_end_slot,
            }
            for a in session.state.assignments.values()
        ],
    }
    repo.tournaments.upsert_data(tournament_id, existing)


def _persist_event(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    *,
    event_id: str,
    meta: EventMeta,
    draw: Draw,
    state: TournamentState,
    seeded_count: int,
    rr_rounds: Optional[int],
    config: Optional[dict] = None,
) -> None:
    """Persist one event's full shape (event row + participants + matches).

    Called from create / import flows. The repo enqueues outbox rows
    for the event + each match in the same transaction; results from
    auto-walkover-on-BYE are persisted separately by the caller after
    this returns (the matches must exist before results can FK them).
    """
    repo.brackets.create_event(
        tournament_id,
        event_id,
        discipline=meta.discipline,
        format=meta.format,
        duration_slots=meta.duration_slots,
        bracket_size=meta.bracket_size,
        seeded_count=seeded_count,
        rr_rounds=rr_rounds,
        config=config or {},
    )
    repo.brackets.bulk_create_participants(
        tournament_id,
        event_id,
        [
            {
                "id": p.id,
                "name": p.name,
                "type": p.type.value.upper(),
                "member_ids": list(p.member_ids or []),
                "seed": (
                    p.metadata.get("seed")
                    if isinstance(p.metadata, dict)
                    else None
                ),
                "meta": {
                    k: v
                    for k, v in (p.metadata or {}).items()
                    if k != "seed"
                },
            }
            for p in draw.participants.values()
        ],
    )
    match_dicts: List[dict] = []
    for round_index, round_pu_ids in enumerate(draw.rounds):
        for match_index, pu_id in enumerate(round_pu_ids):
            pu = state.play_units[pu_id]
            slot_a, slot_b = draw.slots[pu_id]
            match_dicts.append(
                {
                    "id": pu.id,
                    "round_index": round_index,
                    "match_index": match_index,
                    "kind": pu.kind.value.upper(),
                    "slot_a": _slot_to_dict(slot_a),
                    "slot_b": _slot_to_dict(slot_b),
                    "side_a": list(pu.side_a) if pu.side_a else [],
                    "side_b": list(pu.side_b) if pu.side_b else [],
                    "dependencies": list(pu.dependencies),
                    "expected_duration_slots": pu.expected_duration_slots,
                    "duration_variance_slots": pu.duration_variance_slots,
                    "child_unit_ids": list(pu.child_unit_ids or []),
                    "meta": dict(pu.metadata or {}),
                }
            )
    repo.brackets.bulk_create_matches(tournament_id, event_id, match_dicts)


# ---------------------------------------------------------------------------
# Serialization — BracketSession → TournamentOut wire format.
# ---------------------------------------------------------------------------


def _serialize_session(session: BracketSession) -> TournamentOut:
    state = session.state
    started_ids = _started_play_unit_ids(state)
    finished_ids = _finished_play_unit_ids(state)

    play_units_out: List[PlayUnitOut] = []
    events_out: List[EventOut] = []

    for event_id, draw in session.draws.items():
        meta = session.events.get(event_id)
        for round_index, round_pu_ids in enumerate(draw.rounds):
            for match_index, pu_id in enumerate(round_pu_ids):
                pu = state.play_units[pu_id]
                slot_a, slot_b = draw.slots[pu_id]
                play_units_out.append(
                    PlayUnitOut(
                        id=pu.id,
                        event_id=pu.event_id,
                        round_index=round_index,
                        match_index=match_index,
                        side_a=list(pu.side_a) if pu.side_a else None,
                        side_b=list(pu.side_b) if pu.side_b else None,
                        duration_slots=pu.expected_duration_slots or 1,
                        dependencies=list(pu.dependencies),
                        slot_a=BracketSlotOut(
                            participant_id=slot_a.participant_id,
                            feeder_play_unit_id=slot_a.feeder_play_unit_id,
                        ),
                        slot_b=BracketSlotOut(
                            participant_id=slot_b.participant_id,
                            feeder_play_unit_id=slot_b.feeder_play_unit_id,
                        ),
                        version=session.match_versions.get(pu_id, 1),
                    )
                )
        events_out.append(
            EventOut(
                id=event_id,
                discipline=meta.discipline if meta else event_id,
                format=meta.format if meta else "se",
                bracket_size=meta.bracket_size if meta else None,
                participant_count=meta.participant_count if meta else 0,
                rounds=list(draw.rounds),
                status=meta.status if meta else None,
            )
        )

    assignments_out = [
        AssignmentOut(
            play_unit_id=a.play_unit_id,
            slot_id=a.slot_id,
            court_id=a.court_id,
            duration_slots=a.duration_slots,
            actual_start_slot=a.actual_start_slot,
            actual_end_slot=a.actual_end_slot,
            started=a.play_unit_id in started_ids,
            finished=a.play_unit_id in finished_ids,
        )
        for a in state.assignments.values()
    ]

    results_out = [
        ResultOut(
            play_unit_id=pu_id,
            winner_side=r.winner_side.value,
            walkover=r.walkover,
            finished_at_slot=r.finished_at_slot,
            score=r.score,
        )
        for pu_id, r in state.results.items()
    ]

    participants_out = [
        ParticipantOut(
            id=p.id,
            name=p.name,
            members=list(p.member_ids)
            if p.type == ParticipantType.TEAM and p.member_ids
            else None,
        )
        for p in state.participants.values()
    ]

    return TournamentOut(
        courts=session.config.court_count,
        total_slots=session.config.total_slots,
        rest_between_rounds=session.rest_between_rounds,
        interval_minutes=session.config.interval_minutes,
        start_time=session.start_time,
        events=events_out,
        participants=participants_out,
        play_units=play_units_out,
        assignments=assignments_out,
        results=results_out,
    )


def _started_play_unit_ids(state: TournamentState) -> Set[str]:
    return {
        a.play_unit_id
        for a in state.assignments.values()
        if a.actual_start_slot is not None
        and a.play_unit_id not in state.results
    }


def _finished_play_unit_ids(state: TournamentState) -> Set[str]:
    return set(state.results.keys())


def _bracket_locked_play_unit_ids(
    state: TournamentState, current_slot: int
) -> Set[str]:
    """PlayUnits whose assignment is locked: played (has a result) ∪
    started (``actual_start_slot`` set) ∪ past (ends at or before
    ``current_slot``). Delegates to ``is_assignment_locked`` — the
    single source of truth shared with
    ``TournamentDriver.repin_and_resolve``."""
    return {
        a.play_unit_id
        for a in state.assignments.values()
        if is_assignment_locked(a, state.results, current_slot)
    }


# ---------------------------------------------------------------------------
# Small parsing helpers.
# ---------------------------------------------------------------------------


def _slot_to_dict(slot: BracketSlot) -> dict:
    """Encode a BracketSlot for JSON storage."""
    return {
        "participant_id": slot.participant_id,
        "feeder_play_unit_id": slot.feeder_play_unit_id,
    }


def _dict_to_slot(raw) -> BracketSlot:
    """Decode a stored slot dict into a BracketSlot."""
    if not isinstance(raw, dict):
        return BracketSlot()
    return BracketSlot(
        participant_id=raw.get("participant_id"),
        feeder_play_unit_id=raw.get("feeder_play_unit_id"),
    )


def _parse_participant_type(value: str) -> ParticipantType:
    """Normalise the persisted PLAYER/TEAM string to the enum."""
    lower = (value or "").lower()
    if lower in (ParticipantType.PLAYER.value, ParticipantType.TEAM.value):
        return ParticipantType(lower)
    return ParticipantType.PLAYER


def _parse_play_unit_kind(value: str) -> PlayUnitKind:
    """Normalise the persisted MATCH/TIE/BLOCK string to the enum."""
    lower = (value or "").lower()
    if lower in (
        PlayUnitKind.MATCH.value,
        PlayUnitKind.TIE.value,
        PlayUnitKind.BLOCK.value,
    ):
        return PlayUnitKind(lower)
    return PlayUnitKind.MATCH


def _ensure_tournament_exists(
    repo: LocalRepository, tournament_id: uuid.UUID
) -> None:
    if repo.tournaments.get_by_id(tournament_id) is None:
        raise HTTPException(status_code=404, detail="tournament not found")


def _clear_bracket(repo: LocalRepository, tournament_id: uuid.UUID) -> None:
    """Delete every bracket event under this tournament — cascade wipes
    participants, matches, results — and clear the session JSON blob."""
    for event in repo.brackets.list_events(tournament_id):
        repo.brackets.delete_event(tournament_id, event.id)
    tournament = repo.tournaments.get_by_id(tournament_id)
    if tournament is not None and isinstance(tournament.data, dict):
        if "bracket_session" in tournament.data:
            payload = dict(tournament.data)
            payload.pop("bracket_session", None)
            repo.tournaments.upsert_data(tournament_id, payload)


def _load_match_versions(
    repo: LocalRepository, tournament_id: uuid.UUID
) -> Dict[str, int]:
    """``{play_unit_id: BracketMatch.version}`` across all of the
    tournament's events — the optimistic-concurrency tokens surfaced on
    the serialized play units (SP-F3)."""
    versions: Dict[str, int] = {}
    for event_row in repo.brackets.list_events(tournament_id):
        for m in repo.brackets.list_matches(tournament_id, event_row.id):
            versions[m.id] = m.version
    return versions


def _persist_result_advancement(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    session: BracketSession,
    play_unit_id: str,
    affected: List[str],
) -> None:
    """Persist a recorded result plus any downstream advancement rows."""
    pu = session.state.play_units[play_unit_id]
    recorded = session.state.results[play_unit_id]
    repo.brackets.record_result(
        tournament_id,
        pu.event_id,
        play_unit_id,
        winner_side=recorded.winner_side.value,
        score=recorded.score,
        finished_at_slot=recorded.finished_at_slot,
        walkover=recorded.walkover,
    )
    # First result on a Generated event flips its status to 'started'.
    ev_row = repo.brackets.get_event(tournament_id, pu.event_id)
    if ev_row is not None and ev_row.status == "generated":
        repo.brackets.set_event_status(tournament_id, pu.event_id, "started")
    # Persist the downstream match-row slot updates (and any cascading
    # walkover results triggered by _sweep_walkovers).
    for downstream_id in affected:
        downstream_pu = session.state.play_units[downstream_id]
        ev_id = downstream_pu.event_id
        slot_a, slot_b = session.draws[ev_id].slots[downstream_id]
        repo.brackets.update_match(
            tournament_id,
            ev_id,
            downstream_id,
            {
                "slot_a": _slot_to_dict(slot_a),
                "slot_b": _slot_to_dict(slot_b),
                "side_a": list(downstream_pu.side_a)
                if downstream_pu.side_a
                else [],
                "side_b": list(downstream_pu.side_b)
                if downstream_pu.side_b
                else [],
            },
        )
        # If the sweep auto-walkovered this downstream PlayUnit too,
        # its result is in state.results now and needs persisting.
        if downstream_id in session.state.results:
            r = session.state.results[downstream_id]
            repo.brackets.record_result(
                tournament_id,
                ev_id,
                downstream_id,
                winner_side=r.winner_side.value,
                score=r.score,
                finished_at_slot=r.finished_at_slot,
                walkover=r.walkover,
            )


# ---------------------------------------------------------------------------
# Routes.
# ---------------------------------------------------------------------------


@router.post("", response_model=TournamentOut, dependencies=[_OPERATOR])
def create_bracket(
    body: CreateTournamentIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Create the bracket session + events for this tournament.

    Mirrors the tournament product's ``POST /tournament``: takes the
    full session config + an events list, generates the draws via
    ``generate_single_elimination`` / ``generate_round_robin``, and
    persists the result. Returns the full state for the client to
    bind to (no second round-trip needed for the create-then-read
    flow).

    409 if a bracket session already exists for this tournament — the
    client must ``DELETE /bracket`` first to recreate.
    """
    _ensure_tournament_exists(repo, tournament_id)

    if not body.events:
        raise HTTPException(
            status_code=400, detail="at least one event is required"
        )
    if repo.brackets.list_events(tournament_id):
        raise HTTPException(
            status_code=409,
            detail="bracket already exists; DELETE /bracket first to recreate",
        )

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}

    seen_event_ids: Set[str] = set()
    for ev in body.events:
        if ev.id in seen_event_ids:
            raise HTTPException(
                status_code=400, detail=f"duplicate event id {ev.id!r}"
            )
        seen_event_ids.add(ev.id)
        if len(ev.participants) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"event {ev.id!r} needs at least 2 participants",
            )

        # Build engine Participants from the wire shape.
        participants = [
            Participant(
                id=p.id,
                name=p.name,
                type=(
                    ParticipantType.TEAM
                    if p.members
                    else ParticipantType.PLAYER
                ),
                member_ids=list(p.members or []),
                metadata=({"seed": p.seed} if p.seed is not None else {}),
            )
            for p in ev.participants
        ]

        # Format generation produces the Draw (slot tree + rounds).
        # ``play_unit_id_prefix=ev.id`` namespaces PlayUnit ids per event
        # (``MS-R0-0`` not the constant-default ``M-R0-0``). Without it
        # every event mints identical ids and the second event's
        # ``register_draw`` raises on the shared TournamentState — see
        # register_draw's "callers should namespace per event" contract.
        if ev.format == "se":
            try:
                draw = generate_single_elimination(
                    participants,
                    event_id=ev.id,
                    play_unit_id_prefix=ev.id,
                    seeded_count=ev.seeded_count,
                    bracket_size=ev.bracket_size,
                    duration_slots=ev.duration_slots,
                    randomize=ev.randomize,
                )
            except (ValueError, NotImplementedError) as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        else:
            try:
                draw = generate_round_robin(
                    participants,
                    rounds=ev.rr_rounds,
                    event_id=ev.id,
                    play_unit_id_prefix=ev.id,
                    duration_slots=ev.duration_slots,
                )
            except (ValueError, NotImplementedError) as exc:
                raise HTTPException(status_code=400, detail=str(exc))

        register_draw(state, draw)
        draws[ev.id] = draw

        bracket_size = (
            len(draw.rounds[0]) * 2 if draw.rounds else None
        ) if ev.format == "se" else None
        events_meta[ev.id] = EventMeta(
            id=ev.id,
            discipline=ev.discipline,
            format=ev.format,
            duration_slots=ev.duration_slots,
            bracket_size=bracket_size,
            participant_count=len(ev.participants),
            status="draft",
        )

    session_obj = BracketSession(
        state=state,
        draws=draws,
        events=events_meta,
        config=build_schedule_config(
            SchedulingParams(
                court_count=body.courts,
                total_slots=body.total_slots,
                interval_minutes=body.interval_minutes,
            )
        ),
        rest_between_rounds=body.rest_between_rounds,
        start_time=body.start_time,
    )

    # Persist everything. Order: events first (FK parents), then
    # participants + matches, then results (auto-walkover BYEs).
    for ev in body.events:
        meta = events_meta[ev.id]
        draw = draws[ev.id]
        _persist_event(
            repo,
            tournament_id,
            event_id=ev.id,
            meta=meta,
            draw=draw,
            state=state,
            seeded_count=ev.seeded_count or 0,
            rr_rounds=ev.rr_rounds if ev.format == "rr" else None,
        )
    # Persist auto-walkover results (R1 BYE byes recorded by register_draw).
    for pu_id, result in state.results.items():
        event_id = state.play_units[pu_id].event_id
        repo.brackets.record_result(
            tournament_id,
            event_id,
            pu_id,
            winner_side=result.winner_side.value,
            score=result.score,
            finished_at_slot=result.finished_at_slot,
            walkover=result.walkover,
        )
    # Persist session config last so a partial failure earlier leaves
    # nothing for ``_hydrate_session`` to rehydrate.
    _persist_session_metadata(
        repo,
        tournament_id,
        session=session_obj,
        time_limit_seconds=body.time_limit_seconds,
    )

    return _serialize_session(session_obj)


@router.get("", response_model=TournamentOut, dependencies=[_VIEWER])
def get_bracket(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    return _serialize_session(session)


@router.delete("", dependencies=[_OPERATOR])
def delete_bracket(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Dict[str, bool]:
    _ensure_tournament_exists(repo, tournament_id)
    _clear_bracket(repo, tournament_id)
    return {"ok": True}


@router.post(
    "/schedule-next",
    response_model=ScheduleNextRoundOut,
    dependencies=[_OPERATOR],
)
def schedule_next_round(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> ScheduleNextRoundOut:
    """Run the CP-SAT solver on the next ready wave of PlayUnits.

    Persists newly-produced ``TournamentAssignment`` records into the
    session blob so subsequent reads see the schedule.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )

    # Pull the per-session solver time limit out of the persisted
    # bracket-session blob; the lightweight BracketSession dataclass
    # doesn't carry it (parser variants don't need it).
    tournament = repo.tournaments.get_by_id(tournament_id)
    session_cfg = (
        (tournament.data or {}).get("bracket_session") if tournament else None
    ) or {}
    time_limit_seconds = float(session_cfg.get("time_limit_seconds", 5.0))

    driver = TournamentDriver(
        state=session.state,
        config=session.config,
        solver_options=SolverOptions(
            time_limit_seconds=time_limit_seconds,
        ),
        rest_between_rounds=session.rest_between_rounds,
    )
    perf_start = time.perf_counter()
    result = driver.schedule_next_round()
    runtime_ms = (time.perf_counter() - perf_start) * 1000.0
    # Persist the new assignments into the session blob.
    _persist_session_metadata(repo, tournament_id, session=session)

    return ScheduleNextRoundOut(
        status=result.status.value,
        play_unit_ids=list(result.play_unit_ids),
        started_at_current_slot=result.started_at_current_slot,
        runtime_ms=round(runtime_ms, 2),
        infeasible_reasons=(
            list(result.schedule_result.infeasible_reasons)
            if result.schedule_result is not None
            else []
        ),
    )


def _candidates_from_schedule_result(result) -> List[BracketScheduleCandidate]:
    """Convert a ``ScheduleResult``'s candidate snapshots to the bracket
    wire shape. Each snapshot's ``Assignment.match_id`` is a PlayUnit id."""
    return [
        BracketScheduleCandidate(
            solution_id=snap.solution_id,
            objective_score=snap.objective_value,
            found_at_seconds=snap.found_at_seconds,
            assignments=[
                BracketAssignmentIn(
                    play_unit_id=a.match_id,
                    slot_id=a.slot_id,
                    court_id=a.court_id,
                    duration_slots=a.duration_slots,
                )
                for a in snap.assignments
            ],
        )
        for snap in (result.candidates or [])
    ]


def _resolve_candidate_pool_size(
    session_cfg: dict, override: Optional[int]
) -> int:
    """Pick the candidate-pool size: explicit query override > persisted
    bracket-session value > the shared default."""
    if override is not None and override >= 1:
        return override
    stored = session_cfg.get("candidate_pool_size")
    if isinstance(stored, int) and stored >= 1:
        return stored
    return _DEFAULT_CANDIDATE_POOL_SIZE


@router.post(
    "/schedule-next/stream",
    dependencies=[_OPERATOR],
)
async def schedule_next_round_stream(
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
    candidate_pool_size: Optional[int] = Query(None, ge=1),
    repo: LocalRepository = Depends(get_repository),
) -> StreamingResponse:
    """Solve the next ready wave with real-time progress over SSE.

    Mirrors the meet's ``POST /schedule/stream`` shape exactly:

    - ``{type: 'model_built', ...}``  — once, after ``build()``.
    - ``{type: 'phase', phase: 'presolve' | 'search' | 'proving'}``
    - ``{type: 'progress', ...}``      — each intermediate solution.
    - ``{type: 'complete', result: ScheduleNextRoundOut}`` — carries the
      candidate pool the operator chooses from.
    - ``{type: 'error', message: str}``
    - ``{type: 'done'}``               — always last; stream terminator.

    Unlike the batch ``/schedule-next``, this route does **not** write or
    persist assignments — the operator picks a candidate first, then
    ``/schedule-next/commit`` persists the chosen one (Task F2's
    candidate-selection-before-commit step).
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )

    tournament = repo.tournaments.get_by_id(tournament_id)
    session_cfg = (
        (tournament.data or {}).get("bracket_session") if tournament else None
    ) or {}
    time_limit_seconds = float(session_cfg.get("time_limit_seconds", 5.0))
    pool_size = _resolve_candidate_pool_size(session_cfg, candidate_pool_size)
    solver_options = SolverOptions(time_limit_seconds=time_limit_seconds)

    driver = TournamentDriver(
        state=session.state,
        config=session.config,
        solver_options=solver_options,
        rest_between_rounds=session.rest_between_rounds,
    )
    prepared = driver.prepare_next_round_problem()

    async def event_generator() -> AsyncGenerator[str, None]:
        progress_queue: asyncio.Queue = asyncio.Queue(maxsize=_SSE_QUEUE_MAX)
        cancel_event = asyncio.Event()
        result_holder: dict = {}
        error_holder: dict = {}
        state = {"phase": None, "solutions": 0}

        loop = asyncio.get_running_loop()

        def emit(event: dict, *, critical: bool = False) -> None:
            if cancel_event.is_set():
                return
            if critical:
                loop.call_soon_threadsafe(progress_queue.put_nowait, event)
                return
            try:
                loop.call_soon_threadsafe(progress_queue.put_nowait, event)
            except asyncio.QueueFull:
                pass

        def set_phase(phase: str) -> None:
            if state["phase"] != phase:
                state["phase"] = phase
                emit({"type": "phase", "phase": phase}, critical=True)

        def progress_callback(progress_data: dict):
            state["solutions"] += 1
            if state["solutions"] == 1:
                set_phase("search")
            emit({"type": "progress", **progress_data})

        def solve_in_thread():
            try:
                if prepared is None:
                    # No ready PlayUnits — emit a no-op complete so the
                    # client renders an empty result rather than hanging.
                    result_holder["result"] = ScheduleNextRoundOut(
                        status=SolverStatus.UNKNOWN.value,
                        play_unit_ids=[],
                        started_at_current_slot=session.config.current_slot,
                    )
                    return
                ready, current_slot, problem = prepared

                scheduler = CPSATScheduler(
                    config=problem.config,
                    solver_options=solver_options,
                )
                scheduler.add_players(problem.players)
                scheduler.add_matches(problem.matches)
                scheduler.set_previous_assignments(problem.previous_assignments)
                scheduler.build()

                stats = scheduler._compute_model_stats()
                emit(
                    {
                        "type": "model_built",
                        "numMatches": stats["num_matches"],
                        "numPlayers": stats["num_players"],
                        "numIntervals": stats["num_intervals"],
                        "numNoOverlap": stats["num_no_overlap"],
                        "numVariables": stats["num_variables"],
                        "multiMatchPlayers": stats["multi_match_players"],
                        "totalSlots": stats["total_slots"],
                        "courtCount": stats["court_count"],
                    },
                    critical=True,
                )
                set_phase("presolve")

                solve_result = scheduler.solve(
                    progress_callback=progress_callback,
                    candidate_pool_size=pool_size,
                )
                result_holder["result"] = ScheduleNextRoundOut(
                    status=solve_result.status.value,
                    play_unit_ids=list(ready),
                    started_at_current_slot=current_slot,
                    runtime_ms=round(solve_result.runtime_ms, 2),
                    infeasible_reasons=list(solve_result.infeasible_reasons),
                    candidates=_candidates_from_schedule_result(solve_result),
                )
                result_holder["status_value"] = solve_result.status.value
            except Exception as exc:  # pragma: no cover - defensive
                log.exception("bracket SSE solver worker failed")
                error_holder["error"] = str(exc)
            finally:
                emit({"type": "done"}, critical=True)

        executor_future = loop.run_in_executor(None, solve_in_thread)

        try:
            while True:
                try:
                    event = await asyncio.wait_for(
                        progress_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    if await http_request.is_disconnected():
                        log.info("bracket SSE client disconnected; cancelling")
                        cancel_event.set()
                        return
                    continue

                if event["type"] == "done":
                    if "error" in error_holder:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'solver failed'})}\n\n"
                    elif "result" in result_holder:
                        if result_holder.get("status_value") == "optimal":
                            yield f"data: {json.dumps({'type': 'phase', 'phase': 'proving'})}\n\n"
                        out = result_holder["result"].model_dump()
                        yield f"data: {json.dumps({'type': 'complete', 'result': out})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    break
                else:
                    yield f"data: {json.dumps(event)}\n\n"
        finally:
            cancel_event.set()
            executor_future.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/schedule-next/commit",
    response_model=TournamentOut,
    dependencies=[_OPERATOR],
)
def commit_next_round(
    body: CommitRoundIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Persist the operator-chosen candidate's assignments for a round.

    The streaming solve returns a candidate pool but writes nothing; the
    client posts the chosen candidate's assignment cells here to commit
    them. Each cell must reference a ready (unassigned, unplayed,
    sides-resolved) PlayUnit so a stale/foreign payload can't pin a
    played or already-scheduled match.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )

    ready = set(find_ready_play_units(session.state))
    for cell in body.assignments:
        if cell.play_unit_id not in session.state.play_units:
            raise HTTPException(
                status_code=404,
                detail=f"play_unit {cell.play_unit_id!r} not found",
            )
        if cell.play_unit_id not in ready:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"play_unit {cell.play_unit_id!r} is not ready to "
                    f"schedule (already assigned, played, or unresolved)"
                ),
            )
        session.state.assignments[cell.play_unit_id] = TournamentAssignment(
            play_unit_id=cell.play_unit_id,
            slot_id=cell.slot_id,
            court_id=cell.court_id,
            duration_slots=cell.duration_slots,
        )

    _persist_session_metadata(repo, tournament_id, session=session)
    return _serialize_session(session)


@router.post(
    "/events/{event_id}",
    response_model=TournamentOut,
    dependencies=[_OPERATOR],
)
def upsert_event(
    body: EventUpsertIn,
    tournament_id: uuid.UUID = Path(...),
    event_id: str = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Create or replace one bracket event row + its participants.

    Status of the event is forced to ``'draft'``. Existing
    ``bracket_matches`` for this event are wiped (an upsert is a
    Draft-state operation; Generated/Started events must go
    through DELETE→upsert→generate).

    409 if the event is 'started' (matches with recorded results cannot
    be replaced).
    """
    _ensure_tournament_exists(repo, tournament_id)
    existing = repo.brackets.get_event(tournament_id, event_id)
    if existing is not None and existing.status == "started":
        raise HTTPException(
            status_code=409,
            detail=f"event {event_id!r} is started; cannot edit",
        )

    # For a Generated event, wipe out its assignments from the session
    # blob before the delete so they don't become orphan references.
    # We do this by hydrating the session, removing the assignments for
    # this event's play units, and persisting before deleting the event.
    if existing is not None and existing.status == "generated":
        session = _hydrate_session(repo, tournament_id)
        if session is not None:
            # Remove assignments belonging to this event.
            event_pu_ids = [
                pu_id
                for pu_id, pu in session.state.play_units.items()
                if pu.event_id == event_id
            ]
            for pu_id in event_pu_ids:
                session.state.assignments.pop(pu_id, None)
            _persist_session_metadata(repo, tournament_id, session=session)

    repo.brackets.delete_event(tournament_id, event_id)
    repo.brackets.create_event(
        tournament_id,
        event_id,
        discipline=body.discipline,
        format=body.format,
        duration_slots=body.duration_slots,
        bracket_size=body.bracket_size,
        seeded_count=body.seeded_count,
        rr_rounds=body.rr_rounds if body.format == "rr" else None,
        config={},
        status="draft",
    )
    if body.participants:
        repo.brackets.bulk_create_participants(
            tournament_id,
            event_id,
            [
                {
                    "id": p.id,
                    "name": p.name,
                    "type": "TEAM" if p.members else "PLAYER",
                    "member_ids": list(p.members or []),
                    "seed": p.seed,
                    "meta": {},
                }
                for p in body.participants
            ],
        )
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket session for this tournament"
        )
    return _serialize_session(session)


@router.post(
    "/events/{event_id}/generate",
    response_model=TournamentOut,
    dependencies=[_OPERATOR],
)
def generate_event_route(
    body: GenerateEventIn,
    tournament_id: uuid.UUID = Path(...),
    event_id: str = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Generate (or re-generate) one event's draws + schedule.

    - Draft → builds the event's draw via the format generator,
      then runs ``TournamentDriver.generate_event(event_id)`` so the
      new matches receive assignments around any OTHER events'
      already-locked assignments. Sets status='generated'.
    - Generated with ``wipe=true`` → wipes existing assignments
      in-memory first, then re-generates.
    - Started → 409.
    - Solver infeasible → 409 with reason (DB untouched — nothing is
      persisted until after a successful solve).
    """
    _ensure_tournament_exists(repo, tournament_id)
    existing = repo.brackets.get_event(tournament_id, event_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="event not found")
    if existing.status == "started":
        raise HTTPException(status_code=409, detail="event is started")
    if existing.status == "generated" and not body.wipe:
        raise HTTPException(
            status_code=409,
            detail="event already generated; pass wipe=true to re-generate",
        )

    # Hydrate current session (participants + play_units from DB).
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(status_code=500, detail="hydration failed")

    # Fetch participants for this event from the DB (hydration already
    # loaded them into session.state.participants, but we need the
    # ordered list for the draw generators).
    participant_rows = repo.brackets.list_participants(tournament_id, event_id)
    if len(participant_rows) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"event {event_id!r} needs at least 2 participants to generate",
        )

    # Honour the explicit ``seed`` (the documented contract): the draw
    # generators treat input ORDER as seed order, so order the rows by
    # ascending seed — seeded first, unseeded trailing by id. This is what
    # lets the operator place players in specific bracket slots (the UI
    # sends each participant the seed for its chosen position).
    participant_rows = sorted(
        participant_rows,
        key=lambda p: (p.seed is None, p.seed if p.seed is not None else 0, p.id),
    )

    participants = [
        Participant(
            id=p.id,
            name=p.name,
            type=_parse_participant_type(p.type),
            member_ids=list(p.member_ids or []),
            metadata=({"seed": p.seed} if p.seed is not None else {}),
        )
        for p in participant_rows
    ]

    # Build the draw in memory (no DB writes yet).
    if existing.format == "se":
        try:
            draw = generate_single_elimination(
                participants,
                event_id=event_id,
                play_unit_id_prefix=event_id,
                seeded_count=existing.seeded_count or 0,
                bracket_size=existing.bracket_size,
                duration_slots=existing.duration_slots,
            )
        except (ValueError, NotImplementedError) as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        try:
            draw = generate_round_robin(
                participants,
                rounds=existing.rr_rounds or 1,
                event_id=event_id,
                play_unit_id_prefix=event_id,
                duration_slots=existing.duration_slots,
            )
        except (ValueError, NotImplementedError) as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Build a fresh in-memory state for this generation run.
    # Remove old play_units and assignments for this event from the
    # hydrated session state (handles wipe=True semantics in memory,
    # before any DB writes).
    old_pu_ids = [
        pu_id
        for pu_id, pu in session.state.play_units.items()
        if pu.event_id == event_id
    ]
    for pu_id in old_pu_ids:
        session.state.play_units.pop(pu_id, None)
        session.state.assignments.pop(pu_id, None)
        session.state.results.pop(pu_id, None)
    # Register the new draw into the session state.
    # register_draw will raise if play_unit_ids collide — they shouldn't
    # since we just cleared the old ones.
    register_draw(session.state, draw)

    # Update session.draws and session.events so that _serialize_session
    # iterates the freshly-built draw (not the empty placeholder that
    # _hydrate_session loaded from the DB for a draft event).
    session.draws[event_id] = draw
    bracket_size = (
        len(draw.rounds[0]) * 2 if draw.rounds else None
    ) if existing.format == "se" else None
    session.events[event_id] = EventMeta(
        id=event_id,
        discipline=existing.discipline,
        format=existing.format,
        duration_slots=existing.duration_slots,
        bracket_size=bracket_size,
        participant_count=len(participant_rows),
        status="generated",
    )

    # Run the solver (in memory only — no DB writes until success).
    driver = TournamentDriver(
        state=session.state,
        config=session.config,
        rest_between_rounds=session.rest_between_rounds,
    )
    try:
        result = driver.generate_event(event_id, wipe=False)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    if not result.scheduled:
        reasons = (
            result.schedule_result.infeasible_reasons
            if result.schedule_result else []
        )
        raise HTTPException(
            status_code=409,
            detail=(
                f"solver returned {result.status.value}: "
                f"{'; '.join(reasons) or 'no reason'}"
            ),
        )

    # Solve succeeded — now persist to DB.
    # 1. Delete the old event row (cascades participants + matches).
    repo.brackets.delete_event(tournament_id, event_id)
    # 2. Recreate the event row with status='generated'.
    repo.brackets.create_event(
        tournament_id,
        event_id,
        discipline=existing.discipline,
        format=existing.format,
        duration_slots=existing.duration_slots,
        bracket_size=existing.bracket_size,
        seeded_count=existing.seeded_count or 0,
        rr_rounds=existing.rr_rounds,
        config=dict(existing.config or {}),
        status="generated",
    )
    # 3. Re-persist participants.
    repo.brackets.bulk_create_participants(
        tournament_id,
        event_id,
        [
            {
                "id": p.id,
                "name": p.name,
                "type": p.type.value.upper(),
                "member_ids": list(p.member_ids or []),
                "seed": (
                    p.metadata.get("seed")
                    if isinstance(p.metadata, dict)
                    else None
                ),
                "meta": {
                    k: v
                    for k, v in (p.metadata or {}).items()
                    if k != "seed"
                },
            }
            for p in draw.participants.values()
        ],
    )
    # 4. Persist matches.
    match_dicts: List[dict] = []
    for round_index, round_pu_ids in enumerate(draw.rounds):
        for match_index, pu_id in enumerate(round_pu_ids):
            pu = session.state.play_units[pu_id]
            slot_a, slot_b = draw.slots[pu_id]
            match_dicts.append(
                {
                    "id": pu.id,
                    "round_index": round_index,
                    "match_index": match_index,
                    "kind": pu.kind.value.upper(),
                    "slot_a": _slot_to_dict(slot_a),
                    "slot_b": _slot_to_dict(slot_b),
                    "side_a": list(pu.side_a) if pu.side_a else [],
                    "side_b": list(pu.side_b) if pu.side_b else [],
                    "dependencies": list(pu.dependencies),
                    "expected_duration_slots": pu.expected_duration_slots,
                    "duration_variance_slots": pu.duration_variance_slots,
                    "child_unit_ids": list(pu.child_unit_ids or []),
                    "meta": dict(pu.metadata or {}),
                }
            )
    repo.brackets.bulk_create_matches(tournament_id, event_id, match_dicts)
    # 5. Persist auto-walkover results for R1 BYE play_units that
    #    register_draw wrote into state.results (e.g. SE with odd participant
    #    count). Filter strictly to this event to avoid re-recording other
    #    events' already-persisted results.
    for pu_id, result in session.state.results.items():
        if session.state.play_units[pu_id].event_id != event_id:
            continue
        repo.brackets.record_result(
            tournament_id,
            event_id,
            pu_id,
            winner_side=result.winner_side.value,
            score=result.score,
            finished_at_slot=result.finished_at_slot,
            walkover=result.walkover,
        )
    # 6. Persist assignments (session.state.assignments updated by solver).
    _persist_session_metadata(repo, tournament_id, session=session)
    return _serialize_session(session)


@router.delete(
    "/events/{event_id}",
    status_code=204,
    dependencies=[_OPERATOR],
)
def delete_event_route(
    tournament_id: uuid.UUID = Path(...),
    event_id: str = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    """Delete a bracket event.

    Only 'draft' events may be deleted. 'generated' and 'started' events
    must be explicitly demoted via upsert (with the understanding that
    upsert only allows demotion on 'generated') before deletion.
    """
    _ensure_tournament_exists(repo, tournament_id)
    existing = repo.brackets.get_event(tournament_id, event_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="event not found")
    if existing.status != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"event status is {existing.status!r}; only draft can be deleted",
        )
    repo.brackets.delete_event(tournament_id, event_id)
    return Response(status_code=204)


@router.post("/results", response_model=TournamentOut, dependencies=[_OPERATOR])
def record_match_result(
    body: RecordResultIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Record a result and advance the bracket.

    ``record_result`` (pure-Python) mutates the in-memory state +
    downstream draw slots; we persist the bracket_matches rows that
    changed and the bracket_results row for the recorded match.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )

    pu = session.state.play_units.get(body.play_unit_id)
    if pu is None:
        raise HTTPException(
            status_code=404, detail=f"play_unit {body.play_unit_id!r} not found"
        )

    # Optimistic concurrency (SP-F3): when the client carries the version it
    # last saw, reject a write whose token is stale — a second operator
    # already moved this match. Checked BEFORE the already-recorded /
    # advancement paths so a stale write records nothing and advances
    # nothing. Omitting ``seen_version`` keeps the legacy behavior.
    if body.seen_version is not None:
        current_version = session.match_versions.get(body.play_unit_id, 1)
        if body.seen_version != current_version:
            raise ConflictError(
                match_id=body.play_unit_id,
                current_version=current_version,
                seen_version=body.seen_version,
                message=(
                    f"Bracket match {body.play_unit_id!r} was updated since "
                    f"you last loaded it (current version {current_version}, "
                    f"you sent {body.seen_version})."
                ),
            )

    existing = session.state.results.get(body.play_unit_id)
    if existing is not None:
        is_exact_replay = (
            existing.winner_side.value == body.winner_side
            and existing.finished_at_slot == body.finished_at_slot
            and existing.walkover == body.walkover
            and existing.score == body.score
        )
        if not is_exact_replay:
            raise HTTPException(
                status_code=409,
                detail="Result already recorded for this match",
            )
        session.state.results.pop(body.play_unit_id)

    try:
        affected = record_result(
            session.state,
            session.draws,
            body.play_unit_id,
            WinnerSide(body.winner_side),
            finished_at_slot=body.finished_at_slot,
            walkover=body.walkover,
            score=body.score,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    _persist_result_advancement(
        repo,
        tournament_id,
        session,
        body.play_unit_id,
        affected,
    )

    # Advancement bumped downstream match versions in the DB; refresh the
    # tokens so the returned DTO carries the authoritative versions (SP-F3).
    session.match_versions = _load_match_versions(repo, tournament_id)

    return _serialize_session(session)


@router.post(
    "/match-action", response_model=TournamentOut, dependencies=[_OPERATOR]
)
def match_action(
    body: MatchActionIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Toggle ``actual_start_slot`` / ``actual_end_slot`` on an assignment.

    Mirrors the prototype's start/finish/reset semantics: ``start``
    sets ``actual_start_slot`` (from ``body.slot`` or the assigned
    slot); ``finish`` sets ``actual_end_slot``; ``reset`` clears both.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    assignment = session.state.assignments.get(body.play_unit_id)
    if assignment is None:
        raise HTTPException(
            status_code=404,
            detail=f"no assignment for play_unit {body.play_unit_id!r}",
        )

    # A recorded result locks the physical lifecycle: 'start' would
    # silently wipe ``actual_end_slot`` (and so move the next round's
    # scheduling baseline), and 'reset' would clear the clock while
    # leaving the result + its downstream advancement in place — an
    # inconsistent state with no un-record path. Block both; redoing a
    # played match means resetting the bracket.
    has_result = body.play_unit_id in session.state.results
    if body.action == "start":
        if has_result:
            raise HTTPException(
                status_code=409,
                detail="Cannot start a bracket match that already has a result",
            )
        assignment.actual_start_slot = (
            body.slot if body.slot is not None else assignment.slot_id
        )
        assignment.actual_end_slot = None
    elif body.action == "finish":
        if assignment.actual_start_slot is None:
            raise HTTPException(
                status_code=409,
                detail="Cannot finish a bracket match before it has started",
            )
        assignment.actual_end_slot = (
            body.slot
            if body.slot is not None
            else (assignment.slot_id + assignment.duration_slots)
        )
    elif body.action == "reset":
        if has_result:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot reset a bracket match with a recorded result; "
                    "reset the bracket to redo a played match"
                ),
            )
        assignment.actual_start_slot = None
        assignment.actual_end_slot = None

    _persist_session_metadata(repo, tournament_id, session=session)
    return _serialize_session(session)


@router.post(
    "/validate", response_model=BracketValidationOut, dependencies=[_VIEWER]
)
def validate_bracket_move_route(
    body: BracketValidateIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> BracketValidationOut:
    """Cheap (pure-Python) feasibility check for a drag-to-reschedule
    move on the bracket Schedule Gantt.

    No CP-SAT invocation — splices the proposed ``(slot_id, court_id)``
    for ``play_unit_id`` into the session's current assignment set and
    runs ``validate_bracket_move``. A *locked* (played / started / past)
    PlayUnit is not draggable: it returns ``feasible: false`` with a
    ``locked`` conflict rather than running the full check.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    if body.play_unit_id not in session.state.play_units:
        raise HTTPException(
            status_code=404,
            detail=f"play_unit {body.play_unit_id!r} not found",
        )

    locked_ids = _bracket_locked_play_unit_ids(
        session.state, session.config.current_slot
    )
    if body.play_unit_id in locked_ids:
        return BracketValidationOut(
            feasible=False,
            conflicts=[
                BracketValidationConflictOut(
                    type="locked",
                    description=(
                        f"Play unit {body.play_unit_id} is locked "
                        f"(played / started / past) and cannot be moved"
                    ),
                    play_unit_id=body.play_unit_id,
                )
            ],
        )

    if body.play_unit_id not in session.state.assignments:
        return BracketValidationOut(
            feasible=False,
            conflicts=[
                BracketValidationConflictOut(
                    type="unscheduled",
                    description=(
                        f"Play unit {body.play_unit_id} is not scheduled "
                        f"and cannot be re-pinned"
                    ),
                    play_unit_id=body.play_unit_id,
                )
            ],
        )

    conflicts: List[BracketConflict] = validate_bracket_move(
        session.state,
        session.config,
        play_unit_id=body.play_unit_id,
        slot_id=body.slot_id,
        court_id=body.court_id,
    )
    return BracketValidationOut(
        feasible=not conflicts,
        conflicts=[
            BracketValidationConflictOut(
                type=c.type,
                description=c.description,
                play_unit_id=c.play_unit_id,
                other_play_unit_id=c.other_play_unit_id,
                player_id=c.player_id,
                court_id=c.court_id,
                slot_id=c.slot_id,
            )
            for c in conflicts
        ],
    )


@router.post(
    "/pin", response_model=TournamentOut, dependencies=[_OPERATOR]
)
def pin_bracket_match(
    body: BracketPinIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Re-pin one already-scheduled PlayUnit and re-solve the
    already-scheduled set around it via the shared CP-SAT engine.

    Partitions ``state.assignments`` into locked / pinned / free,
    re-solves with ``current_slot`` unchanged, writes the resulting
    assignments back, persists, and returns the serialized session
    (same shape ``/results`` and ``/match-action`` return).

    A *locked* (played / started / past) ``play_unit_id`` is rejected
    with ``409 {"error": "locked"}`` **before** the partition. A
    solver INFEASIBLE / UNKNOWN result (including timeout) is reported
    as ``409 {"error": "infeasible"}`` — surfaced to the operator, not
    a crash.
    """
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    if body.play_unit_id not in session.state.play_units:
        raise HTTPException(
            status_code=404,
            detail=f"play_unit {body.play_unit_id!r} not found",
        )

    # Reject a locked play_unit BEFORE the partition / feasibility
    # check so the frontend gets an unambiguous 409 rather than an
    # `infeasible` response.
    locked_ids = _bracket_locked_play_unit_ids(
        session.state, session.config.current_slot
    )
    if body.play_unit_id in locked_ids:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "locked",
                "message": (
                    f"play_unit {body.play_unit_id!r} is locked "
                    f"(played / started / past) and cannot be re-pinned"
                ),
            },
        )

    tournament = repo.tournaments.get_by_id(tournament_id)
    session_cfg = (
        (tournament.data or {}).get("bracket_session") if tournament else None
    ) or {}
    time_limit_seconds = float(session_cfg.get("time_limit_seconds", 5.0))

    driver = TournamentDriver(
        state=session.state,
        config=session.config,
        solver_options=SolverOptions(
            time_limit_seconds=time_limit_seconds,
        ),
        rest_between_rounds=session.rest_between_rounds,
    )
    try:
        result = driver.repin_and_resolve(
            body.play_unit_id,
            slot_id=body.slot_id,
            court_id=body.court_id,
        )
    except ValueError as exc:
        # repin_and_resolve raises ValueError for an unscheduled or
        # locked play_unit. The locked case is caught above (409 before
        # this point), so every ValueError here originates from the
        # unscheduled-play_unit entry guard. build_problem and schedule()
        # do not raise ValueError in this call path.
        # An unscheduled real play_unit (e.g. the final, awaiting feeders)
        # cannot be pinned — surface it as infeasible.
        raise HTTPException(
            status_code=409,
            detail={"error": "infeasible", "reasons": [str(exc)]},
        )

    if not result.scheduled:
        reasons = (
            list(result.schedule_result.infeasible_reasons)
            if result.schedule_result is not None
            else []
        )
        raise HTTPException(
            status_code=409,
            detail={
                "error": "infeasible",
                "reasons": reasons or [
                    f"solver returned {result.status.value}"
                ],
            },
        )

    _persist_session_metadata(repo, tournament_id, session=session)
    return _serialize_session(session)


@router.post("/import", response_model=TournamentOut, dependencies=[_OPERATOR])
def import_tournament_json(
    body: ImportTournamentIn,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Import a pre-paired bracket (JSON).

    Uses ``parse_json_payload`` from the moved bracket package. Wipes
    any existing bracket for this tournament before installing the
    imported one — same destructive semantics as the prototype's
    POST /tournament/import.
    """
    _ensure_tournament_exists(repo, tournament_id)
    if repo.brackets.list_events(tournament_id):
        _clear_bracket(repo, tournament_id)

    try:
        slot = parse_json_payload(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Build session metadata from the slot the parser constructed.
    events_meta: Dict[str, EventMeta] = {}
    for ev_id, draw in slot.draws.items():
        meta = slot.events.get(ev_id)
        events_meta[ev_id] = EventMeta(
            id=ev_id,
            discipline=meta.discipline if meta else ev_id,
            format=meta.format if meta else "se",
            duration_slots=meta.duration_slots if meta else 1,
            bracket_size=meta.bracket_size if meta else None,
            participant_count=len(draw.participants),
            status=meta.status if meta else "draft",
        )
    session = BracketSession(
        state=slot.state,
        draws=slot.draws,
        events=events_meta,
        config=slot.config,
        rest_between_rounds=slot.rest_between_rounds,
        start_time=slot.start_time,
    )

    for ev_id, draw in slot.draws.items():
        meta = events_meta[ev_id]
        _persist_event(
            repo,
            tournament_id,
            event_id=ev_id,
            meta=meta,
            draw=draw,
            state=slot.state,
            seeded_count=0,
            rr_rounds=None,
        )
    for pu_id, result in slot.state.results.items():
        ev_id = slot.state.play_units[pu_id].event_id
        repo.brackets.record_result(
            tournament_id,
            ev_id,
            pu_id,
            winner_side=result.winner_side.value,
            score=result.score,
            finished_at_slot=result.finished_at_slot,
            walkover=result.walkover,
        )
    _persist_session_metadata(
        repo,
        tournament_id,
        session=session,
        time_limit_seconds=body.time_limit_seconds,
    )
    return _serialize_session(session)


@router.post(
    "/import.csv", response_model=TournamentOut, dependencies=[_OPERATOR]
)
async def import_tournament_csv(
    request: Request,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    courts: int = Query(2, ge=1),
    total_slots: int = Query(128, ge=1),
    interval_minutes: int = Query(30, ge=1),
    rest_between_rounds: int = Query(1, ge=0),
    time_limit_seconds: float = Query(5.0, gt=0),
    duration_slots: int = Query(1, ge=1),
) -> TournamentOut:
    """Import a pre-paired bracket (CSV).

    Mirrors the prototype's ``POST /tournament/import.csv``: the body
    is the raw CSV; session config comes in as query params.
    """
    _ensure_tournament_exists(repo, tournament_id)
    if repo.brackets.list_events(tournament_id):
        _clear_bracket(repo, tournament_id)

    payload = (await request.body()).decode("utf-8", errors="replace")
    try:
        slot = parse_csv_payload(
            payload,
            courts=courts,
            total_slots=total_slots,
            interval_minutes=interval_minutes,
            rest_between_rounds=rest_between_rounds,
            time_limit_seconds=time_limit_seconds,
            duration_slots=duration_slots,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    events_meta: Dict[str, EventMeta] = {}
    for ev_id, draw in slot.draws.items():
        meta = slot.events.get(ev_id)
        events_meta[ev_id] = EventMeta(
            id=ev_id,
            discipline=meta.discipline if meta else ev_id,
            format=meta.format if meta else "se",
            duration_slots=meta.duration_slots if meta else 1,
            bracket_size=meta.bracket_size if meta else None,
            participant_count=len(draw.participants),
            status=meta.status if meta else "draft",
        )
    session = BracketSession(
        state=slot.state,
        draws=slot.draws,
        events=events_meta,
        config=slot.config,
        rest_between_rounds=slot.rest_between_rounds,
        start_time=slot.start_time,
    )

    for ev_id, draw in slot.draws.items():
        _persist_event(
            repo,
            tournament_id,
            event_id=ev_id,
            meta=events_meta[ev_id],
            draw=draw,
            state=slot.state,
            seeded_count=0,
            rr_rounds=None,
        )
    for pu_id, result in slot.state.results.items():
        ev_id = slot.state.play_units[pu_id].event_id
        repo.brackets.record_result(
            tournament_id,
            ev_id,
            pu_id,
            winner_side=result.winner_side.value,
            score=result.score,
            finished_at_slot=result.finished_at_slot,
            walkover=result.walkover,
        )
    _persist_session_metadata(
        repo,
        tournament_id,
        session=session,
        time_limit_seconds=time_limit_seconds,
    )
    return _serialize_session(session)


@router.get("/export.json", response_model=TournamentOut, dependencies=[_VIEWER])
def export_tournament_json(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    """Alias for GET /tournaments/{tid}/bracket — same body shape."""
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    return _serialize_session(session)


@router.get(
    "/export.csv",
    response_class=PlainTextResponse,
    dependencies=[_VIEWER],
)
def export_tournament_csv(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    """Order-of-play CSV export."""
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    body = to_csv(
        session.state,
        interval_minutes=session.config.interval_minutes,
        start_time=session.start_time,
    )
    return Response(content=body, media_type="text/csv")


@router.get(
    "/export.ics",
    response_class=PlainTextResponse,
    dependencies=[_VIEWER],
)
def export_tournament_ics(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    """iCalendar feed for the bracket schedule."""
    _ensure_tournament_exists(repo, tournament_id)
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail="no bracket configured for this tournament"
        )
    body = to_ics(
        session.state,
        start_time=session.start_time,
        interval_minutes=session.config.interval_minutes,
    )
    return Response(content=body, media_type="text/calendar")
