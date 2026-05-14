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

import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field

from app.dependencies import (
    AuthUser,
    get_current_user,
    require_tournament_access,
)
from repositories import LocalRepository, get_repository
from scheduler_core.domain.models import (
    ScheduleConfig,
    SolverOptions,
    SolverStatus,
)
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
from services.bracket.state import BracketSession, EventMeta, register_draw

router = APIRouter(
    prefix="/tournaments/{tournament_id}/bracket",
    tags=["brackets"],
)

_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))


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


class EventOut(BaseModel):
    id: str
    discipline: str
    format: str
    bracket_size: Optional[int] = None
    participant_count: int
    rounds: List[List[str]]


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


class ScheduleNextRoundOut(BaseModel):
    status: str
    play_unit_ids: List[str]
    started_at_current_slot: int
    runtime_ms: float = 0.0
    infeasible_reasons: List[str] = []


class RecordResultIn(BaseModel):
    play_unit_id: str
    winner_side: Literal["A", "B"]
    finished_at_slot: Optional[int] = None
    walkover: bool = False


class MatchActionIn(BaseModel):
    play_unit_id: str
    action: Literal["start", "finish", "reset"]
    slot: Optional[int] = None


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
    session_cfg = (
        (tournament.data or {}).get("bracket_session") if tournament else None
    ) or {}
    config = ScheduleConfig(
        total_slots=session_cfg.get("total_slots", 128),
        court_count=session_cfg.get("courts", 2),
        interval_minutes=session_cfg.get("interval_minutes", 30),
    )
    rest = int(session_cfg.get("rest_between_rounds", 1))
    start_time_iso = session_cfg.get("start_time")
    start_time = (
        datetime.fromisoformat(start_time_iso)
        if isinstance(start_time_iso, str) and start_time_iso
        else None
    )

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}

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
        if ev.format == "se":
            try:
                draw = generate_single_elimination(
                    participants,
                    event_id=ev.id,
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
        )

    session_obj = BracketSession(
        state=state,
        draws=draws,
        events=events_meta,
        config=ScheduleConfig(
            total_slots=body.total_slots,
            court_count=body.courts,
            interval_minutes=body.interval_minutes,
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

    try:
        affected = record_result(
            session.state,
            session.draws,
            body.play_unit_id,
            WinnerSide(body.winner_side),
            finished_at_slot=body.finished_at_slot,
            walkover=body.walkover,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Persist the result row.
    recorded = session.state.results[body.play_unit_id]
    repo.brackets.record_result(
        tournament_id,
        pu.event_id,
        body.play_unit_id,
        winner_side=recorded.winner_side.value,
        score=recorded.score,
        finished_at_slot=recorded.finished_at_slot,
        walkover=recorded.walkover,
    )
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

    if body.action == "start":
        assignment.actual_start_slot = (
            body.slot if body.slot is not None else assignment.slot_id
        )
        assignment.actual_end_slot = None
    elif body.action == "finish":
        assignment.actual_end_slot = (
            body.slot
            if body.slot is not None
            else (assignment.slot_id + assignment.duration_slots)
        )
    elif body.action == "reset":
        assignment.actual_start_slot = None
        assignment.actual_end_slot = None

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
