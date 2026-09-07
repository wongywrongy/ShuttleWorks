"""submissions.short_reference: NOT NULL (V3-24-1, second half).

``c3d8e2f6a1b5`` added the column nullable and gave every existing row a
code. This is the tightening the split existed for: from here on a
submission without a reference cannot be written at all, which is what lets
every reader — the receipt route, My entries, the redirect — treat the field
as present rather than defending against a NULL that only history could
produce.

Separate revision rather than a second half of the same one so the backfill
is committed before the constraint is enforced. On SQLite the tightening is
a table rebuild (batch mode), and a rebuild that runs in the same
transaction as the UPDATEs it depends on is a rollback away from a column
that is NOT NULL and empty.

Revision ID: c4e9f3a7b2c6
Revises: c3d8e2f6a1b5
Create Date: 2026-09-06 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4e9f3a7b2c6"
down_revision: Union[str, Sequence[str], None] = "c3d8e2f6a1b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("submissions") as batch:
        batch.alter_column(
            "short_reference", existing_type=sa.String(length=8), nullable=False
        )


def downgrade() -> None:
    with op.batch_alter_table("submissions") as batch:
        batch.alter_column(
            "short_reference", existing_type=sa.String(length=8), nullable=True
        )
