"""display_tokens + invite_links.email (SP-CLOUD-2 Phase 3)

The public spectator display becomes a real capability URL: a random
token per workspace resolves the projection routes; the raw tournament
UUID stops being the public key. Invites gain an optional email for
the cloud email-invite flow (NULL = local link invite).

Revision ID: o8f2a6b0c4d5
Revises: n7e1f5a9b3c4
Create Date: 2026-08-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "o8f2a6b0c4d5"
down_revision = "n7e1f5a9b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "display_tokens",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id"),
    )
    op.create_index(
        "uq_display_tokens_token", "display_tokens", ["token"], unique=True
    )
    with op.batch_alter_table("invite_links") as batch:
        batch.add_column(sa.Column("email", sa.String(length=320), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("invite_links") as batch:
        batch.drop_column("email")
    op.drop_index("uq_display_tokens_token", table_name="display_tokens")
    op.drop_table("display_tokens")
