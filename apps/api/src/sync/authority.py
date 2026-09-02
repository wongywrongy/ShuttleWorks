"""Authority, device enrollment, checkout, readiness, return and transfer API."""
from sync.service import (  # compatibility-owned implementations
    begin_checkout,
    enroll_device,
    mark_ready,
    planned_transfer,
    revoke_device,
    return_to_cloud,
    tournament_is_checked_out,
)

__all__ = [
    "begin_checkout",
    "enroll_device",
    "mark_ready",
    "planned_transfer",
    "revoke_device",
    "return_to_cloud",
    "tournament_is_checked_out",
]
