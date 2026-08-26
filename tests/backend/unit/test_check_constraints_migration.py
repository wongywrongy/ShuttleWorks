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
  rebuilt here; anything the reflection loses — a foreign key, an index, a
  server default, a ``NOT NULL`` — would be invisible everywhere else in the
  suite, which builds its schema with ``create_all`` from the models. So those
  four kinds are snapshotted at the previous revision and compared either side
  of the migration, in both directions (column type, PK and unique constraints
  are NOT covered — ``_schema_shapes`` says so). Derived, not hand-listed:
  the first version of this file listed the FKs by hand and missed
  ``tournaments.org_id`` -> ``orgs`` outright.
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

#: The four tables ``z0f5a1b3c9d2`` rebuilds. Everything they carried before
#: the rebuild has to still be there after it — see the shape snapshot below.
REBUILT_TABLES = ("tournaments", "matches", "entries", "tournament_members")


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


def _schema_shapes(engine):
    """Four of the things ``batch_alter_table`` could silently drop, per table.

    Not "everything" — the four captured are **foreign keys, indexes, server
    defaults and nullability**. What is NOT captured, said plainly so a green
    here is not read as more than it is: **column type**, **primary key**, and
    **unique constraints** — the four rebuilt tables carry no
    ``UniqueConstraint`` at all today (produced by reflection, not assumed),
    so there is nothing yet to lose, but one added later would land outside
    this snapshot.

    **Nullability is here because P7a Task 2 leans on it.** Deleting the
    ``or "meet"`` fallback in ``entries/entries.py`` is sound only while
    ``tournaments.kind`` stays ``NOT NULL``; a rebuild that quietly relaxed it
    would make that deleted branch reachable again and nothing else in the
    suite would say so. It is its own key rather than a widened ``defaults``
    tuple, so the anti-vacuity assertions below keep asserting what they say.

    Derived from the live database rather than hand-listed: a hand-maintained
    expectation is only as complete as whoever last edited it, and the first
    version of this file missed ``tournaments.org_id`` -> ``orgs`` entirely,
    leaving the one rebuilt table with a single FK at zero coverage.

    Foreign keys are compared by SHAPE, never by name — SQLite auto-names
    unnamed constraints, so the two sides would never agree on a label.
    ``ondelete`` is part of the shape because a rebuild that kept the edge but
    lost its RESTRICT would otherwise look identical.
    """
    inspector = sa.inspect(engine)
    return {
        table: {
            "fks": {
                (
                    tuple(sorted(fk["constrained_columns"])),
                    fk["referred_table"],
                    tuple(sorted(fk["referred_columns"])),
                    (fk.get("options") or {}).get("ondelete"),
                )
                for fk in inspector.get_foreign_keys(table)
            },
            "indexes": {
                (ix["name"], tuple(ix["column_names"]), bool(ix.get("unique")))
                for ix in inspector.get_indexes(table)
            },
            "defaults": {
                (col["name"], col["default"])
                for col in inspector.get_columns(table)
            },
            "nullability": {
                (col["name"], col["nullable"])
                for col in inspector.get_columns(table)
            },
        }
        for table in REBUILT_TABLES
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


def test_the_batch_rebuilds_changed_nothing_but_the_checks(alembic_cfg):
    """``batch_alter_table`` rebuilds from reflection, and this revision
    rebuilds four tables. Anything the reflection loses — a foreign key, an
    index, a server default, a ``NOT NULL`` — would be invisible to every
    other suite, which builds its schema with ``create_all`` from the models.

    So this compares those four kinds across the four tables either side of
    the migration, in both directions, instead of asserting a list someone has
    to remember to extend. It is not the whole table shape: column type,
    primary key and unique constraints are NOT covered — ``_schema_shapes``
    says which and why."""
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    engine = sa.create_engine(url)
    before = _schema_shapes(engine)

    # Anti-vacuity: an empty snapshot would compare equal to an empty snapshot
    # forever. One representative of each of the three kinds must be in there,
    # and the FK is ``tournaments``' only one — the gap that made the
    # hand-listed version of this test wrong.
    assert (
        ("org_id",),
        "orgs",
        ("id",),
        "RESTRICT",
    ) in before["tournaments"]["fks"]
    assert (
        "ix_matches_tournament_status",
        ("tournament_id", "status"),
        False,
    ) in before["matches"]["indexes"]
    assert ("kind", "'meet'") in before["tournaments"]["defaults"]
    # The fourth kind, and the one Task 2 depends on: deleting the
    # ``or "meet"`` fallback is only sound while this column cannot be NULL.
    assert ("kind", False) in before["tournaments"]["nullability"]

    command.upgrade(cfg, "head")
    assert _schema_shapes(engine) == before, "the upgrade rebuild lost something"

    command.downgrade(cfg, PREVIOUS_REVISION)
    assert _schema_shapes(engine) == before, "the downgrade rebuild lost something"


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
