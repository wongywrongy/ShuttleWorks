"""SP-G1 Seam C — bracket result and advancement via Operations command.

Tests verify:
  1. POST /tournaments/{tid}/bracket/commands records a result and advances
     the bracket (downstream play unit resolves its feeder slot).
  2. The command endpoint is idempotent on the command UUID: posting the
     same id twice returns 200 both times, but the result appears exactly
     once (no double-advance).

The ordering contract is critical:
  - The replay check runs BEFORE the seen_version guard. On a genuine replay
    the match version has already advanced, so the version guard alone would
    produce 409 and break idempotency.
"""
from __future__ import annotations

import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def bracket_client(tmp_path, monkeypatch):
    """In-memory SQLite + FastAPI app with tournaments + brackets routers."""
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


def _se_4_body() -> dict:
    """Minimal 4-entrant single-elimination bracket payload."""
    return {
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
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


@pytest.fixture
def seeded_bracket(bracket_client) -> tuple[str, str, int]:
    """Return (tournament_id, play_unit_id, version) for a ready round-0 play unit.

    Creates a tournament + 4-entrant SE bracket, then picks the round-0
    match-0 semifinal (always present, always ready, version=1 on a fresh
    bracket).
    """
    tid = seed_tournament(bracket_client, "Seam C Test")
    bracket_client.post(f"/tournaments/{tid}/bracket", json=_se_4_body())
    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    sf = next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 0
    )
    return tid, sf["id"], sf["version"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bcmd(client, tid: str, **kw) -> object:
    """POST a bracket command; always injects a fresh id unless 'id' is given."""
    body = {"id": str(uuid.uuid4()), "kind": "record_result", **kw}
    return client.post(f"/tournaments/{tid}/bracket/commands", json=body)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_seam_c_records_result_and_advances(bracket_client, seeded_bracket):
    """A bracket command records the result and resolves the downstream slot."""
    tid, pu_id, version = seeded_bracket
    r = _bcmd(
        bracket_client,
        tid,
        play_unit_id=pu_id,
        winner_side="A",
        seen_version=version,
    )
    assert r.status_code == 200, r.text
    dto = r.json()
    # Result must appear in the returned DTO.
    assert any(
        res["play_unit_id"] == pu_id and res["winner_side"] == "A"
        for res in dto["results"]
    ), f"Expected result for {pu_id} in {dto['results']}"
    # Downstream final must have resolved its slot_a (feeder_play_unit_id gone).
    final = next(p for p in dto["play_units"] if p["round_index"] == 1)
    assert final["slot_a"]["participant_id"] is not None, (
        "Downstream slot was not resolved after command"
    )


def test_seam_c_is_idempotent_on_command_id(bracket_client, seeded_bracket):
    """Posting the same command UUID twice returns 200 both times; the result
    appears exactly once (no double-advance).

    Idempotency is proven at three levels:
      1. Both POSTs return 200 (replay guard fires instead of 4xx).
      2. The command id is durably persisted in the data blob so that a
         fresh hydration on the second POST sees it and short-circuits.
      3. Exactly one result row for the play unit in the returned DTO.
    """
    tid, pu_id, version = seeded_bracket
    cid = str(uuid.uuid4())
    body = {
        "id": cid,
        "kind": "record_result",
        "play_unit_id": pu_id,
        "winner_side": "A",
        "seen_version": version,
    }
    r1 = bracket_client.post(f"/tournaments/{tid}/bracket/commands", json=body)
    assert r1.status_code == 200, r1.text

    # Verify the command id was persisted to the data blob BEFORE the second
    # POST — this is the mechanism that makes re-hydration on the replay see
    # the id and short-circuit instead of double-advancing.
    from sqlalchemy import select
    from database.models import Tournament
    from database.session import SessionLocal

    with SessionLocal() as s:
        row = s.scalar(select(Tournament).where(Tournament.id == uuid.UUID(tid)))
    assert row is not None
    persisted_ids = row.data["bracket_session"].get("applied_command_ids", [])
    assert cid in persisted_ids, (
        f"Command id {cid!r} was not persisted to the data blob after first POST; "
        f"got: {persisted_ids}"
    )

    # Now replay: re-hydration reads the persisted id and returns immediately.
    r2 = bracket_client.post(f"/tournaments/{tid}/bracket/commands", json=body)
    assert r2.status_code == 200, r2.text

    # Exactly one result for pu_id — no double-advance.
    results = [x for x in r2.json()["results"] if x["play_unit_id"] == pu_id]
    assert len(results) == 1, (
        f"Expected exactly 1 result for {pu_id}, got {len(results)}: {results}"
    )
