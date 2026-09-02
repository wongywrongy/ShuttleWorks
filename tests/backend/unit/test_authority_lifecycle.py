"""Audited authority return, transfer, and lost-node recovery invariants."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from db.models import (
    AuthorityTransition,
    Base,
    EventOperation,
    SyncCheckpoint,
    SyncInbox,
    Tournament,
    TournamentAuthority,
)
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sync.service import (
    ProtocolError,
    begin_checkout,
    checkpoint_package,
    cloud_projection_digest,
    mark_ready,
    planned_transfer,
    recover_lost_node,
    return_to_cloud,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _ready(session: Session, tournament_id: uuid.UUID, node_id: uuid.UUID):
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
    return authority, capability


def _tournament(session: Session) -> uuid.UUID:
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Lifecycle proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    return tournament_id


def _evidence() -> dict[str, object]:
    return {
        "actor_id": uuid.uuid4(),
        "device_id": uuid.uuid4(),
        "reason": "End of event",
        "declared_last_sequence": 0,
        "snapshot_hash": "a" * 64,
        "confirmation": True,
    }


def _recovery_checkpoint(
    session: Session,
    tournament_id: uuid.UUID,
    *,
    authority_epoch: int,
    backup_sequence: int,
    backup_hash: str,
    cloud_sequence: int,
    replayed_operation_ids: list[str],
) -> dict[str, object]:
    checkpoint = checkpoint_package(
        session.get(Tournament, tournament_id), schema_version=3, session=session
    )
    checkpoint["recovery"] = {
        "sourceAuthorityEpoch": authority_epoch,
        "backupSequence": backup_sequence,
        "backupHash": backup_hash,
        "cloudSequence": cloud_sequence,
        "replayedOperationIds": replayed_operation_ids,
    }
    return checkpoint


def _receipt(
    session: Session,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    sequence: int,
) -> uuid.UUID:
    operation_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    session.add(
        EventOperation(
            operation_id=operation_id,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority_epoch,
            sequence=sequence,
            actor_id=uuid.uuid4(),
            command_type="match.record_result.v3",
            aggregate_type="bracket_match",
            aggregate_id=f"m{sequence}",
            expected_version=None,
            payload={"winnerSide": "A"},
            occurred_at_local=now,
            accepted_at_node=now,
            schema_version=3,
        )
    )
    session.add(
        SyncInbox(
            operation_id=operation_id,
            tournament_id=tournament_id,
            authority_epoch=authority_epoch,
            sequence=sequence,
        )
    )
    checkpoint = session.get(SyncCheckpoint, (tournament_id, authority_epoch))
    if checkpoint is None:
        checkpoint = SyncCheckpoint(
            tournament_id=tournament_id,
            authority_epoch=authority_epoch,
            highest_contiguous_sequence=sequence,
        )
        session.add(checkpoint)
    else:
        checkpoint.highest_contiguous_sequence = sequence
    session.commit()
    return operation_id


def test_return_closes_node_and_creates_audited_cloud_epoch() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)
    evidence = _evidence()
    evidence["snapshot_hash"] = cloud_projection_digest(
        session, tournament_id=tournament_id, authority_epoch=authority.epoch
    )

    previous, cloud = return_to_cloud(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        **evidence,
    )

    assert previous.state == "closed"
    assert cloud.state == "cloud"
    assert cloud.epoch == authority.epoch + 1
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "return_to_cloud"
    assert transition.from_epoch == authority.epoch
    assert transition.to_epoch == cloud.epoch
    assert transition.reason == "End of event"


def test_return_rejects_projection_hash_mismatch_without_closing_authority() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)

    with pytest.raises(ProtocolError) as raised:
        return_to_cloud(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            **_evidence(),
        )

    assert raised.value.code == "snapshot_hash_mismatch"
    assert session.get(TournamentAuthority, (tournament_id, authority.epoch)).state == "active"
    assert session.scalar(select(AuthorityTransition)) is None


def test_planned_transfer_relinquishes_old_node_and_prepares_new_epoch() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    new_node = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, old_node)

    previous, replacement, replacement_capability = planned_transfer(
        session,
        tournament_id=tournament_id,
        node_id=old_node,
        new_node_id=new_node,
        authority_epoch=authority.epoch,
        capability=capability,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Move to the backup laptop",
        declared_last_sequence=0,
        handoff_hash="b" * 64,
        confirmation=True,
    )

    assert previous.state == "closed"
    assert replacement.state == "preparing"
    assert replacement.node_id == new_node
    assert replacement_capability
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "planned_transfer"
    assert session.scalar(
        select(TournamentAuthority).where(
            TournamentAuthority.state == "active",
            TournamentAuthority.epoch == replacement.epoch,
        )
    ) is None


def test_lost_node_recovery_binds_exact_checkpoint_and_records_replay_evidence() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    authority, _capability = _ready(session, tournament_id, old_node)
    replacement_node = uuid.uuid4()

    backup_hash = "c" * 64
    checkpoint = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=0,
        backup_hash=backup_hash,
        cloud_sequence=0,
        replayed_operation_ids=[],
    )
    previous, replacement, _ = recover_lost_node(
        session,
        tournament_id=tournament_id,
        new_node_id=replacement_node,
        authority_epoch=authority.epoch,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Director laptop destroyed",
        backup_sequence=0,
        declared_last_sequence=0,
        backup_hash=backup_hash,
        recovery_checkpoint=checkpoint,
        confirmation=True,
    )

    assert previous.state == "recovered"
    assert replacement.state == "preparing"
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "lost_node_recovery"
    assert transition.declared_last_sequence == 0
    assert transition.detail["possiblyMissingOperations"] is False
    assert transition.detail["replayedOperationIds"] == []


def test_stale_backup_requires_exact_cloud_receipt_replay() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    authority, _ = _ready(session, tournament_id, old_node)
    operation_id = _receipt(session, tournament_id, old_node, authority.epoch, 1)
    backup_hash = "d" * 64
    incomplete = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=0,
        backup_hash=backup_hash,
        cloud_sequence=1,
        replayed_operation_ids=[],
    )
    with pytest.raises(ProtocolError) as raised:
        recover_lost_node(
            session,
            tournament_id=tournament_id,
            new_node_id=uuid.uuid4(),
            authority_epoch=authority.epoch,
            actor_id=uuid.uuid4(),
            device_id=uuid.uuid4(),
            reason="Recover stale backup",
            backup_sequence=0,
            declared_last_sequence=1,
            backup_hash=backup_hash,
            recovery_checkpoint=incomplete,
            confirmation=True,
        )
    assert raised.value.code == "recovery_evidence_mismatch"

    complete = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=0,
        backup_hash=backup_hash,
        cloud_sequence=1,
        replayed_operation_ids=[str(operation_id)],
    )
    previous, replacement, _ = recover_lost_node(
        session,
        tournament_id=tournament_id,
        new_node_id=uuid.uuid4(),
        authority_epoch=authority.epoch,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Recover stale backup after replay",
        backup_sequence=0,
        declared_last_sequence=1,
        backup_hash=backup_hash,
        recovery_checkpoint=complete,
        confirmation=True,
    )
    assert previous.state == "recovered"
    assert replacement.checkpoint_hash


@pytest.mark.parametrize(
    ("backup_sequence", "declared_sequence", "expected_code"),
    [(2, 1, "backup_ahead_unverifiable"), (0, 2, "node_ahead_unverifiable")],
)
def test_recovery_rejects_cloud_or_node_ahead_evidence(
    backup_sequence: int, declared_sequence: int, expected_code: str
) -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    authority, _ = _ready(session, tournament_id, old_node)
    _receipt(session, tournament_id, old_node, authority.epoch, 1)
    checkpoint = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=backup_sequence,
        backup_hash="e" * 64,
        cloud_sequence=1,
        replayed_operation_ids=[],
    )
    with pytest.raises(ProtocolError) as raised:
        recover_lost_node(
            session,
            tournament_id=tournament_id,
            new_node_id=uuid.uuid4(),
            authority_epoch=authority.epoch,
            actor_id=uuid.uuid4(),
            device_id=uuid.uuid4(),
            reason="Unverifiable recovery",
            backup_sequence=backup_sequence,
            declared_last_sequence=declared_sequence,
            backup_hash="e" * 64,
            recovery_checkpoint=checkpoint,
            confirmation=True,
        )
    assert raised.value.code == expected_code


def test_recovery_rejects_missing_receipts_corruption_and_repeat() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    authority, _ = _ready(session, tournament_id, old_node)
    session.add(
        SyncCheckpoint(
            tournament_id=tournament_id,
            authority_epoch=authority.epoch,
            highest_contiguous_sequence=1,
        )
    )
    session.commit()
    checkpoint = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=0,
        backup_hash="f" * 64,
        cloud_sequence=1,
        replayed_operation_ids=[],
    )
    with pytest.raises(ProtocolError) as raised:
        recover_lost_node(
            session,
            tournament_id=tournament_id,
            new_node_id=uuid.uuid4(),
            authority_epoch=authority.epoch,
            actor_id=uuid.uuid4(),
            device_id=uuid.uuid4(),
            reason="Missing operation",
            backup_sequence=0,
            declared_last_sequence=1,
            backup_hash="f" * 64,
            recovery_checkpoint=checkpoint,
            confirmation=True,
        )
    assert raised.value.code == "recovery_operations_missing"

    # Restore a valid zero-cursor recovery, then prove the same source epoch
    # cannot be recovered twice under a second capability.
    session.get(SyncCheckpoint, (tournament_id, authority.epoch)).highest_contiguous_sequence = 0
    valid = _recovery_checkpoint(
        session,
        tournament_id,
        authority_epoch=authority.epoch,
        backup_sequence=0,
        backup_hash="a" * 64,
        cloud_sequence=0,
        replayed_operation_ids=[],
    )
    kwargs = dict(
        tournament_id=tournament_id,
        new_node_id=uuid.uuid4(),
        authority_epoch=authority.epoch,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Valid recovery",
        backup_sequence=0,
        declared_last_sequence=0,
        backup_hash="a" * 64,
        recovery_checkpoint=valid,
        confirmation=True,
    )
    recover_lost_node(session, **kwargs)
    with pytest.raises(ProtocolError) as repeated:
        recover_lost_node(session, **kwargs)
    assert repeated.value.code == "recovery_already_completed"


def test_privileged_transitions_require_confirmation_and_active_capability() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)
    evidence = _evidence()
    evidence["confirmation"] = False

    with pytest.raises(Exception) as raised:
        return_to_cloud(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            **evidence,
        )
    assert raised.value.code == "confirmation_required"

    # No transition was persisted by the rejected request.
    assert session.scalar(select(AuthorityTransition)) is None
