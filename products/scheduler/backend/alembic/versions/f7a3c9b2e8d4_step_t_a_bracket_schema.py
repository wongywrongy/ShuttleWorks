"""step_t_a_bracket_schema

First step of the backend-merge arc (T-A). Adds the four bracket
tables — ``bracket_events``, ``bracket_participants``,
``bracket_matches``, ``bracket_results`` — as children of the existing
``tournaments`` row. Mirrors the scheduler-arc convention: composite
primary keys leading with ``tournament_id`` so per-tournament scans
hit the PK index; portable ``JSON`` for slot trees and metadata
(JSONB on Postgres / TEXT on SQLite); ``version`` columns on
``bracket_events`` and ``bracket_matches`` for optimistic
concurrency once writers come online in PR 2.

This migration is additive only. The tournament product continues to
run with its in-memory state through PR 1; nothing reads or writes
these tables yet. The ``_LocalBracketRepo`` introduced alongside this
migration is exercised by repository tests against an in-memory
SQLite — that's the test gate for T-A.

Revision ID: f7a3c9b2e8d4
Revises: e2a5f3b8c1d6
Create Date: 2026-05-13

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f7a3c9b2e8d4"
down_revision: Union[str, Sequence[str], None] = "e2a5f3b8c1d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # bracket_events — one row per sub-event (Men's Singles, Women's
    # Doubles, etc.) within a tournament. Composite PK matches the
    # scheduler's matches-table convention.
    op.create_table(
        "bracket_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("duration_slots", sa.Integer(), nullable=False),
        sa.Column("bracket_size", sa.Integer(), nullable=True),
        sa.Column(
            "seeded_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("rr_rounds", sa.Integer(), nullable=True),
        sa.Column(
            "config",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
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

    # bracket_participants — seeded entrants per event. Both
    # ``id`` shape (string 100, event-scoped) and the leading
    # ``tournament_id`` mirror bracket_events.
    op.create_table(
        "bracket_participants",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column(
            "member_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column(
            "meta",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "bracket_event_id", "id"),
    )

    # bracket_matches — one row per PlayUnit. The slot tree
    # (``slot_a``/``slot_b``) is the BracketSlot shape from
    # ``products/tournament/tournament/draw.py``: exactly one of
    # ``participant_id`` or ``feeder_play_unit_id``. ``dependencies``
    # and ``child_unit_ids`` are list[str] caches the advancement code
    # uses to walk upstream/downstream. ``side_a``/``side_b`` hold the
    # resolved participant ids once known (mirrors PlayUnit.side_a/b).
    op.create_table(
        "bracket_matches",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("round_index", sa.Integer(), nullable=False),
        sa.Column("match_index", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'MATCH'"),
        ),
        sa.Column("slot_a", sa.JSON(), nullable=False),
        sa.Column("slot_b", sa.JSON(), nullable=False),
        sa.Column(
            "side_a",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "side_b",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "dependencies",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column("expected_duration_slots", sa.Integer(), nullable=False),
        sa.Column(
            "duration_variance_slots",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "child_unit_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "meta",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
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
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "bracket_event_id", "id"
        ),
    )
    op.create_index(
        "ix_bracket_matches_event_round",
        "bracket_matches",
        ["tournament_id", "bracket_event_id", "round_index"],
    )

    # bracket_results — one row per recorded outcome. One-to-one
    # optional with bracket_matches; mirrors the
    # TournamentState.results dict's PlayUnitId → Result shape.
    op.create_table(
        "bracket_results",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("bracket_match_id", sa.String(length=100), nullable=False),
        sa.Column("winner_side", sa.String(length=10), nullable=False),
        sa.Column("score", sa.JSON(), nullable=True),
        sa.Column("finished_at_slot", sa.Integer(), nullable=True),
        # ``walkover`` default is handled by the ORM (Mapped[bool] =
        # mapped_column(Boolean, default=False, ...)) rather than a
        # DB-level DEFAULT, because Postgres rejects ``DEFAULT 0`` for
        # boolean columns and SQLite has no native bool type.
        sa.Column("walkover", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            [
                "tournament_id",
                "bracket_event_id",
                "bracket_match_id",
            ],
            [
                "bracket_matches.tournament_id",
                "bracket_matches.bracket_event_id",
                "bracket_matches.id",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "bracket_event_id", "bracket_match_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("bracket_results")
    op.drop_index(
        "ix_bracket_matches_event_round", table_name="bracket_matches"
    )
    op.drop_table("bracket_matches")
    op.drop_table("bracket_participants")
    op.drop_table("bracket_events")
