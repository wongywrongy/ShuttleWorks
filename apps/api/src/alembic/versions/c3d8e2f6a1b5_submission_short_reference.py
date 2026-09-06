"""submissions: add the short entry reference, backfilled (V3-24-1).

The receipt printed a submission's UUID as its "Reference". This adds the
eight-character handle that replaces it — see
``apps/api/src/db/short_reference.py`` for the alphabet and why an
identifier this short is still not a capability.

**Add-nullable, backfill, then tighten in a SECOND migration**, rather than
one `nullable=False` add. `submissions` has rows on every laptop and in the
demo database; a NOT NULL column with no default cannot be added to a
populated table on either dialect, and a server_default would hand every
existing row the SAME reference — a uniqueness violation dressed as a
default. So this migration mints one code per existing row, and
``c4e9f3a7b2c6`` makes the column NOT NULL once none can be null.

**The unique index is created HERE, before the backfill.** It is what makes
the backfill's own uniqueness claim checkable rather than assumed: if the
generator ever handed out two identical codes in one pass, the INSERT would
be refused loudly at that moment instead of leaving two rows quietly sharing
a reference for someone to discover from a support ticket.

**The generator is copied, not imported.** ``db.short_reference`` is the
live definition and this file is a frozen historical record — a migration
that imports today's service is a migration that changes meaning when the
service does, and stops running at all when the service moves. Six lines
duplicated is the standard price. If the alphabet ever changes, this file
keeps the alphabet that was actually issued to these rows, which is the
correct answer for rows that were issued under it.

Revision ID: c3d8e2f6a1b5
Revises: b1c6d0e5f2a7
Create Date: 2026-09-06 00:00:00.000000
"""
from __future__ import annotations

import logging
import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c3d8e2f6a1b5"
down_revision: Union[str, Sequence[str], None] = "b1c6d0e5f2a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")

# FROZEN COPY of ``db.short_reference`` as of this revision — see the
# module docstring for why it is a copy.
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_LENGTH = 8
_MAX_ATTEMPTS = 8


def _mint(taken: set[str]) -> str:
    for _ in range(_MAX_ATTEMPTS):
        candidate = "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))
        if candidate not in taken:
            taken.add(candidate)
            return candidate
    raise RuntimeError(
        "could not draw an unused submission reference; the keyspace or the "
        "generator is wrong"
    )


def upgrade() -> None:
    op.add_column(
        "submissions", sa.Column("short_reference", sa.String(length=8), nullable=True)
    )
    op.create_index(
        "uq_submissions_short_reference",
        "submissions",
        ["short_reference"],
        unique=True,
    )

    bind = op.get_bind()
    # Composite primary key (tournament_id, id) — both are needed to name a
    # row, and naming it by ``id`` alone would update every workspace that
    # happened to share one.
    rows = bind.exec_driver_sql(
        "SELECT tournament_id, id FROM submissions WHERE short_reference IS NULL"
    ).fetchall()
    if not rows:
        # ASCII, not an em-dash: read on a Windows console whose cp1252
        # stdout mangles one into a `?`.
        log.info("short reference: no existing submissions - nothing to backfill")
        return

    taken: set[str] = set()
    for tournament_id, submission_id in rows:
        bind.exec_driver_sql(
            "UPDATE submissions SET short_reference = ? "
            "WHERE tournament_id = ? AND id = ?",
            (_mint(taken), tournament_id, submission_id),
        )
    log.info("short reference: backfilled %d existing submission(s)", len(rows))


def downgrade() -> None:
    op.drop_index("uq_submissions_short_reference", table_name="submissions")
    op.drop_column("submissions", "short_reference")
