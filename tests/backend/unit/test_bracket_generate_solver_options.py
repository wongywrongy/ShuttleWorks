"""Ruling D11 — `POST …/bracket/events/{id}/generate` honours the session
solver config.

The route built its ``TournamentDriver`` with no ``solver_options`` at all,
while every other bracket solve path (``schedule-next`` and its streaming
sibling) passes ``_bracket_solver_options(...)``. So the persisted per-session
time budget AND the workspace's ``deterministic`` / ``randomSeed`` knobs were
silently dropped on the one path an operator uses most: a solve that is
supposed to be reproducible was not, and a budget the operator set did not
apply.

The assertion is on the options the driver is CONSTRUCTED with rather than on
a draw's shape: the point is that the knobs reach the solver, and pinning a
particular CP-SAT output would test the solver instead.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Generate Solver Options")


def _url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


_PARTICIPANTS = [{"id": f"P{i}", "name": f"Player {i}", "seed": i} for i in range(1, 5)]


def _draft_event(client, tid: str) -> None:
    """A bracket whose one event is back in ``draft`` — what generate needs."""
    r = client.post(
        _url(tid),
        json={
            "courts": 2,
            "total_slots": 64,
            "rest_between_rounds": 1,
            "interval_minutes": 30,
            "time_limit_seconds": 1.0,
            "events": [
                {
                    "id": "MS",
                    "discipline": "Men's Singles",
                    "format": "se",
                    "participants": _PARTICIPANTS,
                    "duration_slots": 1,
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert client.delete(_url(tid, "events", "MS")).status_code == 204
    r = client.post(
        _url(tid, "events", "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "participants": _PARTICIPANTS,
            "duration_slots": 1,
        },
    )
    assert r.status_code == 200, r.text


def _capture_driver_options(monkeypatch) -> dict:
    """Record the ``solver_options`` the route hands the driver, and still
    run the real solve — a stub would make the 200 below meaningless."""
    from bracket import brackets

    seen: dict = {}
    real = brackets.TournamentDriver

    class Recording(real):  # type: ignore[misc, valid-type]
        def __init__(self, *args, **kwargs):
            seen["solver_options"] = kwargs.get("solver_options")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(brackets, "TournamentDriver", Recording)
    return seen


def _write_session_config(client, tid: str, *, time_limit: float, config: dict) -> None:
    """Put the solve budget and the engine knobs where hydration reads them."""
    from db.session import SessionLocal
    from repositories.local import LocalRepository
    import uuid

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        row = repo.tournaments.get_by_id(uuid.UUID(tid))
        blob = dict(row.data or {})
        blob["bracket_session"] = {
            **(blob.get("bracket_session") or {}),
            "time_limit_seconds": time_limit,
        }
        blob["config"] = {**(blob.get("config") or {}), **config}
        repo.tournaments.upsert_data(uuid.UUID(tid), blob)
    finally:
        session.close()


def test_generate_passes_the_session_time_limit(client, tid, monkeypatch):
    _draft_event(client, tid)
    _write_session_config(client, tid, time_limit=3.5, config={})
    seen = _capture_driver_options(monkeypatch)

    r = client.post(_url(tid, "events", "MS", "generate"), json={})
    assert r.status_code == 200, r.text

    options = seen["solver_options"]
    assert options is not None, "generate built a driver with no solver options"
    assert options.time_limit_seconds == 3.5


def test_generate_passes_determinism_and_seed(client, tid, monkeypatch):
    _draft_event(client, tid)
    _write_session_config(
        client, tid, time_limit=2.0, config={"deterministic": True, "randomSeed": 17}
    )
    seen = _capture_driver_options(monkeypatch)

    r = client.post(_url(tid, "events", "MS", "generate"), json={})
    assert r.status_code == 200, r.text

    options = seen["solver_options"]
    assert options.deterministic is True
    assert options.random_seed == 17
    # Determinism without a single worker is not determinism.
    assert options.num_workers == 1
    assert options.time_limit_seconds == 2.0


def test_generate_matches_what_schedule_next_would_use(client, tid, monkeypatch):
    """The two solve paths must not disagree about the session's budget —
    the divergence D11 names was exactly that one path had no options."""
    _draft_event(client, tid)
    _write_session_config(
        client, tid, time_limit=4.0, config={"deterministic": True, "randomSeed": 5}
    )

    from bracket.brackets import _bracket_solver_options, _session_time_limit_seconds

    expected = _bracket_solver_options(
        _session_time_limit_seconds({"time_limit_seconds": 4.0}),
        {"deterministic": True, "randomSeed": 5},
    )

    seen = _capture_driver_options(monkeypatch)
    assert client.post(_url(tid, "events", "MS", "generate"), json={}).status_code == 200

    assert seen["solver_options"] == expected
