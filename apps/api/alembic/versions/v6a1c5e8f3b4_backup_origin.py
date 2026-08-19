"""tournament_backups.origin: auto vs manual, so retention spares the latter.

SP-CONSOLE-2 P5 (commit 97d0456) added the column to the model, the
repository's rotation logic, and the tests — and named this revision id in
``test_entries_migration.HEAD_REVISION`` — but the migration file itself
was never committed. Recovered during the SP-P7 merge: the id is kept
because the ledger and closing report already cite it; the chain slot is
after SP-P7's ``v6b2d6f9a4c5`` (the two landed concurrently on different
branches, and a linear chain beats two heads).

``server_default="auto"`` matches the model: every pre-existing snapshot
row was written by the state-write path, which is exactly what ``auto``
means, so the backfill is the truth rather than a guess.

Revision ID: v6a1c5e8f3b4
Revises: v6b2d6f9a4c5
Create Date: 2026-08-18 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v6a1c5e8f3b4"
down_revision: Union[str, Sequence[str], None] = "v6b2d6f9a4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournament_backups",
        sa.Column(
            "origin", sa.String(length=16), nullable=False, server_default="auto"
        ),
    )


def downgrade() -> None:
    op.drop_column("tournament_backups", "origin")
