"""Lost-node recovery boundary."""
from __future__ import annotations

import uuid
from typing import Any

from db.models import AuthorityTransition, EventOperation, SyncInbox, TournamentAuthority
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.telemetry.instruments import record_authority_rejection
from sync.errors import ProtocolError
from sync.service import (
    _active_authority,
    _append_transition,
    _cloud_cursor,
    _next_epoch,
    _preparing_epoch,
    _require_transition_evidence,
    _validate_checkpoint,
    checkpoint_digest,
    utcnow,
)


def recover_lost_node(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    new_node_id: uuid.UUID,
    authority_epoch: int,
    actor_id: uuid.UUID,
    device_id: uuid.UUID,
    reason: str,
    backup_sequence: int,
    declared_last_sequence: int,
    backup_hash: str,
    recovery_checkpoint: dict[str, Any],
    confirmation: bool,
) -> tuple[TournamentAuthority, TournamentAuthority, str]:
    """Prepare a replacement from an exact, replay-complete checkpoint."""
    reason = _require_transition_evidence(
        reason=reason, confirmation=confirmation, evidence_hash=backup_hash
    )
    prior = session.scalar(
        select(AuthorityTransition)
        .where(
            AuthorityTransition.tournament_id == tournament_id,
            AuthorityTransition.transition_type == "lost_node_recovery",
            AuthorityTransition.from_epoch == authority_epoch,
        )
        .order_by(AuthorityTransition.created_at.desc())
    )
    if prior is not None:
        raise ProtocolError(
            409,
            "recovery_already_completed",
            "This authority epoch has already been recovered",
            replacement_authority_epoch=prior.to_epoch,
        )
    authority = _active_authority(session, tournament_id)
    if authority is None:
        record_authority_rejection("no_active_authority")
        raise ProtocolError(
            409, "no_active_authority", "No active node authority can be recovered"
        )
    if authority.epoch != authority_epoch:
        record_authority_rejection("wrong_authority_epoch")
        raise ProtocolError(
            409,
            "wrong_authority_epoch",
            "Recovery evidence does not match the active authority epoch",
            active_authority_epoch=authority.epoch,
        )
    if authority.node_id == new_node_id:
        record_authority_rejection("same_node")
        raise ProtocolError(
            409, "same_authority_node", "Recovery requires a replacement node"
        )
    cloud_sequence = _cloud_cursor(session, tournament_id, authority.epoch)
    if declared_last_sequence > cloud_sequence:
        record_authority_rejection("node_ahead_unverifiable")
        raise ProtocolError(
            409,
            "node_ahead_unverifiable",
            "The lost node claimed operations that cloud has not receipted",
            declared_last_sequence=declared_last_sequence,
            highest_contiguous_sequence=cloud_sequence,
        )
    if declared_last_sequence < cloud_sequence:
        record_authority_rejection("recovery_incomplete")
        raise ProtocolError(
            409,
            "recovery_incomplete",
            "Recovery checkpoint does not include every cloud-receipted operation",
            declared_last_sequence=declared_last_sequence,
            highest_contiguous_sequence=cloud_sequence,
        )
    if backup_sequence > cloud_sequence:
        record_authority_rejection("backup_ahead_unverifiable")
        raise ProtocolError(
            409,
            "backup_ahead_unverifiable",
            "Backup contains operations that cloud cannot verify",
            backup_sequence=backup_sequence,
            highest_contiguous_sequence=cloud_sequence,
        )
    checkpoint_tournament_id = _validate_checkpoint(recovery_checkpoint, None)
    if checkpoint_tournament_id != tournament_id:
        raise ProtocolError(
            409,
            "recovery_tournament_mismatch",
            "Recovery checkpoint belongs to another tournament",
        )
    manifest = recovery_checkpoint.get("recovery")
    if not isinstance(manifest, dict):
        raise ProtocolError(
            409,
            "recovery_evidence_missing",
            "Recovery checkpoint has no recovery manifest",
        )
    expected_operations = list(
        session.scalars(
            select(EventOperation)
            .join(SyncInbox, SyncInbox.operation_id == EventOperation.operation_id)
            .where(
                EventOperation.tournament_id == tournament_id,
                EventOperation.authority_epoch == authority_epoch,
                EventOperation.sequence > backup_sequence,
                EventOperation.sequence <= cloud_sequence,
            )
            .order_by(EventOperation.sequence)
        )
    )
    expected_ids = [str(operation.operation_id) for operation in expected_operations]
    expected_manifest = {
        "sourceAuthorityEpoch": authority_epoch,
        "backupSequence": backup_sequence,
        "backupHash": backup_hash,
        "cloudSequence": cloud_sequence,
        "replayedOperationIds": expected_ids,
    }
    if manifest != expected_manifest:
        record_authority_rejection("recovery_evidence_mismatch")
        raise ProtocolError(
            409,
            "recovery_evidence_mismatch",
            "Recovery manifest does not match the exact receipted operation suffix",
            expected_replayed_operation_ids=expected_ids,
        )
    if len(expected_operations) != cloud_sequence - backup_sequence:
        record_authority_rejection("recovery_operations_missing")
        raise ProtocolError(
            409,
            "recovery_operations_missing",
            "Cloud does not retain every operation required to rebuild this backup",
        )
    recovery_hash = checkpoint_digest(recovery_checkpoint)
    authority.state = "recovered"
    authority.closed_at = utcnow()
    authority.recovery_reason = reason
    epoch = _next_epoch(session, tournament_id)
    replacement, replacement_capability = _preparing_epoch(
        session,
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=new_node_id,
        checkpoint_hash=recovery_hash,
    )
    _append_transition(
        session,
        tournament_id=tournament_id,
        transition_type="lost_node_recovery",
        from_epoch=authority.epoch,
        to_epoch=replacement.epoch,
        actor_id=actor_id,
        device_id=device_id,
        reason=reason,
        declared_last_sequence=declared_last_sequence,
        evidence_hash=recovery_hash,
        detail={
            "lostNodeId": str(authority.node_id),
            "replacementNodeId": str(new_node_id),
            "sourceAuthorityEpoch": authority_epoch,
            "backupSequence": backup_sequence,
            "backupHash": backup_hash,
            "recoveryCheckpointHash": recovery_hash,
            "cloudHighestContiguousSequence": cloud_sequence,
            "replayedOperationIds": expected_ids,
            "possiblyMissingOperations": False,
        },
    )
    session.commit()
    return authority, replacement, replacement_capability

__all__ = ["recover_lost_node"]
