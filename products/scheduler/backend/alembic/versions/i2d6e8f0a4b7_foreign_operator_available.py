"""foreign-operator enablement: coming_soon -> available for meet/bracket.

SP-B2. Promotes every existing workspace's foreign operator (meet or
bracket) from ``coming_soon`` to ``available`` so it can be used / enabled,
matching ``database.models.derive_modules`` after SP-B2. ``display`` rows
are intentionally left as-is (the bracket public surface is SP-B3).

Tests build the schema via ``Base.metadata.create_all`` and rely on the
repository's derive-and-persist (which now seeds ``available`` directly), so
they never run this migration — correctness does NOT depend on it. This
migration exists so production (Postgres) promotes rows that predate SP-B2.

Revision ID: i2d6e8f0a4b7
Revises: h1c5f4d8e2a9
Create Date: 2026-06-24 00:00:00.000000
"""
from __future__ import annotations

from alembic import op


revision = "i2d6e8f0a4b7"
down_revision = "h1c5f4d8e2a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id IN ('meet', 'bracket') AND status = 'coming_soon'"
    )


def downgrade() -> None:
    # Lossy / no-op: an UPDATE back to 'coming_soon' cannot distinguish a
    # foreign operator promoted by this migration from one that was seeded
    # 'available' on purpose (e.g. a create-time modules[] seed). Leaving the
    # rows as 'available' on downgrade is the safe choice.
    pass
