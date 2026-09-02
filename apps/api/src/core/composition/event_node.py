"""Event-node composition-root compatibility entry point.

The event-node-specific SQLite, sync, backup, and local Collector adapters are
introduced behind this named root as their vertical slices land. Until then it
delegates to the established app assembly, preserving current routes and
startup behavior while making the deployment boundary explicit.
"""

from __future__ import annotations

from fastapi import FastAPI

from core.composition import DeploymentProfile

PROFILE = DeploymentProfile.EVENT_NODE


def create_app() -> FastAPI:
    """Return the current event-node application assembly."""

    from core.main import app

    return app


app = create_app()

__all__ = ["PROFILE", "app", "create_app"]
