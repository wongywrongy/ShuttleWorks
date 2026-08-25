"""The person key on bracket participants, and the match_states FK.

SP-DM-3 P4. Two constraints that turn two string joins into real edges.

**1. ``bracket_participants.entry_player_id`` (R-DM-2(a)).** The first
constrained hop from the people spine to the competition spine. Nullable and
NOT backfilled, by design: a participant a director typed in by hand never
came from a person, and deriving one from ``meta.sourceEntryId`` is a data
migration this ruling did not ask for.

**Why the FK is composite.** ``entry_players``' primary key is
``(tournament_id, id)`` — tournament-scoped by construction — so a
single-column FK onto ``entry_players.id`` is not expressible at all. The
participant already carries ``tournament_id`` as the leading column of its own
PK, so the pair is free.

**Why CASCADE and not SET NULL.** SQLite and portable Postgres apply ``SET
NULL`` to *every* referencing column of a composite key, ``tournament_id``
included — and here that is a NOT NULL primary-key column. The first
``entry_players`` delete under a referencing participant would raise, and
depending on cascade evaluation order that can take tournament deletion itself
down with it. CASCADE is also the exact prior art for this shape:
``entries.(tournament_id, entry_player_id)`` → ``entry_players`` is CASCADE
(``s3d8f2b5c0e1``). The blast radius is bounded in practice — no live code path
deletes ``entrant_accounts`` or ``entry_players`` rows; erasure scrubs fields
and stamps ``erased_at`` (``entries/retention.py``).

**2. ``match_states.(tournament_id, match_id)`` → ``matches`` (F-DM-22).** One
Meet match is three records joined by an unconstrained ``String(100)``, and
``match_states`` was the table with no ``__table_args__`` at all.
``commands`` (``db/models.py``) is the prior art for the same composite shape
onto the same parent.

**Why it cascades rather than restricts.** The Meet projection
(``repositories/local.py``) deletes a ``matches`` row whose id left
``tournaments.data["matches"]``. A RESTRICT would turn that ordinary write into
an ``IntegrityError``. The consequence is real and accepted: live-ops state for
a match removed from the blob is now deleted with it instead of surviving
orphaned. That behaviour change was characterized in
``tests/backend/unit/test_repositories.py`` *before* this migration, and that
test is flipped in the same commit.

**Why the sweep exists.** ``match_states`` never had this FK on EITHER backend,
so unlike ``u5f0b4d7e2a3`` this is not a SQLite-only pre-enforcement problem
and the ``PRAGMA``-driven prior art does not apply: the projection has been
deleting parent ``matches`` rows and leaving these behind on Postgres too. The
sweep is plain, dialect-neutral SQL for that reason, it runs between the two
constraint changes because the FK cannot be added over rows that violate it,
and it logs its rowcount — a silent deletion of operator data would be worse
than no sweep at all.

Revision ID: y9e4f0a2b7c8
Revises: x8d3e9f1a6b7
Create Date: 2026-08-25 00:00:00.000000
"""
from __future__ import annotations

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "y9e4f0a2b7c8"
down_revision: Union[str, Sequence[str], None] = "x8d3e9f1a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ``alembic.*`` is the one logger `alembic.ini` configures at INFO, so this
# reaches an operator running `alembic upgrade head` without any extra setup.
log = logging.getLogger("alembic.runtime.migration")

_SWEEP = (
    "DELETE FROM match_states WHERE NOT EXISTS ("
    " SELECT 1 FROM matches m WHERE m.tournament_id ="
    " match_states.tournament_id AND m.id = match_states.match_id)"
)


def upgrade() -> None:
    # 1. The new pointer. ``batch_alter_table`` is mandatory: SQLite cannot
    #    ALTER TABLE ... ADD CONSTRAINT and has to rebuild the table.
    #    ``alembic/env.py`` disables FK enforcement on the migration
    #    connection, which is what makes that rebuild safe.
    with op.batch_alter_table("bracket_participants") as batch:
        batch.add_column(sa.Column("entry_player_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_bracket_participants_entry_player",
            "entry_players",
            ["tournament_id", "entry_player_id"],
            ["tournament_id", "id"],
            ondelete="CASCADE",
        )

    # 2. One-time sweep of the state rows whose match is already gone.
    removed = op.get_bind().execute(sa.text(_SWEEP)).rowcount
    if removed:
        log.info(
            "person key migration: deleted %d match_states row(s) whose "
            "matches parent was already gone (orphaned by the Meet "
            "projection before this FK existed)",
            removed,
        )
    else:
        # ASCII, not an em-dash: this line is read on a Windows console,
        # where the default cp1252 stdout mangles one into a `?`.
        log.info("person key migration: no orphaned match_states rows - nothing removed")

    # 3. The FK itself.
    with op.batch_alter_table("match_states") as batch:
        batch.create_foreign_key(
            "fk_match_states_match",
            "matches",
            ["tournament_id", "match_id"],
            ["tournament_id", "id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    """Symmetric for the schema; the swept rows are not restorable.

    Every row the sweep deleted was a state record for a match that no longer
    exists — unreachable by any query that starts from a match, and exactly
    what the cascade would have removed had the constraint been there. A
    downgrade that fabricated replacements would invent data.
    """
    with op.batch_alter_table("match_states") as batch:
        batch.drop_constraint("fk_match_states_match", type_="foreignkey")

    with op.batch_alter_table("bracket_participants") as batch:
        batch.drop_constraint(
            "fk_bracket_participants_entry_player", type_="foreignkey"
        )
        batch.drop_column("entry_player_id")
