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

**Bounded to the constraints declared ``ON DELETE CASCADE``, because
``foreign_key_check`` is not the same question as "should this row be gone".**
It reports every invalid row, and invalid does not imply orphaned.
``tournaments.org_id`` is a *nullable* ``ondelete="RESTRICT"`` pointer
(``database/models.py``): a workspace whose org row vanished while enforcement
was inert is reported by the check, yet the Hub lists it and the director
works in it every day — the list query joins ``tournament_members``, never
``orgs``. Deleting it here would take its matches, its match states, its
membership and its ``tournament_backups`` — the in-product recovery path —
unattended, at startup, on a laptop, with no backup and no downgrade. So each
violation is matched against its constraint's ``on_delete`` action from
``PRAGMA foreign_key_list``, and only ``CASCADE`` is swept. That makes this
file's claim literally true rather than true of the two cases we happened to
observe: every row deleted is a row SQLite itself would have deleted, had
enforcement been on when the parent went. Reading the action from the schema
keeps a new table correct for free, which a hand-written allowlist would not.

**A refused violation is reported at ERROR, and the migration still
completes.** Skipping quietly would be its own trap — the row keeps failing
any ``UPDATE`` that touches it, which is the entire reason this migration
exists. Raising instead is worse than it looks: ``app.main._run_migrations``
catches and continues, so the raise would not stop the app, it would leave
``alembic_version`` below head *permanently* — this purge re-raising on every
boot, every future migration blocked behind it, and the genuine orphans never
swept because the transaction rolled back. That trades one unwritable row for
a database that silently stops receiving schema changes. Nor can the migration
repair such a row without inventing policy (fabricate the missing org, or null
out a pointer that drives tenancy). So it names the row and leaves it: a
degraded workspace the operator can see and fix beats a deleted one.

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


def _fk_actions(bind, table: str) -> dict[int, tuple[str, str]]:  # noqa: ANN001
    """``{fkid: (on_delete_action, columns)}`` for one table, from the schema.

    ``fkid`` is the fourth column of ``PRAGMA foreign_key_check`` and indexes
    into ``PRAGMA foreign_key_list``. A composite key reports one row per
    column, all sharing an ``id``, so the columns are joined for the log.
    """
    actions: dict[int, tuple[str, list[str]]] = {}
    rows = bind.exec_driver_sql(
        'SELECT id, "from", "on_delete" FROM pragma_foreign_key_list(?)', (table,)
    ).fetchall()
    for fkid, column, on_delete in rows:
        _, columns = actions.setdefault(fkid, ((on_delete or "NO ACTION").upper(), []))
        columns.append(column)
    return {fkid: (action, ", ".join(cols)) for fkid, (action, cols) in actions.items()}


def purge_orphans(bind) -> dict[str, int]:  # noqa: ANN001
    """Delete the rows a declared ``ON DELETE CASCADE`` would have removed.

    Returns ``{table: rows_removed}`` — empty when the database was clean.
    Violations of any other action are left in place and logged at ERROR; see
    the module docstring for why they are neither deleted nor raised on.
    """
    removed: dict[str, int] = {}
    refused: list[tuple] = []

    for _ in range(_MAX_PASSES):
        violations = bind.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        if not violations:
            refused = []
            break

        # One row can violate several constraints at once (the demo database's
        # submissions rows each miss both their account and their workspace),
        # so collapse to a set of rowids per table before deleting.
        actions = {
            table: _fk_actions(bind, table) for table in {v[0] for v in violations}
        }
        by_table: dict[str, set[int]] = {}
        refused = []
        for table, rowid, parent, fkid in violations:
            # Unknown fkid cannot happen against a consistent schema; default
            # to refusing anyway, because the fallback here deletes user data.
            action, columns = actions[table].get(fkid, ("UNKNOWN", "?"))
            if action != "CASCADE":
                refused.append((table, rowid, columns, parent, action))
                continue
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

        if not by_table:
            # Everything still reported is refused, so no further pass can
            # make progress. Stop here rather than spin to _MAX_PASSES.
            break

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

    if refused:
        log.error(
            "orphan purge: REFUSED to delete %d invalid row(s) whose missing "
            "parent is not declared ON DELETE CASCADE - the row is reachable "
            "data this migration must not destroy, but any UPDATE touching it "
            "will fail with IntegrityError until it is fixed. Restore the "
            "missing parent row, or clear the pointer. Rows: %s",
            len(refused),
            "; ".join(
                f"{table} rowid {rowid} ({columns} -> {parent}, ON DELETE {action})"
                for table, rowid, columns, parent, action in refused
            ),
        )

    return removed


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        log.info(
            "orphan purge: %s enforces foreign keys, so no orphan can exist - "
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

    The rows are gone and were unreachable by any query before they went:
    every one was the child of a parent declared ON DELETE CASCADE, so it was
    already logically deleted and SQLite would have removed it itself had
    enforcement been on at the time. A downgrade that fabricated replacements
    would invent data; one that raised would block an otherwise valid rollback
    over rows nobody can reach.
    """
