"""Shared filesystem helpers for the backend API routes.

Both ``match_state.py`` and ``tournament_state.py`` need the same
``data_dir()`` lookup (env-var honored, default ``/app/data``) and
the ``ensure_data_dir()`` mkdir; centralising them here removes a
small but exact duplication.
"""
from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    """Resolve the data directory. ``BACKEND_DATA_DIR`` overrides the
    container default of ``/app/data``."""
    return Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))


def ensure_data_dir() -> Path:
    """Make sure the data directory exists and return its path."""
    d = data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d
