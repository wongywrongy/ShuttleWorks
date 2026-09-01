"""``meet_events`` + ``entry_events.meet_event_id``, through the MIGRATION.

SP-DM-3 P7b Task 1. Sibling of ``test_check_constraints_migration.py`` and
``test_orphan_purge_migration.py``, for the reason those state: the rest of
the backend suite builds its schema with ``Base.metadata.create_all``, so
anything that exists only in the models — or only in the migration — is
invisible to it. **P7b-NC2** is exactly that requirement, so everything here
runs Alembic for real against a throwaway SQLite file.

**P7b-NC1** is the headline control: a workspace whose blob holds
``{BS: 20, GS: 20, BD: 11, GD: 11, XD: 11}`` — the shape ``data/local.db``
actually carries — backfills to **5 rows, not 73**. R-DM-5 binds the grain to
the division; the seventy-three numbered ranks the console's ``expandRanks``
emits from that dict are generated position labels, not entities.

**P7b-NC4** here is the backfill half: a config with no ``rankCounts`` key at
all (the shape ``POST /tournaments`` seeds) and one holding ``{}`` both yield
zero rows. The derivation half of NC4, and NC3, live in
``test_meet_event_derivation.py`` — F-DM-11 binds the *migration* control to a
migration-built schema, not the runtime sync.

UUIDs are seeded as undashed 32-char hex: that is the shape SQLAlchemy's
``Uuid`` stores on SQLite, and a dashed literal in raw SQL silently matches
nothing.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import sqlalchemy as sa

# The fixture is shared rather than copied — it is fiddly (it must purge the
# cached backend settings before ``alembic/env.py`` reads DATABASE_URL) and two
# copies would drift.
from tests.backend.unit.test_entries_migration import alembic_cfg  # noqa: F401

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"

PREVIOUS_REVISION = "z0f5a1b3c9d2"
MEET_EVENTS_REVISION = "aa1b6c4e0d3f"

NOW = "2026-08-26 00:00:00"

#: The real ``data/local.db`` shape: five divisions, seventy-three numbered
#: ranks. The whole point of NC1.
REAL_RANK_COUNTS = {"BS": 20, "GS": 20, "BD": 11, "GD": 11, "XD": 11}

BIG = "1" * 32
NO_KEY = "2" * 32
EMPTY = "3" * 32
OUT_OF_RANGE = "4" * 32

#: A count outside ``slot_count``'s int4 range is dropped by the backfill the
#: same way ``_rank_counts`` drops it, because on Postgres an unbounded value
#: fails the INSERT and takes the upgrade down. Negatives are IN range and
#: stay: ``slot_count`` carries no CHECK by ruling.
OUT_OF_RANGE_COUNTS = {
    "MS": 3,
    "NEG": -4,
    "MAXI": 2**31 - 1,
    "MINI": -(2**31),
    "OVER": 2**31,
    "UNDER": -(2**31) - 1,
    "HUGE": 10**12,
}


def _db_path(url: str) -> str:
    return url.replace("sqlite:///", "")


def _seed(url: str) -> None:
    """Four workspaces, one per state ``rankCounts`` can be in on disk."""
    conn = sqlite3.connect(_db_path(url))
    blobs = {
        BIG: {"config": {"tournamentName": "Junior League", "rankCounts": REAL_RANK_COUNTS}},
        # The workspace-create seed writes a config with no rankCounts key.
        NO_KEY: {"config": {"tournamentName": "Seeded"}},
        EMPTY: {"config": {"tournamentName": "Smoke", "rankCounts": {}}},
        OUT_OF_RANGE: {
            "config": {"tournamentName": "Restored", "rankCounts": OUT_OF_RANGE_COUNTS}
        },
    }
    for tid, blob in blobs.items():
        conn.execute(
            "INSERT INTO tournaments (id, name, status, kind, schema_version,"
            " data, created_at, updated_at)"
            " VALUES (?, 'P7b', 'draft', 'meet', 1, ?, ?, ?)",
            (tid, json.dumps(blob), NOW, NOW),
        )
    conn.commit()
    conn.close()


def _rows(engine, tournament_id):
    with engine.connect() as conn:
        return conn.execute(
            sa.text(
                "SELECT id, label, slot_count FROM meet_events"
                " WHERE tournament_id = :t ORDER BY id"
            ),
            {"t": tournament_id},
        ).all()


def test_the_backfill_is_one_row_per_division_not_per_numbered_rank(alembic_cfg):  # noqa: F811
    """P7b-NC1 + P7b-NC2.

    ``{BS: 20, GS: 20, BD: 11, GD: 11, XD: 11}`` expands to 73 numbered ranks
    through ``expandRanks``. R-DM-5 says a numbered rank is not an entity, so
    the backfill produces 5 rows carrying those counts as a column.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    command.upgrade(cfg, MEET_EVENTS_REVISION)

    engine = sa.create_engine(url)
    rows = _rows(engine, BIG)
    assert len(rows) == 5, "one row per division, not per numbered rank"
    assert [r.id for r in rows] == ["BD", "BS", "GD", "GS", "XD"]
    assert {r.id: r.slot_count for r in rows} == REAL_RANK_COUNTS
    assert [r.label for r in rows] == ["BD", "BS", "GD", "GS", "XD"], (
        "the blob has no label to derive, so the code seeds it"
    )
    assert sum(REAL_RANK_COUNTS.values()) == 73
    assert len(rows) != sum(REAL_RANK_COUNTS.values())


def test_a_config_with_no_rank_counts_and_one_with_an_empty_dict_both_backfill_nothing(
    alembic_cfg,  # noqa: F811
):
    """P7b-NC4 (backfill half).

    Absent and ``{}`` are the same state — zero divisions — because
    ``POST /tournaments`` seeds a config with no ``rankCounts`` key at all, so
    "missing" is a state real workspaces are in rather than a signal to skip.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    command.upgrade(cfg, MEET_EVENTS_REVISION)

    engine = sa.create_engine(url)
    assert _rows(engine, NO_KEY) == []
    assert _rows(engine, EMPTY) == []


def test_the_mapping_column_lands_indexed_fk_less_and_null(alembic_cfg):  # noqa: F811
    """``entry_events.meet_event_id`` exists, is indexed, and has NO FK.

    FK-less by ruling R2 and, for Meet, more forcefully: ``meet_events`` rows
    are derived and get deleted whenever a code leaves ``config.rankCounts``,
    so a cascade would let a config edit destroy every entry under a division.
    Nothing writes the column in Task 1 — the seam wiring is Task 2 — so the
    backfill must leave it NULL.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")

    engine = sa.create_engine(url)
    inspector = sa.inspect(engine)

    columns = {c["name"]: c for c in inspector.get_columns("entry_events")}
    assert "meet_event_id" in columns
    assert columns["meet_event_id"]["nullable"] is True

    indexes = {
        i["name"]: list(i["column_names"]) for i in inspector.get_indexes("entry_events")
    }
    assert indexes["ix_entry_events_meet_event"] == ["tournament_id", "meet_event_id"]

    fk_targets = {
        tuple(fk["constrained_columns"])
        for fk in inspector.get_foreign_keys("entry_events")
    }
    assert ("meet_event_id",) not in fk_targets
    assert ("tournament_id", "meet_event_id") not in fk_targets

    # The bracket sibling is untouched — R2 said do not.
    assert "bracket_event_id" in columns
    assert indexes["ix_entry_events_bracket_event"] == [
        "tournament_id",
        "bracket_event_id",
    ]


def test_meet_events_cascades_from_its_workspace(alembic_cfg):  # noqa: F811
    """The FK that IS there: deleting the workspace takes its divisions.

    ``PRAGMA foreign_keys`` is per connection and defaults OFF, so it is
    turned on and asserted before anything is deleted.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    command.upgrade(cfg, "head")

    conn = sqlite3.connect(_db_path(url))
    conn.execute("PRAGMA foreign_keys=ON")
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    conn.execute("DELETE FROM tournaments WHERE id = ?", (BIG,))
    conn.commit()
    left = conn.execute(
        "SELECT COUNT(*) FROM meet_events WHERE tournament_id = ?", (BIG,)
    ).fetchone()[0]
    conn.close()
    assert left == 0


def test_the_downgrade_actually_runs(alembic_cfg):  # noqa: F811
    """head -> ``z0f5a1b3c9d2`` -> head.

    ``drop_column`` on SQLite goes through ``batch_alter_table``, which
    rebuilds the table from reflection — a downgrade that is never executed is
    not a downgrade.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    _seed(url)
    command.downgrade(cfg, PREVIOUS_REVISION)

    engine = sa.create_engine(url)
    inspector = sa.inspect(engine)
    assert "meet_events" not in inspector.get_table_names()
    assert "meet_event_id" not in {
        c["name"] for c in inspector.get_columns("entry_events")
    }
    engine.dispose()

    command.upgrade(cfg, "head")
    engine = sa.create_engine(url)
    assert len(_rows(engine, BIG)) == 5, "the second upgrade backfills again"


def test_the_revision_id_scheme_is_unambiguous_against_every_older_id():
    """The single-letter prefix is exhausted at ``z``; ``aa``, ``ab`` continue it.

    Every id in the old scheme has a DIGIT as its second character, so a
    two-letter prefix cannot collide with one.
    """
    versions = _BACKEND / "src" / "alembic" / "versions"
    prefixes = sorted(
        {p.name[:2] for p in versions.glob("*.py") if not p.name.startswith("__")}
    )
    two_letter = [p for p in prefixes if p.isalpha()]
    assert two_letter == ["aa", "ab"], prefixes
    assert MEET_EVENTS_REVISION.startswith("aa")
    assert len(MEET_EVENTS_REVISION) == 12


def test_a_count_outside_int4_is_skipped_by_the_backfill_too(alembic_cfg):  # noqa: F811
    """The backfill mirrors ``_rank_counts``, bound included.

    Unbounded, the INSERT this backfill performs would raise ``DataError`` on
    Postgres and take the whole ``upgrade`` down mid-flight on a tenant whose
    config already holds such a count — nothing bounded the value before
    P7b either. **SQLite cannot reproduce that failure** (arbitrary-width
    integers), so what is asserted here is the mirror: the out-of-range codes
    are absent and the in-range ones, negatives included, are kept.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    command.upgrade(cfg, MEET_EVENTS_REVISION)

    engine = sa.create_engine(url)
    assert {r.id: r.slot_count for r in _rows(engine, OUT_OF_RANGE)} == {
        "MAXI": 2**31 - 1,
        "MINI": -(2**31),
        "MS": 3,
        "NEG": -4,
    }
