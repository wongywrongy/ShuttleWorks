"""Hostile but bounded failure-path proofs for the offline vertical slice."""
from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path
from types import SimpleNamespace
from urllib.error import URLError

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from core.telemetry import bootstrap
from core.telemetry.instruments import record_sync_upload
from core.telemetry.state import set_runtime
from db.models import Base, EventOperation, SyncCheckpoint, SyncInbox, SyncOutbox, Tournament
from recovery.bundles import RecoveryBundleError, create_bundle, inspect_bundle
from sync import agent
from sync.schemas import SyncBatchResponse
from sync.service import append_local_operation, begin_checkout, ingest_batch, mark_ready


def _factory():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine, sessionmaker(engine, expire_on_commit=False)


def _seed(session: Session) -> tuple[uuid.UUID, uuid.UUID, EventOperation]:
    tournament_id, node_id = uuid.uuid4(), uuid.uuid4()
    session.add(Tournament(id=tournament_id, data={"version": 2}, schema_version=2))
    session.commit()
    operation = append_local_operation(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=uuid.uuid4(),
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="m1",
        payload={"winnerSide": "A"},
        expected_version=1,
    )
    session.commit()
    return tournament_id, node_id, operation


def test_wan_unavailable_then_recovery_acknowledges_without_loss(monkeypatch):
    engine, factory = _factory()
    monkeypatch.setattr(agent, "SessionLocal", factory)
    with factory() as session:
        tournament_id, node_id, operation = _seed(session)

    monkeypatch.setattr(agent.settings, "sync_cloud_url", "https://cloud.invalid")
    monkeypatch.setattr(agent.settings, "sync_tournament_id", str(tournament_id))
    monkeypatch.setattr(agent.settings, "node_id", str(node_id))
    monkeypatch.setattr(agent, "_capability", lambda: "capability")
    calls = {"count": 0}

    def flaky_post(*_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise URLError("WAN unavailable")
        return SyncBatchResponse(
            highest_contiguous_sequence=operation.sequence,
            accepted=1,
            duplicates=0,
            next_sequence=operation.sequence + 1,
        )

    monkeypatch.setattr(agent, "_post_batch", flaky_post)
    assert agent.drain_once() == 0
    with factory() as session:
        pending = session.get(SyncOutbox, operation.operation_id)
        assert pending is not None and pending.attempt_count == 1
        pending.next_attempt_at = None
        session.commit()
    assert agent.drain_once() == 1
    with factory() as session:
        acknowledged = session.get(SyncOutbox, operation.operation_id)
        assert acknowledged is not None and acknowledged.acknowledged_at is not None
    engine.dispose()


def test_reordered_batch_is_rejected_without_partial_application():
    _engine, factory = _factory()
    with factory() as session:
        tournament_id, node_id = uuid.uuid4(), uuid.uuid4()
        session.add(Tournament(id=tournament_id, data={"version": 2}, schema_version=2))
        session.commit()
        authority, capability, _ = begin_checkout(
            session, tournament_id=tournament_id, node_id=node_id
        )
        mark_ready(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
        )
        # The cloud has an active epoch; construct a valid second envelope but
        # submit [2, 1] to prove the batch is not sorted or partially applied.
        # Build envelopes directly so no local authority is persisted into the
        # cloud fixture and no mutation is needed to create sequence two.
        from datetime import datetime, timezone
        from sync.schemas import OperationEnvelope, SyncBatchRequest

        now = datetime.now(timezone.utc)
        envelopes = [
            OperationEnvelope(
                operation_id=uuid.uuid4(), event_id=tournament_id, node_id=node_id,
                authority_epoch=authority.epoch, sequence=2, actor_id=uuid.uuid4(),
                command_type="match.record_result.v3", aggregate_type="bracket_match",
                aggregate_id="m2", payload={}, expected_version=1,
                occurred_at_local=now, accepted_at_node=now, schema_version=3,
            ),
            OperationEnvelope(
                operation_id=uuid.uuid4(), event_id=tournament_id, node_id=node_id,
                authority_epoch=authority.epoch, sequence=1, actor_id=uuid.uuid4(),
                command_type="match.record_result.v3", aggregate_type="bracket_match",
                aggregate_id="m1", payload={}, expected_version=1,
                occurred_at_local=now, accepted_at_node=now, schema_version=3,
            ),
        ]
        with pytest.raises(Exception, match="contiguous|gap"):
            ingest_batch(
                session,
                tournament_id=tournament_id,
                capability=capability,
                batch=SyncBatchRequest(node_id=node_id, authority_epoch=authority.epoch, operations=envelopes),
            )
        assert session.scalar(select(func.count()).select_from(SyncInbox)) == 0
        checkpoint = session.get(SyncCheckpoint, (tournament_id, authority.epoch))
        assert checkpoint is not None
        assert checkpoint.highest_contiguous_sequence == 0


def test_telemetry_collector_absence_is_fail_open():
    settings = SimpleNamespace(
        otel_exporter_otlp_endpoint="",
        otel_exporter_otlp_protocol="http/protobuf",
    )
    set_runtime(None)
    assert bootstrap.configure_telemetry(settings, role="api") is None
    record_sync_upload("rejected")


def test_corrupted_backup_fails_closed_without_touching_source(tmp_path: Path):
    source = tmp_path / "event.db"
    bundle = tmp_path / "event.swbackup"
    connection = sqlite3.connect(source)
    connection.execute("CREATE TABLE proof (value TEXT)")
    connection.execute("INSERT INTO proof VALUES ('durable')")
    connection.commit()
    connection.close()
    create_bundle(
        source_database=source,
        output_path=bundle,
        passphrase=b"correct horse battery staple",
    )
    damaged = bytearray(bundle.read_bytes())
    damaged[-1] ^= 1
    bundle.write_bytes(damaged)
    with pytest.raises(RecoveryBundleError, match="wrong passphrase|corrupted"):
        inspect_bundle(bundle, b"correct horse battery staple")
    connection = sqlite3.connect(source)
    assert connection.execute("SELECT value FROM proof").fetchone()[0] == "durable"
    connection.close()


def test_browser_storage_is_explicitly_non_authoritative():
    queue_source = (Path(__file__).resolve().parents[3] / "apps/console/src/lib/commandQueue.ts").read_text()
    state_source = (Path(__file__).resolve().parents[3] / "apps/console/src/hooks/useTournamentState.ts").read_text()
    assert "IndexedDB-backed operator command queue" in queue_source
    # A historical comment may mention the retired storage key; executable
    # browser-storage reads/writes are the authority violation we forbid.
    assert "localStorage." not in state_source
    assert ".getItem(" not in state_source
    assert ".setItem(" not in state_source
    assert "apiClient" in state_source
