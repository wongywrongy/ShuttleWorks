"""step_t_i_tournament_kind

Adds ``tournaments.kind`` so the AppShell can render different
chrome for an intercollegiate meet vs. a bracket-style tournament.
The two share the ``tournaments`` table (per the PR 1 schema
decision); ``kind`` is the discriminator that lets the TabBar
filter out tabs that don't apply to the kind the operator picked
on the dashboard's New form.

Default value ``'meet'`` so every pre-existing tournament row
keeps its current behaviour (the operator created them before
kind existed; they were all functionally meets — bracket support
arrived in the backend-merge arc).

Revision ID: a8b2d5e9f1c3
Revises: f7a3c9b2e8d4
Create Date: 2026-05-13
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a8b2d5e9f1c3"
down_revision: Union[str, Sequence[str], None] = "f7a3c9b2e8d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column(
            "kind",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'meet'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tournaments", "kind")
