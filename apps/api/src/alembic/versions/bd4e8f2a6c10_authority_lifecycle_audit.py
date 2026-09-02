"""Add append-only authority lifecycle evidence.

Revision ID: bd4e8f2a6c10
Revises: ac2d7f3e9b10
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "bd4e8f2a6c10"
down_revision: Union[str, Sequence[str], None] = "ac2d7f3e9b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite requires a table rebuild for CHECK changes; Alembic's batch
    # context performs that rebuild while preserving existing epoch history.
    with op.batch_alter_table("tournament_authority_epochs") as batch:
        batch.drop_constraint("ck_tournament_authority_state", type_="check")
        batch.create_check_constraint(
            "ck_tournament_authority_state",
            "state IN ('preparing', 'active', 'closed', 'recovered', 'cloud')",
        )
    op.create_table(
        "tournament_authority_transitions",
        sa.Column("transition_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("transition_type", sa.String(length=40), nullable=False),
        sa.Column("from_epoch", sa.Integer(), nullable=True),
        sa.Column("to_epoch", sa.Integer(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("declared_last_sequence", sa.Integer(), nullable=True),
        sa.Column("evidence_hash", sa.String(length=128), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "transition_type IN ('return_to_cloud', 'planned_transfer', 'lost_node_recovery')",
            name="ck_authority_transition_type",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("transition_id"),
    )
    op.create_index(
        "ix_authority_transitions_tournament_created",
        "tournament_authority_transitions",
        ["tournament_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_authority_transitions_tournament_created",
        table_name="tournament_authority_transitions",
    )
    op.drop_table("tournament_authority_transitions")
    with op.batch_alter_table("tournament_authority_epochs") as batch:
        batch.drop_constraint("ck_tournament_authority_state", type_="check")
        batch.create_check_constraint(
            "ck_tournament_authority_state",
            "state IN ('preparing', 'active', 'closed', 'recovered')",
        )
