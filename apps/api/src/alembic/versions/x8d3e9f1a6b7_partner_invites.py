"""entries: the doubles partner invite (E3, program Phase 8).

Three columns beside the two ``partner_email`` / ``partner_entry_id`` that
``s3d8f2b5c0e1`` created and left unused, so the pair flow needs no new table:

- ``partner_invite_hash`` — SHA-256 of the mailed token, never the token.
  **Invariant I5's hashed half, and deliberately NOT the operator invite's
  shape**: ``invite_links`` uses its own row id as the token, in plaintext,
  which was tolerable for a link a director pastes into a chat and is not
  tolerable for a credential mailed to a member of the public. The precedent
  followed here is ``auth_sessions`` / ``entrant_accounts.reset_token_hash``.
- ``partner_invite_expires_at`` — an unaccepted invite dies with the entry
  window, and a token with no expiry is a permanent credential in somebody's
  mail archive.
- ``partner_accepted_at`` — when the invited principal accepted. The pair's
  ``awaiting_partner`` reason is cleared from the reasons list, so without
  this stamp the fact that a human agreed would survive only as the *absence*
  of a string in a JSON column.

``ix_entries_partner_invite`` makes the token lookup an index hit rather than
a scan of every entry in the database — the resolve route is public and
unauthenticated by design (a partner previews before they have an account), so
its cost has to be bounded by something other than good manners.

Revision ID: x8d3e9f1a6b7
Revises: w7c2d8e0f5a6
Create Date: 2026-08-22 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "x8d3e9f1a6b7"
down_revision: Union[str, Sequence[str], None] = "w7c2d8e0f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("partner_invite_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "entries",
        sa.Column(
            "partner_invite_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "entries",
        sa.Column("partner_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_entries_partner_invite", "entries", ["partner_invite_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_entries_partner_invite", table_name="entries")
    op.drop_column("entries", "partner_accepted_at")
    op.drop_column("entries", "partner_invite_expires_at")
    op.drop_column("entries", "partner_invite_hash")
