"""FastAPI app for the tournament prototype (multi-event + import/export).

Single in-memory tournament; one or more events. Endpoints:

  POST   /tournament                   — create from config + events
  POST   /tournament/import            — import pre-paired matches (JSON)
  POST   /tournament/import.csv        — import pre-paired matches (CSV)
  GET    /tournament                   — read full state
  GET    /tournament/export.json       — alias for GET /tournament
  GET    /tournament/export.csv        — order-of-play CSV
  GET    /tournament/export.ics        — iCalendar feed
  POST   /tournament/schedule-next     — solve next ready wave
  POST   /tournament/results           — record a real result
  POST   /tournament/match-action      — start / finish / reset
  DELETE /tournament                   — clear state
  GET    /healthz
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response

from scheduler_core.domain.models import ScheduleConfig, SolverOptions
from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
    WinnerSide,
)

from backend.schemas import (
    CreateTournamentIn,
    EventIn,
    ImportTournamentIn,
    MatchActionIn,
    ParticipantIn,
    RecordResultIn,
    ScheduleNextRoundOut,
    TournamentOut,
)
from backend.serializers import serialize_tournament
from backend.state import EventMeta, TournamentSlot, container
from services.bracket.advancement import record_result
from services.bracket.draw import Draw
from services.bracket.formats import (
    generate_round_robin,
    generate_single_elimination,
)
from services.bracket.io.export_schedule import to_csv, to_ics
from services.bracket.io.import_matches import (
    parse_csv_payload,
    parse_json_payload,
)
from services.bracket.scheduler import TournamentDriver
from services.bracket.state import register_draw

app = FastAPI(title="Tournament Prototype API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> Dict[str, bool]:
    return {"ok": True, "loaded": container.has()}


# ---- Create ---------------------------------------------------------------


@app.post("/tournament", response_model=TournamentOut)
def create_tournament(body: CreateTournamentIn) -> TournamentOut:
    if not body.events:
        raise HTTPException(400, "at least one event is required")
    seen_event_ids: set[str] = set()
    for ev in body.events:
        if ev.id in seen_event_ids:
            raise HTTPException(400, f"duplicate event id {ev.id!r}")
        seen_event_ids.add(ev.id)
        if len(ev.participants) < 2:
            raise HTTPException(
                400, f"event {ev.id!r} needs at least 2 participants"
            )

    state = TournamentState()
    draws: Dict[str, Draw] = {}
    events_meta: Dict[str, EventMeta] = {}

    for ev in body.events:
        draw, meta = _build_event_draw(ev)
        register_draw(state, draw)
        draws[ev.id] = draw
        events_meta[ev.id] = meta

    config = ScheduleConfig(
        total_slots=body.total_slots,
        court_count=body.courts,
        interval_minutes=body.interval_minutes,
    )
    driver = TournamentDriver(
        state=state,
        config=config,
        solver_options=SolverOptions(time_limit_seconds=body.time_limit_seconds),
        rest_between_rounds=body.rest_between_rounds,
    )
    slot = TournamentSlot(
        state=state,
        draws=draws,
        driver=driver,
        config=config,
        events=events_meta,
        rest_between_rounds=body.rest_between_rounds,
        start_time=body.start_time,
    )
    container.set(slot)
    return serialize_tournament(slot)


def _build_event_draw(ev: EventIn) -> tuple[Draw, EventMeta]:
    """Translate a CreateTournamentIn EventIn into a Draw + EventMeta."""
    participants = _participants_for_event(ev.participants)
    ordered, seeded_count = _seed_order(ev.participants, participants, ev.seeded_count)

    if ev.format == "se":
        try:
            draw = generate_single_elimination(
                ordered,
                event_id=ev.id,
                duration_slots=ev.duration_slots,
                play_unit_id_prefix=ev.id,
                seeded_count=seeded_count,
                bracket_size=ev.bracket_size,
                randomize=ev.randomize,
            )
        except NotImplementedError as e:
            raise HTTPException(400, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))
        bracket_size = draw.event.parameters.get("bracket_size")
    elif ev.format == "rr":
        draw = generate_round_robin(
            ordered,
            event_id=ev.id,
            rounds=ev.rr_rounds,
            duration_slots=ev.duration_slots,
            play_unit_id_prefix=ev.id,
        )
        bracket_size = None
    else:
        raise HTTPException(400, f"unknown format {ev.format!r}")

    meta = EventMeta(
        id=ev.id,
        discipline=ev.discipline,
        format=ev.format,
        duration_slots=ev.duration_slots,
        bracket_size=bracket_size,
        participant_count=len(ordered),
    )
    return draw, meta


def _participants_for_event(
    raw: List[ParticipantIn],
) -> Dict[str, Participant]:
    """Build the Participant objects (singles or TEAM) for an event."""
    out: Dict[str, Participant] = {}
    for p in raw:
        if p.id in out:
            raise HTTPException(400, f"duplicate participant id {p.id!r}")
        if p.members:
            out[p.id] = Participant(
                id=p.id,
                name=p.name,
                type=ParticipantType.TEAM,
                member_ids=list(p.members),
            )
        else:
            out[p.id] = Participant(id=p.id, name=p.name)
    return out


def _seed_order(
    raw: List[ParticipantIn],
    participants: Dict[str, Participant],
    seeded_count_hint: Optional[int],
) -> tuple[List[Participant], int]:
    """Return (ordered participants, seeded_count) for placement.

    Sort: ascending `seed` (entries with a seed come first, by seed),
    then unseeded entries in input order.
    """
    seeded = sorted(
        [p for p in raw if p.seed is not None],
        key=lambda p: p.seed,
    )
    unseeded = [p for p in raw if p.seed is None]

    ordered_raw = list(seeded) + list(unseeded)
    ordered = [participants[p.id] for p in ordered_raw]

    if seeded_count_hint is not None:
        seeded_count = max(0, min(seeded_count_hint, len(ordered)))
    elif seeded:
        seeded_count = len(seeded)
    else:
        seeded_count = len(ordered)  # default: every entry is seeded by list order
    return ordered, seeded_count


# ---- Read / clear ---------------------------------------------------------


@app.get("/tournament", response_model=TournamentOut)
def get_tournament() -> TournamentOut:
    try:
        slot = container.get()
    except LookupError:
        raise HTTPException(404, "no tournament loaded")
    return serialize_tournament(slot)


@app.delete("/tournament")
def delete_tournament() -> Dict[str, bool]:
    container.clear()
    return {"ok": True}


# ---- Schedule / results ---------------------------------------------------


@app.post("/tournament/schedule-next", response_model=ScheduleNextRoundOut)
def schedule_next_round() -> ScheduleNextRoundOut:
    try:
        slot = container.get()
    except LookupError:
        raise HTTPException(404, "no tournament loaded")

    started = time.perf_counter()
    with container.lock:
        result = slot.driver.schedule_next_round()
    runtime_ms = (time.perf_counter() - started) * 1000.0

    return ScheduleNextRoundOut(
        status=result.status.value,
        play_unit_ids=list(result.play_unit_ids),
        started_at_current_slot=result.started_at_current_slot,
        runtime_ms=round(runtime_ms, 2),
        infeasible_reasons=(
            list(result.schedule_result.infeasible_reasons)
            if result.schedule_result
            else []
        ),
    )


@app.post("/tournament/results", response_model=TournamentOut)
def record_match_result(body: RecordResultIn) -> TournamentOut:
    slot = _slot_or_404()

    if body.play_unit_id not in slot.state.play_units:
        raise HTTPException(404, f"unknown play_unit {body.play_unit_id!r}")
    if body.play_unit_id in slot.state.results:
        raise HTTPException(409, "result already recorded")

    winner = WinnerSide(body.winner_side)
    with container.lock:
        record_result(
            slot.state,
            slot.draws,
            body.play_unit_id,
            winner,
            finished_at_slot=body.finished_at_slot,
            walkover=body.walkover,
        )
    return serialize_tournament(slot)


@app.post("/tournament/match-action", response_model=TournamentOut)
def match_action(body: MatchActionIn) -> TournamentOut:
    slot = _slot_or_404()

    state = slot.state
    if body.play_unit_id not in state.assignments:
        raise HTTPException(
            404, f"play_unit {body.play_unit_id!r} not assigned yet"
        )

    a = state.assignments[body.play_unit_id]
    with container.lock:
        if body.action == "start":
            a.actual_start_slot = (
                body.slot if body.slot is not None else a.slot_id
            )
        elif body.action == "finish":
            a.actual_end_slot = (
                body.slot
                if body.slot is not None
                else (a.slot_id + a.duration_slots)
            )
        elif body.action == "reset":
            a.actual_start_slot = None
            a.actual_end_slot = None
    return serialize_tournament(slot)


# ---- Import ---------------------------------------------------------------


@app.post("/tournament/import", response_model=TournamentOut)
def import_matches_json(body: ImportTournamentIn) -> TournamentOut:
    try:
        slot = parse_json_payload(body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    container.set(slot)
    return serialize_tournament(slot)


@app.post("/tournament/import.csv", response_model=TournamentOut)
async def import_matches_csv(request: Request) -> TournamentOut:
    raw = (await request.body()).decode("utf-8")
    params = request.query_params
    try:
        slot = parse_csv_payload(
            raw,
            courts=int(params.get("courts", "2")),
            total_slots=int(params.get("total_slots", "128")),
            interval_minutes=int(params.get("interval_minutes", "30")),
            rest_between_rounds=int(params.get("rest_between_rounds", "1")),
            start_time=params.get("start_time"),
            time_limit_seconds=float(params.get("time_limit_seconds", "5.0")),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    container.set(slot)
    return serialize_tournament(slot)


# ---- Export ---------------------------------------------------------------


@app.get("/tournament/export.json", response_model=TournamentOut)
def export_json() -> TournamentOut:
    slot = _slot_or_404()
    return serialize_tournament(slot)


@app.get("/tournament/export.csv")
def export_csv() -> Response:
    slot = _slot_or_404()
    body = to_csv(slot)
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=tournament.csv"},
    )


@app.get("/tournament/export.ics")
def export_ics() -> Response:
    slot = _slot_or_404()
    body = to_ics(slot)
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=tournament.ics"},
    )


# ---- helpers --------------------------------------------------------------


def _slot_or_404() -> TournamentSlot:
    try:
        return container.get()
    except LookupError:
        raise HTTPException(404, "no tournament loaded")
