"""generate_event: per-event scheduling that respects locked other-event matches."""
from __future__ import annotations
import pytest
from scheduler_core.domain.models import ScheduleConfig, SolverStatus
from scheduler_core.domain.tournament import Participant, ParticipantType, TournamentState, WinnerSide
from services.bracket import (
    TournamentDriver,
    generate_single_elimination,
    record_result,
)
from services.bracket.state import register_draw


def _make_state(num_p_ms: int = 4, num_p_ws: int = 4):
    state = TournamentState()
    ms_parts = [
        Participant(id=f"ms-p{i}", name=f"MS{i}", type=ParticipantType.PLAYER)
        for i in range(num_p_ms)
    ]
    ws_parts = [
        Participant(id=f"ws-p{i}", name=f"WS{i}", type=ParticipantType.PLAYER)
        for i in range(num_p_ws)
    ]
    ms = generate_single_elimination(
        ms_parts, event_id="MS", play_unit_id_prefix="MS", duration_slots=1,
    )
    ws = generate_single_elimination(
        ws_parts, event_id="WS", play_unit_id_prefix="WS", duration_slots=1,
    )
    register_draw(state, ms)
    register_draw(state, ws)
    draws = {"MS": ms, "WS": ws}
    return state, draws


def test_draft_to_generated(tmp_path):
    state, _draws = _make_state()
    cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
    driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
    r = driver.generate_event("MS")
    assert r.scheduled
    ms_assignments = [a for pu_id, a in state.assignments.items() if pu_id.startswith("MS-")]
    assert len(ms_assignments) >= 1


def test_regenerate_wipes_and_succeeds():
    state, _draws = _make_state()
    cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
    driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
    r1 = driver.generate_event("MS")
    assert r1.scheduled
    n1 = sum(1 for k in state.assignments if k.startswith("MS-"))
    r2 = driver.generate_event("MS", wipe=True)
    assert r2.scheduled
    n2 = sum(1 for k in state.assignments if k.startswith("MS-"))
    assert n1 == n2


def test_started_raises_409_signal():
    state, draws = _make_state()
    cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
    driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
    driver.generate_event("MS")
    first_ms = next(iter(k for k in state.assignments if k.startswith("MS-")))
    record_result(state, draws, first_ms, WinnerSide.A, finished_at_slot=0)
    with pytest.raises(ValueError, match="started"):
        driver.generate_event("MS", wipe=True)


def test_cross_event_no_collision_discriminator():
    """Generating MS schedules around WS's already-locked assignments."""
    state, _draws = _make_state(num_p_ms=4, num_p_ws=4)
    cfg = ScheduleConfig(total_slots=32, court_count=1, interval_minutes=30)
    driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
    ws_result = driver.generate_event("WS")
    assert ws_result.scheduled
    ws_slots = {(a.slot_id, a.court_id) for k, a in state.assignments.items() if k.startswith("WS-")}
    ms_result = driver.generate_event("MS")
    assert ms_result.scheduled
    ms_slots = {(a.slot_id, a.court_id) for k, a in state.assignments.items() if k.startswith("MS-")}
    assert ws_slots.isdisjoint(ms_slots), (
        "MS and WS share (slot, court) cells — cross-event lock not honoured"
    )
