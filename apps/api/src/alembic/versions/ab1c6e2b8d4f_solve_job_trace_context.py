"""Persist W3C Trace Context across the database-backed solve rail.

The carrier is nullable so telemetry-disabled and pre-upgrade jobs retain the
same behavior. Application code writes only traceparent/tracestate; baggage is
never persisted.

Revision ID: ab1c6e2b8d4f
Revises: a1b2c3d4e5f6
Create Date: 2026-08-31 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ab1c6e2b8d4f"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("solve_jobs", sa.Column("trace_context", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("solve_jobs", "trace_context")
