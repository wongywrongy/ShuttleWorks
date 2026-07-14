"""bracket_results.reason: contingency annotation for result recording.

Spec 2026-07-14 §1 / task 5b. Adds a nullable ``reason`` column to
``bracket_results`` so a walkover/retired/forfeit contingency recorded
via ``POST /bracket/commands`` (``BracketCommandRequest.reason``) is
persisted instead of silently dropped. Annotation only — does not
affect advancement/BYE-sweep routing, which stays keyed off the
existing ``walkover`` boolean.

Revision ID: k4a7b1c9d3e5
Revises: j3e7f9a1b5c8
Create Date: 2026-07-14 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "k4a7b1c9d3e5"
down_revision: Union[str, Sequence[str], None] = "j3e7f9a1b5c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bracket_results",
        sa.Column("reason", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bracket_results", "reason")
