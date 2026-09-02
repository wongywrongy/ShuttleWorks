"""Add enrolled event-node identities and signed authority grant material.

Revision ID: cf6a1d8e4b20
Revises: bd4e8f2a6c10
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "cf6a1d8e4b20"
down_revision: Union[str, Sequence[str], None] = "bd4e8f2a6c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tournament_authority_epochs") as batch:
        batch.add_column(sa.Column("grant", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("grant_signature", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("grant_key_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("allowed_command_classes", sa.JSON(), nullable=True))

    op.create_table(
        "event_node_devices",
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("public_key", sa.String(length=128), nullable=False),
        sa.Column("enrolled_by", sa.Uuid(), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("device_id"),
        sa.UniqueConstraint("public_key", name="uq_event_node_devices_public_key"),
    )
    op.create_index(
        "ix_event_node_devices_org_revoked",
        "event_node_devices",
        ["org_id", "revoked_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_event_node_devices_org_revoked", table_name="event_node_devices")
    op.drop_table("event_node_devices")
    with op.batch_alter_table("tournament_authority_epochs") as batch:
        batch.drop_column("allowed_command_classes")
        batch.drop_column("grant_key_id")
        batch.drop_column("grant_signature")
        batch.drop_column("grant")
