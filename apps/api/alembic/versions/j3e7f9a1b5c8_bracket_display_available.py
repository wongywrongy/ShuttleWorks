"""bracket display: coming_soon -> available.

SP-B3. Promotes every existing workspace's ``display`` row from
``coming_soon`` to ``available`` (only bracket workspaces seed display as
``coming_soon``), matching ``database.models.derive_modules`` after SP-B3.

Tests build the schema via ``create_all`` and rely on derive-and-persist
(which now seeds ``available``), so they never run this migration —
correctness does NOT depend on it. This migration promotes prod rows that
predate SP-B3.

Revision ID: j3e7f9a1b5c8
Revises: i2d6e8f0a4b7
Create Date: 2026-06-24 00:00:00.000000
"""
from __future__ import annotations

from alembic import op

revision = "j3e7f9a1b5c8"
down_revision = "i2d6e8f0a4b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id = 'display' AND status = 'coming_soon'"
    )


def downgrade() -> None:
    # Lossy / no-op (same rationale as i2d6e8f0a4b7): cannot distinguish a
    # promoted display row from one seeded 'available' on purpose.
    pass
