"""Durable outbox drain state transitions without a live network."""
from __future__ import annotations

import io
import json
import urllib.error
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Base, SyncOutbox, Tournament
from sync import agent
from sync.service import append_local_operation


def _database(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(agent, "SessionLocal", factory)
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    with factory() as session:
        session.add(
            Tournament(
                id=tournament_id,
                data={"version": 2},
                schema_version=2,
            )
        )
        session.commit()
        operation = append_local_operation(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            actor_id=uuid.uuid4(),
            command_type="match.record_result.v3",
            aggregate_type="bracket_match",
            aggregate_id="m1",
            payload={"winner_side": "A"},
            expected_version=1,
        )
        session.commit()
        operation_id = operation.operation_id
    return factory, tournament_id, node_id, operation_id


def test_acknowledgement_retains_operation_and_marks_outbox(monkeypatch) -> None:
    factory, tournament_id, node_id, operation_id = _database(monkeypatch)
    operations = agent.pending_batch(tournament_id, node_id)
    assert [operation.operation_id for operation in operations] == [operation_id]

    agent._mark_acknowledged(operations, highest=1)
    with factory() as session:
        row = session.get(SyncOutbox, operation_id)
        assert row.acknowledged_at is not None
        assert row.last_error_code is None
    assert agent.pending_batch(tournament_id, node_id) == []


def test_network_failure_schedules_bounded_retry(monkeypatch) -> None:
    factory, tournament_id, node_id, operation_id = _database(monkeypatch)
    operations = agent.pending_batch(tournament_id, node_id)
    monkeypatch.setattr(agent.random, "uniform", lambda _low, _high: 1.0)
    agent._mark_retry(operations, "network_error")

    with factory() as session:
        row = session.get(SyncOutbox, operation_id)
        assert row.attempt_count == 1
        assert row.next_attempt_at is not None
        assert row.acknowledged_at is None
        assert row.last_error_code == "network_error"


def test_permanent_protocol_failure_is_retained_and_removed_from_retry_queue(
    monkeypatch,
) -> None:
    factory, tournament_id, node_id, operation_id = _database(monkeypatch)
    operations = agent.pending_batch(tournament_id, node_id)
    agent._mark_permanently_blocked(operations, "command_class_not_granted")

    with factory() as session:
        row = session.get(SyncOutbox, operation_id)
        assert row.acknowledged_at is None
        assert row.permanently_blocked_at is not None
        assert row.next_attempt_at is None
        assert row.last_error_code == "command_class_not_granted"
    assert agent.pending_batch(tournament_id, node_id) == []


@pytest.mark.parametrize("status", [400, 401, 403, 409, 422])
def test_drain_permanent_http_failure_is_blocked_and_visible(
    monkeypatch, status: int
) -> None:
    factory, tournament_id, node_id, operation_id = _database(monkeypatch)
    monkeypatch.setattr(agent.settings, "sync_cloud_url", "https://cloud.invalid")
    monkeypatch.setattr(agent.settings, "sync_tournament_id", str(tournament_id))
    monkeypatch.setattr(agent.settings, "node_id", str(node_id))
    monkeypatch.setattr(agent, "_capability", lambda: "capability")
    body = io.BytesIO(json.dumps({"error": "protocol_rejected"}).encode())

    def reject(*_args, **_kwargs):
        raise urllib.error.HTTPError(
            "https://cloud.invalid", status, "rejected", {}, body
        )

    monkeypatch.setattr(agent, "_post_batch", reject)
    assert agent.drain_once() == 0
    with factory() as session:
        row = session.get(SyncOutbox, operation_id)
        assert row is not None
        assert row.permanently_blocked_at is not None
        assert row.next_attempt_at is None
        assert row.acknowledged_at is None
        assert row.last_error_code == "protocol_rejected"


@pytest.mark.parametrize("status", [408, 425, 429, 500, 503])
def test_drain_retryable_http_failure_remains_queued(
    monkeypatch, status: int
) -> None:
    factory, tournament_id, node_id, operation_id = _database(monkeypatch)
    monkeypatch.setattr(agent.settings, "sync_cloud_url", "https://cloud.invalid")
    monkeypatch.setattr(agent.settings, "sync_tournament_id", str(tournament_id))
    monkeypatch.setattr(agent.settings, "node_id", str(node_id))
    monkeypatch.setattr(agent, "_capability", lambda: "capability")

    def reject(*_args, **_kwargs):
        raise urllib.error.HTTPError(
            "https://cloud.invalid",
            status,
            "retry",
            {},
            io.BytesIO(json.dumps({"error": "ingestion_retry_required"}).encode()),
        )

    monkeypatch.setattr(agent, "_post_batch", reject)
    monkeypatch.setattr(agent.random, "uniform", lambda _low, _high: 1.0)
    assert agent.drain_once() == 0
    with factory() as session:
        row = session.get(SyncOutbox, operation_id)
        assert row is not None
        assert row.permanently_blocked_at is None
        assert row.next_attempt_at is not None
        assert row.acknowledged_at is None
        assert row.last_error_code == "ingestion_retry_required"
