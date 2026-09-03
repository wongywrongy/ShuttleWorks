"""Quarantine listing and acknowledged-correction reconciliation."""
from __future__ import annotations

import uuid

from db.models import (
    CloudEventProjection,
    EventOperation,
    SyncCheckpoint,
    SyncInbox,
    SyncOutbox,
    SyncQuarantine,
    TournamentAuthority,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sync.errors import ProtocolError
from sync.service import capability_matches, utcnow


def list_quarantines(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    include_resolved: bool = False,
) -> list[SyncQuarantine]:
    query = select(SyncQuarantine).where(SyncQuarantine.tournament_id == tournament_id)
    if not include_resolved:
        query = query.where(SyncQuarantine.status == "open")
    return list(session.scalars(query.order_by(SyncQuarantine.created_at, SyncQuarantine.id)))


def list_correction_candidates(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    quarantine_id: uuid.UUID,
) -> list[EventOperation]:
    """Return acknowledged same-epoch operations; resolution revalidates."""
    quarantine = session.get(SyncQuarantine, quarantine_id)
    if quarantine is None or quarantine.tournament_id != tournament_id:
        raise ProtocolError(404, "quarantine_not_found", "Quarantine record does not exist")
    if quarantine.authority_epoch is None:
        return []
    checkpoint = session.get(
        SyncCheckpoint, (tournament_id, quarantine.authority_epoch)
    )
    if checkpoint is None:
        return []
    return list(
        session.scalars(
            select(EventOperation)
            .join(SyncInbox, SyncInbox.operation_id == EventOperation.operation_id)
            .where(
                EventOperation.tournament_id == tournament_id,
                SyncInbox.tournament_id == tournament_id,
                EventOperation.authority_epoch == quarantine.authority_epoch,
                SyncInbox.authority_epoch == quarantine.authority_epoch,
                EventOperation.sequence == SyncInbox.sequence,
                EventOperation.sequence <= checkpoint.highest_contiguous_sequence,
            )
            .order_by(EventOperation.sequence.desc(), EventOperation.operation_id)
            .limit(100)
        )
    )


def resolve_quarantine(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    quarantine_id: uuid.UUID,
    actor_id: uuid.UUID,
    reason: str,
    correction_operation_id: uuid.UUID,
) -> SyncQuarantine:
    """Link immutable evidence to an accepted authoritative correction."""
    quarantine = session.get(SyncQuarantine, quarantine_id)
    if quarantine is None or quarantine.tournament_id != tournament_id:
        raise ProtocolError(404, "quarantine_not_found", "Quarantine record does not exist")
    if quarantine.status == "resolved":
        if quarantine.resolution_operation_id != correction_operation_id:
            raise ProtocolError(
                409,
                "quarantine_already_resolved",
                "Quarantine is linked to another correction",
            )
        return quarantine
    if not reason.strip():
        raise ProtocolError(422, "correction_required", "A reconciliation reason is required")
    operation = session.get(EventOperation, correction_operation_id)
    receipt = session.get(SyncInbox, correction_operation_id)
    if (
        operation is None
        or receipt is None
        or operation.tournament_id != tournament_id
        or receipt.tournament_id != tournament_id
        or operation.authority_epoch != quarantine.authority_epoch
        or receipt.authority_epoch != quarantine.authority_epoch
        or operation.sequence != receipt.sequence
    ):
        raise ProtocolError(
            409,
            "correction_not_acknowledged",
            "Correction must be an accepted operation from the quarantined authority epoch",
        )
    checkpoint = session.get(
        SyncCheckpoint, (tournament_id, operation.authority_epoch)
    )
    if checkpoint is None or checkpoint.highest_contiguous_sequence < operation.sequence:
        raise ProtocolError(
            409,
            "correction_not_acknowledged",
            "Cloud has not acknowledged the correction",
        )
    quarantine.status = "resolved"
    quarantine.resolved_at = utcnow()
    quarantine.resolved_by = actor_id
    quarantine.resolution_operation_id = operation.operation_id
    quarantine.resolution_note = reason.strip()
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    return quarantine


def latest_authority_status(session: Session, tournament_id: uuid.UUID):
    authority = session.scalar(
        select(TournamentAuthority)
        .where(TournamentAuthority.tournament_id == tournament_id)
        .order_by(TournamentAuthority.epoch.desc())
    )
    if authority is None:
        raise ProtocolError(404, "authority_not_found", "No authority epoch exists")
    checkpoint = session.get(SyncCheckpoint, (tournament_id, authority.epoch))
    pending, oldest = session.execute(
        select(func.count(), func.min(SyncOutbox.created_at))
        .select_from(SyncOutbox)
        .join(EventOperation, EventOperation.operation_id == SyncOutbox.operation_id)
        .where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority.epoch,
            SyncOutbox.acknowledged_at.is_(None),
            SyncOutbox.permanently_blocked_at.is_(None),
        )
    ).one()
    blocked = session.scalar(
        select(func.count())
        .select_from(SyncOutbox)
        .join(EventOperation, EventOperation.operation_id == SyncOutbox.operation_id)
        .where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority.epoch,
            SyncOutbox.acknowledged_at.is_(None),
            SyncOutbox.permanently_blocked_at.is_not(None),
        )
    )
    blocked_error = session.scalar(
        select(SyncOutbox.last_error_code)
        .join(EventOperation, EventOperation.operation_id == SyncOutbox.operation_id)
        .where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority.epoch,
            SyncOutbox.permanently_blocked_at.is_not(None),
        )
        .order_by(SyncOutbox.permanently_blocked_at.desc())
        .limit(1)
    )
    return (
        authority,
        checkpoint.highest_contiguous_sequence if checkpoint else 0,
        int(pending or 0),
        oldest,
        int(blocked or 0),
        blocked_error,
    )


def projection(session: Session, tournament_id: uuid.UUID):
    return session.get(CloudEventProjection, tournament_id)


def sync_status(session: Session, tournament_id, authority_epoch, capability):
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None or not capability_matches(authority, capability):
        raise ProtocolError(
            403, "invalid_authority_capability", "Node capability is invalid"
        )
    checkpoint = session.get(SyncCheckpoint, (tournament_id, authority_epoch))
    quarantines = session.scalar(
        select(func.count()).select_from(SyncQuarantine).where(
            SyncQuarantine.tournament_id == tournament_id,
            SyncQuarantine.authority_epoch == authority_epoch,
        )
    )
    return (
        checkpoint.highest_contiguous_sequence if checkpoint else 0,
        int(quarantines or 0),
    )


__all__ = [
    "latest_authority_status",
    "list_correction_candidates",
    "list_quarantines",
    "projection",
    "resolve_quarantine",
    "sync_status",
]
