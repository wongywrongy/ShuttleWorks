"""Sync-agent composition-root compatibility shim.

The HTTP sync surface is currently mounted by the API. This named entry point
keeps the eventual standalone sync-agent process explicit without creating a
second router assembly or changing current deployments.
"""

from __future__ import annotations

from fastapi import FastAPI

PROFILE = "sync"


def create_app() -> FastAPI:
    """Return the established API assembly that currently hosts sync routes."""

    from core.main import app

    return app


app = create_app()

__all__ = ["PROFILE", "app", "create_app"]
