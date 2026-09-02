"""Authority epoch and ordered operation protocol invariants."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from importlib import import_module

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from bracket.application import BracketResultService
from db.models import (
    Base,
    CloudEventProjection,
    EventOperation,
    SyncCheckpoint,
    SyncInbox,
    SyncOutbox,
    SyncQuarantine,
    Tournament,
    TournamentAuthority,
)
from repositories import LocalRepository
from sync.schemas import OperationEnvelope, SyncBatchRequest
from sync.service import (
    ProtocolError,
    append_local_operation,
    begin_checkout,
    checkpoint_package,
    ingest_batch,
    mark_ready,
    operation_to_envelope,
    rebuild_cloud_projection,
    tournament_is_checked_out,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _tournament(session: Session, tournament_id: uuid.UUID) -> None:
    session.add(
        Tournament(
            id=tournament_id,
            name="Protocol proof",
            data={"version": 2, "config": {"tournamentName": "Protocol proof"}},
            schema_version=2,
        )
    )
    session.commit()


def _active_checkout(
    session: Session, tournament_id: uuid.UUID, node_id: uuid.UUID
) -> str:
    authority, capability, _checkpoint = begin_checkout(
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
    return capability


def test_checkout_freezes_cloud_mutations_during_prepare_and_active() -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(session, tournament_id)

    authority, capability, _checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    assert authority.state == "preparing"
    assert tournament_is_checked_out(session, tournament_id)

    mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
    )
    assert tournament_is_checked_out(session, tournament_id)


def test_cloud_bracket_commands_are_read_only_after_checkout(monkeypatch) -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    _tournament(session, tournament_id)
    begin_checkout(session, tournament_id=tournament_id, node_id=uuid.uuid4())
    # Migration tests deliberately purge backend modules so Alembic reloads
    # configuration from its temporary environment.  Resolve the process
    # settings object at execution time rather than retaining a stale module-
    # collection reference when this test runs in the complete unit suite.
    settings = import_module("core.config").settings
    monkeypatch.setattr(settings, "deployment_profile", "cloud")

    with pytest.raises(HTTPException) as raised:
        BracketResultService().apply(
            LocalRepository(session),
            tournament_id,
            play_unit_id="match-1",
            winner_side="A",
        )

    assert raised.value.status_code == 409
    assert "read-only" in str(raised.value.detail)

def test_local_operation_and_outbox_share_the_callers_transaction() -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    _tournament(session, tournament_id)

    operation = append_local_operation(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="event-1/match-1",
        expected_version=3,
        payload={"winnerSide": "A"},
    )
    operation_id = operation.operation_id
    session.rollback()

    assert session.get(EventOperation, operation_id) is None
    assert session.get(SyncOutbox, operation_id) is None


def test_sequences_are_epoch_local_and_strictly_increasing() -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    _tournament(session, tournament_id)

    first = append_local_operation(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="m1",
        expected_version=1,
        payload={},
    )
    second = append_local_operation(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="m2",
        expected_version=1,
        payload={},
    )
    session.commit()

    assert (first.sequence, second.sequence) == (1, 2)
    assert session.scalar(select(func.count()).select_from(SyncOutbox)) == 2


def test_cloud_ingestion_is_idempotent_and_advances_contiguous_cursor() -> None:
    local = _session()
    cloud = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    _tournament(local, tournament_id)
    _tournament(cloud, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)

    operation = append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="event-1/match-1",
        expected_version=2,
        payload={"winnerSide": "B"},
    )
    # The local compatibility epoch is independently numbered but has the same
    # first epoch/node for this proof database.
    local.commit()
    envelope = operation_to_envelope(operation)
    batch = SyncBatchRequest(
        node_id=node_id, authority_epoch=1, operations=[envelope]
    )

    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=batch,
    ) == (1, 1, 0)
    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=batch,
    ) == (1, 0, 1)
    checkpoint = cloud.get(SyncCheckpoint, (tournament_id, 1))
    assert checkpoint.highest_contiguous_sequence == 1
    assert cloud.scalar(select(func.count()).select_from(SyncInbox)) == 1
    projection = cloud.get(CloudEventProjection, tournament_id)
    assert projection.last_sequence == 1
    assert projection.data["bracketResults"]["event-1/match-1"]["winnerSide"] == "B"


def test_gap_rejects_whole_batch_without_partial_application() -> None:
    cloud = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)
    now = datetime.now(timezone.utc)
    operation = OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=1,
        sequence=2,
        actor_id=uuid.uuid4(),
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="m2",
        expected_version=1,
        payload={},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=3,
    )

    with pytest.raises(ProtocolError) as raised:
        ingest_batch(
            cloud,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1, operations=[operation]
            ),
        )
    assert raised.value.code == "sequence_gap"
    assert raised.value.detail["expected_sequence"] == 1
    assert cloud.scalar(select(func.count()).select_from(SyncInbox)) == 0
    assert cloud.get(SyncCheckpoint, (tournament_id, 1)) is None


def test_incompatible_schema_is_quarantined_without_advancing() -> None:
    cloud = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)
    now = datetime.now(timezone.utc)
    operation = OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=1,
        sequence=1,
        actor_id=uuid.uuid4(),
        command_type="match.record_result.v99",
        aggregate_type="bracket_match",
        aggregate_id="m1",
        payload={},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=99,
    )

    with pytest.raises(ProtocolError) as raised:
        ingest_batch(
            cloud,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1, operations=[operation]
            ),
        )
    assert raised.value.code == "unsupported_operation_schema"
    assert cloud.scalar(select(func.count()).select_from(SyncQuarantine)) == 1
    assert cloud.scalar(select(func.count()).select_from(SyncInbox)) == 0


def test_command_outside_signed_grant_is_quarantined() -> None:
    cloud = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)
    now = datetime.now(timezone.utc)
    operation = OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=1,
        sequence=1,
        actor_id=uuid.uuid4(),
        command_type="ungranted.live.mutation.v1",
        aggregate_type="match",
        aggregate_id="m1",
        payload={},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=3,
    )

    with pytest.raises(ProtocolError) as raised:
        ingest_batch(
            cloud,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id, authority_epoch=1, operations=[operation]
            ),
        )

    assert raised.value.code == "command_class_not_granted"
    quarantine = cloud.scalar(select(SyncQuarantine))
    assert quarantine.reason_code == "command_class_not_granted"
    assert cloud.scalar(select(func.count()).select_from(SyncInbox)) == 0


def test_schedule_commit_rebuilds_cloud_read_projection() -> None:
    cloud = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)
    now = datetime.now(timezone.utc)
    payload = {
        "proposalId": "proposal-1",
        "scheduleVersion": 5,
        "schedule": {"assignments": [{"matchId": "m1", "courtId": 1}]},
        "config": {"courtCount": 2},
        "historyEntry": {"version": 4, "trigger": "manual_edit"},
    }
    operation = OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=1,
        sequence=1,
        actor_id=uuid.uuid4(),
        command_type="meet.schedule.commit.v1",
        aggregate_type="tournament_schedule",
        aggregate_id=str(tournament_id),
        expected_version=4,
        payload=payload,
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=3,
    )

    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id, authority_epoch=1, operations=[operation]
        ),
    ) == (1, 1, 0)
    projection = cloud.get(CloudEventProjection, tournament_id)
    assert projection.data["schedule"]["scheduleVersion"] == 5
    assert projection.data["schedule"]["schedule"]["assignments"][0]["matchId"] == "m1"


def test_cloud_projection_rebuilds_from_checkpoint_and_accepted_operations() -> None:
    cloud = _session()
    local = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    _tournament(local, tournament_id)
    authority, capability, checkpoint = begin_checkout(
        cloud, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        cloud,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
    )

    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="record_bracket_result",
        aggregate_type="bracket_match",
        aggregate_id="MS/m1",
        expected_version=1,
        payload={"winnerSide": "B", "score": {"sets": [[21, 19]]}},
    )
    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match_state.update.v1",
        aggregate_type="match_state",
        aggregate_id="m1",
        expected_version=0,
        payload={"status": "playing", "courtId": 2},
    )
    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="meet.schedule.commit.v1",
        aggregate_type="tournament_schedule",
        aggregate_id=str(tournament_id),
        expected_version=3,
        payload={
            "scheduleVersion": 4,
            "schedule": {"assignments": [{"matchId": "m1", "courtId": 2}]},
        },
    )
    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="bracket.match_action.v1",
        aggregate_type="bracket_match",
        aggregate_id="MS/m1",
        expected_version=None,
        payload={
            "action": "start",
            "slot": 8,
            "actualStartSlot": 8,
            "actualEndSlot": None,
        },
    )
    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="bracket.assignment.v1",
        aggregate_type="bracket_match",
        aggregate_id="MS/m1",
        expected_version=None,
        payload={"action": "assign", "courtId": 2, "slotId": 8},
    )
    append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type="match_state.reset_all.v1",
        aggregate_type="match",
        aggregate_id=str(tournament_id),
        expected_version=None,
        payload={
            "clearedStateCount": 1,
            "affectedMatches": [
                {"matchId": "m1", "status": "scheduled", "version": 4}
            ],
        },
    )
    local.commit()
    operations = list(
        local.scalars(
            select(EventOperation)
            .where(EventOperation.tournament_id == tournament_id)
            .order_by(EventOperation.sequence)
        )
    )
    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=authority.epoch,
            operations=[operation_to_envelope(operation) for operation in operations],
        ),
    ) == (6, 6, 0)

    cloud.delete(cloud.get(CloudEventProjection, tournament_id))
    cloud.commit()
    rebuilt = rebuild_cloud_projection(
        cloud,
        checkpoint=checkpoint,
        checkpoint_hash=authority.checkpoint_hash,
        authority_epoch=authority.epoch,
    )

    assert rebuilt.last_sequence == 6
    assert rebuilt.data["checkpoint"]["checkpointHash"] == authority.checkpoint_hash
    assert rebuilt.data["bracketResults"]["MS/m1"]["winnerSide"] == "B"
    assert rebuilt.data["matchStates"]["m1"]["status"] == "scheduled"
    assert rebuilt.data["matchStates"]["m1"]["deleted"] is True
    assert rebuilt.data["schedule"]["scheduleVersion"] == 4
    assert rebuilt.data["bracketMatchActions"]["MS/m1"]["action"] == "start"
    assert rebuilt.data["bracketAssignments"]["MS/m1"]["courtId"] == 2


def test_cloud_projection_rebuild_rejects_an_unreceipted_operation() -> None:
    cloud = _session()
    local = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    _tournament(local, tournament_id)
    authority, capability, checkpoint = begin_checkout(
        cloud, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        cloud,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
    )
    operation = append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=uuid.uuid4(),
        command_type="record_bracket_result",
        aggregate_type="bracket_match",
        aggregate_id="MS/m1",
        expected_version=1,
        payload={"winnerSide": "A"},
    )
    local.commit()
    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=authority.epoch,
            operations=[operation_to_envelope(operation)],
        ),
    ) == (1, 1, 0)
    cloud.delete(cloud.get(SyncInbox, operation.operation_id))
    cloud.commit()

    with pytest.raises(ProtocolError, match="no matching cloud receipt"):
        rebuild_cloud_projection(
            cloud,
            checkpoint=checkpoint,
            checkpoint_hash=authority.checkpoint_hash,
            authority_epoch=authority.epoch,
        )


def test_bulk_match_state_operation_rebuilds_cloud_projection() -> None:
    cloud = _session()
    local = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    _tournament(local, tournament_id)
    capability = _active_checkout(cloud, tournament_id, node_id)
    authority = cloud.scalar(select(TournamentAuthority))
    operation = append_local_operation(
        local, tournament_id=tournament_id, node_id=node_id, actor_id=uuid.uuid4(),
        command_type="match_state.bulk_upsert.v1", aggregate_type="match",
        aggregate_id=str(tournament_id), expected_version=None,
        payload={"requestHash": "h", "updates": {"m1": {"status": "called"}},
                 "resultingVersions": {"m1": 3},
                 "affectedMatches": [{"matchId": "m1", "status": "called", "version": 3}]},
    )
    local.commit()
    ingest_batch(
        cloud, tournament_id=tournament_id, capability=capability,
        batch=SyncBatchRequest(node_id=node_id, authority_epoch=authority.epoch,
                               operations=[operation_to_envelope(operation)]),
    )
    cloud.delete(cloud.get(CloudEventProjection, tournament_id))
    cloud.commit()
    checkpoint = checkpoint_package(cloud.get(Tournament, tournament_id), schema_version=3, session=cloud)
    rebuilt = rebuild_cloud_projection(cloud, checkpoint=checkpoint,
                                       checkpoint_hash=authority.checkpoint_hash,
                                       authority_epoch=authority.epoch)
    assert rebuilt.data["matchStates"]["m1"]["status"] == "called"
    assert rebuilt.data["matchStates"]["m1"]["version"] == 3


def test_replace_match_state_operation_rebuilds_exact_snapshot() -> None:
    cloud = _session()
    local = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    _tournament(cloud, tournament_id)
    _tournament(local, tournament_id)
    authority, capability, checkpoint = begin_checkout(
        cloud, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        cloud,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
    )
    operation = append_local_operation(
        local,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=uuid.uuid4(),
        command_type="match_state.replace.v1",
        aggregate_type="match_state_snapshot",
        aggregate_id=str(tournament_id),
        expected_version=None,
        payload={
            "idempotencyKey": "replace-1",
            "sourceSchemaVersion": "1.0",
            "snapshotDigest": hashlib.sha256(
                json.dumps(
                    [{"matchId": "m1", "status": "called", "score": None}],
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest(),
            "snapshot": [
                {"matchId": "m1", "status": "called", "score": None},
            ],
            "resultingVersions": {"m1": 2},
            "response": {
                "message": "Tournament state imported successfully",
                "matchCount": 1,
                "lastUpdated": "2026-09-01T12:00:00Z",
            },
        },
    )
    local.commit()
    assert ingest_batch(
        cloud,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=authority.epoch,
            operations=[operation_to_envelope(operation)],
        ),
    ) == (1, 1, 0)
    cloud.delete(cloud.get(CloudEventProjection, tournament_id))
    cloud.commit()
    rebuilt = rebuild_cloud_projection(
        cloud,
        checkpoint=checkpoint,
        checkpoint_hash=authority.checkpoint_hash,
        authority_epoch=authority.epoch,
    )
    state = rebuilt.data["matchStates"]["m1"]
    assert state["status"] == "called"
    assert state["score"] is None
    assert state["version"] == 2
    assert state["operationId"] == str(operation.operation_id)
    assert state["sequence"] == 1
    assert state["acceptedAtNode"]
