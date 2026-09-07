"""Add per-workspace venue-board settings (branding + board switches).

Holds the board title, logo/banner image sources, accent, and the
``Show next`` / ``Show scores`` switches that both venue boards read.
Nullable: an untouched workspace keeps the board's built-in defaults
(no branding, Next off, scores shown).

Revision ID: e7c1a9d4b208
Revises: d5f0a1b2c3d4
Create Date: 2026-09-07 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e7c1a9d4b208"
down_revision: Union[str, Sequence[str], None] = "d5f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("board_settings", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tournaments", "board_settings")
