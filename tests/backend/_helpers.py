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


_REPO_ROOT = Path(__file__).resolve().parents[2]
# apps/api/src is the sys.path root (SP-REORG-1 R4: src is a ROOT, not a
# package), which is what makes `core`, `meet`, `bracket` import by bare name.
_BACKEND_ROOT = str(_REPO_ROOT / "apps" / "api" / "src")

_BACKEND_PACKAGE_PREFIXES = (
    "core.",
    "shared.",
    "db.",
    "repositories.",
    "workspaces.",
    "identity.",
    "meet.",
    "bracket.",
    "operations.",
    "display.",
    "entries.",
    "competition.",
    "solve_rail.",
    "ops.",
    "recovery.",
    "shuttleworks.",
    "sync.",
)
_BACKEND_PACKAGE_NAMES = {
    "core",
    "shared",
    "db",
    "repositories",
    "workspaces",
    "identity",
    "meet",
    "bracket",
    "operations",
    "display",
    "entries",
    "competition",
    "solve_rail",
    "ops",
    "recovery",
    "shuttleworks",
    "sync",
}


# Pure domain modules with no settings/DB dependency. Exempting them
# from the purge keeps class identity stable across test fixtures — so
# ``pytest.raises(SomeException)`` in one test still matches an instance
# raised by code that imported the same class after a different test's
# fixture reset ``sys.modules``.
_PURGE_EXEMPT = frozenset({
    "core.exceptions",
    # SP-DM-3 P2: same reason. ``BlobVersionError`` is raised by the
    # ``VersionedJSON`` decorator bound onto the column at model-import
    # time, so a purged-and-re-imported copy of this module gives a test
    # a different class than the one the ORM raises. SQLAlchemy-only, no
    # settings and no DB, so it qualifies on the rule above.
    "db.blob_version",
    # Transport models are pure Pydantic values.  Keeping their identity
    # stable is essential when a migration fixture refreshes the application
    # modules after other tests have already collected references to these
    # classes.  Otherwise a freshly imported ``SyncBatchRequest`` rejects an
    # ``OperationEnvelope`` created by the pre-purge class, even though both
    # have the same schema.
    "sync.schemas",
    "sync.errors",
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
    from db.session import engine
    upgrade_test_database(engine)
    return db_path


def seed_tournament(client, name: str = "Test") -> str:
    """POST /tournaments and return the new id.

    Most route tests need an existing tournament in the DB before the
    scoped endpoints (match-states, schedule/*) accept writes. Use this
    helper from a fixture so the boilerplate stays out of test bodies.
    The ``client`` must already include the ``workspaces.tournaments`` router.
    """
    r = client.post("/tournaments", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]



def submit_reviewed(client, url, *, data=None, headers=None, **kwargs):
    """Exercise the public quote step before a test's intended submission.

    Tests for missing/stale review deliberately call client.post directly.
    A refused quote never grants a review fingerprint or changes the submit
    assertion: authorization, CSRF and policy remain independently tested.
    """
    body = dict(data or {})
    quote_headers = {**(headers or {}), "Accept": "application/json"}
    quoted = client.post(url.replace("/submit/", "/quote/"), data=body,
                         headers=quote_headers, follow_redirects=False)
    if quoted.status_code == 200:
        body["reviewedQuote"] = quoted.json().get("reviewedQuote", "")
    return client.post(url, data=body, headers=headers or {}, **kwargs)


def upgrade_test_database(engine) -> None:
    """Build a fresh test schema through the same frozen revisions as startup.

    Pass the actual connection so in-memory engines are supported too.
    """
    from alembic import command
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(Path(_BACKEND_ROOT) / "alembic"))
    with engine.connect() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")


def drop_test_database(engine) -> None:
    """Remove a disposable test schema, including Alembic state and functions."""
    from sqlalchemy import inspect
    with engine.connect() as connection:
        if engine.dialect.name == "postgresql":
            connection.exec_driver_sql("DROP SCHEMA public CASCADE")
            connection.exec_driver_sql("CREATE SCHEMA public")
            connection.commit()
        else:
            raw = connection.connection.driver_connection
            raw.execute("PRAGMA foreign_keys=OFF")
            try:
                for table in inspect(connection).get_table_names():
                    quoted = connection.dialect.identifier_preparer.quote(table)
                    connection.exec_driver_sql(f"DROP TABLE {quoted}")
                connection.commit()
            finally:
                connection.rollback()
                raw.execute("PRAGMA foreign_keys=ON")
