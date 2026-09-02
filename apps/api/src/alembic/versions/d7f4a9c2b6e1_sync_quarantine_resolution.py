"""Track visible sync quarantine resolution by audited correction operation.

Revision ID: d7f4a9c2b6e1
Revises: cf6a1d8e4b20
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7f4a9c2b6e1"
down_revision: Union[str, Sequence[str], None] = "cf6a1d8e4b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("sync_quarantine") as batch:
        batch.add_column(sa.Column("status", sa.String(length=16), nullable=False, server_default="open"))
        batch.add_column(sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("resolved_by", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("resolution_operation_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("resolution_note", sa.String(length=500), nullable=True))
        batch.create_check_constraint(
            "ck_sync_quarantine_status", "status IN ('open', 'resolved')"
        )
    op.create_index(
        "ix_sync_quarantine_tournament_status",
        "sync_quarantine",
        ["tournament_id", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sync_quarantine_tournament_status", table_name="sync_quarantine"
    )
    with op.batch_alter_table("sync_quarantine") as batch:
        batch.drop_constraint("ck_sync_quarantine_status", type_="check")
        batch.drop_column("resolution_note")
        batch.drop_column("resolution_operation_id")
        batch.drop_column("resolved_by")
        batch.drop_column("resolved_at")
        batch.drop_column("status")
