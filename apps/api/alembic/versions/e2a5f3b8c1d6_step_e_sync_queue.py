"""step_e_sync_queue

Add the ``sync_queue`` table — the SQLite → Supabase Postgres outbox
introduced by the architecture-adjustment arc's Step E. Every match /
tournament write inserts a row in the same transaction; a background
worker drains the queue. Schema uses portable types (``JSON``,
app-side UUID defaults, ``DateTime(timezone=True)``) so the same
migration runs cleanly on SQLite and Postgres.

Revision ID: e2a5f3b8c1d6
Revises: d8c4f1a7e6b2
Create Date: 2026-05-13

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e2a5f3b8c1d6"
down_revision: Union[str, Sequence[str], None] = "d8c4f1a7e6b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_index("ix_sync_queue_created_attempts", table_name="sync_queue")
    op.drop_table("sync_queue")
