"""Alembic round-trip for the Entries schema migration (SP-E1-1, Phase B).

**Why this file exists at all.** The rest of the backend suite builds its
schema with ``Base.metadata.create_all`` (``tests/_helpers.py``), so a
migration that diverges from the models — or one that cannot be applied at
all — is completely invisible to it. Entries is the first slice to add three
tables at once, and the first with an index set that carries a security
meaning (the tenant-scoped idempotency uniqueness of ruling D4). So this
module runs Alembic for real, against a throwaway SQLite file, and asserts:

1. ``upgrade head`` applies cleanly from an empty database and the head
   revision is the Entries revision.
2. The three tables, and every index the spec's §4 sketch mandates, exist —
   with the *right* uniqueness (D4's unique idempotency index; Q12's
   deliberately NON-unique contact-email index).
3. The migration and ``database.models`` agree column-for-column. Models are
   the source of truth for the suite; the migration is the source of truth
   for production. A drift between them is a production-only bug.
4. ``downgrade -1`` removes exactly what the upgrade added and leaves the
   pre-existing schema (``workspace_modules`` and its unique constraint)
   untouched.

The negative controls are the uniqueness assertions read in both directions:
the idempotency index must be unique *and* the contact-email index must not
be, because a test that only checked "an index exists" would pass against the
hard email uniqueness Q12 explicitly rejects.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[2] / "backend"

# The revision this stage adds, and the one it must follow.
ENTRIES_REVISION = "r2c7e1f4a9b3"
PREVIOUS_REVISION = "q1b4c8d2e6f7"

ENTRIES_TABLES = ("entry_events", "entries", "entry_pages")


@pytest.fixture
def alembic_cfg(tmp_path, monkeypatch):
    """An Alembic config bound to a fresh, empty SQLite file.

    ``alembic/env.py`` reads ``app.config.settings.database_url``, so the env
    var must be set *and* the backend modules purged before the first import
    — otherwise a settings object cached by an earlier test points the
    migration at that test's database.
    """
    db_path = tmp_path / "migration.db"
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if str(_BACKEND) in sys.path:
        sys.path.remove(str(_BACKEND))
    sys.path.insert(0, str(_BACKEND))
    purge_backend_modules()

    from alembic.config import Config

    # Built without an .ini file on purpose: ``env.py`` skips ``fileConfig``
    # when ``config_file_name`` is None, so running migrations in-process
    # does not reconfigure pytest's logging.
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    try:
        yield cfg, url
    finally:
        purge_backend_modules()


def _inspector(url):
    engine = sa.create_engine(url)
    return sa.inspect(engine), engine


def _index_map(inspector, table: str) -> dict[str, dict]:
    return {ix["name"]: ix for ix in inspector.get_indexes(table)}


def _head_revision(url) -> str | None:
    engine = sa.create_engine(url)
    with engine.connect() as conn:
        return conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()


# ---- Upgrade ----------------------------------------------------------


def test_upgrade_head_creates_the_entries_tables(alembic_cfg):
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")

    assert _head_revision(url) == ENTRIES_REVISION
    inspector, _ = _inspector(url)
    tables = set(inspector.get_table_names())
    for table in ENTRIES_TABLES:
        assert table in tables, f"{table} missing after upgrade head"


def test_upgrade_creates_the_ruled_indexes_with_the_ruled_uniqueness(alembic_cfg):
    """D4 + Q12 in one assertion pair.

    The idempotency index is UNIQUE and tenant-scoped (D4 — a global lookup
    on an unauthenticated route is a cross-tenant disclosure vector). The
    contact-email index is deliberately NOT unique (Q12 — one email may
    legitimately enter several players). The second half is the negative
    control for the first: "an index exists" is not the claim.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    inspector, _ = _inspector(url)

    entries = _index_map(inspector, "entries")
    idem = entries["uq_entries_tournament_idempotency_key"]
    assert idem["unique"], "D4: idempotency uniqueness must be enforced"
    assert idem["column_names"] == ["tournament_id", "idempotency_key"], (
        "D4: the idempotency index must be tenant-scoped, not global"
    )

    email = entries["ix_entries_event_contact_email"]
    assert not email["unique"], (
        "Q12: a UNIQUE contact-email index is explicitly rejected — "
        "one parent / club rep legitimately enters several players"
    )
    assert email["column_names"] == ["entry_event_id", "contact_email"]

    pages = _index_map(inspector, "entry_pages")
    assert pages["uq_entry_pages_slug"]["unique"]


def test_upgrade_enforces_the_tenant_scoped_idempotency_uniqueness(alembic_cfg):
    """The index is not decorative — the database refuses the second row.

    Negative control: the *same* key under a *different* tournament is
    accepted, proving the constraint is scoped rather than global.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    _, engine = _inspector(url)

    tid_a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    tid_b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    with engine.begin() as conn:
        for tid in (tid_a, tid_b):
            conn.execute(
                sa.text(
                    "INSERT INTO tournaments"
                    " (id, name, status, schema_version, data,"
                    "  created_at, updated_at)"
                    " VALUES (:id, 'T', 'draft', 1, '{}', :now, :now)"
                ),
                {"id": tid, "now": "2026-08-06 00:00:00"},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO entry_events"
                    " (tournament_id, id, code, discipline, entry_type,"
                    "  created_at, updated_at)"
                    " VALUES (:tid, :eid, 'MS', 'Mens Singles', 'singles',"
                    "         :now, :now)"
                ),
                {"tid": tid, "eid": tid, "now": "2026-08-06 00:00:00"},
            )

    def _insert(conn, tid, entry_id):
        conn.execute(
            sa.text(
                "INSERT INTO entries"
                " (tournament_id, id, entry_event_id, state, pending_reasons,"
                "  contact_name, contact_email, manage_token_hash, player_name,"
                "  list_opt_out, idempotency_key, submitted_at, updated_at)"
                " VALUES (:tid, :id, :eid, 'pending', '[]', 'Rep',"
                "         'rep@example.com', 'hash', 'Player', 0, 'key-1',"
                "         :now, :now)"
            ),
            {"tid": tid, "id": entry_id, "eid": tid, "now": "2026-08-06 00:00:00"},
        )

    with engine.begin() as conn:
        _insert(conn, tid_a, "1" * 32)
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            _insert(conn, tid_a, "2" * 32)
    # Negative control: same key, different tenant → accepted.
    with engine.begin() as conn:
        _insert(conn, tid_b, "3" * 32)


def test_migration_matches_the_models_column_for_column(alembic_cfg):
    """Models are the suite's schema; the migration is production's.

    Tests build via ``create_all``, so a migration that drifts from the
    models is invisible everywhere else. Pin them together here.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    inspector, _ = _inspector(url)

    from database.models import Base

    for table in ENTRIES_TABLES:
        migrated = {c["name"] for c in inspector.get_columns(table)}
        modelled = {c.name for c in Base.metadata.tables[table].columns}
        assert migrated == modelled, (
            f"{table}: migration/model drift — "
            f"only in migration {sorted(migrated - modelled)}, "
            f"only in model {sorted(modelled - migrated)}"
        )


# ---- Downgrade --------------------------------------------------------


def test_downgrade_one_step_removes_exactly_the_entries_schema(alembic_cfg):
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    before, _ = _inspector(url)
    pre_existing = set(before.get_table_names()) - set(ENTRIES_TABLES)

    command.downgrade(cfg, "-1")

    assert _head_revision(url) == PREVIOUS_REVISION
    after, _ = _inspector(url)
    remaining = set(after.get_table_names())
    for table in ENTRIES_TABLES:
        assert table not in remaining, f"{table} survived the downgrade"
    # Negative control: the downgrade is a scalpel, not a drop-everything —
    # every table that predated it is still there.
    assert pre_existing <= remaining
    assert "workspace_modules" in remaining
    assert "uq_workspace_modules_tournament_module" in {
        c["name"] for c in after.get_unique_constraints("workspace_modules")
    }


def test_upgrade_is_replayable_after_a_downgrade(alembic_cfg):
    """Round-trip: down then up again, ending in the same shape."""
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")
    command.upgrade(cfg, "head")

    inspector, _ = _inspector(url)
    tables = set(inspector.get_table_names())
    for table in ENTRIES_TABLES:
        assert table in tables
    assert _index_map(inspector, "entries")[
        "uq_entries_tournament_idempotency_key"
    ]["unique"]
