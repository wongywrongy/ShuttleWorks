"""drop_sync_queue

Remove the ``sync_queue`` table — the SQLite → Supabase Postgres outbox
added by ``e2a5f3b8c1d6`` (architecture-adjustment arc, Step E).

SP-CLOUD-3 / 0.E retires the Supabase mirror entirely. The outbox was
designed for a world where local SQLite was the only source of truth and
wanted a cloud copy; with Postgres as the cloud primary it was either
redundant or dead weight, and it was never operated — no project was
ever populated and no credential ever existed. It was also a one-way
push with no restore path, so it was never a recovery mechanism.
In-product recovery is ``tournament_backups``. See ADR-0007.

``sync_queue`` has no foreign keys in either direction, so this drop has
no ordering constraints and cannot cascade.

**Data loss on upgrade is intended and total.** Any rows present are
un-drained outbox entries for a destination that does not exist; nothing
can consume them. The downgrade recreates the table's *structure* (so
the chain round-trips cleanly) but cannot resurrect rows — standard for
a drop migration, and harmless here because the rows have no consumer.

Portable types only (``JSON``, app-side UUID defaults,
``DateTime(timezone=True)``) so it runs on SQLite and Postgres alike.

Revision ID: p9a3b7c1d5e6
Revises: o8f2a6b0c4d5
Create Date: 2026-08-04

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "p9a3b7c1d5e6"
down_revision: Union[str, Sequence[str], None] = "o8f2a6b0c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_sync_queue_created_attempts", table_name="sync_queue")
    op.drop_table("sync_queue")


def downgrade() -> None:
    """Recreate the table exactly as ``e2a5f3b8c1d6`` left it.

    Structure only — see the module docstring. Kept byte-for-byte
    equivalent to the original ``upgrade()`` so a downgrade lands on a
    schema the pre-removal code would still recognise.
    """
    op.create_table(
        "sync_queue",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("last_attempt", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sync_queue_created_attempts",
        "sync_queue",
        ["created_at", "attempts"],
    )
