"""Atomic bracket pin command and replay behavior."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from bracket.application import BracketPinService
from core.config import settings
from db.models import Base, EventOperation, SyncOutbox, Tournament
from repositories import LocalRepository
from sync.schemas import OperationEnvelope
from sync.service import ALLOWED_COMMAND_CLASSES, apply_cloud_projection


def _fixture(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine, expire_on_commit=False)
    tournament_id = uuid.uuid4()
    db.add(Tournament(id=tournament_id, name="Pin proof", data={"version": 2}))
    db.commit()
    assignment = SimpleNamespace(
        play_unit_id="m1",
        slot_id=1,
        court_id=1,
        actual_start_slot=None,
        actual_end_slot=None,
    )
    state = SimpleNamespace(
        state=SimpleNamespace(
            play_units={"m1": SimpleNamespace(expected_duration_slots=1)},
            assignments={"m1": assignment},
        ),
        config=SimpleNamespace(current_slot=0),
        rest_between_rounds=1,
        player_extras={},
        applied_command_ids=set(),
    )

    import bracket.brackets as routes

    monkeypatch.setattr(routes, "_ensure_tournament_exists", lambda *_args: None)
    monkeypatch.setattr(routes, "_hydrate_session", lambda *_args: state)
    monkeypatch.setattr(
        routes,
        "_bracket_locked_play_unit_ids",
        lambda *_args: set(),
    )

    def fake_options(*_args, **_kwargs):
        return None

    monkeypatch.setattr(routes, "_bracket_solver_options", fake_options)

    class Driver:
        def __init__(self, **_kwargs):
            pass

        def repin_and_resolve(self, play_unit_id, *, slot_id, court_id):
            state.state.assignments[play_unit_id].slot_id = slot_id
            state.state.assignments[play_unit_id].court_id = court_id
            return SimpleNamespace(scheduled=True, status=SimpleNamespace(value="feasible"))

    monkeypatch.setattr(routes, "TournamentDriver", Driver)
    monkeypatch.setattr(
        routes,
        "_serialize_session",
        lambda _session: SimpleNamespace(
            model_dump=lambda **_kwargs: {
                "assignments": [{"play_unit_id": "m1", "slot_id": 9, "court_id": 2}]
            }
        ),
    )

    def persist(repo, tid, *, session, commit):
        assert commit is False
        assert session.applied_command_ids
        tournament = repo.tournaments.get_by_id(tid)
        data = dict(tournament.data or {})
        data["pinned"] = [
            {
                "play_unit_id": a.play_unit_id,
                "slot_id": a.slot_id,
                "court_id": a.court_id,
            }
            for a in session.state.assignments.values()
        ]
        repo.tournaments.upsert_data(tid, data, commit=False)

    monkeypatch.setattr(routes, "_persist_session_metadata", persist)
    monkeypatch.setattr(settings, "deployment_profile", "local")
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "node_id", "")
    monkeypatch.setattr(settings, "authority_signing_key_file", "")
    return db, tournament_id, state


def test_pin_persists_snapshot_operation_and_outbox_atomically(monkeypatch):
    db, tournament_id, state = _fixture(monkeypatch)
    command_id = uuid.uuid4()

    outcome = BracketPinService().apply(
        LocalRepository(db),
        tournament_id,
        play_unit_id="m1",
        slot_id=9,
        court_id=2,
        command_id=command_id,
    )

    operation = db.get(EventOperation, command_id)
    assert outcome.replay is False
    assert operation is not None
    assert operation.command_type == "bracket.pin.v1"
    assert operation.payload["bracketSnapshot"]["assignments"]
    assert db.get(SyncOutbox, command_id) is not None
    assert db.get(Tournament, tournament_id).data["pinned"][0]["slot_id"] == 9
    assert str(command_id) in state.applied_command_ids


def test_pin_retry_replays_without_solver_or_duplicate_operation(monkeypatch):
    db, tournament_id, _state = _fixture(monkeypatch)
    command_id = uuid.uuid4()
    service = BracketPinService()
    repo = LocalRepository(db)
    service.apply(
        repo,
        tournament_id,
        play_unit_id="m1",
        slot_id=9,
        court_id=2,
        command_id=command_id,
    )

    import bracket.brackets as routes

    def fail(*_args, **_kwargs):
        raise AssertionError("replay must not invoke solver")

    monkeypatch.setattr(routes.TournamentDriver, "repin_and_resolve", fail)
    replay = service.apply(
        repo,
        tournament_id,
        play_unit_id="m1",
        slot_id=9,
        court_id=2,
        command_id=command_id,
    )
    assert replay.replay is True
    operations = list(
        db.scalars(
            select(EventOperation).where(
                EventOperation.command_type == "bracket.pin.v1"
            )
        )
    )
    assert len(operations) == 1


def test_reusing_command_id_for_a_different_pin_is_rejected(monkeypatch):
    db, tournament_id, _state = _fixture(monkeypatch)
    command_id = uuid.uuid4()
    service = BracketPinService()
    repo = LocalRepository(db)
    service.apply(
        repo,
        tournament_id,
        play_unit_id="m1",
        slot_id=9,
        court_id=2,
        command_id=command_id,
    )
    with pytest.raises(Exception) as raised:
        service.apply(
            repo,
            tournament_id,
            play_unit_id="m1",
            slot_id=3,
            court_id=1,
            command_id=command_id,
        )
    assert raised.value.status_code == 409
    assert raised.value.detail["error"] == "command_id_reuse"


def test_pin_rollback_removes_snapshot_and_operation_when_outbox_fails(monkeypatch):
    db, tournament_id, _state = _fixture(monkeypatch)
    import sync.service as sync_service

    def fail(*_args, **_kwargs):
        raise RuntimeError("outbox unavailable")

    monkeypatch.setattr(sync_service, "append_local_operation", fail)
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        BracketPinService().apply(
            LocalRepository(db),
            tournament_id,
            play_unit_id="m1",
            slot_id=9,
            court_id=2,
            command_id=uuid.uuid4(),
        )
    assert db.scalar(select(EventOperation)) is None
    assert db.scalar(select(SyncOutbox)) is None
    assert "pinned" not in db.get(Tournament, tournament_id).data


def test_pin_is_in_signed_grant_allowlist_and_cloud_replay_projection():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine, expire_on_commit=False)
    tournament_id = uuid.uuid4()
    db.add(Tournament(id=tournament_id, name="Projection proof", data={"version": 2}))
    db.commit()
    assert "bracket.pin.v1" in ALLOWED_COMMAND_CLASSES
    now = datetime.now(timezone.utc)
    operation = OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=uuid.uuid4(),
        authority_epoch=1,
        sequence=1,
        actor_id=uuid.uuid4(),
        command_type="bracket.pin.v1",
        aggregate_type="bracket_tournament",
        aggregate_id=str(tournament_id),
        payload={"bracketSnapshot": {"assignments": []}, "playUnitId": "m1", "slotId": 9, "courtId": 2},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=3,
    )
    apply_cloud_projection(db, operation)
    from db.models import CloudEventProjection

    projection = db.get(CloudEventProjection, tournament_id)
    assert projection.data["bracket"] == {"assignments": []}
    assert projection.data["bracketPin"]["playUnitId"] == "m1"
