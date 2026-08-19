"""step_c_commands_table

Add the ``commands`` table — the idempotent operator command log + audit
trail introduced by the architecture-adjustment arc's Step C. Composite
FK to ``matches`` matches the Step A schema; single-column FK + UUID
match_id from the prompt's literal pseudocode would not.

Revision ID: d8c4f1a7e6b2
Revises: b7e3a9f4c8d2
Create Date: 2026-05-13

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d8c4f1a7e6b2"
down_revision: Union[str, Sequence[str], None] = "b7e3a9f4c8d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "commands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("submitted_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_commands_tournament_match_applied",
        "commands",
        ["tournament_id", "match_id", "applied_at"],
    )
    op.create_index(
        "ix_commands_submitted_by_created",
        "commands",
        ["submitted_by", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_commands_submitted_by_created", table_name="commands")
    op.drop_index(
        "ix_commands_tournament_match_applied", table_name="commands"
    )
    op.drop_table("commands")
