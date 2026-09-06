"""entries: persist the partner invite mail outcome (V3-PE37.1).

``entries_json._send_partner_invite`` already returned a real ``bool``
(package 05, ruling R4) but nothing durable read it — the failure was only
logged for an operator, and the nominating entrant was never told. This
column lets ``entries_me.my_entries`` report a truthful, non-replay-breaking
notice ("the invitation email to your partner could not be sent") on the
account that made the nomination, closing the debt-log entry "Partner-invite
delivery failure has no entrant-facing recovery path" (docs/reference/debt-log.md).

Nullable, never backfilled: NULL means "no invite attempted, or attempted
before this column existed" — a fact this migration cannot recover — and is
deliberately distinct from ``False`` ("attempted and failed").

Revision ID: b1c6d0e5f2a7
Revises: aa1b2c3d4e5f
Create Date: 2026-09-06 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b1c6d0e5f2a7"
down_revision: Union[str, Sequence[str], None] = "aa1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("partner_invite_mail_sent", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entries", "partner_invite_mail_sent")
