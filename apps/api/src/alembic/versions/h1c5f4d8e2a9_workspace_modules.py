"""workspace_modules: per-workspace module state + kind backfill.

Workspace-modules program, sub-project #1. Creates the
``workspace_modules`` table (first-class per-workspace module rows tied
to ``tournaments.id``) and backfills the derived module set for every
existing tournament from its legacy ``kind``.

Tests build the schema via ``Base.metadata.create_all`` and rely on the
repository's lazy derive-and-persist, so they never run this migration —
correctness does NOT depend on it. This migration exists so production
(Postgres) is correct immediately for rows that predate the table.

Revision ID: h1c5f4d8e2a9
Revises: g9d4e2a3b7c1
Create Date: 2026-06-23 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "h1c5f4d8e2a9"
down_revision = "g9d4e2a3b7c1"
branch_labels = None
depends_on = None


# Frozen copy of ``database.models.derive_modules`` — migrations must not
# drift with the app. Keep in sync only if the historical seed semantics
# themselves are corrected.
def _derive_modules(kind: str | None) -> dict[str, str]:
    if kind == "bracket":
        return {"bracket": "enabled", "display": "coming_soon", "meet": "coming_soon"}
    return {"meet": "enabled", "display": "available", "bracket": "coming_soon"}


def upgrade() -> None:
    op.create_table(
        "workspace_modules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("config", sa.JSON(), nullable=True),
        # Server-side defaults so the raw-SQL backfill below (which runs no
        # ORM and supplies no timestamp) satisfies the NOT NULL columns.
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tournament_id",
            "module_id",
            name="uq_workspace_modules_tournament_module",
        ),
    )
    op.create_index(
        "ix_workspace_modules_tournament_id",
        "workspace_modules",
        ["tournament_id"],
    )

    # Backfill: derive each existing tournament's module set from ``kind``.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, kind FROM tournaments")).fetchall()
    insert = sa.text(
        "INSERT INTO workspace_modules (tournament_id, module_id, status) "
        "VALUES (:tournament_id, :module_id, :status)"
    )
    for tournament_id, kind in rows:
        for module_id, status in _derive_modules(kind).items():
            conn.execute(
                insert,
                {
                    "tournament_id": tournament_id,
                    "module_id": module_id,
                    "status": status,
                },
            )


def downgrade() -> None:
    op.drop_index(
        "ix_workspace_modules_tournament_id", table_name="workspace_modules"
    )
    op.drop_table("workspace_modules")
