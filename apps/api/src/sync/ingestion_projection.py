"""Cloud ordered-ingestion and disposable-projection API."""
from db.models import CloudEventProjection
from sqlalchemy.orm import Session

from sync.schemas import OperationEnvelope
from sync.service import (
    _apply_cloud_projection_data,
    ingest_batch,
    rebuild_cloud_projection,
    utcnow,
)


def apply_cloud_projection(session: Session, operation: OperationEnvelope) -> None:
    """Update disposable projection state from one accepted operation."""
    projection = session.get(CloudEventProjection, operation.event_id)
    if projection is None or projection.authority_epoch != operation.authority_epoch:
        projection = CloudEventProjection(
            tournament_id=operation.event_id,
            authority_epoch=operation.authority_epoch,
            last_sequence=0,
            data={"bracketResults": {}, "matchStates": {}},
        )
        session.add(projection)
    data = dict(projection.data or {})
    _apply_cloud_projection_data(data, operation)
    projection.data = data
    projection.last_sequence = operation.sequence
    projection.updated_at = utcnow()

__all__ = ["apply_cloud_projection", "ingest_batch", "rebuild_cloud_projection"]
