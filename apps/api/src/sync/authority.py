"""Authority, device enrollment, checkout, readiness, return and transfer API."""
from sync.service import (  # compatibility-owned implementations
    begin_checkout,
    enroll_device,
    mark_ready,
    planned_transfer,
    revoke_device,
    return_to_cloud,
)
import uuid

from sqlalchemy.orm import Session

from sync.service import _active_authority


def tournament_is_checked_out(session: Session, tournament_id: uuid.UUID) -> bool:
    """Return whether checkout has frozen cloud-side tournament writes."""
    return _active_authority(session, tournament_id) is not None

__all__ = [
    "begin_checkout",
    "enroll_device",
    "mark_ready",
    "planned_transfer",
    "revoke_device",
    "return_to_cloud",
    "tournament_is_checked_out",
]
