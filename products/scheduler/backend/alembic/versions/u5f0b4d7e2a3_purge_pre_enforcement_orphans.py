"""Delete the rows SQLite orphaned while foreign keys were unenforced.

``ad58940`` turned ``PRAGMA foreign_keys`` ON for every SQLite connection, so
the ``ondelete="CASCADE"`` clauses declared in ``database/models.py`` finally
fire. **SQLite never revalidates rows that already exist**, so every database
created before that commit still carries whatever the inert cascades left
behind — the demo database carries ten violations: four ``submissions`` rows
from two deleted workspaces and two ``entrant_sessions`` rows for deleted
accounts.

That is a live regression, not cosmetic tidying. An ``UPDATE`` touching such a
row now raises ``IntegrityError`` where it used to succeed, because SQLite
validates the foreign keys of every row it writes. The row was unreachable and
harmless; it is now a booby trap on any laptop database older than that
commit. This migration is the one-time sweep.

**Keyed off ``PRAGMA foreign_key_check``, which reports exactly the invalid
rows** — table, rowid, missing parent — rather than off a hand-written list of
tables. A list would be wrong the moment a table is added, and wrong in the
direction that deletes nothing while looking thorough. It also means this
migration deletes *only* what SQLite itself calls invalid: on a clean database
the first check comes back empty and nothing is executed at all.

**Why the loop.** ``alembic/env.py`` disables enforcement on the migration
connection, and must keep doing so — batch mode rebuilds a table by DROPping
the original, and with enforcement on SQLite issues an implicit ``DELETE
FROM`` first, firing every child cascade (measured: upgrading a populated
pre-orgs database through ``n7e1f5a9b3c4`` deleted every ``matches`` /
``match_states`` / ``tournament_backups`` / ``tournament_members`` row). With
enforcement off our own DELETEs do not cascade either, so removing an orphaned
``submissions`` row can orphan the ``entries`` rows hanging off it. Re-running
the check until it comes back clean reaches the state the cascades would have
produced, without ever turning enforcement back on.

**Postgres is skipped outright.** Foreign keys were always enforced there, so
no orphan can exist, and ``PRAGMA`` is SQLite-only syntax that would raise.

The deletion logic is a module-level function taking a connection so
``tests/unit/test_orphan_purge_migration.py`` can drive it directly as well as
through ``alembic upgrade head``.
"""
from __future__ import annotations

import logging
from typing import Sequence, Union

from alembic import op

revision: str = "u5f0b4d7e2a3"
down_revision: Union[str, Sequence[str], None] = "t4e9a3c6d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ``alembic.*`` is the one logger `alembic.ini` configures at INFO, so this
# reaches an operator running `alembic upgrade head` without any extra setup.
log = logging.getLogger("alembic.runtime.migration")

# Each pass can only expose orphans one level further down the FK graph, and
# that graph is a handful of levels deep (tournament → submission → entry →
# entry_event). The bound exists so a cycle, or a row the check reports but
# the DELETE cannot remove, fails loudly instead of spinning.
_MAX_PASSES = 20


def purge_orphans(bind) -> dict[str, int]:  # noqa: ANN001
    """Delete every row ``PRAGMA foreign_key_check`` reports, and only those.

    Returns ``{table: rows_removed}`` — empty when the database was clean.
    """
    removed: dict[str, int] = {}

    for _ in range(_MAX_PASSES):
        violations = bind.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        if not violations:
            break

        # One row can violate several constraints at once (the demo database's
        # submissions rows each miss both their account and their workspace),
        # so collapse to a set of rowids per table before deleting.
        by_table: dict[str, set[int]] = {}
        for table, rowid, parent, _fkid in violations:
            if rowid is None:
                # WITHOUT ROWID tables report no rowid, and this migration has
                # no other way to name the single offending row. Refuse rather
                # than widen the DELETE — it deletes user data.
                raise RuntimeError(
                    f"{table} has orphaned rows referencing {parent} but reports "
                    "no rowid (WITHOUT ROWID table); refusing to guess which "
                    "rows to delete"
                )
            by_table.setdefault(table, set()).add(rowid)

        for table, rowids in by_table.items():
            ordered = sorted(rowids)
            quoted = '"' + table.replace('"', '""') + '"'
            placeholders = ",".join("?" * len(ordered))
            bind.exec_driver_sql(
                f"DELETE FROM {quoted} WHERE rowid IN ({placeholders})",
                tuple(ordered),
            )
            removed[table] = removed.get(table, 0) + len(ordered)
            log.info(
                "orphan purge: deleted %d row(s) from %s (rowid %s)",
                len(ordered),
                table,
                ", ".join(str(r) for r in ordered),
            )
    else:
        raise RuntimeError(
            f"PRAGMA foreign_key_check still reports violations after "
            f"{_MAX_PASSES} passes; not deleting further"
        )

    return removed


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        log.info(
            "orphan purge: %s enforces foreign keys, so no orphan can exist — "
            "skipped",
            bind.dialect.name,
        )
        return

    removed = purge_orphans(bind)
    if removed:
        log.info(
            "orphan purge: removed %d row(s) orphaned before foreign keys were "
            "enforced (%s)",
            sum(removed.values()),
            ", ".join(f"{t}={n}" for t, n in sorted(removed.items())),
        )
    else:
        # ASCII, not an em-dash: this line is read on a Windows console,
        # where the default cp1252 stdout mangles one into a `?`.
        log.info("orphan purge: no orphaned rows found - nothing removed")


def downgrade() -> None:
    """Irreversible, and honestly so.

    The rows are gone and were unreachable by any query before they went —
    every one of them referenced a parent that no longer exists. A downgrade
    that fabricated replacements would invent data; one that raised would
    block an otherwise valid rollback over rows nobody can reach.
    """
