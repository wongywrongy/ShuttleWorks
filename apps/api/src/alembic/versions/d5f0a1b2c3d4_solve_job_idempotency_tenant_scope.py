"""solve_jobs idempotency key: scope the unique index to the workspace.

``uq_solve_jobs_idempotency_key`` was global over ``idempotency_key``
alone, and ``enqueue()`` looked the key up the same way. The key is
CALLER-chosen, so an operator on workspace A could send a key already used
on workspace B and get B's job back — schedule result included — from
``POST /tournaments/A/solve-jobs``: a cross-tenant read through a header,
past a tenancy dependency that only inspects the path (SEC, 2026-09-07).

Recreating the index rather than adding a second one: leaving the global
one in place would keep the collision as a 409-shaped IntegrityError, which
is a different bug with the same root.

Index drop/create needs no table rebuild, but this runs through
``batch_alter_table`` anyway because SQLite is the local and CI dialect
while Postgres is production, and batch mode is the one form that behaves
identically on both. No raw SQL: the ``?``-style paramstyle trap from
``c828e8ee`` is exactly what this file avoids by staying in the Alembic op
layer.

Revision ID: d5f0a1b2c3d4
Revises: c4e9f3a7b2c6
Create Date: 2026-09-07 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "d5f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "c4e9f3a7b2c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("solve_jobs") as batch:
        batch.drop_index("uq_solve_jobs_idempotency_key")
        batch.create_index(
            "uq_solve_jobs_idempotency_key",
            ["tournament_id", "idempotency_key"],
            unique=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("solve_jobs") as batch:
        batch.drop_index("uq_solve_jobs_idempotency_key")
        batch.create_index(
            "uq_solve_jobs_idempotency_key",
            ["idempotency_key"],
            unique=True,
        )
