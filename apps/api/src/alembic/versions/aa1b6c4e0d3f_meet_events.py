"""Meet gets a real Event entity: ``meet_events`` + ``entry_events.meet_event_id``.

SP-DM-3 P7b Task 1. Meet has never had an Event. A division lived only as a
key in the state blob's ``config.rankCounts`` dict, which is why the Entries
commit seam had to *invent* the fields it needed. This revision creates the
entity and the mapping column that points at it.

**Grain (R-DM-5): one row per DIVISION, never per numbered position.** A
numbered rank (``MS1``) is regenerated from ``{prefix, count}`` at every site
that shows one — it has no row, no label, no lifecycle. So a workspace whose
config holds ``{BS: 20, GS: 20, BD: 11, GD: 11, XD: 11}`` backfills to **five
rows carrying those counts**, not the seventy-three numbered ranks the
console's ``expandRanks`` would emit from it.

**``entry_events.meet_event_id`` is FK-less**, mirroring ``bracket_event_id``
(ruling R2) and for a stronger reason: ``meet_events`` rows are DERIVED from
the blob and are deleted whenever a code leaves ``config.rankCounts``, so a
cascading FK would let one config edit — or a backup restore — destroy every
entry under a division, and a restricting one would make the blob write fail.
A dangling pointer is the already-handled state ("an unmappable code is
skipped and reported, never guessed"). Nothing writes the column in this
revision; the seam wiring is P7b Task 2, so the backfill leaves it NULL.

**The backfill is module-agnostic on purpose.** It reads every workspace's
``config.rankCounts`` rather than filtering on the meet module, because the
runtime derivation in ``repositories.local._LocalTournamentRepo.upsert_data``
does not filter either — a backfill narrower than the derivation would be
undone by the first blob write after the upgrade. One consequence is ruled
acceptable and stated here so it does not surprise: the console store seeds
``rankCounts: {MS: 3, WS: 3, MD: 2, WD: 2, XD: 2}`` into every fresh store and
autosaves it, so workspaces nobody configured get five rows they never asked
for. That is the pre-existing default surfacing, not the backfill inventing.

**Revision id scheme.** The single-letter prefix the tree has used since the
first migration is exhausted at ``z0f5a1b3c9d2``. From here ids are a
**two-letter prefix advancing alphabetically (``aa``, ``ab``, …) followed by
ten hex characters** — same twelve-character width, and unambiguous against
every older id because in all thirty of those the second character is a digit.

Like every migration this program has shipped, this one is **SQLite-verified
only**.

Revision ID: aa1b6c4e0d3f
Revises: z0f5a1b3c9d2
Create Date: 2026-08-26

"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "aa1b6c4e0d3f"
down_revision: Union[str, Sequence[str], None] = "z0f5a1b3c9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "meet_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column(
            "slot_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )

    # SQLite cannot ADD COLUMN inside a table it also has to re-index, and
    # batch mode is what every other column addition in this tree uses.
    with op.batch_alter_table("entry_events") as batch:
        batch.add_column(sa.Column("meet_event_id", sa.String(length=40), nullable=True))
    op.create_index(
        "ix_entry_events_meet_event",
        "entry_events",
        ["tournament_id", "meet_event_id"],
    )

    _backfill_meet_events_from_blobs()


def downgrade() -> None:
    op.drop_index("ix_entry_events_meet_event", table_name="entry_events")
    with op.batch_alter_table("entry_events") as batch:
        batch.drop_column("meet_event_id")
    op.drop_table("meet_events")


def _backfill_meet_events_from_blobs() -> None:
    """One ``meet_events`` row per key of each workspace's ``rankCounts``.

    Mirrors ``repositories.local._rank_counts`` exactly, including its
    tolerance: absent ``config``, absent ``rankCounts`` and ``{}`` all mean
    zero rows, and a junk key or non-integer count is dropped rather than
    raised on — a migration that fails on a director's laptop is worse than
    one that skips a value nothing could have read anyway.
    """
    bind = op.get_bind()

    tournaments_table = sa.table(
        "tournaments",
        sa.column("id", sa.Uuid()),
        sa.column("data", sa.JSON()),
    )
    meet_events_table = sa.table(
        "meet_events",
        sa.column("tournament_id", sa.Uuid()),
        sa.column("id", sa.String()),
        sa.column("label", sa.String()),
        sa.column("slot_count", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    now = datetime.now(timezone.utc)
    rows: list[dict] = []

    for tournament in bind.execute(sa.select(tournaments_table)).all():
        data = tournament.data
        # SQLite stores JSON as TEXT; Postgres returns a dict natively.
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                continue
        if not isinstance(data, dict):
            continue
        config = data.get("config")
        if not isinstance(config, dict):
            continue
        counts = config.get("rankCounts")
        if not isinstance(counts, dict):
            continue
        for code, count in counts.items():
            if not isinstance(code, str) or not code or len(code) > 40:
                continue
            try:
                slots = int(count)
            except (TypeError, ValueError):
                continue
            rows.append(
                {
                    "tournament_id": tournament.id,
                    "id": code,
                    "label": code,
                    "slot_count": slots,
                    "created_at": now,
                    "updated_at": now,
                }
            )

    if rows:
        bind.execute(sa.insert(meet_events_table), rows)
