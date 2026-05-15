"""step_t_b: add status enum to bracket_events.

Revision ID: g9d4e2a3b7c1
Revises: a8b2d5e9f1c3
Create Date: 2026-05-14 00:00:00.000000
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa


revision = "g9d4e2a3b7c1"
down_revision = "a8b2d5e9f1c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bracket_events",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
    )
    # Backfill: 'started' if any result row; else 'generated' if any match row; else 'draft'.
    op.execute(
        """
        UPDATE bracket_events
        SET status = 'started'
        WHERE EXISTS (
            SELECT 1 FROM bracket_results br
            WHERE br.tournament_id = bracket_events.tournament_id
              AND br.bracket_event_id = bracket_events.id
        )
        """
    )
    op.execute(
        """
        UPDATE bracket_events
        SET status = 'generated'
        WHERE status = 'draft'
          AND EXISTS (
              SELECT 1 FROM bracket_matches bm
              WHERE bm.tournament_id = bracket_events.tournament_id
                AND bm.bracket_event_id = bracket_events.id
          )
        """
    )


def downgrade() -> None:
    op.drop_column("bracket_events", "status")
