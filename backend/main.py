"""FastAPI app for the tournament prototype.

Single in-memory tournament. Endpoints:

  POST   /tournament                 — create from config + participants
  GET    /tournament                 — read full state
  POST   /tournament/schedule-next   — solve next ready wave
  POST   /tournament/results         — record a real result
  POST   /tournament/match-action    — start / finish / reset
  DELETE /tournament                 — clear state
  GET    /healthz
"""
from __future__ import annotations

import time
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scheduler_core.domain.models import ScheduleConfig, SolverOptions
from scheduler_core.domain.tournament import (
    Participant,
    TournamentState,
    WinnerSide,
)

from backend.schemas import (
    CreateTournamentIn,
    MatchActionIn,
    RecordResultIn,
    ScheduleNextRoundOut,
    TournamentOut,
)
from backend.serializers import serialize_tournament
from backend.state import TournamentSlot, container
from tournament.advancement import record_result
from tournament.formats import (
    generate_round_robin,
    generate_single_elimination,
)
from tournament.scheduler import TournamentDriver
from tournament.state import register_draw

app = FastAPI(title="Tournament Prototype API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> Dict[str, bool]:
    return {"ok": True, "loaded": container.has()}


@app.post("/tournament", response_model=TournamentOut)
def create_tournament(body: CreateTournamentIn) -> TournamentOut:
    if not body.participants:
        raise HTTPException(400, "participants must be non-empty")
    if len(body.participants) < 2:
        raise HTTPException(400, "need at least 2 participants")

    participants = [
        Participant(id=p.id, name=p.name) for p in body.participants
    ]

    if body.format == "se":
        draw = generate_single_elimination(
            participants, duration_slots=body.duration_slots
        )
    else:
        draw = generate_round_robin(
            participants,
            rounds=body.rr_rounds,
            duration_slots=body.duration_slots,
        )

    state = TournamentState()
    register_draw(state, draw)

    config = ScheduleConfig(
        total_slots=body.total_slots,
        court_count=body.courts,
        interval_minutes=body.interval_minutes,
    )
    driver = TournamentDriver(
        state=state,
        draw=draw,
        config=config,
        solver_options=SolverOptions(time_limit_seconds=body.time_limit_seconds),
        rest_between_rounds=body.rest_between_rounds,
    )
    slot = TournamentSlot(
        state=state,
        draw=draw,
        driver=driver,
        config=config,
        format=body.format,
        duration_slots=body.duration_slots,
        rest_between_rounds=body.rest_between_rounds,
    )
    container.set(slot)
    return serialize_tournament(slot)


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
    try:
        slot = container.get()
    except LookupError:
        raise HTTPException(404, "no tournament loaded")

    if body.play_unit_id not in slot.state.play_units:
        raise HTTPException(404, f"unknown play_unit {body.play_unit_id!r}")
    if body.play_unit_id in slot.state.results:
        raise HTTPException(409, "result already recorded")

    winner = WinnerSide(body.winner_side)
    with container.lock:
        record_result(
            slot.state,
            slot.draw,
            body.play_unit_id,
            winner,
            finished_at_slot=body.finished_at_slot,
            walkover=body.walkover,
        )
    return serialize_tournament(slot)


@app.post("/tournament/match-action", response_model=TournamentOut)
def match_action(body: MatchActionIn) -> TournamentOut:
    try:
        slot = container.get()
    except LookupError:
        raise HTTPException(404, "no tournament loaded")

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
