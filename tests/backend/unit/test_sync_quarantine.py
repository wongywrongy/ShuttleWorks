"""Visible sync dead-letter and audited correction behaviour."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from db.models import Base, EventOperation, SyncQuarantine, Tournament
from sync.schemas import OperationEnvelope, SyncBatchRequest
from sync.service import (
    ProtocolError,
    begin_checkout,
    checkpoint_digest,
    ingest_batch,
    list_correction_candidates,
    list_quarantines,
    mark_ready,
    resolve_quarantine,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _authority(session: Session) -> tuple[uuid.UUID, uuid.UUID, str]:
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Quarantine proof",
            kind="bracket",
            data={"version": 2},
        )
    )
    session.commit()
    authority, capability, checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    return tournament_id, node_id, capability


def _operation(tournament_id: uuid.UUID, node_id: uuid.UUID, *, sequence: int, schema: int = 3) -> OperationEnvelope:
    now = datetime.now(timezone.utc)
    return OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=1,
        sequence=sequence,
        actor_id=uuid.uuid4(),
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id=f"m{sequence}",
        expected_version=1,
        payload={"winnerSide": "A"},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=schema,
    )


def test_wrong_epoch_schema_gap_and_apply_version_failures_are_visible() -> None:
    session = _session()
    tournament_id, node_id, capability = _authority(session)

    with pytest.raises(ProtocolError, match="not active"):
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=2,
                operations=[_operation(tournament_id, node_id, sequence=1)],
            ),
        )
    with pytest.raises(ProtocolError, match="incompatible"):
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1,
                operations=[_operation(tournament_id, node_id, sequence=1, schema=4)],
            ),
        )
    with pytest.raises(ProtocolError, match="contiguous"):
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1,
                operations=[_operation(tournament_id, node_id, sequence=3)],
            ),
        )

    def fail(_session, _operation):
        raise ProtocolError(409, "version_conflict", "stale aggregate version")

    with pytest.raises(ProtocolError, match="stale aggregate"):
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1,
                operations=[_operation(tournament_id, node_id, sequence=1)],
            ),
            apply_projection=fail,
        )
    reasons = set(session.scalars(select(SyncQuarantine.reason_code)))
    assert reasons == {"wrong_authority_epoch", "unsupported_operation_schema", "sequence_gap", "version_conflict"}


def test_quarantine_listing_and_resolution_only_emit_audited_correction() -> None:
    session = _session()
    tournament_id, node_id, capability = _authority(session)
    operation = _operation(tournament_id, node_id, sequence=2)
    with pytest.raises(ProtocolError):
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(node_id=node_id, authority_epoch=1, operations=[operation]),
        )
    row = list_quarantines(session, tournament_id=tournament_id)[0]

    # Corrections are ordinary authoritative domain operations: they are
    # created onsite, projected, uploaded, and receipted before an operator
    # can link them to the quarantine evidence.
    correction = _operation(tournament_id, node_id, sequence=1)
    highest, accepted, _ = ingest_batch(
        session,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=1,
            operations=[correction],
        ),
    )
    assert (highest, accepted) == (1, 1)
    candidates = list_correction_candidates(
        session,
        tournament_id=tournament_id,
        quarantine_id=row.id,
    )
    assert [candidate.operation_id for candidate in candidates] == [
        correction.operation_id
    ]
    resolved = resolve_quarantine(
        session,
        tournament_id=tournament_id,
        quarantine_id=row.id,
        actor_id=uuid.uuid4(),
        reason="Corrected after operator review",
        correction_operation_id=correction.operation_id,
    )
    assert session.get(SyncQuarantine, row.id).status == "resolved"
    assert resolved.resolution_operation_id == correction.operation_id
    assert session.scalar(select(EventOperation).where(EventOperation.operation_id == correction.operation_id))
    assert list_quarantines(session, tournament_id=tournament_id) == []
    assert len(list_quarantines(
        session,
        tournament_id=tournament_id,
        include_resolved=True,
    )) == 1
    # Retrying resolution cannot create a second correction operation.
    retry = resolve_quarantine(
        session,
        tournament_id=tournament_id,
        quarantine_id=row.id,
        actor_id=uuid.uuid4(),
        reason="retry",
        correction_operation_id=correction.operation_id,
    )
    assert retry.resolution_operation_id == correction.operation_id
    assert session.scalar(
        select(func.count()).select_from(EventOperation).where(
            EventOperation.tournament_id == tournament_id
        )
    ) == 1
