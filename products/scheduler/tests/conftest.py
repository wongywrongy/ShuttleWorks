"""Shared pytest setup for the backend test suite.

Pytest's rootdir is ``products/scheduler/`` (the directory containing
``pyproject.toml``), which forces it to the front of ``sys.path``.
That makes ``from app.schemas import ...`` resolve to
``products/scheduler/app/schemas.py`` (a legacy stub that lacks every
model added since the v2 API rewrite). Each test file used to repeat
the same fix-up — shift ``backend/`` to the front of ``sys.path`` and
purge any cached ``app.*`` / ``api.*`` / ``services.*`` / ``adapters.*``
modules so the next import resolves correctly.

Centralising both shifts here:

  - ``_pin_backend_root_on_path``: a session-scoped autouse fixture
    that re-prepends ``backend/`` whenever pytest's collection
    machinery shoves ``src/`` ahead of it.
  - ``backend_test_env`` / ``purge_backend_modules``: helpers test
    fixtures call before importing routers, so the import resolves
    fresh against ``backend/`` instead of the cached, possibly stale
    module from a previous test.

Existing test files keep working — they call the helpers explicitly
inside their own ``client`` fixtures. New tests just import what they
need; the autouse fixture handles the rest.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

import pytest


# Resolve once. ``products/scheduler/tests/conftest.py`` lives at
# parents[0]=tests, parents[1]=scheduler (product root), parents[2]=products,
# parents[3]=repo root.
_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = str(_PRODUCT_ROOT / "backend")

# Repo root needs to be on sys.path so tests can ``from scheduler_core
# import ...`` directly. Pytest already has the product root (rootdir
# from pyproject.toml) on the path; we add the repo root once at module
# load so scheduler_core/ resolves regardless of how the test was kicked off.
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _pin_backend_root() -> None:
    """Move ``backend/`` to the very front of ``sys.path``."""
    sys.path[:] = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]


# Module names whose first segment lives under ``backend/``. We purge
# these so the next ``from <pkg>.<mod> import ...`` resolves fresh.
_BACKEND_PACKAGE_PREFIXES = ("app.", "api.", "services.", "adapters.")
_BACKEND_PACKAGE_NAMES = {"app", "api", "services", "adapters"}


def purge_backend_modules(extra: Iterable[str] = ()) -> None:
    """Drop every cached backend module so the next import is fresh.

    Accepts an iterable of additional substring patterns to also
    purge — keeps the surface flexible for tests that touch helpers
    not under the standard four packages.
    """
    extras = tuple(extra)
    for cached in [
        k for k in list(sys.modules)
        if k in _BACKEND_PACKAGE_NAMES
        or any(k.startswith(p) for p in _BACKEND_PACKAGE_PREFIXES)
        or any(e in k for e in extras)
    ]:
        del sys.modules[cached]


def reset_backend_test_env(extra_purge: Iterable[str] = ()) -> None:
    """Convenience: pin sys.path then purge — what every fixture does."""
    _pin_backend_root()
    purge_backend_modules(extra_purge)


@pytest.fixture
def backend_env(tmp_path, monkeypatch):
    """Opt-in fixture for backend (FastAPI router) tests.

    Pins ``backend/`` to the front of ``sys.path``, purges any cached
    backend modules so the next import resolves fresh, and routes the
    persistence layer at a per-test tmp directory via ``BACKEND_DATA_DIR``.

    Use as the foundation for ``client`` fixtures in router tests:

        @pytest.fixture
        def client(backend_env):
            from api import schedule_proposals  # fresh import
            ...

    Tests that exercise pure scheduler-core code (under
    ``products/scheduler/{app,adapters}/``) and don't touch FastAPI
    routers should NOT request this fixture — pinning backend/ ahead
    of the product root would shadow ``adapters.fastapi`` and similar
    legacy-namespace modules.
    """
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    reset_backend_test_env()
    yield tmp_path
