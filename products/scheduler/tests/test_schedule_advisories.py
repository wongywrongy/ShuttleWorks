"""Tests for the live-operations advisory pipeline.

Each heuristic is tested in isolation via deterministic fixtures so they
can be tuned without flaking. The HTTP endpoint test exercises the full
file-based read path with a tmp data dir.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


_BACKEND_ROOT = str(Path(__file__).resolve().parents[1] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [
    k for k in list(sys.modules)
    if k == "app" or k.startswith("app.")
    or k == "services" or k.startswith("services.")
    or k.startswith("api.")
]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Import the heuristics + schemas at module load time, while backend/ is
# the first entry on sys.path. Pytest re-prepends src/ between module
# load and fixture execution, so a deferred import inside a test
# function would resolve `app.schemas` to src/app/schemas.py (the legacy
# module that lacks Advisory / Impact / Proposal).
from app.schemas import (
    MatchDTO,
    ScheduleAssignment,
    ScheduleDTO,
    SolverStatus,
    TournamentConfig,
    TournamentStateDTO,
)
from api.schedule_advisories import (
    collect_advisories,
    detect_approaching_blackout,
    detect_no_shows,
    detect_overruns,
    detect_running_behind,
    detect_start_delay,
)
from _helpers import seed_tournament


def _config(**overrides) -> TournamentConfig:
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="17:00",
        breaks=[],
        courtCount=4,
        defaultRestMinutes=30,
        freezeHorizonSlots=0,
        tournamentDate="2026-04-28",
    )
    base.update(overrides)
    return TournamentConfig(**base)


def _state(
    matches: list[MatchDTO],
    schedule: ScheduleDTO,
    config: TournamentConfig | None = None,
) -> TournamentStateDTO:
    return TournamentStateDTO(
        version=2,
        config=config or _config(),
        groups=[],
        players=[],
        matches=matches,
        schedule=schedule,
        scheduleStats=None,
        scheduleIsStale=False,
    )


def _schedule(assignments: list[tuple[str, int, int, int]]) -> ScheduleDTO:
    return ScheduleDTO(
        assignments=[
            ScheduleAssignment(matchId=mid, slotId=s, courtId=c, durationSlots=d)
            for mid, s, c, d in assignments
        ],
        unscheduledMatches=[],
        softViolations=[],
        objectiveScore=1000.0,
        infeasibleReasons=[],
        status=SolverStatus.FEASIBLE,
    )


# ---------- overrun --------------------------------------------------------


def test_overrun_below_grace_does_not_fire():
    config = _config(intervalMinutes=30)
    match = MatchDTO(id="m1", durationSlots=1, matchNumber=1)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    # started 32 min ago; expected = 30 min, delay = 2 min < 5 grace
    started = (now - timedelta(minutes=32)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "started", "actualStartTime": started}}
    advisories = detect_overruns({"m1": match}, states, config, now)
    assert advisories == []


def test_overrun_warn_severity_when_5_to_10_min_over():
    config = _config(intervalMinutes=30)
    match = MatchDTO(id="m1", durationSlots=1, matchNumber=7)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    started = (now - timedelta(minutes=38)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "started", "actualStartTime": started}}
    advisories = detect_overruns({"m1": match}, states, config, now)
    assert len(advisories) == 1
    a = advisories[0]
    assert a.kind == "overrun"
    assert a.severity == "warn"
    assert a.matchId == "m1"
    assert a.id == "overrun:m1"
    assert "8 min over" in a.summary
    assert a.suggestedAction.kind == "repair"
    assert a.suggestedAction.payload == {
        "type": "overrun",
        "matchId": "m1",
        "extraMinutes": 8,
    }


def test_overrun_critical_severity_when_more_than_10_min_over():
    config = _config(intervalMinutes=30)
    match = MatchDTO(id="m1", durationSlots=1)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    started = (now - timedelta(minutes=50)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "started", "actualStartTime": started}}
    advisories = detect_overruns({"m1": match}, states, config, now)
    assert advisories[0].severity == "critical"


def test_overrun_skips_unstarted_matches():
    config = _config()
    match = MatchDTO(id="m1", durationSlots=1)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    states = {"m1": {"status": "called", "calledAt": "2026-04-28T09:55:00Z"}}
    advisories = detect_overruns({"m1": match}, states, config, now)
    assert advisories == []


# ---------- no-show --------------------------------------------------------


def test_no_show_below_threshold_does_not_fire():
    config = _config()
    match = MatchDTO(id="m1", matchNumber=2)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    called = (now - timedelta(minutes=2)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "called", "calledAt": called}}
    advisories = detect_no_shows({"m1": match}, states, config, now)
    assert advisories == []


def test_no_show_warn_above_threshold():
    config = _config()
    match = MatchDTO(id="m1", matchNumber=2)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    called = (now - timedelta(minutes=4)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "called", "calledAt": called}}
    advisories = detect_no_shows({"m1": match}, states, config, now)
    assert len(advisories) == 1
    a = advisories[0]
    assert a.kind == "no_show"
    assert a.severity == "warn"
    assert a.suggestedAction.kind == "repair"
    assert a.suggestedAction.payload["type"] == "withdrawal"


def test_no_show_critical_after_5min():
    config = _config()
    match = MatchDTO(id="m1")
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    called = (now - timedelta(minutes=8)).isoformat().replace("+00:00", "Z")
    states = {"m1": {"status": "called", "calledAt": called}}
    advisories = detect_no_shows({"m1": match}, states, config, now)
    assert advisories[0].severity == "critical"


# ---------- running behind -------------------------------------------------


def test_running_behind_no_signal_when_finished_matches_on_time():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    match = MatchDTO(id="m1", durationSlots=1)
    sch = _schedule([("m1", 0, 1, 1)])  # scheduled 09:00–09:30
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    actual_end = "2026-04-28T09:32:00Z"  # 2 min late, well under threshold
    states = {"m1": {"status": "finished", "actualEndTime": actual_end}}
    advisories = detect_running_behind({"m1": match}, sch, states, config, now)
    assert advisories == []


def test_running_behind_fires_when_average_exceeds_threshold():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    matches = [MatchDTO(id=f"m{i}", durationSlots=1) for i in range(3)]
    by_id = {m.id: m for m in matches}
    sch = _schedule([(f"m{i}", i, 1, 1) for i in range(3)])  # 09:00, 09:30, 10:00
    now = datetime(2026, 4, 28, 11, 0, tzinfo=timezone.utc)
    states = {
        "m0": {"status": "finished", "actualEndTime": "2026-04-28T09:45:00Z"},  # +15
        "m1": {"status": "finished", "actualEndTime": "2026-04-28T10:15:00Z"},  # +15
        "m2": {"status": "finished", "actualEndTime": "2026-04-28T10:45:00Z"},  # +15
    }
    advisories = detect_running_behind(by_id, sch, states, config, now)
    assert len(advisories) == 1
    assert advisories[0].kind == "running_behind"
    assert advisories[0].severity == "warn"
    assert "15 min behind" in advisories[0].summary
    assert advisories[0].suggestedAction.kind == "warm_restart"


def test_running_behind_no_signal_with_no_finished_matches():
    config = _config()
    sch = _schedule([("m1", 0, 1, 1)])
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    advisories = detect_running_behind(
        {"m1": MatchDTO(id="m1")}, sch, {}, config, now
    )
    assert advisories == []


# ---------- start_delay (director-aware) -----------------------------------


def test_start_delay_below_threshold_does_not_fire():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    matches = [MatchDTO(id="m1", matchNumber=1, durationSlots=1)]
    sch = _schedule([("m1", 0, 1, 1)])  # 09:00
    now = datetime(2026, 4, 28, 9, 5, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T09:03:00Z"}}
    advisories = detect_start_delay({"m1": matches[0]}, sch, states, config, now)
    assert advisories == []  # 3 min late < 5 min threshold


def test_start_delay_warn_when_above_threshold():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    matches = [MatchDTO(id="m1", matchNumber=1, durationSlots=1)]
    sch = _schedule([("m1", 0, 1, 1)])
    now = datetime(2026, 4, 28, 9, 30, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T09:12:00Z"}}
    advisories = detect_start_delay({"m1": matches[0]}, sch, states, config, now)
    assert len(advisories) == 1
    a = advisories[0]
    assert a.kind == "start_delay_detected"
    assert a.severity == "warn"
    assert "12 min late" in a.summary
    assert a.suggestedAction.kind == "delay_start"
    assert a.suggestedAction.payload == {"minutes": 12}


def test_start_delay_critical_when_more_than_20min():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    matches = [MatchDTO(id="m1", durationSlots=1)]
    sch = _schedule([("m1", 0, 1, 1)])
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T09:35:00Z"}}
    advisories = detect_start_delay({"m1": matches[0]}, sch, states, config, now)
    assert advisories[0].severity == "critical"


def test_start_delay_uses_called_at_when_no_actual_start():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", intervalMinutes=30)
    matches = [MatchDTO(id="m1", durationSlots=1)]
    sch = _schedule([("m1", 0, 1, 1)])
    now = datetime(2026, 4, 28, 9, 30, tzinfo=timezone.utc)
    states = {"m1": {"status": "called", "calledAt": "2026-04-28T09:08:00Z"}}
    advisories = detect_start_delay({"m1": matches[0]}, sch, states, config, now)
    assert len(advisories) == 1
    assert "8 min late" in advisories[0].summary


# ---------- approaching_blackout (director-aware) --------------------------


def test_approaching_blackout_fires_when_match_overlaps_break():
    config = _config(
        tournamentDate="2026-04-28",
        dayStart="09:00",
        intervalMinutes=30,
        breaks=[{"start": "12:00", "end": "13:00"}],
    )
    # Match scheduled 11:30, expected 30 min — would normally finish 12:00.
    # Started at 11:35, so expected finish 12:05 → 5 min into break.
    matches = [MatchDTO(id="m1", matchNumber=1, durationSlots=1)]
    sch = _schedule([("m1", 5, 1, 1)])  # slot 5 = 11:30
    now = datetime(2026, 4, 28, 11, 50, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T11:35:00Z"}}
    advisories = detect_approaching_blackout({"m1": matches[0]}, sch, states, config, now)
    assert len(advisories) == 1
    a = advisories[0]
    assert a.kind == "approaching_blackout"
    assert a.matchId == "m1"
    assert "5 min into" in a.summary
    assert a.suggestedAction.kind == "repair"


def test_approaching_blackout_no_signal_when_match_finishes_before():
    config = _config(
        tournamentDate="2026-04-28",
        dayStart="09:00",
        intervalMinutes=30,
        breaks=[{"start": "12:00", "end": "13:00"}],
    )
    matches = [MatchDTO(id="m1", durationSlots=1)]
    sch = _schedule([("m1", 5, 1, 1)])  # 11:30
    now = datetime(2026, 4, 28, 11, 50, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T11:30:00Z"}}
    advisories = detect_approaching_blackout({"m1": matches[0]}, sch, states, config, now)
    # Expected end 12:00 — exactly at break start, not into it.
    assert advisories == []


def test_approaching_blackout_no_signal_with_no_breaks():
    config = _config(tournamentDate="2026-04-28", dayStart="09:00", breaks=[])
    matches = [MatchDTO(id="m1", durationSlots=1)]
    sch = _schedule([("m1", 0, 1, 1)])
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    states = {"m1": {"status": "started", "actualStartTime": "2026-04-28T09:00:00Z"}}
    advisories = detect_approaching_blackout({"m1": matches[0]}, sch, states, config, now)
    assert advisories == []


# ---------- collect_advisories: ordering + multi-kind ----------------------


def test_collect_advisories_severity_ordering():
    config = _config(intervalMinutes=30)
    matches = [
        MatchDTO(id="overrun_warn", durationSlots=1, matchNumber=1),
        MatchDTO(id="overrun_crit", durationSlots=1, matchNumber=2),
        MatchDTO(id="no_show_match", matchNumber=3),
    ]
    sch = _schedule([
        ("overrun_warn", 0, 1, 1),
        ("overrun_crit", 1, 1, 1),
        ("no_show_match", 2, 1, 1),
    ])
    state = _state(matches, sch, config)
    now = datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc)
    states = {
        "overrun_warn": {
            "status": "started",
            "actualStartTime": (now - timedelta(minutes=38)).isoformat().replace("+00:00", "Z"),
        },
        "overrun_crit": {
            "status": "started",
            "actualStartTime": (now - timedelta(minutes=50)).isoformat().replace("+00:00", "Z"),
        },
        "no_show_match": {
            "status": "called",
            "calledAt": (now - timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        },
    }
    advisories = collect_advisories(state, states, now=now)
    # Expect: critical first, then warns
    assert advisories[0].severity == "critical"
    assert all(a.severity == "warn" or a.severity == "critical" for a in advisories)
    # The two critical ones come before warn
    severities = [a.severity for a in advisories]
    assert severities[: severities.count("critical")] == ["critical"] * severities.count(
        "critical"
    )


def test_collect_advisories_returns_empty_when_no_state():
    assert collect_advisories(None, {}) == []


def test_collect_advisories_returns_empty_when_no_schedule():
    state = TournamentStateDTO(
        version=2, config=_config(), groups=[], players=[], matches=[],
        schedule=None,
    )
    assert collect_advisories(state, {}) == []


# ---------- HTTP endpoint --------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    from _helpers import isolate_test_database, seed_tournament
    isolate_test_database(tmp_path, monkeypatch)

    from api import schedule_advisories, match_state, tournaments

    app_ = FastAPI()
    app_.include_router(schedule_advisories.router)
    app_.include_router(match_state.router)
    app_.include_router(tournaments.router)
    return TestClient(app_)


def test_advisories_endpoint_returns_empty_when_no_state(client):
    tid = seed_tournament(client)
    r = client.get(f"/tournaments/{tid}/schedule/advisories")
    assert r.status_code == 200
    assert r.json() == []


def test_advisories_endpoint_returns_overrun_from_persisted_state(client, tmp_path):
    tid = seed_tournament(client)
    # 1) PUT a tournament state with one match and a schedule
    payload = {
        "version": 2,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
            "tournamentDate": "2026-04-28",
        },
        "groups": [],
        "players": [],
        "matches": [{"id": "m_late", "matchNumber": 1, "durationSlots": 1}],
        "schedule": {
            "assignments": [
                {"matchId": "m_late", "slotId": 0, "courtId": 1, "durationSlots": 1}
            ],
            "unscheduledMatches": [],
            "softViolations": [],
            "objectiveScore": 1000,
            "infeasibleReasons": [],
            "status": "feasible",
        },
        "scheduleStats": None,
        "scheduleIsStale": False,
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200

    # 2) PUT a match-state row that puts m_late 50 min over a 30-min match
    started_dt = datetime.now(timezone.utc) - timedelta(minutes=80)
    started = started_dt.isoformat().replace("+00:00", "Z")
    r = client.put(
        f"/tournaments/{tid}/match-states/m_late",
        json={
            "matchId": "m_late",
            "status": "started",
            "actualStartTime": started,
        },
    )
    assert r.status_code == 200

    # 3) GET advisories — expect one critical overrun
    r = client.get(f"/tournaments/{tid}/schedule/advisories")
    assert r.status_code == 200
    advisories = r.json()
    assert len(advisories) >= 1
    overruns = [a for a in advisories if a["kind"] == "overrun"]
    assert len(overruns) == 1
    assert overruns[0]["matchId"] == "m_late"
    assert overruns[0]["severity"] == "critical"
    assert overruns[0]["suggestedAction"]["kind"] == "repair"
