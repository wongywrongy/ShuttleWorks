"""Add event-scoped offline operator sessions."""
from __future__ import annotations

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d7f4a9c2b6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "offline_operator_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            [
                "tournament_authority_epochs.tournament_id",
                "tournament_authority_epochs.epoch",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_offline_operator_sessions_token_hash", "offline_operator_sessions", ["token_hash"], unique=True)
    op.create_index("ix_offline_operator_sessions_scope", "offline_operator_sessions", ["tournament_id", "user_id"])


def downgrade() -> None:
    op.drop_index("ix_offline_operator_sessions_scope", table_name="offline_operator_sessions")
    op.drop_index("uq_offline_operator_sessions_token_hash", table_name="offline_operator_sessions")
    op.drop_table("offline_operator_sessions")
