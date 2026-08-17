"""entry_pages: publication flags + regulations timestamp (SP-P7 Phase 1).

Three TD-controlled publication gates for the public tier, defaulting OFF
(SP-P7 §4 — "software flags, operators decide"; nothing auto-publishes):

- ``entrants_published`` gates the public entrant list and player-page
  discoverability;
- ``draws_published`` gates draws and seeded entries;
- ``results_published`` gates result data everywhere (scores, standings,
  win-loss, winners) — draws render structure-and-schedule-only when off.

They live on ``entry_pages`` rather than ``tournaments`` for the same
recorded reason as ``venue_name``/``venue_address``: public-page
configuration, read only by the public tier, deliberately outside the state
blob so a publication toggle can never 409 against the fail-closed
CONFIG_LOCKED guard. A public tournament page only exists where an
``entry_pages`` row does, so a flag without a page would gate nothing.

``regulations_updated_at`` is the per-regulations timestamp SP-P7 §3.7's
document row renders ("v3 · updated 2026-08-12"). ``entry_pages.updated_at``
cannot serve it — that bumps on any field. Nullable: NULL means the text has
never changed since this column existed, and the row renders version-only.

Revision ID: v6b2d6f9a4c5
Revises: u5f0b4d7e2a3
Create Date: 2026-08-17 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v6b2d6f9a4c5"
down_revision: Union[str, Sequence[str], None] = "u5f0b4d7e2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FLAGS = ("entrants_published", "draws_published", "results_published")


def upgrade() -> None:
    for flag in _FLAGS:
        op.add_column(
            "entry_pages",
            # server_default so existing rows get an explicit False rather
            # than NULL-in-a-NOT-NULL — default-off is the ruling (C3),
            # existing open pages included: the TD publishes when ready.
            sa.Column(
                flag, sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )
    op.add_column(
        "entry_pages",
        sa.Column("regulations_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entry_pages", "regulations_updated_at")
    for flag in reversed(_FLAGS):
        op.drop_column("entry_pages", flag)
