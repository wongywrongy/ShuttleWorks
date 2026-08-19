"""Shared filesystem helpers.

After Step 3 the data directory is resolved from
``app.config.settings.data_dir``; ``BACKEND_DATA_DIR`` is honoured as a
legacy alias by ``Settings`` itself via the field's env alias (case-
insensitive name match) so existing dockerfiles / make targets keep
working.
"""
from __future__ import annotations

from pathlib import Path

from app.config import settings


def data_dir() -> Path:
    """Return the configured data directory as a ``Path``."""
    return Path(settings.data_dir)


def ensure_data_dir() -> Path:
    """Make sure the data directory exists and return its path."""
    d = data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d
