"""``u5f0b4d7e2a3`` — the one-time sweep of rows orphaned before ``ad58940``.

That commit turned ``PRAGMA foreign_keys`` ON for SQLite, which is why every
``ondelete="CASCADE"`` in ``database/models.py`` now fires. SQLite does not
revalidate rows that already exist, so a database created before it still
carries whatever the inert cascades left behind — and an ``UPDATE`` touching
one of those rows raises ``IntegrityError`` today where it succeeded
yesterday. The migration deletes them; this file is what keeps it honest,
because it deletes user data.

Three properties, and the third is the one that is easy to get wrong:

1. **It removes exactly what ``PRAGMA foreign_key_check`` reports** — the
   orphans, and none of their valid siblings. Both directions are asserted:
   an unreachable row is gone, and a *structurally identical* reachable row is
   still there. Without the second half a migration that emptied the table
   would pass.
2. **It is a no-op on a clean database** — nothing executed, nothing removed,
   row counts identical.
3. **It re-checks until the check comes back clean.** ``alembic/env.py``
   disables enforcement on the migration connection (batch mode is
   destructive with it on — see that file), so the migration's own DELETEs do
   not cascade either: removing an orphaned ``submissions`` row orphans the
   ``entries`` hanging off it. The fixture below plants exactly that row —
   valid on the first pass, orphaned by the first pass — so a single-pass
   implementation leaves the database dirty and fails here.

The orphans are manufactured with the ``sqlite3`` driver and enforcement off,
which is not a trick: it is precisely how a real pre-``ad58940`` database got
this way.
"""
from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

import sqlalchemy as sa

# The fixture is shared rather than copied — it is fiddly (it must purge the
# cached backend settings before `alembic/env.py` reads DATABASE_URL) and two
# copies would drift.
from tests.backend.unit.test_entries_migration import alembic_cfg  # noqa: F401

ORPHAN_PURGE_REVISION = "u5f0b4d7e2a3"


def _revision_reached(url: str, revision: str) -> bool:
    """Whether the migration history at ``url`` includes ``revision`` —
    i.e. the current head is it or a descendant of it."""
    from alembic.script import ScriptDirectory
    from alembic.config import Config as _Cfg

    api = Path(__file__).resolve().parents[3] / "apps" / "api"
    cfg = _Cfg(str(api / "alembic.ini"))
    cfg.set_main_option("script_location", str(api / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    head = _head_revision(url)
    return any(
        rev.revision == revision
        for rev in script.iterate_revisions(head, "base")
    )
PREVIOUS_REVISION = "t4e9a3c6d1f2"

_MIGRATION = (
    Path(__file__).resolve().parents[3] / "apps" / "api"
    / "alembic"
    / "versions"
    / "u5f0b4d7e2a3_purge_pre_enforcement_orphans.py"
)

NOW = "2026-08-10 00:00:00"

TOURNAMENT = "1" * 32
ACCOUNT_GONE = "a" * 32
ACCOUNT_KEPT = "b" * 32
SUBMISSION_ORPHANED = "c" * 32
SUBMISSION_KEPT = "d" * 32
SESSION_ORPHANED = "e" * 32
SESSION_KEPT = "f" * 32
EVENT = "2" * 32
PLAYER = "3" * 32
ENTRY_CASCADED = "4" * 32
ENTRY_KEPT = "5" * 32
ORG_GONE = "9" * 32
USER = "8" * 32
BACKUP = "7" * 32
MATCH = "a-match"


def _load_migration():
    """Import the revision by path — ``alembic/versions`` is not a package."""
    spec = importlib.util.spec_from_file_location("_orphan_purge", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _db_path(url: str) -> str:
    return url.replace("sqlite:///", "")


def _seed(url: str) -> None:
    """A workspace with one live account and one that is about to vanish.

    Every row here is valid when it is written. The account is then deleted
    with enforcement off, which is what leaves the orphans behind.
    """
    conn = sqlite3.connect(_db_path(url))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(
        "INSERT INTO tournaments (id, name, status, schema_version, data,"
        " created_at, updated_at)"
        " VALUES (?, 'Orphan Purge', 'draft', 1, '{}', ?, ?)",
        (TOURNAMENT, NOW, NOW),
    )
    for account, email in ((ACCOUNT_GONE, "gone@x.test"), (ACCOUNT_KEPT, "kept@x.test")):
        conn.execute(
            "INSERT INTO entrant_accounts (id, email, email_verified,"
            " created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
            (account, email, NOW, NOW),
        )
    for submission, account in (
        (SUBMISSION_ORPHANED, ACCOUNT_GONE),
        (SUBMISSION_KEPT, ACCOUNT_KEPT),
    ):
        conn.execute(
            "INSERT INTO submissions (tournament_id, id, account_id,"
            " submitted_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (TOURNAMENT, submission, account, NOW, NOW),
        )
    for session, account in (
        (SESSION_ORPHANED, ACCOUNT_GONE),
        (SESSION_KEPT, ACCOUNT_KEPT),
    ):
        conn.execute(
            "INSERT INTO entrant_sessions (id, token_hash, account_id,"
            " created_at, last_seen_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (session, session, account, NOW, NOW, "2099-01-01 00:00:00"),
        )
    conn.execute(
        "INSERT INTO entry_events (tournament_id, id, code, discipline,"
        " created_at, updated_at) VALUES (?, ?, 'MS', 'Singles', ?, ?)",
        (TOURNAMENT, EVENT, NOW, NOW),
    )
    # Belongs to the account that SURVIVES, so it is not itself an orphan —
    # the entries row below has to be orphaned by the submission's removal
    # and by nothing else, or it would not prove the second pass.
    conn.execute(
        "INSERT INTO entry_players (tournament_id, id, account_id, full_name,"
        " gender, created_at, updated_at)"
        " VALUES (?, ?, ?, 'A Player', 'unspecified', ?, ?)",
        (TOURNAMENT, PLAYER, ACCOUNT_KEPT, NOW, NOW),
    )
    for entry, submission in (
        (ENTRY_CASCADED, SUBMISSION_ORPHANED),
        (ENTRY_KEPT, SUBMISSION_KEPT),
    ):
        conn.execute(
            "INSERT INTO entries (tournament_id, id, entry_event_id,"
            " submission_id, entry_player_id, pending_reasons,"
            " submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)",
            (TOURNAMENT, entry, EVENT, submission, PLAYER, NOW, NOW),
        )
    conn.commit()
    conn.close()


def _orphan_the_account(url: str) -> None:
    conn = sqlite3.connect(_db_path(url))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("DELETE FROM entrant_accounts WHERE id = ?", (ACCOUNT_GONE,))
    conn.commit()
    conn.close()


def _give_the_workspace_an_org(url: str) -> None:
    """Attach the seeded workspace to an org and hang real content off it.

    Everything a director would lose: the workspace row itself, its matches
    and match states, its ``tournament_backups`` (the in-product recovery
    path) and its membership row.
    """
    conn = sqlite3.connect(_db_path(url))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(
        "INSERT INTO orgs (id, name, created_at) VALUES (?, 'Riverside BC', ?)",
        (ORG_GONE, NOW),
    )
    conn.execute(
        "INSERT INTO users (id, email, email_verified, created_at, updated_at)"
        " VALUES (?, 'director@x.test', 0, ?, ?)",
        (USER, NOW, NOW),
    )
    conn.execute("UPDATE tournaments SET org_id = ? WHERE id = ?", (ORG_GONE, TOURNAMENT))
    conn.execute(
        "INSERT INTO matches (tournament_id, id, status, version, created_at,"
        " updated_at) VALUES (?, ?, 'scheduled', 1, ?, ?)",
        (TOURNAMENT, MATCH, NOW, NOW),
    )
    conn.execute(
        "INSERT INTO match_states (tournament_id, match_id, status, updated_at)"
        " VALUES (?, ?, 'scheduled', ?)",
        (TOURNAMENT, MATCH, NOW),
    )
    conn.execute(
        "INSERT INTO tournament_backups (id, tournament_id, filename, snapshot,"
        " size_bytes, created_at) VALUES (?, ?, 'tournament-orphan-purge.json',"
        " '{}', 2, ?)",
        (BACKUP, TOURNAMENT, NOW),
    )
    conn.execute(
        "INSERT INTO tournament_members (tournament_id, user_id, role, joined_at)"
        " VALUES (?, ?, 'owner', ?)",
        (TOURNAMENT, USER, NOW),
    )
    conn.commit()
    conn.close()


def _orphan_the_org(url: str) -> None:
    conn = sqlite3.connect(_db_path(url))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("DELETE FROM orgs WHERE id = ?", (ORG_GONE,))
    conn.commit()
    conn.close()


def _violations(url: str) -> list[tuple]:
    conn = sqlite3.connect(_db_path(url))
    try:
        return conn.execute("PRAGMA foreign_key_check").fetchall()
    finally:
        conn.close()


def _ids(url: str, table: str, column: str = "id") -> set[str]:
    conn = sqlite3.connect(_db_path(url))
    try:
        return {row[0] for row in conn.execute(f"SELECT {column} FROM {table}")}
    finally:
        conn.close()


def _head_revision(url: str) -> str | None:
    engine = sa.create_engine(url)
    with engine.connect() as conn:
        return conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()


# ---- Removes exactly the reported rows --------------------------------


def test_upgrade_removes_only_the_rows_foreign_key_check_reports(alembic_cfg):  # noqa: F811
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    _orphan_the_account(url)

    # Non-vacuity: if the fixture stopped producing orphans, every assertion
    # below would pass against a migration that did nothing at all.
    before = _violations(url)
    assert {row[0] for row in before} == {"submissions", "entrant_sessions"}, before

    # To the purge revision ITSELF, not "head": this file tests the purge,
    # and pinning "head == purge" made it fail the day any later migration
    # landed (SP-P7's did) for a reason that has nothing to do with orphans.
    command.upgrade(cfg, ORPHAN_PURGE_REVISION)

    # To (at least) the purge revision — "head" keeps moving as later
    # migrations land, and this test is about the purge, not the head.
    assert _revision_reached(url, ORPHAN_PURGE_REVISION)
    assert _violations(url) == []

    # The orphans are gone…
    assert _ids(url, "submissions") == {SUBMISSION_KEPT}
    assert _ids(url, "entrant_sessions") == {SESSION_KEPT}
    # …and so is the entries row the first pass orphaned, which is the whole
    # reason the migration re-checks rather than sweeping once.
    assert _ids(url, "entries") == {ENTRY_KEPT}

    # The negative control, and the half that matters most on a migration
    # that deletes user data: nothing reachable was touched.
    assert _ids(url, "entrant_accounts") == {ACCOUNT_KEPT}
    assert _ids(url, "tournaments") == {TOURNAMENT}
    assert _ids(url, "entry_players") == {PLAYER}
    assert _ids(url, "entry_events") == {EVENT}


# ---- It refuses to delete what a cascade would never have removed -----


def test_a_workspace_whose_org_row_vanished_survives_the_purge(alembic_cfg, caplog):  # noqa: F811
    """The data-loss case: ``tournaments.org_id`` is ON DELETE **RESTRICT**.

    ``PRAGMA foreign_key_check`` reports a tournament whose org row vanished
    while enforcement was inert exactly as it reports a truly orphaned
    ``submissions`` row — but the two are nothing alike. A child of a CASCADE
    parent was already logically deleted; a tournament is a top-level entity
    the Hub lists and the director works in every day (the list query joins
    ``tournament_members``, never ``orgs``). Deleting it, unattended, from the
    app's startup path takes its matches, its match states, its membership and
    the ``tournament_backups`` that were the only way back.

    So the purge is bounded by the schema's own ON DELETE action: it removes
    the rows a cascade would have removed, and nothing else. What it refuses
    it must say out loud — the row is still a booby trap on any UPDATE, which
    is the entire reason this migration exists.
    """
    import logging

    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    _give_the_workspace_an_org(url)
    _orphan_the_account(url)
    _orphan_the_org(url)

    before = _violations(url)
    assert {row[0] for row in before} == {
        "submissions",
        "entrant_sessions",
        "tournaments",
    }, before

    with caplog.at_level(logging.INFO, logger="alembic.runtime.migration"):
        command.upgrade(cfg, "head")

    # The workspace and every row hanging off it is still there.
    assert _ids(url, "tournaments") == {TOURNAMENT}
    assert _ids(url, "matches") == {MATCH}
    assert _ids(url, "match_states", "match_id") == {MATCH}
    assert _ids(url, "tournament_backups") == {BACKUP}
    assert _ids(url, "tournament_members", "tournament_id") == {TOURNAMENT}

    # The genuine orphans still go — the bound narrows the purge, it does not
    # switch it off.
    assert _ids(url, "submissions") == {SUBMISSION_KEPT}
    assert _ids(url, "entrant_sessions") == {SESSION_KEPT}
    assert _ids(url, "entries") == {ENTRY_KEPT}

    # Skipping quietly is its own trap: the row still fails any UPDATE that
    # touches it, so the operator is told which row and what to do about it.
    assert _violations(url) == [("tournaments", 1, "orgs", 0)]
    refusals = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(refusals) == 1, caplog.records
    message = refusals[0].getMessage()
    assert "tournaments" in message and "org_id" in message and "RESTRICT" in message


# ---- No-op on a clean database ----------------------------------------


def test_the_purge_is_a_no_op_on_a_database_with_no_orphans(alembic_cfg):  # noqa: F811
    """Seed only valid rows, then ask the purge to run again over them.

    ``upgrade head`` already ran the revision once on this file, so running
    the function directly is the only way to put it in front of populated,
    *valid* data — which is the case every database that was created after
    ``ad58940`` presents.
    """
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    _seed(url)

    counts = {
        table: _ids(url, table)
        for table in (
            "tournaments",
            "entrant_accounts",
            "entrant_sessions",
            "submissions",
            "entries",
            "entry_players",
            "entry_events",
        )
    }
    assert _violations(url) == []

    purge_orphans = _load_migration().purge_orphans
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        assert purge_orphans(conn) == {}

    for table, ids in counts.items():
        assert _ids(url, table) == ids, f"{table} lost rows on a clean database"


def test_the_purge_reports_what_it_removed(alembic_cfg):  # noqa: F811
    """The return value is the log line's content — silent deletion is worse
    than none, so the counts are asserted rather than trusted."""
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    _seed(url)
    _orphan_the_account(url)

    purge_orphans = _load_migration().purge_orphans
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        removed = purge_orphans(conn)

    assert removed == {"submissions": 1, "entrant_sessions": 1, "entries": 1}


# ---- Postgres is skipped, not attempted -------------------------------


def test_upgrade_does_not_issue_a_pragma_on_a_non_sqlite_dialect(monkeypatch):
    """``PRAGMA`` is SQLite-only syntax and would raise on Postgres, where
    foreign keys were always enforced and no orphan can exist. Asserted by
    driving ``upgrade()`` against a bind that claims to be Postgres and would
    explode if anything were executed on it."""
    module = _load_migration()

    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

        def exec_driver_sql(self, *args, **kwargs):
            raise AssertionError("upgrade() executed SQL on a non-SQLite bind")

    monkeypatch.setattr(module.op, "get_bind", lambda: _Bind())
    module.upgrade()
