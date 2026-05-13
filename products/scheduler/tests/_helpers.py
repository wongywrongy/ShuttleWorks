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


# Pure domain modules with no settings/DB dependency. Exempting them
# from the purge keeps class identity stable across test fixtures — so
# ``pytest.raises(SomeException)`` in one test still matches an instance
# raised by code that imported the same class after a different test's
# fixture reset ``sys.modules``.
_PURGE_EXEMPT = frozenset({
    "app.exceptions",
})


def purge_backend_modules(extra: Iterable[str] = ()) -> None:
    extras = tuple(extra)
    for cached in [
        k for k in list(sys.modules)
        if (
            k in _BACKEND_PACKAGE_NAMES
            or any(k.startswith(p) for p in _BACKEND_PACKAGE_PREFIXES)
            or any(e in k for e in extras)
        )
        and k not in _PURGE_EXEMPT
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


def seed_tournament(client, name: str = "Test") -> str:
    """POST /tournaments and return the new id.

    Most route tests need an existing tournament in the DB before the
    scoped endpoints (match-states, schedule/*) accept writes. Use this
    helper from a fixture so the boilerplate stays out of test bodies.
    The ``client`` must already include the ``api.tournaments`` router.
    """
    r = client.post("/tournaments", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]
