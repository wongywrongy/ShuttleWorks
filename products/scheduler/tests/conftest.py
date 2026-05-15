"""Shared pytest setup for the backend test suite.

Pytest's rootdir is ``products/scheduler/``. The FastAPI app and its
adapter / api / services packages live under ``products/scheduler/backend/``;
we insert that directory at the front of ``sys.path`` at conftest load
time so every test can do ``from app.X import Y`` and friends without
local sys.path manipulation. We also add ``tests/`` to ``sys.path`` so
test modules can ``from _helpers import isolate_test_database``.

``scheduler_core`` is installed as a regular package via its own
``pyproject.toml`` and reaches every test through site-packages.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


_TESTS_DIR = Path(__file__).resolve().parent
_PRODUCT_ROOT = _TESTS_DIR.parent
_BACKEND_ROOT = str(_PRODUCT_ROOT / "backend")

for entry in (str(_TESTS_DIR), _BACKEND_ROOT):
    if entry not in sys.path:
        sys.path.insert(0, entry)


# Re-export from _helpers so existing callers keep working.
from _helpers import isolate_test_database, purge_backend_modules  # noqa: E402


def reset_backend_test_env(extra_purge=()) -> None:
    """Convenience: purge cached backend modules so the next import is fresh."""
    purge_backend_modules(extra_purge)


@pytest.fixture
def backend_env(tmp_path, monkeypatch):
    """Opt-in fixture for backend (FastAPI router) tests.

    Sets up a fresh per-test SQLite database, rebinds the backend
    engine, and creates the schema. Tests using this fixture can
    `from api.<module> import router` immediately afterwards.
    """
    yield isolate_test_database(tmp_path, monkeypatch)
