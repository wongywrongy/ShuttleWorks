"""Tell an operator's deliberate backup apart from a routine automatic one.

Every state write snapshots the prior payload and then rotates the list down to
``BACKUP_KEEP`` entries. Both paths — the automatic one and the director
pressing "Create backup" — went through the same ``create()`` with the same
synthetic filename, so the table had no way to distinguish them and rotation
could not spare one. The observed result (SP-CONSOLE-2 O-5, from the 2026-08-17
capture) is a backup list holding exactly ten rows spanning **three minutes**:
ten routine writes during setup are enough to evict a snapshot the director
took deliberately that morning, which is the one entry the feature exists for.

``origin`` is the column that makes the distinction expressible. Retention
skips manual rows entirely; automatic rows keep rotating.

Existing rows all become ``'auto'``. A manual snapshot taken before this
migration is therefore still rotation-eligible — a one-time loss with no way
around it, since nothing recorded on those rows says which they were.
``server_default`` rather than a Python default so the backfill happens in the
DDL on both SQLite and Postgres.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v6a1c5e8f3b4"
down_revision: Union[str, Sequence[str], None] = "u5f0b4d7e2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournament_backups",
        sa.Column(
            "origin",
            sa.String(length=16),
            nullable=False,
            server_default="auto",
        ),
    )


def downgrade() -> None:
    op.drop_column("tournament_backups", "origin")
