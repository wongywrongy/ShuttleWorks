"""Explicit deployment composition roots.

The profile modules in this package are intentionally small during the
offline-first migration. They provide stable, named entry points for cloud
and event-node packaging while the existing ``core.main:app`` target remains
available to current deployments. Adapters and profile-specific services can
move behind these roots incrementally without a flag-driven universal startup
path.
"""

from __future__ import annotations

from enum import StrEnum


class DeploymentProfile(StrEnum):
    """Supported runtime composition profiles."""

    CLOUD = "cloud"
    EVENT_NODE = "event-node"


__all__ = ["DeploymentProfile"]
