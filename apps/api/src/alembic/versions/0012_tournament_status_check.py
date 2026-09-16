"""additive — ``tournaments.status`` gets the CHECK its four siblings have.

SP-DM-3 P7a constrained ``tournaments.kind``, ``matches.status``,
``entries.state`` and ``tournament_members.role`` and deliberately skipped this
column: its vocabulary was produced by nothing in the code, so a CHECK here
would have been a constant invented in a migration. ``TOURNAMENT_STATUSES`` in
``db/models.py`` is now that authority, and every write path validates against
it, so the constraint has something to mirror.

EXISTING ROWS OUTSIDE THE VOCABULARY are normalized to ``'draft'``, not
refused. Nothing in the product has ever produced another value — the column
default is ``draft`` and each of the three write paths already admitted only
these three — so a row carrying one is a hand-edited or imported database. For
such a row ``draft`` is the safe reading: it is the state a workspace starts in,
and it leaves the row visible and editable in the Hub rather than archived out
of sight.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_VOCABULARY = "('draft', 'active', 'archived')"


def upgrade() -> None:
    op.execute(f"UPDATE tournaments SET status = 'draft' WHERE status NOT IN {_VOCABULARY}")
    # SQLite cannot add a CHECK in place, so batch mode rebuilds the table —
    # and `payments_keep_history` is a trigger on another table whose body
    # names `tournaments`. Since SQLite 3.25 a RENAME reparses every trigger
    # body, and the rebuild's final rename happens while `tournaments` does
    # not exist, so that parse fails. `legacy_alter_table` is the documented
    # way to keep a rename from reparsing; the trigger text is unchanged and
    # resolves again the moment the rename lands.
    sqlite = op.get_bind().dialect.name == "sqlite"
    if sqlite:
        op.execute("PRAGMA legacy_alter_table=ON")
    try:
        with op.batch_alter_table("tournaments", reflect_kwargs={"resolve_fks": False}) as batch:
            batch.create_check_constraint(
                "ck_tournaments_status", sa.text(f"status IN {_VOCABULARY}")
            )
    finally:
        if sqlite:
            op.execute("PRAGMA legacy_alter_table=OFF")


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
