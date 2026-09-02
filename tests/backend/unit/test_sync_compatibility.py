"""Rolling protocol compatibility and competing-authority gates."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from db.models import (
    Base,
    EventOperation,
    SyncCheckpoint,
    SyncQuarantine,
    Tournament,
    TournamentAuthority,
)
from sync.compatibility import (
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    CURRENT_OPERATION_SCHEMA_VERSION,
    SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS,
    SUPPORTED_OPERATION_SCHEMA_VERSIONS,
    supports_checkpoint_schema,
    supports_operation_schema,
)
from sync.schemas import OperationEnvelope, SyncBatchRequest
from sync.service import ProtocolError, begin_checkout, ingest_batch, mark_ready
from sync.service import checkpoint_digest, import_checkpoint


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "tests/backend/fixtures/sync_compatibility"


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _authority(session: Session) -> tuple[uuid.UUID, uuid.UUID, str]:
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    session.add(Tournament(id=tournament_id, name="Compatibility proof", data={"version": 2}))
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
        checkpoint_hash=checkpoint["checkpointHash"] if "checkpointHash" in checkpoint else authority.checkpoint_hash,
    )
    return tournament_id, node_id, capability


def _operation(tournament_id: uuid.UUID, node_id: uuid.UUID, *, schema: int, epoch: int = 1) -> OperationEnvelope:
    now = datetime.now(timezone.utc)
    return OperationEnvelope(
        operation_id=uuid.uuid4(),
        event_id=tournament_id,
        node_id=node_id,
        authority_epoch=epoch,
        sequence=1,
        actor_id=uuid.uuid4(),
        command_type="match.record_result.v3",
        aggregate_type="bracket_match",
        aggregate_id="m1",
        payload={},
        occurred_at_local=now,
        accepted_at_node=now,
        schema_version=schema,
    )


def test_matrix_is_machine_readable_and_matches_runtime_policy() -> None:
    matrix = json.loads((ROOT / "docs/reference/compatibility-matrix.json").read_text())
    assert matrix["current"]["operationSchema"] == CURRENT_OPERATION_SCHEMA_VERSION
    assert matrix["current"]["checkpointSchema"] == CURRENT_CHECKPOINT_SCHEMA_VERSION
    assert tuple(matrix["supported"]["operationSchemas"]) == SUPPORTED_OPERATION_SCHEMA_VERSIONS
    assert tuple(matrix["supported"]["checkpointSchemas"]) == SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS
    assert matrix["policy"] == "current-plus-two"
    assert matrix["evidence"]["externalDeploymentProof"] is False
    assert matrix["evidence"]["binaryRollingReleaseProof"] is False
    assert [
        case["operationSchema"] for case in matrix["repositoryPolicyCases"]
    ] == [3, 2, 1]


@pytest.mark.parametrize("version", SUPPORTED_OPERATION_SCHEMA_VERSIONS)
def test_current_and_previous_operation_versions_are_supported(version: int) -> None:
    assert supports_operation_schema(version)


@pytest.mark.parametrize("version", SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS)
def test_current_and_previous_checkpoint_versions_are_supported(version: int) -> None:
    assert supports_checkpoint_schema(version)


@pytest.mark.parametrize("version", SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS)
def test_checkout_emits_each_supported_checkpoint_version(version: int) -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    session.add(Tournament(id=tournament_id, name="Checkpoint version proof", data={"version": 2}))
    session.commit()
    authority, _capability, checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=uuid.uuid4(), schema_version=version
    )
    assert authority.checkpoint_schema_version == version
    assert checkpoint["checkpointSchemaVersion"] == version


@pytest.mark.parametrize("version", SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS)
def test_archived_checkpoint_fixture_imports_without_partial_state(version: int) -> None:
    checkpoint = json.loads(
        (FIXTURES / "checkpoints" / f"checkpoint-v{version}.json").read_text()
    )
    target = _session()
    authority = import_checkpoint(
        target,
        checkpoint=checkpoint,
        node_id=uuid.uuid4(),
        authority_epoch=1,
        capability="archived-fixture-capability-" + "x" * 32,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    assert authority.checkpoint_schema_version == version
    assert target.get(Tournament, uuid.UUID(checkpoint["tournamentId"])) is not None


def test_archived_operation_fixtures_roll_forward_and_replay_across_adjacent_versions() -> None:
    session = _session()
    tournament_id = uuid.UUID("00000000-0000-4000-8000-000000000001")
    node_id = uuid.UUID("00000000-0000-4000-8000-000000000002")
    session.add(Tournament(id=tournament_id, name="Rolling operation proof", data={"version": 2}))
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
    envelopes = []
    for sequence, version in enumerate((3, 2, 1), start=1):
        raw = json.loads(
            (FIXTURES / "operations" / f"operation-v{version}.json").read_text()
        )
        raw.update(
            {
                "event_id": str(tournament_id),
                "node_id": str(node_id),
                "sequence": sequence,
            }
        )
        envelopes.append(OperationEnvelope(**raw))
    for envelope in envelopes:
        assert ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id,
                authority_epoch=1,
                operations=[envelope],
            ),
        )[1:] == (1, 0)
    # At-least-once replay of an older adjacent-version operation is a
    # duplicate, not a stale-version failure or a second write.
    assert ingest_batch(
        session,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=1,
            operations=[envelopes[1]],
        ),
    ) == (3, 0, 1)


@pytest.mark.parametrize("version", SUPPORTED_OPERATION_SCHEMA_VERSIONS)
def test_ingest_accepts_each_supported_operation_version(version: int) -> None:
    session = _session()
    tournament_id, node_id, capability = _authority(session)
    assert ingest_batch(
        session,
        tournament_id=tournament_id,
        capability=capability,
        batch=SyncBatchRequest(
            node_id=node_id,
            authority_epoch=1,
            operations=[_operation(tournament_id, node_id, schema=version)],
        ),
    ) == (1, 1, 0)


@pytest.mark.parametrize("version", (0, 4, 99, True, "3"))
def test_unknown_operation_versions_are_not_supported(version: object) -> None:
    assert not supports_operation_schema(version)


@pytest.mark.parametrize("version", (0, 4, 99, True, "3"))
def test_unknown_checkpoint_versions_are_not_supported(version: object) -> None:
    assert not supports_checkpoint_schema(version)


def test_unsupported_checkpoint_version_is_rejected_before_checkout() -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    session.add(Tournament(id=tournament_id, name="Unsupported checkpoint", data={"version": 2}))
    session.commit()
    with pytest.raises(ProtocolError) as raised:
        begin_checkout(
            session,
            tournament_id=tournament_id,
            node_id=uuid.uuid4(),
            schema_version=4,
        )
    assert raised.value.code == "unsupported_checkpoint_schema"
    assert session.scalar(select(TournamentAuthority)) is None


def test_unsupported_operation_version_is_quarantined_before_application() -> None:
    session = _session()
    tournament_id, node_id, capability = _authority(session)
    with pytest.raises(ProtocolError, match="incompatible") as raised:
        ingest_batch(
            session,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=node_id,
                authority_epoch=1,
                operations=[_operation(tournament_id, node_id, schema=4)],
            ),
        )
    assert raised.value.code == "unsupported_operation_schema"
    assert session.scalar(select(SyncQuarantine)) is not None
    assert session.scalar(select(EventOperation)) is None
    checkpoint = session.scalar(select(SyncCheckpoint))
    assert checkpoint is not None
    assert checkpoint.highest_contiguous_sequence == 0


def test_competing_checkout_is_rejected_and_stale_epoch_cannot_sync() -> None:
    session = _session()
    tournament_id = uuid.uuid4()
    first_node = uuid.uuid4()
    second_node = uuid.uuid4()
    session.add(Tournament(id=tournament_id, name="Authority proof", data={"version": 2}))
    session.commit()
    authority, capability, checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=first_node
    )
    with pytest.raises(ProtocolError, match="already has") as raised:
        begin_checkout(session, tournament_id=tournament_id, node_id=second_node)
    assert raised.value.code == "authority_already_granted"
    mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=first_node,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=checkpoint["checkpointHash"] if "checkpointHash" in checkpoint else authority.checkpoint_hash,
    )
    stale = SyncBatchRequest(
        node_id=second_node,
        authority_epoch=authority.epoch + 1,
        operations=[_operation(tournament_id, second_node, schema=3, epoch=authority.epoch + 1)],
    )
    with pytest.raises(ProtocolError) as stale_error:
        ingest_batch(session, tournament_id=tournament_id, capability=capability, batch=stale)
    assert stale_error.value.code == "wrong_authority_epoch"
    assert session.scalar(select(TournamentAuthority).where(TournamentAuthority.node_id == first_node)).state == "active"
