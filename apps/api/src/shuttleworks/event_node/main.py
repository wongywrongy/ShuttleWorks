"""Event-node API composition-root compatibility shim."""

from __future__ import annotations

from fastapi import FastAPI

from core.composition import DeploymentProfile

PROFILE = DeploymentProfile.EVENT_NODE


def create_app() -> FastAPI:
    """Return the established app while node adapters are being split out."""

    from core.main import app

    return app


app = create_app()

__all__ = ["PROFILE", "app", "create_app"]
