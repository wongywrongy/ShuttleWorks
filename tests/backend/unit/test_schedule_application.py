"""Unit tests for the schedule proposal application boundary."""
from __future__ import annotations

import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session


_BACKEND_ROOT = str(Path(__file__).resolve().parents[3] / "apps" / "api" / "src")
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from meet import schedule_application as application
class _SettingsProxy:
    def __getattr__(self, name):
        from core.config import settings as current

        return getattr(current, name)

    def __setattr__(self, name, value):
        from core.config import settings as current

        setattr(current, name, value)


settings = _SettingsProxy()
from core.schemas import (
    ScheduleDTO,
    ScheduleHistoryEntry,
    SolverStatus,
    TournamentConfig,
    TournamentStateDTO,
)
from db.models import Base, EventOperation, SyncOutbox, Tournament
from repositories import LocalRepository


class _Session:
    def __init__(self, existing=None):
        self.existing = existing
        self.commits = 0
        self.rollbacks = 0
        self.flushes = 0

    def get(self, _model, _key):
        return self.existing

    def flush(self):
        self.flushes += 1

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, _row):
        pass


class _Doc:
    scheduleVersion = 4
    scheduleHistory = []
    schedule = SimpleNamespace(model_dump=lambda mode="json": {"assignments": []})
    config = SimpleNamespace(model_dump=lambda mode="json": {"courtCount": 1})

    def model_copy(self, *, update):
        value = _Doc()
        value.scheduleVersion = update["scheduleVersion"]
        value.scheduleHistory = update["scheduleHistory"]
        value.schedule = update["schedule"]
        value.config = update.get("config", self.config)
        value.model_dump = lambda: {
            "scheduleVersion": value.scheduleVersion,
            "scheduleHistory": value.scheduleHistory,
            "schedule": value.schedule,
            "config": value.config,
        }
        return value


class _Repo:
    def __init__(self, session, failure=None):
        self.session = session
        self.failure = failure
        self.calls = []
        self.tournaments = SimpleNamespace(
            get_by_id=lambda _tid: SimpleNamespace(data={}, state_version=5)
        )

    def commit_tournament_state(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.failure:
            raise self.failure
        return SimpleNamespace(data={}, state_version=5)

    def execute_query(self, operation, *args, **kwargs):
        return operation(self.session, *args, **kwargs)

    def execute_transaction(self, operation, *args, **kwargs):
        try:
            result = operation(self.session, *args, **kwargs)
            self.session.commit()
            return result
        except BaseException:
            self.session.rollback()
            raise

    def refresh(self, row):
        self.session.refresh(row)


def _history():
    return SimpleNamespace(
        model_dump=lambda mode="json": {"version": 4, "trigger": "manual_edit"}
    )


def _real_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _real_state() -> TournamentStateDTO:
    config = TournamentConfig(
        tournamentName="Schedule transaction proof",
        intervalMinutes=15,
        dayStart="09:00",
        dayEnd="17:00",
        courtCount=4,
        defaultRestMinutes=30,
        freezeHorizonSlots=2,
    )
    return TournamentStateDTO(
        version=2,
        config=config,
        schedule=ScheduleDTO(status=SolverStatus.FEASIBLE),
        scheduleVersion=4,
    )


def _signer_file(tmp_path):
    private = Ed25519PrivateKey.generate()
    path = tmp_path / "schedule-authority.pem"
    path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return path


def test_schedule_commit_rolls_back_when_state_projection_fails(monkeypatch):
    session = _Session()
    repo = _Repo(session, RuntimeError("projection failed"))
    monkeypatch.setattr(application, "_event_node_mode", lambda: False)

    with pytest.raises(RuntimeError, match="projection failed"):
        application.ScheduleCommitApplication(repo).apply(
            uuid.uuid4(), _Doc(), _Doc().schedule, _history(), proposal_id="proposal-1"
        )

    assert session.commits == 0
    assert session.rollbacks == 1
    assert repo.calls[0][1]["commit"] is False


def test_operation_payload_allows_legacy_state_without_config():
    updated = SimpleNamespace(
        scheduleVersion=5,
        schedule=SimpleNamespace(model_dump=lambda mode="json": {"status": "feasible"}),
        config=None,
    )

    payload = application._commit_payload(
        proposal_id="legacy",
        updated=updated,
        history_entry=_history(),
    )

    assert payload["config"] is None


def test_event_node_commit_appends_operation_before_one_commit(monkeypatch):
    session = _Session()
    repo = _Repo(session)
    captured = {}

    def append(_session, **kwargs):
        captured.update(kwargs)

    from sync import service

    monkeypatch.setattr(application, "_event_node_mode", lambda: True)
    monkeypatch.setattr(service, "append_local_operation", append)
    result = application.ScheduleCommitApplication(
        repo, actor_id=uuid.uuid4(), node_id=uuid.uuid4()
    ).apply(uuid.uuid4(), _Doc(), _Doc().schedule, _history(), proposal_id="proposal-2")

    assert result.state_version == 5
    assert captured["command_type"] == application.SCHEDULE_COMMIT_COMMAND
    assert captured["aggregate_type"] == application.SCHEDULE_AGGREGATE
    assert captured["expected_version"] == 4
    assert captured["payload"]["scheduleVersion"] == 5
    assert session.commits == 1
    assert session.rollbacks == 0


def test_retry_with_existing_operation_is_idempotent(monkeypatch):
    operation_id = uuid.uuid4()
    existing = SimpleNamespace(
        tournament_id=uuid.uuid4(),
        command_type=application.SCHEDULE_COMMIT_COMMAND,
    )
    session = _Session(existing=existing)
    repo = _Repo(session)
    monkeypatch.setattr(application, "state_dto_from_document", lambda _data: "persisted")
    # Use a UUID-shaped proposal id so the service derives the same key.
    result = application.ScheduleCommitApplication(repo).apply(
        existing.tournament_id,
        _Doc(),
        _Doc().schedule,
        _history(),
        proposal_id=operation_id.hex,
    )

    assert result.state == "persisted"
    assert result.operation_id == operation_id
    assert repo.calls == []
    assert session.commits == 0


def test_real_event_node_commit_persists_state_operation_and_outbox(monkeypatch, tmp_path):
    session = _real_session()
    tournament_id = uuid.uuid4()
    original = _real_state()
    session.add(
        Tournament(
            id=tournament_id,
            name="Schedule transaction proof",
            data=original.model_dump(mode="json"),
            schema_version=2,
            state_version=1,
        )
    )
    session.commit()
    node_id = uuid.uuid4()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    replacement = ScheduleDTO(status=SolverStatus.OPTIMAL, objectiveScore=12.5)
    history = ScheduleHistoryEntry(
        version=4,
        committedAt="2026-09-01T12:00:00Z",
        trigger="manual_edit",
        schedule=original.schedule,
    )

    result = application.ScheduleCommitApplication(
        LocalRepository(session), actor_id=uuid.uuid4(), node_id=node_id
    ).apply(
        tournament_id,
        original,
        replacement,
        history,
        proposal_id="schedule-proof",
    )

    persisted = session.get(Tournament, tournament_id)
    operation = session.scalar(select(EventOperation))
    assert persisted is not None
    assert persisted.data["scheduleVersion"] == 5
    assert persisted.data["schedule"]["status"] == "optimal"
    assert result.state_version == 2
    assert operation is not None
    assert operation.command_type == application.SCHEDULE_COMMIT_COMMAND
    assert operation.payload["scheduleVersion"] == 5
    assert session.get(SyncOutbox, operation.operation_id) is not None


def test_real_event_node_append_failure_rolls_back_schedule_projection(
    monkeypatch, tmp_path
):
    session = _real_session()
    tournament_id = uuid.uuid4()
    original = _real_state()
    session.add(
        Tournament(
            id=tournament_id,
            name="Schedule rollback proof",
            data=original.model_dump(mode="json"),
            schema_version=2,
            state_version=1,
        )
    )
    session.commit()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    monkeypatch.setattr(
        "sync.service.append_local_operation",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("outbox unavailable")),
    )

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        application.ScheduleCommitApplication(LocalRepository(session)).apply(
            tournament_id,
            original,
            ScheduleDTO(status=SolverStatus.OPTIMAL),
            ScheduleHistoryEntry(
                version=4,
                committedAt="2026-09-01T12:00:00Z",
                schedule=original.schedule,
            ),
            proposal_id="schedule-rollback-proof",
        )

    session.expire_all()
    persisted = session.get(Tournament, tournament_id)
    assert persisted is not None
    assert persisted.state_version == 1
    assert persisted.data["scheduleVersion"] == 4
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None
