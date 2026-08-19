"""entries: the public self-service registration schema.

SP-PROGRAM-1 Phase 5 (SP-E1-1), the E1 walking skeleton. Creates the three
Entries-owned tables — ``entry_events``, ``entries``, ``entry_pages`` —
covering the design spec's §4 sketch **in full**, even though the E1 slice
uses only a subset of it. The doubles pointers, the payment columns and the
email-verification timestamp are created here on purpose (SP-E1-1 rule 6):
E2/E3/E5 then become feature work instead of a run of migrations against a
table that is already carrying live public data.

All three tables hang off ``tournaments`` with ``ondelete=CASCADE``, the same
shape ``display_tokens`` and ``tournament_members`` use, so deleting a
workspace takes its entry data with it and leaves nothing orphaned.

Three index decisions are rulings rather than defaults, and are recorded here
because a later reader will otherwise "fix" them:

1. **``uq_entries_tournament_idempotency_key`` is UNIQUE on
   ``(tournament_id, idempotency_key)``** — deliberately *narrower* than the
   solve rail's global ``uq_solve_jobs_idempotency_key``. Ruling D4: the
   entry-submit route is unauthenticated, so resolving a client-supplied key
   globally would let an outsider probe another tenant's keyspace and learn
   that some other workspace used the same key. The lookup that reads this
   index is tenant-scoped to match. NULL keys stay exempt on both dialects.

2. **There is no unique index on ``(entry_event_id, contact_email)``** —
   ruled out in Q12. One parent enters two children; one club representative
   enters eight players. A unique index would force them to invent email
   addresses, corrupting the one field we keep as a future registry join key.
   Duplicate *suspicion* is a soft attention flag an operator resolves.

3. **``ix_entries_event_contact_email`` is a plain index on the raw column,
   not a functional index on ``lower(contact_email)``.** ``contact_email`` is
   normalized (lowercased) at write time instead, which keeps the DDL byte-
   identical on SQLite and Postgres — expression indexes are supported on
   both but with enough dialect and Alembic-reflection friction to be worth
   avoiding for a flag lookup.

``entry_events.bracket_event_id`` carries **no** foreign key to
``bracket_events``. The spec sketch annotates it as an FK, but the reference
is unbuildable as annotated (``bracket_events`` has a composite
``(tournament_id, id)`` key whose ``id`` is a ``String(100)`` code such as
``"MS"``, not a uuid) and it is undesirable as corrected: a composite FK
would have to cascade, so rebuilding a draw would silently delete the entry
configuration and every entry underneath it. Seam A already specifies that an
unmappable event mapping is *skipped and reported, never guessed*, which
means a dangling pointer is a handled state rather than a corruption. The
column is indexed so the mapping lookup stays cheap.

``batch_alter_table`` is not needed here — every statement is a CREATE, and
nothing alters an existing table.

Revision ID: r2c7e1f4a9b3
Revises: q1b4c8d2e6f7
Create Date: 2026-08-06
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r2c7e1f4a9b3"
down_revision: Union[str, Sequence[str], None] = "q1b4c8d2e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entry_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        # 'MS', 'XD1' — the Meet PlayerDTO.ranks[] vocabulary, or the id of a
        # bracket event.
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
        # 'singles' | 'doubles'. E1 is singles-only; doubles is E3.
        sa.Column(
            "entry_type",
            sa.String(length=20),
            nullable=False,
            server_default="singles",
        ),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=True),
        sa.Column("cap", sa.Integer(), nullable=True),
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    op.create_index(
        "ix_entry_events_bracket_event",
        "entry_events",
        ["tournament_id", "bracket_event_id"],
    )

    op.create_table(
        "entries",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entry_event_id", sa.Uuid(), nullable=False),
        # Lifecycle vocabulary lives in the design spec §6. E1 submissions
        # land in 'pending' directly (ruling D1).
        sa.Column(
            "state", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column("pending_reasons", sa.JSON(), nullable=False),
        # ---- submitter / contact block (Q12) --------------------------
        sa.Column("contact_name", sa.String(length=200), nullable=False),
        # Normalized (lowercased) at write time — see the index note above.
        sa.Column("contact_email", sa.String(length=320), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        # SHA-256 of the capability token (auth_sessions precedent, not the
        # display token's plaintext storage).
        sa.Column("manage_token_hash", sa.String(length=64), nullable=False),
        # ---- player block (Q12) ---------------------------------------
        # Kept structurally separate from the contact block so a later
        # `entry_players` split is a column move, not a redesign.
        sa.Column("player_name", sa.String(length=200), nullable=False),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        # ---- doubles (created now, unused in E1) ----------------------
        sa.Column("partner_entry_id", sa.Uuid(), nullable=True),
        sa.Column("partner_email", sa.String(length=320), nullable=True),
        # ---- publication & consent ------------------------------------
        sa.Column(
            "list_opt_out",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "regulations_accepted_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("regulations_version_accepted", sa.Integer(), nullable=True),
        # ---- money / traceability -------------------------------------
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_note", sa.Text(), nullable=True),
        sa.Column("committed_player_id", sa.String(length=100), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_event_id"],
            ["entry_events.tournament_id", "entry_events.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    # Ruling D4 — tenant-scoped retry dedup (note 1 in the docstring).
    op.create_index(
        "uq_entries_tournament_idempotency_key",
        "entries",
        ["tournament_id", "idempotency_key"],
        unique=True,
    )
    # NON-unique on purpose (notes 2 and 3 in the docstring).
    op.create_index(
        "ix_entries_event_contact_email",
        "entries",
        ["entry_event_id", "contact_email"],
    )

    op.create_table(
        "entry_pages",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        # The public, discoverable address of the entry *page*. A shareable
        # slug, not a capability token — per-entrant capability lives on
        # entries.manage_token_hash.
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column(
            "is_open", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("intro_text", sa.Text(), nullable=True),
        # Q11 — the director's own words. We ship no template.
        sa.Column("regulations_text", sa.Text(), nullable=True),
        sa.Column(
            "waiver_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        # Bumps on every text edit, so an entry's recorded
        # regulations_version_accepted means something in a dispute.
        sa.Column(
            "regulations_version", sa.Integer(), nullable=False, server_default="1"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id"),
    )
    op.create_index("uq_entry_pages_slug", "entry_pages", ["slug"], unique=True)


def downgrade() -> None:
    # The exact reverse: indexes then tables, children before parents.
    op.drop_index("uq_entry_pages_slug", table_name="entry_pages")
    op.drop_table("entry_pages")
    op.drop_index("ix_entries_event_contact_email", table_name="entries")
    op.drop_index("uq_entries_tournament_idempotency_key", table_name="entries")
    op.drop_table("entries")
    op.drop_index("ix_entry_events_bracket_event", table_name="entry_events")
    op.drop_table("entry_events")
