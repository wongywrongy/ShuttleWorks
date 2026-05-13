"""Shared pytest setup for the backend test suite.

Pytest's rootdir is ``products/scheduler/``. The FastAPI app and its
adapter / api / services packages live under ``products/scheduler/backend/``;
we insert that directory at the front of ``sys.path`` at conftest load
time so every test can do ``from app.X import Y`` and friends without
local sys.path manipulation.

``scheduler_core`` is installed as a regular package via its own
``pyproject.toml`` and reaches every test through site-packages.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

import pytest


_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_BACKEND_ROOT = str(_PRODUCT_ROOT / "backend")

if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


# Module names whose first segment lives under ``backend/``. We purge
# these so the next ``from <pkg>.<mod> import ...`` resolves fresh —
# router tests need this when a previous test mutated module state.
_BACKEND_PACKAGE_PREFIXES = ("app.", "api.", "services.", "adapters.")
_BACKEND_PACKAGE_NAMES = {"app", "api", "services", "adapters"}


def purge_backend_modules(extra: Iterable[str] = ()) -> None:
    """Drop every cached backend module so the next import is fresh."""
    extras = tuple(extra)
    for cached in [
        k for k in list(sys.modules)
        if k in _BACKEND_PACKAGE_NAMES
        or any(k.startswith(p) for p in _BACKEND_PACKAGE_PREFIXES)
        or any(e in k for e in extras)
    ]:
        del sys.modules[cached]


def reset_backend_test_env(extra_purge: Iterable[str] = ()) -> None:
    """Convenience: purge cached backend modules so the next import is fresh."""
    purge_backend_modules(extra_purge)


@pytest.fixture
def backend_env(tmp_path, monkeypatch):
    """Opt-in fixture for backend (FastAPI router) tests.

    Purges any cached backend modules so the next import resolves
    fresh, and routes the persistence layer at a per-test tmp directory
    via ``BACKEND_DATA_DIR``.
    """
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    reset_backend_test_env()
    yield tmp_path
