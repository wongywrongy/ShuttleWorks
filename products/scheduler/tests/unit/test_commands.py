"""Unit tests for Step C — the idempotent command log endpoint.

Seven tests:

1. Happy path — command applied, version bumped, applied_at stamped.
2. Idempotent replay — same id twice returns 200, no double-write.
3. Stale version — 409 stale_version body, rejected_at stamped.
4. Invalid transition — 409 conflict body with current/attempted_status.
5. Rejected-command replay — second submission returns 409 with the
   *original* rejection_reason from the command row.
6. Mid-transaction failure — monkey-patch session.commit to raise on
   the apply path; assert the match row is unchanged in a fresh
   session (rollback verified).
7. Replay-current-state contract — between original apply and replay,
   mutate the match via another path; assert the replay response
   carries the *current* (mutated) state, not the post-original-apply
   state.

Driven through a FastAPI TestClient so the route → service →
repository pipeline is exercised end-to-end, including the
``ConflictError`` → 409 exception handler installed in ``app.main``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    # Register the exception handler so ConflictError → 409 (the
    # production wiring lives in app.main; tests build minimal apps).
    from api import commands, match_state, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(match_state.router)
    app.include_router(commands.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Step C Test")


def _commands_url(tid: str) -> str:
    return f"/tournaments/{tid}/commands"


def _seed_match(client, tid: str, match_id: str = "m1") -> None:
    """Drop a row into the matches table via the schedule-commit projection.

    Routes don't expose a direct ``matches`` write path; the canonical
    population path is the schedule commit (``PUT /tournaments/{tid}/state``).
    Tests reuse that path to seed.
    """
    payload = {
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "courtCount": 2,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "matches": [{"id": match_id, "sideA": ["p1"], "sideB": ["p2"]}],
        "schedule": {
            "status": "feasible",
            "assignments": [
                {"matchId": match_id, "slotId": 0, "courtId": 1, "durationSlots": 1}
            ],
        },
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200, r.text


def _new_command_body(
    *,
    match_id: str = "m1",
    action: str = "call_to_court",
    seen_version: int = 1,
    cmd_id: uuid.UUID | None = None,
    payload: dict | None = None,
) -> dict:
    return {
        "id": str(cmd_id or uuid.uuid4()),
        "match_id": match_id,
        "action": action,
        "payload": payload,
        "seen_version": seen_version,
    }


# ---- 1. Happy path ----------------------------------------------------


def test_happy_path_call_to_court_applies(client, tid):
    _seed_match(client, tid)

    body = _new_command_body(action="call_to_court", seen_version=1)
    r = client.post(_commands_url(tid), json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "called"
    assert out["version"] == 2
    assert out["replay"] is False
    assert out["applied_at"]
    # Sanity: applied_at is a parseable ISO timestamp.
    datetime.fromisoformat(out["applied_at"].replace("Z", "+00:00"))


# ---- 2. Idempotent replay -------------------------------------------------


def test_idempotent_replay_returns_same_state_no_double_write(client, tid):
    _seed_match(client, tid)
    cmd_id = uuid.uuid4()

    first = client.post(
        _commands_url(tid),
        json=_new_command_body(cmd_id=cmd_id, seen_version=1),
    )
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["version"] == 2
    assert first_body["replay"] is False

    second = client.post(
        _commands_url(tid),
        json=_new_command_body(cmd_id=cmd_id, seen_version=1),
    )
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["version"] == 2  # NOT bumped to 3 — no double-write
    assert second_body["status"] == "called"
    assert second_body["command_id"] == str(cmd_id)
    assert second_body["replay"] is True


# ---- 3. Stale version -----------------------------------------------------


def test_stale_version_is_rejected_with_409_stale_version_body(client, tid):
    _seed_match(client, tid)
    # First command bumps version 1 → 2.
    client.post(
        _commands_url(tid),
        json=_new_command_body(action="call_to_court", seen_version=1),
    )

    # Now a stale command (still references version 1) — should reject.
    stale = client.post(
        _commands_url(tid),
        json=_new_command_body(action="start_match", seen_version=1),
    )
    assert stale.status_code == 409
    body = stale.json()
    assert body["error"] == "stale_version"
    assert body["match_id"] == "m1"
    assert body["current_version"] == 2
    assert body["seen_version"] == 1


# ---- 4. Invalid transition -----------------------------------------------


def test_invalid_transition_is_rejected_with_409_conflict_body(client, tid):
    _seed_match(client, tid)
    # Match starts at scheduled (version 1). Try to jump straight to
    # finish_match — illegal transition.
    r = client.post(
        _commands_url(tid),
        json=_new_command_body(action="finish_match", seen_version=1),
    )
    assert r.status_code == 409
    body = r.json()
    assert body["error"] == "conflict"
    assert body["match_id"] == "m1"
    assert body["current_status"] == "scheduled"
    assert body["attempted_status"] == "finished"


# ---- 5. Rejected-command replay ------------------------------------------


def test_rejected_command_replay_returns_original_rejection_reason(client, tid):
    _seed_match(client, tid)
    cmd_id = uuid.uuid4()

    first = client.post(
        _commands_url(tid),
        json=_new_command_body(
            cmd_id=cmd_id, action="finish_match", seen_version=1
        ),
    )
    assert first.status_code == 409
    first_body = first.json()
    original_message = first_body["message"]

    # Replay the same command id — should return the same rejection reason.
    second = client.post(
        _commands_url(tid),
        json=_new_command_body(
            cmd_id=cmd_id, action="finish_match", seen_version=1
        ),
    )
    assert second.status_code == 409
    second_body = second.json()
    assert original_message in second_body["message"]


# ---- 6. Mid-transaction failure → rollback -------------------------------


def test_mid_transaction_failure_rolls_back_match_update(client, tid, monkeypatch):
    _seed_match(client, tid)

    # Snapshot pre-attempt state in a *fresh* session so we read what's
    # actually on disk, not whatever an active session is caching.
    from database.models import Match
    from database.session import SessionLocal
    with SessionLocal() as s:
        rows = s.query(Match).all()
        assert len(rows) == 1
        before = rows[0]
        before_status = before.status
        before_version = before.version

    # Monkey-patch the session's commit to raise. ``process_command``
    # calls commit exactly once per call path; raising on first call
    # is enough to verify rollback. ``monkeypatch.setattr`` is
    # per-test so the patch lifts at teardown — subsequent tests get
    # an unpatched session.
    from sqlalchemy.orm import Session as _Session

    def _commit_with_failure(self):
        raise RuntimeError("simulated mid-transaction failure")

    monkeypatch.setattr(_Session, "commit", _commit_with_failure)

    # Now the apply path will trip on commit. TestClient re-raises
    # uncaught exceptions rather than mapping them to a 500 response;
    # we don't care about the response — only that the rollback left
    # nothing on disk.
    with pytest.raises(RuntimeError, match="simulated mid-transaction"):
        client.post(
            _commands_url(tid),
            json=_new_command_body(action="call_to_court", seen_version=1),
        )

    # Read in a *fresh* session — anything the in-flight session was
    # holding is rolled back; nothing should have hit disk.
    with SessionLocal() as s:
        rows = s.query(Match).all()
        assert len(rows) == 1
        after = rows[0]
        assert after.status == before_status
        assert after.version == before_version
        # No commands row should have landed either.
        from database.models import Command
        assert s.query(Command).count() == 0


# ---- 7. Replay returns CURRENT state, not post-original-apply state ------


def test_idempotent_replay_returns_current_state_after_third_party_update(client, tid):
    """Pin the response-shape contract.

    Between original apply and replay, another caller moves the
    match (here, by another command). The replay must return the
    *current* state, not the state right after the original apply.
    """
    _seed_match(client, tid)
    cmd_id = uuid.uuid4()

    # Operator A submits a "call to court" command.
    first = client.post(
        _commands_url(tid),
        json=_new_command_body(cmd_id=cmd_id, action="call_to_court", seen_version=1),
    )
    assert first.status_code == 200
    assert first.json()["status"] == "called"
    assert first.json()["version"] == 2

    # Operator B (a different command) moves the match forward.
    other = client.post(
        _commands_url(tid),
        json=_new_command_body(action="start_match", seen_version=2),
    )
    assert other.status_code == 200
    assert other.json()["status"] == "playing"
    assert other.json()["version"] == 3

    # Operator A re-submits the original command (e.g., a retry from
    # a flaky network). The replay returns 200 with the CURRENT state
    # (playing / version 3), not the post-original-apply state
    # (called / version 2).
    replay = client.post(
        _commands_url(tid),
        json=_new_command_body(cmd_id=cmd_id, action="call_to_court", seen_version=1),
    )
    assert replay.status_code == 200
    body = replay.json()
    assert body["replay"] is True
    assert body["status"] == "playing"   # current, not "called"
    assert body["version"] == 3          # current, not 2
