"""entries: the entrant principal, the submission level, and the player level.

SP-PROGRAM-1 Phase 5 delta (SP-E1-2). Rulings R10–R14 arrived the day after
the E1 walking skeleton merged, and they reshape the intake schema
``r2c7e1f4a9b3`` created: entrants become a real principal with accounts and
sessions (R10/Q13), a *form act* becomes a first-class ``submissions`` row
(R13/Q12), the human being entered becomes an ``entry_players`` row
(R13/Q12, decision D-A4), and the R12/R14 configuration fields land on
``entry_events`` and ``entry_pages``.

**DEVIATION FROM THE SPEC'S STATED POSTURE, RESOLVED BY EVIDENCE.**
The amended spec's §4 delta table specifies *additive migration then
narrowing*, with three backfills: one account per distinct
``entries.contact_email``, one submission per existing entry, one player per
existing entry. That posture is written for a world that has data. **This
one does not.** SP-E1-2 Phase A enumerated every reachable entries store and
counted **four** ``entries`` rows in existence — all of them in the
throwaway ``sw-e1-demo`` Postgres volume created for the E1 walkthrough;
every dev SQLite file predates ``r2c7e1f4a9b3`` entirely. No deployment
serves entries (Phase 2 has not run, and amendment A1 forbids exposure).
Decision **D-A5** therefore authorised a **clean rebuild**, for three
reasons in order of weight:

1. ``entry_players.gender`` has **no source**. The spec names it as the one
   genuinely lossy step of the backfill, resolvable only as
   unknown-and-flagged. A clean rebuild deletes the problem rather than
   shipping rows nobody will ever resolve, on a field R12 makes required
   precisely because the form filtering depends on it.
2. Compatibility shims — both column sets alive, dual writes, a narrowing
   migration later — would be code that exists only to serve rows that do
   not exist, and every shim is a place for a fail-open bug in a slice
   whose whole point is *adding authentication*.
3. The chain stays linear: one revision, ``upgrade`` and ``downgrade`` both
   exercised by the programmatic round-trip test, no squash, and
   ``r2c7e1f4a9b3`` unedited.

So ``upgrade`` **drops and recreates** the three entries-family tables. It
destroys entry data by design. Anyone reaching this revision with data they
care about has met a situation the evidence above says cannot exist, and
should stop rather than run it.

---

**Index decisions, recorded because a later reader will otherwise "fix"
them:**

1. ``uq_submissions_tournament_idempotency_key`` is UNIQUE on
   ``(tournament_id, idempotency_key)`` — ruling D4, carried up a level
   intact by R13. Deliberately *narrower* than the solve rail's global
   ``uq_solve_jobs_idempotency_key``: anyone holding a public slug can reach
   the submit route, so resolving a client-supplied key globally would let
   an outsider probe another tenant's keyspace. NULL keys stay exempt on
   both dialects.

2. **There is no unique index on any natural key, at any level.** Ruled out
   in Q12 and preserved *verbatim* by R13. One parent enters two children;
   one club representative enters eight players. A unique index would force
   them to invent identities, corrupting the very data it was added to
   protect. Duplicate *suspicion* — same event + same player name across
   submissions — is a soft attention flag an operator resolves, and
   ``ix_entries_event_player`` is the non-unique index that powers the
   lookup. It replaces ``ix_entries_event_contact_email``, whose email half
   the account level made both wrong (one account is *expected* to repeat)
   and unnecessary (the player is a row now, not a repeated string).

3. ``uq_entrant_accounts_email_lower`` is a **functional** index on
   ``lower(email)``, unlike every other index in this family. The exception
   is deliberate: this one is login identity, so it has to be
   case-insensitive at the database rather than by convention at write time
   — a case-sensitive account namespace is an account-takeover surface, not
   a formatting inconsistency. It mirrors ``uq_users_email_lower`` from
   ``m6d0e4f8a2b3`` exactly, and is a *separate* namespace from it on
   purpose (Q13 §3): one human may hold an operator account and an entrant
   account on the same address, and a shared namespace would let an entrant
   signup collide with, or probe for, a director's account.

**``entrant_accounts`` is the one table here that does not hang off
``tournaments``.** An account outlives any one tournament, which is the
entire point of it. Everything else cascades from the workspace like
``display_tokens`` and ``tournament_members`` do, so deleting a workspace
takes its entry data with it and leaves nothing orphaned.

``entry_events.bracket_event_id`` still carries **no** foreign key, for the
reason ``r2c7e1f4a9b3`` records: a composite FK would have to cascade, so
rebuilding a draw would silently delete the entry configuration and every
entry underneath it, while Seam A already specifies that an unmappable
event is *skipped and reported, never guessed*.

Revision ID: s3d8f2b5c0e1
Revises: r2c7e1f4a9b3
Create Date: 2026-08-07
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s3d8f2b5c0e1"
down_revision: Union[str, Sequence[str], None] = "r2c7e1f4a9b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def _drop_r2_schema() -> None:
    """Remove what ``r2c7e1f4a9b3`` built, children before parents.

    Indexes first so the drop is symmetrical with that revision's
    ``downgrade`` — SQLite drops them with the table anyway, Postgres is
    happier being told.
    """
    op.drop_index("uq_entry_pages_slug", table_name="entry_pages")
    op.drop_table("entry_pages")
    op.drop_index("ix_entries_event_contact_email", table_name="entries")
    op.drop_index("uq_entries_tournament_idempotency_key", table_name="entries")
    op.drop_table("entries")
    op.drop_index("ix_entry_events_bracket_event", table_name="entry_events")
    op.drop_table("entry_events")


def upgrade() -> None:
    _drop_r2_schema()

    # ---- the account level (R10 / Q13) --------------------------------
    op.create_table(
        "entrant_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        # Argon2id PHC string — the shipped hasher, reused not re-implemented.
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column(
            "email_verified", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        # R12: the ONLY optional contact field, collected only where the
        # director turned it on. It lands on the ACCOUNT, not the entry.
        sa.Column("phone", sa.String(length=40), nullable=True),
        # Verification and reset are E2; the columns exist now so that slice
        # is feature work rather than migration churn.
        sa.Column("reset_token_hash", sa.String(length=64), nullable=True),
        sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        # No org_id. No role. No tournament_members row. Ever (Q13 §5) —
        # and no tournament_id either: an account outlives the workspace.
        sa.PrimaryKeyConstraint("id"),
    )
    # Note 3 in the docstring: functional, and its own namespace.
    op.create_index(
        "uq_entrant_accounts_email_lower",
        "entrant_accounts",
        [sa.text("lower(email)")],
        unique=True,
    )

    op.create_table(
        "entrant_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        # Only the SHA-256 is stored, following auth_sessions rather than
        # the display token's plaintext: the stronger precedent wins for a
        # credential this numerous.
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        # Revocation is a timestamp, never a delete.
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["account_id"], ["entrant_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_entrant_sessions_token_hash", "entrant_sessions", ["token_hash"], unique=True
    )
    op.create_index("ix_entrant_sessions_account", "entrant_sessions", ["account_id"])

    # ---- the act (R13) ------------------------------------------------
    op.create_table(
        "submissions",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        # These three moved UP from `entries`: one agreement, one retry
        # unit, one payment — not one per event.
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column("regulations_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("regulations_version_accepted", sa.Integer(), nullable=True),
        # R14: the running total the form showed, snapshotted, plus how it
        # was derived so a later dispute is answerable without re-deriving
        # prices from a config that has since been edited.
        sa.Column("fee_total_cents", sa.Integer(), nullable=True),
        sa.Column("fee_basis", sa.JSON(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_note", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["entrant_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    # Ruling D4, one level up (note 1 in the docstring).
    op.create_index(
        "uq_submissions_tournament_idempotency_key",
        "submissions",
        ["tournament_id", "idempotency_key"],
        unique=True,
    )
    op.create_index("ix_submissions_account", "submissions", ["account_id"])

    # ---- the player level (R13 leaf; decision D-A4) --------------------
    op.create_table(
        "entry_players",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        # Who may act for this player — the join that lets E2's "my entries"
        # show a parent their children's entries.
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        # R12: NOT NULL. MS/WD/XD filtering is impossible without it, which
        # is the only reason the field exists. That is about the field being
        # collected; enforcement of the *match* is soft (Q14 §5).
        sa.Column("gender", sa.String(length=20), nullable=False),
        sa.Column("club", sa.String(length=200), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        # The free-text availability note, carried verbatim onto the roster
        # player by Seam A. It lives here, not on the entry, because it
        # describes a human — three events for one child must not carry
        # three copies of one sentence.
        sa.Column("remarks", sa.Text(), nullable=True),
        *_timestamps(),
        # R12's NEVER-IN-V1 list, recorded because absence is a decision: no
        # postal address, no federation/member id, no DOB beyond
        # birth_year-as-eligibility. GDPR minimization governs (Q10).
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["entrant_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    op.create_index("ix_entry_players_account", "entry_players", ["account_id"])

    # ---- events, with the R12/R14 additions ----------------------------
    op.create_table(
        "entry_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
        sa.Column(
            "entry_type",
            sa.String(length=20),
            nullable=False,
            server_default="singles",
        ),
        # No FK on purpose — see the docstring.
        sa.Column("bracket_event_id", sa.String(length=100), nullable=True),
        sa.Column("cap", sa.Integer(), nullable=True),
        # R14: the per-event FALLBACK, kept. It is how flight-tiered pricing
        # is expressed, and it is unused when a fee schedule is configured.
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        # R12: 'M' | 'F' | 'mixed' | NULL (open). Drives the form's default
        # filtering. SOFT — never a hard block.
        sa.Column("gender_constraint", sa.String(length=20), nullable=True),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        # R14 §3: separate from closes_at, because organisers use the gap.
        sa.Column("withdraws_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        *_timestamps(),
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

    # ---- entries, re-pointed (R13) -------------------------------------
    op.create_table(
        "entries",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entry_event_id", sa.Uuid(), nullable=False),
        # The act this entry belongs to, and the human it enters.
        sa.Column("submission_id", sa.Uuid(), nullable=True),
        sa.Column("entry_player_id", sa.Uuid(), nullable=True),
        sa.Column(
            "state", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column("pending_reasons", sa.JSON(), nullable=False),
        # ---- doubles (created now, unused until E3) --------------------
        sa.Column("partner_entry_id", sa.Uuid(), nullable=True),
        sa.Column("partner_email", sa.String(length=320), nullable=True),
        # ---- publication ----------------------------------------------
        sa.Column(
            "list_opt_out", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        # ---- money / traceability --------------------------------------
        # This entry's component of the submission total. Nullable because
        # tiered pricing prices the PERSON, not the event (Q14 §1).
        sa.Column("fee_cents", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["tournament_id", "submission_id"],
            ["submissions.tournament_id", "submissions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id"),
    )
    # NON-unique on purpose (note 2 in the docstring). Powers the soft
    # duplicate flag, and nothing about it is a constraint.
    op.create_index(
        "ix_entries_event_player", "entries", ["entry_event_id", "entry_player_id"]
    )
    op.create_index("ix_entries_submission", "entries", ["submission_id"])

    # ---- the page, with the R14 configuration --------------------------
    op.create_table(
        "entry_pages",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        # The public, discoverable address of the entry *page* — a
        # shareable slug, not a capability token. R10 retired the
        # per-entrant capability entirely; managing an entry is login-gated.
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("intro_text", sa.Text(), nullable=True),
        sa.Column("regulations_text", sa.Text(), nullable=True),
        sa.Column(
            "waiver_required", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "regulations_version", sa.Integer(), nullable=False, server_default="1"
        ),
        # ---- money & payment (R14) -------------------------------------
        # CUMULATIVE totals in cents by event count, because that is how
        # directors publish them. NULL falls back to summing per-event fees.
        sa.Column("fee_schedule", sa.JSON(), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        # ---- entry policy (R14 §4) --------------------------------------
        sa.Column("max_events_per_person", sa.Integer(), nullable=True),
        sa.Column("discipline_caps", sa.JSON(), nullable=True),
        # ---- field policy (R12) -----------------------------------------
        sa.Column(
            "collect_phone", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        # ---- public page identity (R14 §6) -------------------------------
        # Publication data read only by the public page, deliberately
        # outside the state blob so a venue address can never 409 against
        # the fail-closed CONFIG_LOCKED guard.
        sa.Column("venue_name", sa.String(length=200), nullable=True),
        sa.Column("venue_address", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id"),
    )
    op.create_index("uq_entry_pages_slug", "entry_pages", ["slug"], unique=True)


def downgrade() -> None:
    """Back to ``r2c7e1f4a9b3``'s shape — the schema, not the data.

    Symmetrical with ``upgrade`` in exactly the sense a clean rebuild can
    be: it drops what this revision created and recreates the three tables
    the previous revision defined, empty. It cannot restore rows, and
    neither could an "additive then narrowing" downgrade once the narrowing
    had run — the difference is that this one says so.
    """
    op.drop_index("uq_entry_pages_slug", table_name="entry_pages")
    op.drop_table("entry_pages")
    op.drop_index("ix_entries_submission", table_name="entries")
    op.drop_index("ix_entries_event_player", table_name="entries")
    op.drop_table("entries")
    op.drop_index("ix_entry_events_bracket_event", table_name="entry_events")
    op.drop_table("entry_events")
    op.drop_index("ix_entry_players_account", table_name="entry_players")
    op.drop_table("entry_players")
    op.drop_index(
        "uq_submissions_tournament_idempotency_key", table_name="submissions"
    )
    op.drop_index("ix_submissions_account", table_name="submissions")
    op.drop_table("submissions")
    op.drop_index("ix_entrant_sessions_account", table_name="entrant_sessions")
    op.drop_index("uq_entrant_sessions_token_hash", table_name="entrant_sessions")
    op.drop_table("entrant_sessions")
    op.drop_index("uq_entrant_accounts_email_lower", table_name="entrant_accounts")
    op.drop_table("entrant_accounts")

    # Recreate r2c7e1f4a9b3's tables so ``downgrade`` lands on that
    # revision's schema rather than on a hole. Inlined rather than imported
    # from that module: a migration must describe the world at its own
    # moment, and calling the previous revision's ``upgrade`` would make
    # this one's behavior change whenever that one is read differently.
    op.create_table(
        "entry_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
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
        *_timestamps(),
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
        sa.Column(
            "state", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column("pending_reasons", sa.JSON(), nullable=False),
        sa.Column("contact_name", sa.String(length=200), nullable=False),
        sa.Column("contact_email", sa.String(length=320), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("manage_token_hash", sa.String(length=64), nullable=False),
        sa.Column("player_name", sa.String(length=200), nullable=False),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("partner_entry_id", sa.Uuid(), nullable=True),
        sa.Column("partner_email", sa.String(length=320), nullable=True),
        sa.Column(
            "list_opt_out", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("regulations_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("regulations_version_accepted", sa.Integer(), nullable=True),
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
    op.create_index(
        "uq_entries_tournament_idempotency_key",
        "entries",
        ["tournament_id", "idempotency_key"],
        unique=True,
    )
    op.create_index(
        "ix_entries_event_contact_email",
        "entries",
        ["entry_event_id", "contact_email"],
    )
    op.create_table(
        "entry_pages",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("intro_text", sa.Text(), nullable=True),
        sa.Column("regulations_text", sa.Text(), nullable=True),
        sa.Column(
            "waiver_required", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "regulations_version", sa.Integer(), nullable=False, server_default="1"
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tournament_id"),
    )
    op.create_index("uq_entry_pages_slug", "entry_pages", ["slug"], unique=True)
