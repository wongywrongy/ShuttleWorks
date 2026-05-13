"""Shared helpers for the backend test suite.

Kept separate from ``conftest.py`` so individual test modules can
``from _helpers import isolate_test_database`` directly — conftest
contents are not auto-importable in pytest. ``conftest.py`` adds the
``tests/`` directory to ``sys.path`` so this import resolves.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable


_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_BACKEND_ROOT = str(_PRODUCT_ROOT / "backend")

_BACKEND_PACKAGE_PREFIXES = (
    "app.",
    "api.",
    "services.",
    "adapters.",
    "database.",
    "repositories.",
)
_BACKEND_PACKAGE_NAMES = {
    "app",
    "api",
    "services",
    "adapters",
    "database",
    "repositories",
}


def purge_backend_modules(extra: Iterable[str] = ()) -> None:
    extras = tuple(extra)
    for cached in [
        k for k in list(sys.modules)
        if k in _BACKEND_PACKAGE_NAMES
        or any(k.startswith(p) for p in _BACKEND_PACKAGE_PREFIXES)
        or any(e in k for e in extras)
    ]:
        del sys.modules[cached]


def isolate_test_database(tmp_path, monkeypatch) -> Path:
    """Bind the backend to a per-test SQLite file and create the schema.

    Must be called BEFORE importing any backend module that touches the
    database. Also re-prepends ``backend/`` to ``sys.path`` defensively
    in case pytest's rootdir injection shadowed it.
    """
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if _BACKEND_ROOT in sys.path:
        sys.path.remove(_BACKEND_ROOT)
    sys.path.insert(0, _BACKEND_ROOT)
    purge_backend_modules()
    from database.models import Base
    from database.session import engine
    Base.metadata.create_all(engine)
    return db_path
