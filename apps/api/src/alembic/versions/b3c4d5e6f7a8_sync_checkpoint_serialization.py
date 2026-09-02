"""Backfill one synchronization cursor per authority epoch.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO sync_checkpoints
                (tournament_id, authority_epoch, highest_contiguous_sequence, updated_at)
            SELECT a.tournament_id, a.epoch, COALESCE(MAX(i.sequence), 0), CURRENT_TIMESTAMP
            FROM tournament_authority_epochs AS a
            LEFT JOIN sync_inbox AS i
              ON i.tournament_id = a.tournament_id
             AND i.authority_epoch = a.epoch
            WHERE NOT EXISTS (
                SELECT 1
                FROM sync_checkpoints AS c
                WHERE c.tournament_id = a.tournament_id
                  AND c.authority_epoch = a.epoch
            )
            GROUP BY a.tournament_id, a.epoch
            """
        )
    )


def downgrade() -> None:
    # Cursor rows are live synchronization state.  Removing backfilled rows on
    # downgrade could discard acknowledgements, so the data is retained.
    pass
