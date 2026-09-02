"""Cloud composition-root compatibility entry point.

This is a transition shim: the cloud profile currently shares the mature
application assembly in ``core.main``. Keeping the name explicit means new
cloud-only adapters can be registered here without changing the legacy
``uvicorn core.main:app`` deployment target.
"""

from __future__ import annotations

from fastapi import FastAPI

from core.composition import DeploymentProfile

PROFILE = DeploymentProfile.CLOUD


def create_app() -> FastAPI:
    """Return the current cloud application assembly.

    Importing lazily preserves the existing module initialization order and
    keeps this shim free of a second router registration path.
    """

    from core.main import app

    return app


app = create_app()

__all__ = ["PROFILE", "app", "create_app"]
