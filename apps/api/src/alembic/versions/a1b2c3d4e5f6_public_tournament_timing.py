"""Add public tournament end date and IANA timezone.

Existing tournaments retain their recorded start date as a conservative
single-day window and use UTC until an operator supplies a venue timezone.

Revision ID: a1b2c3d4e5f6
Revises: aa1b6c4e0d3f
Create Date: 2026-08-29 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "aa1b6c4e0d3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("tournament_end_date", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "tournaments",
        sa.Column(
            "time_zone", sa.String(length=64), nullable=False, server_default="UTC"
        ),
    )
    # Preserve the old single-day semantics for all legacy rows. Rows without
    # a date remain undated; phase derivation intentionally does not guess one.
    op.execute(
        sa.text(
            "UPDATE tournaments SET tournament_end_date = tournament_date "
            "WHERE tournament_end_date IS NULL AND tournament_date IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("tournaments", "time_zone")
    op.drop_column("tournaments", "tournament_end_date")
