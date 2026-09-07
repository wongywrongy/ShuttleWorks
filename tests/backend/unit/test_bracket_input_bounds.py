"""Bounds on the bracket routes' solve-budget and pool-size inputs.

Hardening 2026-09-07. ``POST /tournaments/{tid}/bracket/import.csv``
takes its session config as query params and had lower bounds only,
while the JSON-body siblings (``CreateTournamentIn`` /
``ImportTournamentIn``) cap the same fields. The CSV value is persisted
into the ``bracket_session`` blob and read back by ``/schedule-next``
and ``/schedule-next/stream``, so an unbounded import could arrange an
in-request CP-SAT solve that ignores the ``MAX_SOLVE_SECONDS`` ceiling.

Both ends are covered here: the query params reject out-of-range values,
and the read-back clamps whatever is already stored.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments
    from core.exceptions import ConflictError
    from core.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Bounds Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": time_limit,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


def _store_time_limit(tid: str, value) -> None:
    """Write an oversized budget straight into the persisted session blob,
    standing in for a row written by the pre-hardening import route."""
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        tournament_id = uuid.UUID(tid)
        tournament = repo.tournaments.get_by_id(tournament_id)
        data = dict(tournament.data or {})
        cfg = dict(data.get("bracket_session") or {})
        cfg["time_limit_seconds"] = value
        data["bracket_session"] = cfg
        repo.tournaments.upsert_data(tournament_id, data)
    finally:
        session.close()


def test_import_csv_rejects_unbounded_time_limit(client, tid):
    r = client.post(
        _bracket_url(tid, "import.csv"),
        params={"time_limit_seconds": 100000},
        content=b"",
    )
    assert r.status_code == 422, r.text


@pytest.mark.parametrize(
    "param,value",
    [
        ("courts", 100_000),
        ("total_slots", 10_000_000),
        ("interval_minutes", 100_000),
        ("duration_slots", 10_000_000),
    ],
)
def test_import_csv_rejects_out_of_range_session_config(client, tid, param, value):
    r = client.post(
        _bracket_url(tid, "import.csv"),
        params={param: value},
        content=b"",
    )
    assert r.status_code == 422, r.text


def test_schedule_next_clamps_persisted_time_limit(client, tid, monkeypatch):
    """A budget already persisted by the unbounded import is clamped on
    read, so the in-request solve still honours the ceiling."""
    from bracket import brackets
    from core.limits import MAX_SOLVE_SECONDS
    from scheduler_core.domain.models import SolverOptions

    client.post(_bracket_url(tid), json=_se_4_body())
    _store_time_limit(tid, 999_999_999.0)

    seen: list[float] = []
    original = brackets._bracket_solver_options

    def _record(time_limit_seconds: float, camel_cfg: dict) -> SolverOptions:
        seen.append(time_limit_seconds)
        # Solve fast regardless of what was asked for.
        return original(1.0, camel_cfg)

    monkeypatch.setattr(brackets, "_bracket_solver_options", _record)

    r = client.post(_bracket_url(tid, "schedule-next"))
    assert r.status_code == 200, r.text
    assert seen == [MAX_SOLVE_SECONDS]


def test_schedule_next_stream_clamps_persisted_time_limit(client, tid, monkeypatch):
    from bracket import brackets
    from core.limits import MAX_SOLVE_SECONDS
    from scheduler_core.domain.models import SolverOptions

    client.post(_bracket_url(tid), json=_se_4_body())
    _store_time_limit(tid, 999_999_999.0)

    seen: list[float] = []
    original = brackets._bracket_solver_options

    def _record(time_limit_seconds: float, camel_cfg: dict) -> SolverOptions:
        seen.append(time_limit_seconds)
        return original(1.0, camel_cfg)

    monkeypatch.setattr(brackets, "_bracket_solver_options", _record)

    r = client.post(_bracket_url(tid, "schedule-next", "stream"))
    assert r.status_code == 200, r.text
    assert seen == [MAX_SOLVE_SECONDS]


def test_stream_rejects_oversized_candidate_pool_size(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())

    r = client.post(
        _bracket_url(tid, "schedule-next", "stream"),
        params={"candidate_pool_size": 1000},
    )
    assert r.status_code == 422, r.text
