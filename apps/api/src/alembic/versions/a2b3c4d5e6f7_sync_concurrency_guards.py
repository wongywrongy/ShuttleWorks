"""Add atomic operation sequences and live-authority uniqueness.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sync_outbox",
        sa.Column("permanently_blocked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_index("ix_sync_outbox_pending", table_name="sync_outbox")
    op.create_index(
        "ix_sync_outbox_pending",
        "sync_outbox",
        ["acknowledged_at", "permanently_blocked_at", "next_attempt_at"],
    )
    op.create_table(
        "event_operation_sequences",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("next_sequence", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "next_sequence >= 1", name="ck_event_operation_sequence_positive"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            [
                "tournament_authority_epochs.tournament_id",
                "tournament_authority_epochs.epoch",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "authority_epoch"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO event_operation_sequences
                (tournament_id, authority_epoch, next_sequence)
            SELECT a.tournament_id, a.epoch, COALESCE(MAX(o.sequence), 0) + 1
            FROM tournament_authority_epochs AS a
            LEFT JOIN event_operations AS o
              ON o.tournament_id = a.tournament_id
             AND o.authority_epoch = a.epoch
            GROUP BY a.tournament_id, a.epoch
            """
        )
    )
    op.create_index(
        "uq_tournament_authority_one_live_epoch",
        "tournament_authority_epochs",
        ["tournament_id"],
        unique=True,
        sqlite_where=sa.text("state IN ('preparing', 'active')"),
        postgresql_where=sa.text("state IN ('preparing', 'active')"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_tournament_authority_one_live_epoch",
        table_name="tournament_authority_epochs",
    )
    op.drop_table("event_operation_sequences")
    op.drop_index("ix_sync_outbox_pending", table_name="sync_outbox")
    op.create_index(
        "ix_sync_outbox_pending",
        "sync_outbox",
        ["acknowledged_at", "next_attempt_at"],
    )
    op.drop_column("sync_outbox", "permanently_blocked_at")
