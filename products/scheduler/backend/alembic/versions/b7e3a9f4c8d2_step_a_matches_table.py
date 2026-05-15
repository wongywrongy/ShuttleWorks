"""step_a_matches_table

Add the ``matches`` table that the architecture-adjustment arc's state
machine + solver-locking layers key off. Backfills from existing
``tournaments.data`` JSONB so the new table is in sync with the current
schedule on first boot after the migration.

Revision ID: b7e3a9f4c8d2
Revises: c2e587494c07
Create Date: 2026-05-13

"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7e3a9f4c8d2"
down_revision: Union[str, Sequence[str], None] = "c2e587494c07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_VALID_STATUSES = {"scheduled", "called", "playing", "finished", "retired"}
# Legacy match_states.status values that need translating to the new enum.
_STATUS_TRANSLATE = {"started": "playing"}


def upgrade() -> None:
    op.create_table(
        "matches",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("court_id", sa.Integer(), nullable=True),
        sa.Column("time_slot", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'scheduled'"),
        ),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    op.create_index(
        "ix_matches_tournament_status",
        "matches",
        ["tournament_id", "status"],
    )

    _backfill_matches_from_jsonb()


def downgrade() -> None:
    op.drop_index("ix_matches_tournament_status", table_name="matches")
    op.drop_table("matches")


def _backfill_matches_from_jsonb() -> None:
    """Populate ``matches`` rows from existing ``tournaments.data`` JSONB.

    Walks each tournament's ``data["matches"]`` to materialise one row
    per match, then assigns ``court_id`` + ``time_slot`` from
    ``data["schedule"]["assignments"]`` where the match appears.
    ``status`` defaults to ``scheduled``; if the legacy
    ``match_states`` row carries a non-default status it overrides
    (translating ``started`` → ``playing``).

    Tournaments with empty / non-dict ``data`` are skipped silently.
    """
    bind = op.get_bind()

    tournaments_table = sa.table(
        "tournaments",
        sa.column("id", sa.Uuid()),
        sa.column("data", sa.JSON()),
    )
    match_states_table = sa.table(
        "match_states",
        sa.column("tournament_id", sa.Uuid()),
        sa.column("match_id", sa.String()),
        sa.column("status", sa.String()),
    )
    matches_table = sa.table(
        "matches",
        sa.column("tournament_id", sa.Uuid()),
        sa.column("id", sa.String()),
        sa.column("court_id", sa.Integer()),
        sa.column("time_slot", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("version", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    now = datetime.now(timezone.utc)

    for tournament in bind.execute(sa.select(tournaments_table)).all():
        tid = tournament.id
        data = tournament.data
        # SQLite stores JSON as TEXT; Postgres returns a dict natively.
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                continue
        if not isinstance(data, dict):
            continue

        matches_in_data = data.get("matches") or []
        if not isinstance(matches_in_data, list) or not matches_in_data:
            continue

        # Map schedule assignments by matchId for court/slot lookup.
        assignments = ((data.get("schedule") or {}).get("assignments")) or []
        court_slot_by_match: dict[str, tuple] = {}
        if isinstance(assignments, list):
            for assignment in assignments:
                if not isinstance(assignment, dict):
                    continue
                mid = assignment.get("matchId")
                if not mid:
                    continue
                court_slot_by_match[mid] = (
                    assignment.get("courtId"),
                    assignment.get("slotId"),
                )

        # Translate legacy match_states.status into the new enum.
        legacy_status_by_match: dict[str, str] = {}
        for row in bind.execute(
            sa.select(
                match_states_table.c.match_id, match_states_table.c.status
            ).where(match_states_table.c.tournament_id == tid)
        ).all():
            translated = _STATUS_TRANSLATE.get(row.status, row.status)
            if translated in _VALID_STATUSES:
                legacy_status_by_match[row.match_id] = translated

        rows_to_insert: list[dict] = []
        seen_ids: set[str] = set()
        for match in matches_in_data:
            if not isinstance(match, dict):
                continue
            mid = match.get("id")
            if not mid or mid in seen_ids:
                continue
            seen_ids.add(mid)
            court_id, time_slot = court_slot_by_match.get(mid, (None, None))
            status = legacy_status_by_match.get(mid, "scheduled")
            rows_to_insert.append(
                {
                    "tournament_id": tid,
                    "id": mid,
                    "court_id": court_id,
                    "time_slot": time_slot,
                    "status": status,
                    "version": 1,
                    "created_at": now,
                    "updated_at": now,
                }
            )

        if rows_to_insert:
            bind.execute(matches_table.insert(), rows_to_insert)
