"""Event-node operation log and atomic sequence allocation."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from db.models import EventOperation, EventOperationSequence, SyncOutbox
from sqlalchemy import update
from sqlalchemy.orm import Session

from sync.compatibility import CURRENT_OPERATION_SCHEMA_VERSION
from sync.schemas import OperationEnvelope
from sync.service import ProtocolError, _ensure_operation_sequence, ensure_local_authority, utcnow


def allocate_operation_sequence(
    session: Session, *, tournament_id: uuid.UUID, authority_epoch: int
) -> int:
    """Atomically reserve one epoch-local sequence on SQLite and PostgreSQL."""
    _ensure_operation_sequence(session, tournament_id, authority_epoch)
    next_value = session.scalar(
        update(EventOperationSequence)
        .where(
            EventOperationSequence.tournament_id == tournament_id,
            EventOperationSequence.authority_epoch == authority_epoch,
        )
        .values(next_sequence=EventOperationSequence.next_sequence + 1)
        .returning(EventOperationSequence.next_sequence)
    )
    if next_value is None:
        raise ProtocolError(
            409,
            "sequence_allocator_missing",
            "Operation sequence allocator is unavailable",
        )
    return int(next_value) - 1


def append_local_operation(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    actor_id: uuid.UUID,
    command_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any],
    expected_version: int | None,
    operation_id: uuid.UUID | None = None,
    occurred_at_local: datetime | None = None,
    traceparent: str | None = None,
) -> EventOperation:
    """Append an operation and outbox row inside the caller's transaction."""
    authority = ensure_local_authority(
        session, tournament_id=tournament_id, node_id=node_id
    )
    sequence = allocate_operation_sequence(
        session,
        tournament_id=tournament_id,
        authority_epoch=authority.epoch,
    )
    operation = EventOperation(
        operation_id=operation_id or uuid.uuid4(),
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        sequence=sequence,
        actor_id=actor_id,
        command_type=command_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        expected_version=expected_version,
        payload=payload,
        occurred_at_local=occurred_at_local or utcnow(),
        accepted_at_node=utcnow(),
        traceparent=traceparent,
        schema_version=CURRENT_OPERATION_SCHEMA_VERSION,
    )
    session.add(operation)
    session.flush()
    session.add(SyncOutbox(operation_id=operation.operation_id))
    session.flush()
    return operation


def operation_to_envelope(operation: EventOperation) -> OperationEnvelope:
    return OperationEnvelope(
        operation_id=operation.operation_id,
        event_id=operation.tournament_id,
        node_id=operation.node_id,
        authority_epoch=operation.authority_epoch,
        sequence=operation.sequence,
        actor_id=operation.actor_id,
        command_type=operation.command_type,
        aggregate_type=operation.aggregate_type,
        aggregate_id=operation.aggregate_id,
        expected_version=operation.expected_version,
        payload=operation.payload,
        occurred_at_local=operation.occurred_at_local,
        accepted_at_node=operation.accepted_at_node,
        traceparent=operation.traceparent,
        schema_version=operation.schema_version,
    )

__all__ = [
    "allocate_operation_sequence",
    "append_local_operation",
    "operation_to_envelope",
]
