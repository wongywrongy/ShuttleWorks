"""Durable event-node outbox drain process."""
from __future__ import annotations

import json
import logging
import random
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from core.config import settings
from core.telemetry.bootstrap import configure_telemetry
from core.telemetry.instruments import record_sync_retry, record_sync_upload
from db.models import EventOperation, SyncOutbox
from db.session import SessionLocal
from sync.schemas import SyncBatchRequest, SyncBatchResponse
from sync.service import operation_to_envelope


log = logging.getLogger("scheduler.sync")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _capability() -> str:
    if not settings.sync_authority_capability_file:
        raise RuntimeError("SYNC_AUTHORITY_CAPABILITY_FILE is required")
    value = Path(settings.sync_authority_capability_file).read_text().strip()
    if not value:
        raise RuntimeError("sync authority capability file is empty")
    return value


def _identity() -> tuple[uuid.UUID, uuid.UUID]:
    try:
        return uuid.UUID(settings.sync_tournament_id), uuid.UUID(settings.node_id)
    except ValueError as exc:
        raise RuntimeError("SYNC_TOURNAMENT_ID and SHUTTLEWORKS_NODE_ID must be UUIDs") from exc


def pending_batch(tournament_id: uuid.UUID, node_id: uuid.UUID) -> list[EventOperation]:
    with SessionLocal() as session:
        now = _utcnow()
        return list(
            session.scalars(
                select(EventOperation)
                .join(SyncOutbox, SyncOutbox.operation_id == EventOperation.operation_id)
                .where(
                    EventOperation.tournament_id == tournament_id,
                    EventOperation.node_id == node_id,
                    SyncOutbox.acknowledged_at.is_(None),
                    SyncOutbox.permanently_blocked_at.is_(None),
                    (SyncOutbox.next_attempt_at.is_(None))
                    | (SyncOutbox.next_attempt_at <= now),
                )
                .order_by(EventOperation.authority_epoch, EventOperation.sequence)
                .limit(settings.sync_batch_size)
            )
        )


def _post_batch(
    tournament_id: uuid.UUID,
    capability: str,
    operations: list[EventOperation],
) -> SyncBatchResponse:
    batch = SyncBatchRequest(
        node_id=operations[0].node_id,
        authority_epoch=operations[0].authority_epoch,
        operations=[operation_to_envelope(operation) for operation in operations],
    )
    url = (
        settings.sync_cloud_url.rstrip("/")
        + f"/sync/v1/tournaments/{tournament_id}/operations"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(batch.model_dump(mode="json")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {capability}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
        return SyncBatchResponse.model_validate_json(response.read())


def _mark_acknowledged(operations: list[EventOperation], highest: int) -> None:
    ids = [
        operation.operation_id
        for operation in operations
        if operation.sequence <= highest
    ]
    if not ids:
        return
    with SessionLocal() as session:
        rows = session.scalars(select(SyncOutbox).where(SyncOutbox.operation_id.in_(ids)))
        acknowledged_at = _utcnow()
        for row in rows:
            row.acknowledged_at = acknowledged_at
            row.last_error_code = None
        session.commit()


def _mark_failure(
    operations: list[EventOperation], code: str, *, permanent: bool
) -> None:
    ids = [operation.operation_id for operation in operations]
    with SessionLocal() as session:
        rows = list(
            session.scalars(select(SyncOutbox).where(SyncOutbox.operation_id.in_(ids)))
        )
        for row in rows:
            row.attempt_count += 1
            if permanent:
                row.next_attempt_at = None
                row.permanently_blocked_at = _utcnow()
            else:
                seconds = min(300.0, 2 ** min(row.attempt_count, 8))
                seconds *= random.uniform(0.75, 1.25)
                row.next_attempt_at = _utcnow() + timedelta(seconds=seconds)
            row.last_error_code = code[:80]
        session.commit()


def _mark_retry(operations: list[EventOperation], code: str) -> None:
    _mark_failure(operations, code, permanent=False)


def _mark_permanently_blocked(operations: list[EventOperation], code: str) -> None:
    """Retain permanent protocol failures for explicit operator action."""
    _mark_failure(operations, code, permanent=True)


def drain_once() -> int:
    if not settings.sync_cloud_url:
        return 0
    tournament_id, node_id = _identity()
    operations = pending_batch(tournament_id, node_id)
    if not operations:
        record_sync_upload("empty")
        return 0
    # An upload never crosses epochs.  Leave the newer rows for the next pass.
    epoch = operations[0].authority_epoch
    operations = [operation for operation in operations if operation.authority_epoch == epoch]
    try:
        response = _post_batch(tournament_id, _capability(), operations)
    except urllib.error.HTTPError as exc:
        code = f"http_{exc.code}"
        try:
            body = json.loads(exc.read())
            code = str(body.get("error", code))
        except (ValueError, OSError):
            pass
        retryable = exc.code in {408, 425, 429} or exc.code >= 500
        if retryable:
            _mark_retry(operations, code)
            record_sync_retry("http_error")
        else:
            _mark_permanently_blocked(operations, code)
        record_sync_upload("rejected")
        log.warning(
            "sync_batch_rejected code=%s retryable=%s count=%d",
            code,
            retryable,
            len(operations),
        )
        return 0
    except (OSError, urllib.error.URLError) as exc:
        _mark_retry(operations, "network_error")
        record_sync_retry("network_error")
        record_sync_upload("rejected")
        log.info("sync_network_unavailable type=%s", type(exc).__name__)
        return 0
    _mark_acknowledged(operations, response.highest_contiguous_sequence)
    if response.accepted:
        record_sync_upload("accepted")
    if response.duplicates:
        record_sync_upload("duplicate")
    log.info(
        "sync_batch_acknowledged accepted=%d duplicates=%d highest=%d",
        response.accepted,
        response.duplicates,
        response.highest_contiguous_sequence,
    )
    return response.accepted + response.duplicates


def main() -> None:
    logging.basicConfig(level=settings.log_level.upper())
    telemetry = configure_telemetry(settings, role="sync")
    log.info("sync_agent_started")
    try:
        while True:
            drain_once()
            time.sleep(max(0.25, settings.sync_poll_interval_seconds))
    except KeyboardInterrupt:
        log.info("sync_agent_stopped")
    finally:
        if telemetry is not None:
            telemetry.shutdown()


if __name__ == "__main__":
    main()
