"""The schema's first CHECK constraints, through the MIGRATION.

SP-DM-3 P7a (F-DM-37). Sibling of ``test_person_key_migration.py`` and
``test_entries_migration.py``, for the same reason and by the same shape: the
rest of the backend suite builds its schema with ``Base.metadata.create_all``,
so a constraint that exists only in the models — or only in the migration — is
invisible to it. **P7a-NC2** is precisely that requirement, so everything here
runs Alembic for real against a throwaway SQLite file.

**P7a-NC1** is the headline control: ``INSERT tournaments(kind='banana')`` is
rejected. It succeeded before ``z0f5a1b3c9d2``.

Three things this module is written around:

- **``PRAGMA foreign_keys`` is per connection and defaults OFF — but
  ``db/session.py`` registers a listener on the Engine CLASS, so whether it is
  on here depends on import order, which ``purge_backend_modules`` moves
  around.** CHECK enforcement is independent of it, and seeding a valid parent
  chain for all four tables would be four fixtures' worth of setup that tests
  nothing this card is about. So the insert tests turn FK enforcement OFF
  *explicitly* and assert it is 0 — deterministic either way. FK **presence**
  is asserted separately, by reflection.
- **``batch_alter_table`` REBUILDS the table from reflection.** Four tables are
  rebuilt here, every one of them with foreign keys. A constraint the
  reflection loses would be invisible everywhere else in the suite, so the FKs
  are compared by shape (never by name — SQLite auto-names unnamed
  constraints) before and against a known list.
- **A downgrade that does not run is not a downgrade.** The round-trip test
  goes head → ``y9e4f0a2b7c8`` → head, which is the only thing that catches a
  ``drop_constraint`` that batch mode cannot resolve.

UUIDs are seeded as undashed 32-char hex: that is the shape SQLAlchemy's
``Uuid`` stores on SQLite, and a dashed literal in raw SQL silently matches
nothing.
"""
from __future__ import annotations

import contextlib
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"

NOW = "2026-08-25 00:00:00"

TOURNAMENT = "1" * 32
USER = "2" * 32
EVENT = "3" * 32
ENTRY = "4" * 32

PREVIOUS_REVISION = "y9e4f0a2b7c8"

#: (table, constraint name, column, a value inside the vocabulary, one
#: outside it). The names must match ``db/models.py`` exactly — F-DM-11.
CHECKS = (
    ("tournaments", "ck_tournaments_kind", "kind", "bracket", "banana"),
    ("matches", "ck_matches_status", "status", "playing", "banana"),
    ("entries", "ck_entries_state", "state", "waitlisted", "banana"),
    (
        "tournament_members",
        "ck_tournament_members_role",
        "role",
        "operator",
        "banana",
    ),
)

#: Shape-compared FKs that must survive the four batch rebuilds:
#: (table, constrained columns, referred table, referred columns).
SURVIVING_FKS = (
    ("matches", ("tournament_id",), "tournaments", ("id",)),
    ("entries", ("tournament_id",), "tournaments", ("id",)),
    # All three of ``entries``' composite spine pointers — the whole set, so a
    # key the rebuild drops cannot hide behind the two most obvious ones.
    (
        "entries",
        ("entry_event_id", "tournament_id"),
        "entry_events",
        ("id", "tournament_id"),
    ),
    (
        "entries",
        ("submission_id", "tournament_id"),
        "submissions",
        ("id", "tournament_id"),
    ),
    (
        "entries",
        ("entry_player_id", "tournament_id"),
        "entry_players",
        ("id", "tournament_id"),
    ),
    ("tournament_members", ("tournament_id",), "tournaments", ("id",)),
    ("tournament_members", ("user_id",), "users", ("id",)),
)


@pytest.fixture
def alembic_cfg(tmp_path, monkeypatch):
    """An Alembic config bound to a fresh, empty SQLite file.

    Copied from ``test_person_key_migration.py`` for the reason stated there:
    ``alembic/env.py`` reads ``core.config.settings.database_url``, so the env
    var must be set *and* the backend modules purged before the first import.
    """
    db_path = tmp_path / "migration.db"
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if str(_BACKEND / "src") in sys.path:
        sys.path.remove(str(_BACKEND / "src"))
    sys.path.insert(0, str(_BACKEND / "src"))
    purge_backend_modules()

    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND / "src" / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    try:
        yield cfg, url
    finally:
        purge_backend_modules()


def _upgraded(alembic_cfg):
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    return sa.create_engine(url)


def _fk_shapes(engine, table):
    return {
        (
            tuple(sorted(fk["constrained_columns"])),
            fk["referred_table"],
            tuple(sorted(fk["referred_columns"])),
        )
        for fk in sa.inspect(engine).get_foreign_keys(table)
    }


def _insert(conn, table, column, value):
    """One row into ``table`` with ``column`` set to ``value``.

    Only the NOT NULL columns are supplied — raw SQL gets no ORM defaults.
    """
    rows = {
        "tournaments": (
            "INSERT INTO tournaments (id, name, status, kind, schema_version,"
            " data, created_at, updated_at)"
            " VALUES (?, 'Checks', 'draft', ?, 1, '{}', ?, ?)",
            (TOURNAMENT, value, NOW, NOW),
        ),
        "matches": (
            "INSERT INTO matches (tournament_id, id, status, version,"
            " created_at, updated_at) VALUES (?, 'm1', ?, 1, ?, ?)",
            (TOURNAMENT, value, NOW, NOW),
        ),
        "entries": (
            "INSERT INTO entries (tournament_id, id, entry_event_id, state,"
            " pending_reasons, submitted_at, updated_at)"
            " VALUES (?, ?, ?, ?, '[]', ?, ?)",
            (TOURNAMENT, ENTRY, EVENT, value, NOW, NOW),
        ),
        "tournament_members": (
            "INSERT INTO tournament_members (tournament_id, user_id, role,"
            " joined_at) VALUES (?, ?, ?, ?)",
            (TOURNAMENT, USER, value, NOW),
        ),
    }
    sql, params = rows[table]
    conn.exec_driver_sql(sql, params)


@contextlib.contextmanager
def _fk_free(engine):
    """A connection with FK enforcement explicitly OFF, asserted.

    CHECK constraints do not care; the parent chains these four inserts would
    otherwise need do not exist and are not what P7a constrains. Asserting the
    PRAGMA rather than assuming it keeps this deterministic under whatever
    import order the suite happens to run in.

    The ``rollback()`` is load-bearing rather than tidy: SQLAlchemy autobegins
    a logical transaction on the first statement, and SQLite **ignores**
    ``PRAGMA foreign_keys`` issued inside a real transaction. Clearing it here
    keeps the readback honest and lets callers drive their own commits.
    """
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
        conn.rollback()
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 0
        conn.rollback()
        yield conn


@pytest.mark.parametrize(
    "table,name,column,good,bad", CHECKS, ids=[c[0] for c in CHECKS]
)
def test_a_value_outside_the_vocabulary_is_refused(
    alembic_cfg, table, name, column, good, bad
):
    """P7a-NC1 (the ``tournaments`` case) and its three siblings, against a
    MIGRATION-built schema (P7a-NC2).

    The positive half is not decoration: without it a test that raised for any
    reason at all — a typo in the column list, a missing table — would pass
    while proving nothing about the constraint."""
    engine = _upgraded(alembic_cfg)

    # The constraint must EXIST and carry the agreed name. An IntegrityError
    # alone cannot tell "CHECK present" from "test set up wrong".
    names = {
        c["name"] for c in sa.inspect(engine).get_check_constraints(table)
    }
    assert name in names, f"{table} has no {name}: {sorted(names)}"

    with _fk_free(engine) as conn:
        with pytest.raises(sa.exc.IntegrityError):
            _insert(conn, table, column, bad)
        conn.rollback()

        _insert(conn, table, column, good)
        conn.commit()
        assert (
            conn.exec_driver_sql(
                f"SELECT COUNT(*) FROM {table} WHERE {column} = ?", (good,)
            ).scalar()
            == 1
        )


def test_the_batch_rebuilds_kept_every_foreign_key(alembic_cfg):
    """``batch_alter_table`` rebuilds from reflection, and this revision
    rebuilds four tables that all have foreign keys. A key the reflection
    dropped would be invisible to every other suite, which builds its schema
    with ``create_all`` from the models."""
    engine = _upgraded(alembic_cfg)

    for table, cols, referred, referred_cols in SURVIVING_FKS:
        shapes = _fk_shapes(engine, table)
        assert (
            (cols, referred, referred_cols) in shapes
        ), f"the batch rebuild dropped {table}.{cols} -> {referred}: {sorted(shapes)}"


def test_the_downgrade_runs_and_the_upgrade_runs_again(alembic_cfg):
    """A named constraint is what makes batch mode reversible on SQLite; this
    is the only test that proves the names actually resolve on the way down."""
    from alembic import command

    cfg, url = alembic_cfg
    engine = _upgraded(alembic_cfg)

    command.downgrade(cfg, PREVIOUS_REVISION)
    for table, name, _column, _good, _bad in CHECKS:
        names = {
            c["name"] for c in sa.inspect(engine).get_check_constraints(table)
        }
        assert name not in names, f"{name} survived the downgrade"

    # And back up again — a downgrade that leaves the schema un-upgradable is
    # only half a downgrade.
    command.upgrade(cfg, "head")
    with _fk_free(engine) as conn:
        with pytest.raises(sa.exc.IntegrityError):
            _insert(conn, "tournaments", "kind", "banana")
        conn.rollback()
