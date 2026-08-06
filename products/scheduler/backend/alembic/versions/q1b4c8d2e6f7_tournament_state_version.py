"""Add tournaments.state_version — optimistic concurrency for the state blob.

SP-CLOUD-4 Phase 1. ``PUT /tournaments/{id}/state`` was the last unversioned
whole-object write in the codebase, and it carries essentially the entire
product: config, roster, groups, matches, schedule, bracket roster and the
plan-finalized flag all travel in one blob on a 500 ms debounce. Two tabs
editing one workspace silently lost each other's work, with the loser's PUT
answering 200.

The column is an integer bumped on every committed write. Existing rows start
at 0, which is correct: no client currently holds a version for them, and the
first read after deploy hands out 0.

Both dialects: a plain integer plus a compare-and-swap
``UPDATE ... WHERE state_version = :seen``. No dialect-specific SQL, no
RETURNING, no advisory locks.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "q1b4c8d2e6f7"
down_revision: Union[str, Sequence[str], None] = "p9a3b7c1d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default so the ALTER is valid against existing rows on both
    # dialects; the model default (0) governs new inserts.
    op.add_column(
        "tournaments",
        sa.Column(
            "state_version", sa.Integer(), nullable=False, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("tournaments", "state_version")
