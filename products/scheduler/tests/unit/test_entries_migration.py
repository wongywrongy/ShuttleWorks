"""Alembic round-trip for the Entries schema (SP-E1-1, reshaped by SP-E1-2).

**Why this file exists at all.** The rest of the backend suite builds its
schema with ``Base.metadata.create_all`` (``tests/_helpers.py``), so a
migration that diverges from the models — or one that cannot be applied at
all — is completely invisible to it. So this module runs Alembic for real,
against a throwaway SQLite file, and asserts that upgrade, downgrade and
replay all work and that the migration and the models agree column for
column.

**MIGRATION-SHAPE UNWIND (SP-E1-2 Phase C, rule 6).** This file was written
against ``r2c7e1f4a9b3`` and named that revision as head, its three tables
as the schema, and the entry-level idempotency index as ruling D4's home.
``s3d8f2b5c0e1`` moves all three: seven tables, the key one level up onto
``submissions``, and the entrant principal alongside. Every assertion here
had to be re-pointed for that reason and no other — **none of them was
weakened, and two were added**: the contact-email index the R13 reshape
removes is now asserted *absent*, and the entry-level idempotency
uniqueness likewise, because a rebuild that quietly recreated either would
otherwise pass a test that only ever looked at what it expected to find.

The negative controls are the uniqueness assertions read in both
directions: the submission idempotency index must be unique **and** the
duplicate-flag index must not be, because a test that only checked "an
index exists" would pass against the hard uniqueness Q12 explicitly
rejects at every level.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[2] / "backend"

# The revision that creates the entries family, the one that narrows its
# idempotency scope (the new head), and the one the family must follow.
ENTRIES_REVISION = "s3d8f2b5c0e1"
HEAD_REVISION = "u5f0b4d7e2a3"
PREVIOUS_REVISION = "r2c7e1f4a9b3"

# Every table the Entries family owns after the R13 reshape. The account
# level is in the list because ``s3d8f2b5c0e1`` creates it, even though it
# is the one table here that does not hang off ``tournaments``.
ENTRIES_TABLES = (
    "entrant_accounts",
    "entrant_sessions",
    "submissions",
    "entry_players",
    "entry_events",
    "entries",
    "entry_pages",
)

# What the previous revision owned — what a downgrade must land back on.
R2_TABLES = ("entry_events", "entries", "entry_pages")


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


def test_upgrade_head_creates_the_whole_entries_family(alembic_cfg):
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")

    assert _head_revision(url) == HEAD_REVISION
    inspector, _ = _inspector(url)
    tables = set(inspector.get_table_names())
    for table in ENTRIES_TABLES:
        assert table in tables, f"{table} missing after upgrade head"


def test_upgrade_creates_the_ruled_indexes_with_the_ruled_uniqueness(alembic_cfg):
    """D4 + Q12 in one assertion pair, at the levels R13 put them.

    The submission's idempotency index is UNIQUE and tenant-scoped (D4 — a
    global lookup on a route anyone with a poster URL can reach is a
    cross-tenant disclosure vector). The duplicate-flag index is
    deliberately NOT unique (Q12, preserved verbatim by R13 — one account
    legitimately enters the same event for two different players). The
    second half is the negative control for the first: "an index exists" is
    not the claim.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    inspector, _ = _inspector(url)

    submissions = _index_map(inspector, "submissions")
    idem = submissions["uq_submissions_tournament_account_idempotency_key"]
    assert idem["unique"], "D4: idempotency uniqueness must be enforced"
    assert idem["column_names"] == [
        "tournament_id",
        "account_id",
        "idempotency_key",
    ], "D4 + Phase 6 §4: the index is tenant- AND account-scoped, not global"
    assert "uq_submissions_tournament_idempotency_key" not in submissions, (
        "the tenant-only index is superseded, not kept alongside"
    )

    flag = _index_map(inspector, "entries")["ix_entries_event_player"]
    assert not flag["unique"], (
        "Q12/R13: a UNIQUE natural-key index is explicitly rejected — one "
        "parent / club rep legitimately enters several players"
    )
    assert flag["column_names"] == ["entry_event_id", "entry_player_id"]

    assert _index_map(inspector, "entry_pages")["uq_entry_pages_slug"]["unique"]
    assert _index_map(inspector, "entrant_sessions")[
        "uq_entrant_sessions_token_hash"
    ]["unique"]


def test_the_superseded_indexes_are_not_recreated(alembic_cfg):
    """**Added by the reshape**, and the reason it is added is the shape of
    a clean rebuild: this migration drops and recreates ``entries``, so a
    copy-paste of the previous revision's DDL would restore the very
    constraints R13 removed and every other assertion here would still
    pass. Named individually so a failure says which one came back.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    inspector, _ = _inspector(url)

    entries = _index_map(inspector, "entries")
    assert "uq_entries_tournament_idempotency_key" not in entries, (
        "the entry-level idempotency key moved to submissions (R13)"
    )
    assert "ix_entries_event_contact_email" not in entries, (
        "the contact-email half of the duplicate lookup went with the "
        "contact block (Q13 §6)"
    )


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
    account = "cccccccccccccccccccccccccccccccc"
    now = "2026-08-07 00:00:00"
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO entrant_accounts"
                " (id, email, email_verified, created_at, updated_at)"
                " VALUES (:id, 'parent@example.com', 0, :now, :now)"
            ),
            {"id": account, "now": now},
        )
        for tid in (tid_a, tid_b):
            conn.execute(
                sa.text(
                    "INSERT INTO tournaments"
                    " (id, name, status, schema_version, data,"
                    "  created_at, updated_at)"
                    " VALUES (:id, 'T', 'draft', 1, '{}', :now, :now)"
                ),
                {"id": tid, "now": now},
            )

    def _insert(conn, tid, submission_id):
        conn.execute(
            sa.text(
                "INSERT INTO submissions"
                " (tournament_id, id, account_id, idempotency_key,"
                "  submitted_at, updated_at)"
                " VALUES (:tid, :id, :acct, 'key-1', :now, :now)"
            ),
            {"tid": tid, "id": submission_id, "acct": account, "now": now},
        )

    with engine.begin() as conn:
        _insert(conn, tid_a, "1" * 32)
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            _insert(conn, tid_a, "2" * 32)
    # Negative control: same key, different tenant → accepted.
    with engine.begin() as conn:
        _insert(conn, tid_b, "3" * 32)


def test_the_account_email_index_is_case_insensitive_and_enforced(alembic_cfg):
    """Login identity, so the case-folding lives in the database rather
    than in a write-time convention: a case-sensitive account namespace is
    an account-takeover surface, not a formatting inconsistency."""
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    _, engine = _inspector(url)

    now = "2026-08-07 00:00:00"

    def _account(conn, ident, email):
        conn.execute(
            sa.text(
                "INSERT INTO entrant_accounts"
                " (id, email, email_verified, created_at, updated_at)"
                " VALUES (:id, :email, 0, :now, :now)"
            ),
            {"id": ident, "email": email, "now": now},
        )

    with engine.begin() as conn:
        _account(conn, "1" * 32, "Parent@Example.COM")
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            _account(conn, "2" * 32, "parent@example.com")
    # Negative control: a genuinely different address is accepted.
    with engine.begin() as conn:
        _account(conn, "3" * 32, "other@example.com")


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


def test_the_gender_column_is_not_null_in_production_too(alembic_cfg):
    """R12 through the migration rather than only through the models.

    ``create_all`` would happily hold this true in the suite while the
    production DDL left it nullable — which is the exact class of bug this
    file exists for, and this column is the one the clean rebuild was
    chosen over a backfill to avoid.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    inspector, _ = _inspector(url)

    gender = next(
        c for c in inspector.get_columns("entry_players") if c["name"] == "gender"
    )
    assert not gender["nullable"]


# ---- Downgrade --------------------------------------------------------


def test_downgrade_one_step_lands_back_on_the_previous_revision(alembic_cfg):
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    before, _ = _inspector(url)
    pre_existing = set(before.get_table_names()) - set(ENTRIES_TABLES)

    # Named rather than stepped: "-1" stopped meaning r2c7e1f4a9b3 the day a
    # revision was added on top of the entries family.
    command.downgrade(cfg, PREVIOUS_REVISION)

    assert _head_revision(url) == PREVIOUS_REVISION
    after, _ = _inspector(url)
    remaining = set(after.get_table_names())

    # The R13 levels are gone…
    for table in ("entrant_accounts", "entrant_sessions", "submissions", "entry_players"):
        assert table not in remaining, f"{table} survived the downgrade"
    # …and the previous revision's three are back, in its shape.
    for table in R2_TABLES:
        assert table in remaining, f"{table} was not restored by the downgrade"
    assert "contact_email" in {
        c["name"] for c in after.get_columns("entries")
    }, "the downgrade must land on r2c7e1f4a9b3's entries, not a hole"

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
    command.downgrade(cfg, PREVIOUS_REVISION)
    command.upgrade(cfg, "head")

    inspector, _ = _inspector(url)
    tables = set(inspector.get_table_names())
    for table in ENTRIES_TABLES:
        assert table in tables
    assert _index_map(inspector, "submissions")[
        "uq_submissions_tournament_account_idempotency_key"
    ]["unique"]
    assert "uq_entries_tournament_idempotency_key" not in _index_map(
        inspector, "entries"
    )
