"""entrant_accounts: verification tokens · entry_players: erasure tombstone (E2, Phase 7).

Two additive columns pairs, both for transitions the E1-2 schema anticipated
but left unreachable.

**Verification (R10, spec §6).** ``entrant_accounts`` already carried
``email_verified`` / ``email_verified_at`` and the reset pair, but nothing to
verify *with*: a verification token is a second, differently-scoped
credential and folding it onto ``reset_token_hash`` would mean one column
whose meaning depends on which route last wrote it — and a mailed
verification link that could be replayed as a password reset. Two purposes,
two columns.

**Erasure (ruling D7, 2026-08-21).** ``erased_at`` on ``entry_players`` is
the tombstone for withdraw-and-erase. The owner's ruling is *scrub the PII,
keep the rows*: the submission and entry survive with their state and fee
history so a director's records stay intact, while the name, club and
remarks are overwritten. Without a marker, a scrubbed row is indistinguishable
from a row somebody typed badly — the desk needs to be able to say
"withdrawn, details erased" rather than render an empty name.

The CASCADE that made D7 a question is deliberately **left alone here**: the
ruling routes erasure through a scrub path, so no delete of an
``entrant_accounts`` row happens on the entrant's behalf and the cascade is
never reached. Changing an FK's ``ondelete`` on SQLite means a table rebuild,
and rebuilding two tables to alter a path the product no longer takes is
cost without a property. Recorded in the debt log instead, where it belongs.

Revision ID: w7c2d8e0f5a6
Revises: v6a1c5e8f3b4
Create Date: 2026-08-21 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "w7c2d8e0f5a6"
down_revision: Union[str, Sequence[str], None] = "v6a1c5e8f3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entrant_accounts",
        sa.Column("verify_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "entrant_accounts",
        sa.Column(
            "verify_token_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "entry_players",
        sa.Column("erased_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entry_players", "erased_at")
    op.drop_column("entrant_accounts", "verify_token_expires_at")
    op.drop_column("entrant_accounts", "verify_token_hash")
