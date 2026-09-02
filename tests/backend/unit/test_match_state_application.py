"""Atomic match-state mutation and event-node operation-envelope proof."""
from __future__ import annotations

import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

class _SettingsProxy:
    def __getattr__(self, name):
        from core.config import settings as current

        return getattr(current, name)

    def __setattr__(self, name, value):
        from core.config import settings as current

        setattr(current, name, value)


settings = _SettingsProxy()
from db.models import (
    Base,
    EventOperation,
    Match,
    MatchState,
    MatchStatus,
    SyncOutbox,
    Tournament,
)
from operations.match_state_application import MatchStateApplication
from repositories import LocalRepository


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _tournament(session: Session) -> uuid.UUID:
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Match state proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    return tournament_id


def _signer_file(tmp_path):
    private = Ed25519PrivateKey.generate()
    path = tmp_path / "authority.pem"
    path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return path


def _patch_append(monkeypatch, replacement) -> None:
    """Patch the exact module globals retained by the imported service."""
    monkeypatch.setitem(
        MatchStateApplication.update.__globals__,
        "append_local_operation",
        replacement,
    )


def test_event_node_update_commits_normalized_rows_and_outbox_together(monkeypatch, tmp_path) -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    repo = LocalRepository(session)

    state, match = MatchStateApplication(repo).update(
        tournament_id=tournament_id,
        match_id="m1",
        fields={"status": "called", "called_at": "2026-09-01T12:00:00Z"},
        target_status=MatchStatus.CALLED,
        expected_version=0,
        actor_id=uuid.uuid4(),
    )

    operation = session.scalar(select(EventOperation))
    assert state.status == "called"
    assert match.status == "called"
    assert match.version == 1
    assert operation is not None
    assert operation.command_type == "match_state.update.v1"
    assert operation.expected_version == 0
    assert session.get(SyncOutbox, operation.operation_id) is not None


def test_match_state_rollback_removes_both_rows_and_operation(monkeypatch, tmp_path) -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    _patch_append(
        monkeypatch,
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("outbox unavailable")),
    )

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        MatchStateApplication(LocalRepository(session)).update(
            tournament_id=tournament_id,
            match_id="m1",
            fields={"status": "called"},
            target_status=MatchStatus.CALLED,
            expected_version=0,
            actor_id=uuid.uuid4(),
        )

    assert session.scalar(select(Match)) is None
    assert session.scalar(select(MatchState)) is None
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None


def test_bulk_merge_is_atomic_retry_safe_and_rejects_key_reuse(monkeypatch, tmp_path):
    session = _session()
    tournament_id = _tournament(session)
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    app = MatchStateApplication(LocalRepository(session))
    updates = {"m2": {"status": "started"}, "m1": {"status": "called"}}
    first = app.bulk_merge(tournament_id=tournament_id, updates=updates, idempotency_key="bulk-1", actor_id=uuid.uuid4())
    replay = app.bulk_merge(tournament_id=tournament_id, updates=updates, idempotency_key="bulk-1", actor_id=uuid.uuid4())
    assert first == replay
    assert session.query(EventOperation).count() == 1
    assert session.query(SyncOutbox).count() == 1
    with pytest.raises(ValueError, match="different payload"):
        app.bulk_merge(tournament_id=tournament_id, updates={"m1": {"status": "finished"}}, idempotency_key="bulk-1", actor_id=uuid.uuid4())


def test_bulk_merge_rolls_back_when_outbox_append_fails(monkeypatch, tmp_path):
    session = _session()
    tournament_id = _tournament(session)
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    _patch_append(monkeypatch, lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("outbox unavailable")))
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        MatchStateApplication(LocalRepository(session)).bulk_merge(
            tournament_id=tournament_id, updates={"m1": {"status": "called"}},
            idempotency_key="bulk-rollback", actor_id=uuid.uuid4(),
        )
    assert session.scalar(select(Match)) is None
    assert session.scalar(select(MatchState)) is None
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None


def test_replace_import_is_digest_bound_retry_safe_and_replayable(monkeypatch, tmp_path):
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    app = MatchStateApplication(LocalRepository(session))
    updates = {"m1": {"status": "called"}, "m2": {"status": "started"}}
    statuses = {"m1": MatchStatus.CALLED, "m2": MatchStatus.PLAYING}
    snapshot = [
        {"matchId": "m2", "status": "started"},
        {"matchId": "m1", "status": "called"},
    ]
    first = app.replace_import(
        tournament_id=tournament_id,
        updates=updates,
        statuses=statuses,
        snapshot=snapshot,
        idempotency_key="replace-1",
        last_updated="2026-09-01T12:00:00Z",
        actor_id=uuid.uuid4(),
    )
    replay = app.replace_import(
        tournament_id=tournament_id,
        updates=updates,
        statuses=statuses,
        snapshot=list(reversed(snapshot)),
        idempotency_key="replace-1",
        last_updated="2026-09-01T12:00:00Z",
        actor_id=uuid.uuid4(),
    )
    assert first == replay
    operation = session.scalar(select(EventOperation))
    assert operation.payload["sourceSchemaVersion"] == "1.0"
    assert operation.payload["snapshotDigest"]
    assert session.query(EventOperation).count() == 1
    assert session.query(SyncOutbox).count() == 1
    assert {row.match_id for row in session.scalars(select(MatchState))} == {"m1", "m2"}
    with pytest.raises(ValueError, match="different snapshot"):
        app.replace_import(
            tournament_id=tournament_id,
            updates={"m1": {"status": "finished"}},
            statuses={"m1": MatchStatus.FINISHED},
            snapshot=[{"matchId": "m1", "status": "finished"}],
            idempotency_key="replace-1",
            last_updated="2026-09-01T12:01:00Z",
            actor_id=uuid.uuid4(),
        )


def test_replace_import_rolls_back_when_operation_append_fails(monkeypatch, tmp_path):
    session = _session()
    tournament_id = _tournament(session)
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    _patch_append(
        monkeypatch,
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("operation append failed")),
    )
    with pytest.raises(RuntimeError, match="operation append failed"):
        MatchStateApplication(LocalRepository(session)).replace_import(
            tournament_id=tournament_id,
            updates={"m1": {"status": "called"}},
            statuses={"m1": MatchStatus.CALLED},
            snapshot=[{"matchId": "m1", "status": "called"}],
            idempotency_key="replace-rollback",
            last_updated="2026-09-01T12:00:00Z",
            actor_id=uuid.uuid4(),
        )
    session.expire_all()
    assert session.scalar(select(MatchState)) is None
    assert session.scalar(select(Match)) is None
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None


def test_canonical_operator_command_appends_one_operation_and_replays_without_duplication(
    monkeypatch, tmp_path
) -> None:
    session = _session()
    tournament_id = _tournament(session)
    match_id = "m1"
    session.add(Match(tournament_id=tournament_id, id=match_id, version=0))
    session.commit()
    node_id = uuid.uuid4()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    repo = LocalRepository(session)
    command_id = uuid.uuid4()

    first = repo.process_command(
        tournament_id=tournament_id,
        command_id=command_id,
        match_id=match_id,
        action="call_to_court",
        target_status=MatchStatus.CALLED,
        payload={},
        seen_version=0,
        submitted_by=uuid.uuid4(),
    )
    replay = repo.process_command(
        tournament_id=tournament_id,
        command_id=command_id,
        match_id=match_id,
        action="call_to_court",
        target_status=MatchStatus.CALLED,
        payload={},
        seen_version=0,
        submitted_by=first.command.submitted_by,
    )

    assert first.is_replay is False
    assert replay.is_replay is True
    assert session.scalar(select(EventOperation)) is not None
    assert session.query(EventOperation).count() == 1


def _seed_reset_rows(session: Session, tournament_id: uuid.UUID) -> None:
    session.add_all(
        [
            Match(
                tournament_id=tournament_id,
                id="m1",
                status=MatchStatus.CALLED.value,
                version=1,
            ),
            Match(
                tournament_id=tournament_id,
                id="m2",
                status=MatchStatus.PLAYING.value,
                version=2,
            ),
            MatchState(
                tournament_id=tournament_id,
                match_id="m1",
                status="called",
            ),
            MatchState(
                tournament_id=tournament_id,
                match_id="m2",
                status="started",
            ),
        ]
    )
    session.commit()


def test_reset_all_is_atomic_retry_safe_and_records_exact_affected_set(
    monkeypatch,
    tmp_path,
) -> None:
    session = _session()
    tournament_id = _tournament(session)
    _seed_reset_rows(session, tournament_id)
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))
    application = MatchStateApplication(LocalRepository(session))
    command_id = uuid.uuid4()

    assert application.reset_all(
        tournament_id=tournament_id,
        actor_id=uuid.uuid4(),
        operation_id=command_id,
    ) == 2
    assert application.reset_all(
        tournament_id=tournament_id,
        actor_id=uuid.uuid4(),
        operation_id=command_id,
    ) == 2

    assert session.query(MatchState).count() == 0
    matches = session.scalars(select(Match).order_by(Match.id)).all()
    assert [(row.id, row.status, row.version) for row in matches] == [
        ("m1", "scheduled", 2),
        ("m2", "scheduled", 3),
    ]
    operation = session.get(EventOperation, command_id)
    assert operation.payload == {
        "clearedStateCount": 2,
        "affectedMatches": [
            {"matchId": "m1", "status": "scheduled", "version": 2},
            {"matchId": "m2", "status": "scheduled", "version": 3},
        ],
    }
    assert session.query(EventOperation).count() == 1
    assert session.get(SyncOutbox, command_id) is not None


def test_reset_all_rolls_back_states_and_canonical_matches_when_append_fails(
    monkeypatch,
    tmp_path,
) -> None:
    session = _session()
    tournament_id = _tournament(session)
    _seed_reset_rows(session, tournament_id)
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", str(_signer_file(tmp_path)))

    def fail(*_args, **_kwargs):
        raise RuntimeError("operation append failed")

    _patch_append(monkeypatch, fail)
    with pytest.raises(RuntimeError, match="operation append failed"):
        MatchStateApplication(LocalRepository(session)).reset_all(
            tournament_id=tournament_id,
            actor_id=uuid.uuid4(),
            operation_id=uuid.uuid4(),
        )

    session.expire_all()
    assert session.query(MatchState).count() == 2
    assert [row.status for row in session.scalars(select(Match).order_by(Match.id))] == [
        "called",
        "playing",
    ]
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None
