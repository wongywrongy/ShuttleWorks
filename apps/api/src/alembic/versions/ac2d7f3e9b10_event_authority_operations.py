"""Add authority epochs and ordered operation synchronization tables.

Revision ID: ac2d7f3e9b10
Revises: ab1c6e2b8d4f
Create Date: 2026-09-01 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ac2d7f3e9b10"
down_revision: Union[str, Sequence[str], None] = "ab1c6e2b8d4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tournament_authority_epochs",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("checkpoint_hash", sa.String(length=64), nullable=False),
        sa.Column("checkpoint_schema_version", sa.Integer(), nullable=False),
        sa.Column("capability_digest", sa.String(length=64), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recovery_reason", sa.String(length=500), nullable=True),
        sa.CheckConstraint(
            "state IN ('preparing', 'active', 'closed', 'recovered')",
            name="ck_tournament_authority_state",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "epoch"),
    )
    op.create_index(
        "ix_tournament_authority_node_state",
        "tournament_authority_epochs",
        ["node_id", "state"],
    )

    op.create_table(
        "event_operations",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("command_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.String(length=200), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("occurred_at_local", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at_node", sa.DateTime(timezone=True), nullable=False),
        sa.Column("traceparent", sa.String(length=128), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            ["tournament_authority_epochs.tournament_id", "tournament_authority_epochs.epoch"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("operation_id"),
        sa.UniqueConstraint(
            "tournament_id",
            "authority_epoch",
            "sequence",
            name="uq_event_operations_epoch_sequence",
        ),
    )
    op.create_index(
        "ix_event_operations_aggregate",
        "event_operations",
        ["tournament_id", "aggregate_type", "aggregate_id"],
    )

    op.create_table(
        "sync_outbox",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["operation_id"], ["event_operations.operation_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("operation_id"),
    )
    op.create_index(
        "ix_sync_outbox_pending",
        "sync_outbox",
        ["acknowledged_at", "next_attempt_at"],
    )

    op.create_table(
        "sync_inbox",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("operation_id"),
        sa.UniqueConstraint(
            "tournament_id",
            "authority_epoch",
            "sequence",
            name="uq_sync_inbox_epoch_sequence",
        ),
    )

    op.create_table(
        "sync_checkpoints",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("highest_contiguous_sequence", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "authority_epoch"),
    )

    op.create_table(
        "sync_quarantine",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=True),
        sa.Column("authority_epoch", sa.Integer(), nullable=True),
        sa.Column("operation_id", sa.Uuid(), nullable=True),
        sa.Column("reason_code", sa.String(length=80), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sync_quarantine_tournament_created",
        "sync_quarantine",
        ["tournament_id", "created_at"],
    )
    op.create_table(
        "cloud_event_projections",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id"),
    )


def downgrade() -> None:
    op.drop_table("cloud_event_projections")
    op.drop_index(
        "ix_sync_quarantine_tournament_created", table_name="sync_quarantine"
    )
    op.drop_table("sync_quarantine")
    op.drop_table("sync_checkpoints")
    op.drop_table("sync_inbox")
    op.drop_index("ix_sync_outbox_pending", table_name="sync_outbox")
    op.drop_table("sync_outbox")
    op.drop_index("ix_event_operations_aggregate", table_name="event_operations")
    op.drop_table("event_operations")
    op.drop_index(
        "ix_tournament_authority_node_state",
        table_name="tournament_authority_epochs",
    )
    op.drop_table("tournament_authority_epochs")
