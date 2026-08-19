"""solve_jobs: DB-backed queue for asynchronous CP-SAT solves.

SP-CLOUD-1 Phase 1. One table rides the primary database (SQLite local
/ Postgres cloud) — no broker. Three indexes, two of them partial
(the first partial indexes in this schema; supported by both dialects):

- ``uq_solve_jobs_idempotency_key`` — unique; client retry safety
  (Stripe idempotency-key semantics; NULLs exempt on both dialects).
- ``uq_solve_jobs_active`` — partial unique on ``(tournament_id, type)``
  WHERE status is active; enforces "at most one active solve per
  tournament per type" declaratively (SKIP LOCKED cannot).
- ``ix_solve_jobs_claimable`` — partial on ``(priority, created_at)``
  WHERE queued; keeps worker claims from ever scanning terminal rows.

Revision ID: l5c9d3e7f1a2
Revises: k4a7b1c9d3e5
Create Date: 2026-08-03 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "l5c9d3e7f1a2"
down_revision: Union[str, Sequence[str], None] = "k4a7b1c9d3e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTIVE_PREDICATE = sa.text("status IN ('queued', 'claimed', 'running')")
_QUEUED_PREDICATE = sa.text("status = 'queued'")


def upgrade() -> None:
    op.create_table(
        "solve_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("input_snapshot", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column(
            "attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "max_attempts", sa.Integer(), nullable=False, server_default=sa.text("2")
        ),
        sa.Column(
            "priority", sa.Integer(), nullable=False, server_default=sa.text("100")
        ),
        sa.Column("claimed_by", sa.String(length=64), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_solve_jobs_idempotency_key",
        "solve_jobs",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        "uq_solve_jobs_active",
        "solve_jobs",
        ["tournament_id", "type"],
        unique=True,
        sqlite_where=_ACTIVE_PREDICATE,
        postgresql_where=_ACTIVE_PREDICATE,
    )
    op.create_index(
        "ix_solve_jobs_claimable",
        "solve_jobs",
        ["priority", "created_at"],
        sqlite_where=_QUEUED_PREDICATE,
        postgresql_where=_QUEUED_PREDICATE,
    )


def downgrade() -> None:
    op.drop_index("ix_solve_jobs_claimable", table_name="solve_jobs")
    op.drop_index("uq_solve_jobs_active", table_name="solve_jobs")
    op.drop_index("uq_solve_jobs_idempotency_key", table_name="solve_jobs")
    op.drop_table("solve_jobs")
