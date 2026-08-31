"""SQLAlchemy 2.0 ORM models for the scheduler backend.

Tables back the routes that used to read and write JSON files:

- ``tournaments``   — one row per tournament document; the full
  ``TournamentStateDTO`` payload lives in the ``data`` JSON column. The
  scalar columns (``name``, ``status``, ``owner_id``, ``tournament_date``)
  are denormalised for the multi-tournament list view that lands in
  Step 6, and for the ownership check in Step 5.
- ``matches``       — per-match operational row introduced by the
  architecture-adjustment arc (Step A). Source of truth for ``status``
  (typed enum), ``version`` (optimistic concurrency), and the live
  ``court_id`` / ``time_slot`` assignment. Populated by the
  schedule-commit projection + the upcoming command-log endpoint;
  consumed by solver locking (Step B) and the operator UI (Steps E–G).
- ``match_states``  — legacy live operator scratchpad (called_at,
  actual_start_time, score, notes). Predates ``matches``; kept for now
  so existing routes and tests keep working. Both tables coexist until
  the arc cuts over.
- ``tournament_backups`` — opt-in snapshots of ``tournaments.data`` for
  the existing Setup → Backups panel. Replaces the rolling
  ``data/backups/tournament-*.json`` files. Retention is still
  app-managed (see ``TournamentBackupRepository.rotate``).

Design notes:
- ``Uuid`` cross-DB type maps to native UUID on Postgres (cloud mode)
  and to a CHAR(32) hex string on SQLite (local mode).
- ``JSON`` is the portable type — native JSONB on Postgres, TEXT on
  SQLite. We don't query inside the blob today; if we ever need to,
  switch to ``JSONB`` for the Postgres dialect via a separate Alembic
  step.
- All ``datetime`` columns store timezone-aware UTC values. We never
  rely on the database's session timezone.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from db.blob_version import CURRENT_TOURNAMENT_SCHEMA_VERSION, VersionedJSON


class MatchStatus(str, enum.Enum):
    """Lifecycle of a single match.

    ``SCHEDULED``  — solver assigned a court/slot, not yet acted on.
    ``CALLED``     — operator called players to court.
    ``PLAYING``    — match in progress.
    ``FINISHED``   — score recorded (terminal).
    ``RETIRED``    — walkover / retirement (terminal).
    """

    SCHEDULED = "scheduled"
    CALLED = "called"
    PLAYING = "playing"
    FINISHED = "finished"
    RETIRED = "retired"


def _utcnow() -> datetime:
    """Timezone-aware UTC clock — used as the default for every timestamp."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Single declarative base for the scheduler product."""


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The creating user (``users.id``). Nullable so rows created before
    # auth landed aren't rejected. Since SP-CLOUD-2 this is provenance
    # only — authorization reads memberships.
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    # SP-CLOUD-2: the owning org. Nullable at the column level so the
    # backfill migration can populate it; the application always sets
    # it (creator's personal org) and the migration leaves no NULLs.
    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("orgs.id", ondelete="RESTRICT"), nullable=True
    )
    # Denormalised name pulled out of ``data["config"]["tournamentName"]``
    # for the Step 6 dashboard list. Nullable to mirror the existing
    # behaviour where ``tournamentName`` is optional.
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Denormalised owner email captured at create time from the
    # authenticated user, surfaced as ``ownerName`` in the Hub's
    # "Shared with You" section. A one-way cache: it is not kept in sync
    # with ``users.email``, so a user who changes their address keeps the
    # old one on workspaces they already created.
    owner_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    # ``draft`` / ``active`` / ``archived`` — used by the Step 6 status
    # pill. Stored as plain string for ease of evolution; enforcement
    # lives at the application layer.
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    # ``meet`` (default — intercollegiate dual / tri-meet workflow,
    # uses the Setup / Roster / Matches / Schedule / Live / TV tabs)
    # or ``bracket`` (single-elimination / round-robin draws, uses the
    # standalone Bracket surface). Added in the backend-merge arc
    # follow-up after the user pushed back on showing meet tabs on
    # a bracket-only tournament. Stored as plain string; the dashboard
    # writes one of the two literals on create.
    kind: Mapped[str] = mapped_column(String(20), default="meet", nullable=False)
    # ISO date string ("2026-02-15") preserved as-is. Stored as String,
    # not Date, to mirror the on-the-wire shape in TournamentConfig.
    tournament_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Calendar end date for multi-day public tournament phases. Kept as an
    # ISO date string for compatibility with ``tournament_date`` and the
    # existing JSON contract; never interpreted as a UTC instant.
    tournament_end_date: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    # IANA venue timezone used when deriving public phase and displaying
    # tournament-local schedule times. UTC is the safe default for legacy
    # rows and deployments that have not configured a venue zone yet.
    time_zone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="UTC", server_default="UTC"
    )
    # The full ``TournamentStateDTO`` document - config + groups + players
    # + matches + schedule + history. One blob by choice; sub-entities
    # normalise out only when query needs warrant it.
    #
    # FOUR NUMBERS LIVE ON OR IN THIS COLUMN. Reconciled by R-DM-8(a)
    # (ruled 2026-08-24) - each one has exactly one job:
    #
    #   data["version"]        the SCHEMA version of the document. Absent
    #                          means 1. Stamped on write and checked on
    #                          read by ``VersionedJSON`` below; a document
    #                          newer than this build raises rather than
    #                          being mis-parsed.
    #   schema_version         a COLUMN MIRROR of data["version"], so
    #                          Alembic-level SQL can reason about payload
    #                          shape without parsing the blob. Never an
    #                          independent value.
    #   state_version          the OPTIMISTIC-CONCURRENCY token (I8,
    #                          SP-CLOUD-4). Counts committed writes; a
    #                          PUT /state carrying a stale one is refused.
    #                          NOT a schema version and never compared to
    #                          one - which is why it is not called
    #                          ``version``.
    #   data["scheduleVersion"]  the proposal-commit counter, a domain
    #                          value inside the document. Unrelated to all
    #                          three of the above.
    #
    # F-DM-39 stands and is documented rather than fixed: this document is
    # a superset of ``TournamentStateDTO``, and ``state_dto_from_document``
    # drops any section the DTO does not declare (``bracket_session``,
    # ``_integrity``). The wire type is a known-lossy filter over storage,
    # by design. Making it lossless is a wire change, not a versioning one.
    data: Mapped[dict] = mapped_column(
        VersionedJSON(CURRENT_TOURNAMENT_SCHEMA_VERSION, "version"),
        nullable=False,
        default=dict,
    )
    schema_version: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    matches: Mapped[list["Match"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    match_states: Mapped[list["MatchState"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    backups: Mapped[list["TournamentBackup"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    members: Mapped[list["TournamentMember"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    invite_links: Mapped[list["InviteLink"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    bracket_events: Mapped[list["BracketEvent"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )
    modules: Mapped[list["WorkspaceModule"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # SP-DM-3 P7a (F-DM-37): the schema's first CHECK constraints.
        # Vocabulary source: the route validator in
        # ``workspaces/tournaments.py`` ("kind must be 'meet' or 'bracket'").
        # Hardcoded rather than imported — ``db`` may not reach up into a
        # domain package (import-linter's persistence-direction contract).
        # ``status`` is deliberately NOT constrained here: its comment above
        # says enforcement lives at the application layer, and no validator
        # in the API produces its allowed set. It is on P7a's deferred list.
        CheckConstraint(
            "kind IN ('meet', 'bracket')",
            name="ck_tournaments_kind",
        ),
    )


class Match(Base):
    """Per-match operational row.

    Status is the typed enum (see ``MatchStatus``); ``version`` is the
    optimistic-concurrency token incremented on every write to the row.
    ``court_id`` / ``time_slot`` mirror the current schedule
    assignment — populated by the schedule-commit projection and by
    the upcoming command-log endpoint. Both are nullable so a match
    that exists in roster but isn't yet assigned can still have a row
    (status defaults to ``scheduled``).

    Primary key is composite ``(tournament_id, id)`` so foreign keys
    from the upcoming ``commands`` table can reference the pair and the
    leading-column index supports tournament-scoped scans.
    """

    __tablename__ = "matches"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    court_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    time_slot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=MatchStatus.SCHEDULED.value, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="matches")

    __table_args__ = (
        Index("ix_matches_tournament_status", "tournament_id", "status"),
        # SP-DM-3 P7a (F-DM-37). Vocabulary source: ``MatchStatus`` above.
        # Spelled out rather than derived from the enum so this string is
        # character-identical to the one in migration ``z0f5a1b3c9d2``.
        CheckConstraint(
            "status IN ('scheduled', 'called', 'playing', 'finished', 'retired')",
            name="ck_matches_status",
        ),
    )


class Command(Base):
    """Idempotent operator command log.

    Step C of the architecture-adjustment arc. Every mutating operator
    action (call_to_court / start_match / finish_match / retire_match
    / uncall) is recorded here with a client-generated UUID as the
    idempotency key. Replays of the same key short-circuit: applied
    commands return their original outcome; rejected commands return
    their original rejection reason. Both outcomes are stored
    permanently for audit.

    Foreign key is composite ``(tournament_id, match_id) →
    matches(tournament_id, id)`` because ``matches.id`` alone isn't
    unique (it's part of the composite PK from Step A) and match_ids
    are tournament-scoped strings, not the prompt's single-column
    UUID reference. ``match_id`` is NOT NULL — every action in
    ``MatchAction`` targets a specific match; tournament-level
    actions are a hypothetical we don't model until they exist.
    """

    __tablename__ = "commands"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    match_id: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    submitted_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    # Exactly one of applied_at / rejected_at is set after processing;
    # both null means the row was inserted but the processor crashed
    # before stamping an outcome — should never happen with the
    # single-commit-per-path orchestration in
    # ``LocalRepository.process_command``.
    applied_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            ondelete="CASCADE",
        ),
        Index(
            "ix_commands_tournament_match_applied",
            "tournament_id",
            "match_id",
            "applied_at",
        ),
        Index(
            "ix_commands_submitted_by_created",
            "submitted_by",
            "created_at",
        ),
    )


class MatchState(Base):
    __tablename__ = "match_states"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    match_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)
    called_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    actual_start_time: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    actual_end_time: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    score_side_a: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_side_b: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    original_slot_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    original_court_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="match_states")

    # F-DM-22: one Meet match is three records joined by an unconstrained
    # String(100), and this was the table with no ``__table_args__`` at
    # all. ``commands`` (same file, :283) is the prior art — composite
    # because ``matches.id`` alone is not unique.
    #
    # CASCADE is FORCED, not preferred: the Meet projection
    # (repositories/local.py:483) deletes a ``matches`` row whose id left
    # ``tournaments.data["matches"]``, and a RESTRICT would turn that
    # ordinary write into an IntegrityError. The consequence is real and
    # accepted — live-ops state for a match removed from the blob is now
    # deleted with it instead of surviving orphaned (characterized in
    # tests/backend/unit/test_repositories.py before the change).
    #
    # No extra Index: the primary key IS (tournament_id, match_id).
    # ``commands`` needs one because its index is
    # (tournament_id, match_id, applied_at) over a surrogate PK.
    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            ondelete="CASCADE",
        ),
    )


class TournamentBackup(Base):
    __tablename__ = "tournament_backups"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    # Synthetic filename so the existing API contract
    # (GET/POST /tournament/state/backups, POST /restore/{filename}) is
    # preserved. Matches the legacy on-disk shape
    # ``tournament-<name>-<timestamp>.json`` so any UI that displays it
    # keeps reading.
    filename: Mapped[str] = mapped_column(String(260), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    # ``auto`` (a state write snapshotting the prior payload) or ``manual``
    # (the director pressed Create backup). Retention rotates ``auto`` rows
    # and never touches ``manual`` ones: ten routine writes during setup used
    # to be enough to evict the snapshot a director took deliberately that
    # morning, which is the one entry the feature exists for.
    origin: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="auto", default="auto"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="backups")


class TournamentMember(Base):
    """Per-tournament role assignment.

    Step 5 of the cloud-prep migration adds this table to gate every
    ``/tournaments/{id}/*`` route behind a role check. The composite
    primary key (tournament_id, user_id) enforces one role per user
    per tournament; promotions/demotions overwrite the existing row.

    ``role`` is a plain string column ("owner" / "operator" /
    "viewer") rather than a DB-level enum so role changes ship as
    plain DML and don't need an Alembic migration each time the
    application widens the vocabulary.
    """

    __tablename__ = "tournament_members"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    # SP-CLOUD-2: real users now — the raw-UUID era ended with the
    # backfill migration seeding a users row for every historical id.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="members")

    __table_args__ = (
        Index("ix_tournament_members_user", "user_id"),
        # SP-DM-3 P7a (F-DM-37). Vocabulary source: ``identity/members.py``
        # ``ROLES = ("viewer", "operator", "owner")``, the same three the
        # ``_ROLE_LEVELS`` ladder in ``core/dependencies.py`` ranks.
        CheckConstraint(
            "role IN ('viewer', 'operator', 'owner')",
            name="ck_tournament_members_role",
        ),
    )


class InviteLink(Base):
    """Shareable URL token granting a fixed role on a tournament.

    Step 5 lands the schema; Step 7 fills in the routes (generate /
    resolve / revoke). ``role`` is constrained at the application layer
    to ``operator`` or ``viewer``; ``owner`` is reserved for the
    tournament creator and isn't transferable via invite.
    """

    __tablename__ = "invite_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # SP-CLOUD-2 Phase 3: cloud invites are email-addressed (delivery
    # via the email seam). NULL = local link-style invite.
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    tournament: Mapped[Tournament] = relationship(back_populates="invite_links")


# ---- Bracket schema (T-A, backend-merge arc) ----------------------------
#
# Children of ``tournaments``. A bracket "event" here means a sub-event
# / division within a tournament (Men's Singles, Women's Doubles, etc.)
# — NOT a meet. The naming follows ``scheduler_core/domain/tournament.py``'s
# ``Event`` concept. Persistence is invisible in PR 1; the
# ``_LocalBracketRepo`` introduced alongside this schema is exercised
# by unit tests only. PR 2 wires the tournament-product routes to read
# and write through these tables.


class BracketEvent(Base):
    """One sub-event within a tournament's bracket draws.

    Composite PK ``(tournament_id, id)`` mirrors the ``Match`` model so
    the ``id`` is tournament-scoped (e.g. ``"MS"`` for Men's Singles)
    and per-tournament scans hit the PK leading column. ``format``
    is the tournament product's ``"se"`` (single-elimination) or
    ``"rr"`` (round-robin) tag; ``config`` is the catch-all blob for
    format-specific knobs (randomize-seed flag, optional metadata).

    ``id`` is the entrant tier's public draw address — it is both ``drawKey``
    (the ``/e/{slug}/draws/{drawKey}`` URL segment) and ``eventCode`` on the
    draws, seeds and winners projections. Being half of the PK it cannot be
    UPDATEd in place, and ``PATCH``/``DELETE /bracket/events/{event_id}`` are
    path-keyed — **but ``POST /bracket`` and ``POST /bracket/import`` take the
    id from the request BODY, and neither checks publication.** The 409 on
    ``POST /bracket`` instructs ``DELETE /bracket`` first, so a
    delete-and-recreate can re-key a published draw and silently break every
    public URL that pointed at it. That gap is real, deliberately unclosed in
    P7a (blocking it after publication would block a legitimate draw
    *rebuild*, not just a rename) and logged as debt-log **D24**; it is
    characterized by ``tests/backend/test_event_code_unrenameable.py``.
    """

    __tablename__ = "bracket_events"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    discipline: Mapped[str] = mapped_column(String(200), nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    duration_slots: Mapped[int] = mapped_column(Integer, nullable=False)
    bracket_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    seeded_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rr_rounds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="bracket_events")
    participants: Mapped[list["BracketParticipant"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    matches: Mapped[list["BracketMatch"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )


class BracketParticipant(Base):
    """Seeded entrant in a bracket event.

    ``type`` mirrors ``ParticipantType`` ('PLAYER' | 'TEAM'); a team
    participant carries its member ids in ``member_ids``. ``seed`` is
    nullable for unseeded entrants. ``meta`` holds anything the draw
    logic wants to round-trip (e.g. club, country).
    """

    __tablename__ = "bracket_participants"

    tournament_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    bracket_event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    member_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    seed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # R-DM-2(a) / SP-DM-3 P4: the FIRST constrained hop from the people
    # spine to the competition spine. ``id`` above stays the name-derived
    # String by ruling R-DM-7(a) — no re-key — so this is the identity for
    # every participant that resolves to a person, and ``id`` degrades to a
    # display/URL key. Nullable because a hand-added participant is nobody
    # in ``entry_players``. Composite because ``entry_players``' PK is
    # ``(tournament_id, id)``.
    entry_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    event: Mapped[BracketEvent] = relationship(back_populates="participants")

    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            # CASCADE, not SET NULL: a composite SET NULL nulls EVERY
            # referencing column, ``tournament_id`` included - and that is
            # a NOT NULL primary-key column here. Same ondelete as the
            # ``entries`` FK onto the same parent (s3d8f2b5c0e1). Blast
            # radius argued in the plan's judgment call 7.
            ondelete="CASCADE",
        ),
    )


class BracketMatch(Base):
    """One PlayUnit row.

    ``slot_a`` / ``slot_b`` are the BracketSlot shapes from
    ``products/tournament/tournament/draw.py``: exactly one of
    ``participant_id`` (concrete entrant or BYE sentinel) or
    ``feeder_play_unit_id`` (pointer to the upstream match whose
    winner fills this slot). ``side_a`` / ``side_b`` cache the
    resolved participant id lists once known.

    ``version`` is the optimistic-concurrency token; the advancement
    code in PR 2 will increment it on each slot resolution / status
    change. Index on ``(tournament_id, bracket_event_id, round_index)``
    backs the "list this event's matches by round" query.
    """

    __tablename__ = "bracket_matches"

    tournament_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    bracket_event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    round_index: Mapped[int] = mapped_column(Integer, nullable=False)
    match_index: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="MATCH", nullable=False)
    slot_a: Mapped[dict] = mapped_column(JSON, nullable=False)
    slot_b: Mapped[dict] = mapped_column(JSON, nullable=False)
    side_a: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    side_b: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    dependencies: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    expected_duration_slots: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_variance_slots: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    child_unit_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    event: Mapped[BracketEvent] = relationship(back_populates="matches")
    result: Mapped[Optional["BracketResult"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        uselist=False,
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            ondelete="CASCADE",
        ),
        Index(
            "ix_bracket_matches_event_round",
            "tournament_id",
            "bracket_event_id",
            "round_index",
        ),
    )


class BracketResult(Base):
    """Recorded outcome of a bracket match.

    One-to-one optional with ``bracket_matches``. ``winner_side``
    follows ``WinnerSide`` ('A' | 'B' | 'NONE' for draws/walkovers).
    ``score`` is a JSON blob — format-specific (sets, points, etc.).
    """

    __tablename__ = "bracket_results"

    tournament_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    bracket_event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    bracket_match_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    winner_side: Mapped[str] = mapped_column(String(10), nullable=False)
    score: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    finished_at_slot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    walkover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Contingency annotation only (spec 2026-07-14 §1): why the result was
    # awarded without (full) play — 'walkover' | 'retired' | 'forfeit' | None.
    # Does NOT drive advancement/BYE-sweep routing; that stays keyed off
    # ``walkover`` alone. Distinct routing for retired/forfeit is deferred
    # (debt-log).
    reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    match: Mapped[BracketMatch] = relationship(back_populates="result")

    __table_args__ = (
        ForeignKeyConstraint(
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
    )


# ---- Meet schema (SP-DM-3 P7b) ------------------------------------------


class MeetEvent(Base):
    """One division within a Meet workspace: ``MS``, ``XD`` — never ``MS1``.

    Meet has never had an Event entity; a division lived only as a key in
    the state blob's ``config.rankCounts`` dict, which is why the Entries
    commit seam had to invent the fields it needed. This table is that
    entity, and R-DM-5 binds its grain to the **division**: a numbered rank
    (``MS1``) is a generated *position* label, regenerated from
    ``{prefix, count}`` at every site that shows one, with no row, no label
    and no lifecycle of its own. ``slot_count`` is that count, so
    ``{BS: 20, GS: 20}`` is two rows carrying 20, not forty.

    **Derived, never authored.** The only writer is
    ``repositories.local._LocalTournamentRepo.upsert_data``, which re-syncs
    these rows from the blob it is persisting — the same place the
    denormalised ``name`` / ``tournament_date`` columns are kept in step.
    That is the single funnel every blob write reaches, so a row cannot
    drift from the config no matter which of the nine writers supplied it.
    ``label`` is the one field the blob has no source for: it is seeded to
    the code on INSERT and never rewritten, so it stays available to a
    future editor without the funnel clobbering it on the next save.

    Composite PK ``(tournament_id, id)`` follows ``BracketEvent``, and
    inherits its hazard: ``id`` is half the PK, so a division cannot be
    renamed in place. That costs nothing today — the derivation reads a
    dict keyed by code and cannot tell a rename from a delete-plus-add
    either way — but it is the same shape as debt-log **D24**.
    """

    __tablename__ = "meet_events"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    #: The division code, e.g. ``"MS"``. Bounded like ``entry_events.code``.
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    #: How many numbered positions the division expands to (``rankCounts``).
    slot_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ---- Workspace modules (workspace-modules program, sub-project #1) -------
#
# First-class per-workspace module state, tied to ``tournaments.id``. The
# legacy ``kind`` column becomes a compatibility seed: a tournament's
# initial module set is *derived* from ``kind`` (see ``derive_modules``)
# the first time anyone reads its modules, then persisted as real rows so
# later sub-projects (hub / settings / sharing redesigns, hybrid
# enablement) read and mutate first-class state rather than re-deriving.

# Canonical module ids. ``meet`` / ``bracket`` are the data-producing
# operator modules; ``display`` is the read-only public surface;
# ``entries`` is the public *intake* surface (see CLOUD_ONLY_MODULES).
MODULE_IDS = ("meet", "bracket", "display", "entries")

# Modules that only exist where the deployment can actually operate them.
# Entries is public self-service registration: it needs real operator
# accounts and a reachable public surface, so a local-mode deployment can
# never enable it. ADR 0005 retired ``coming_soon`` precisely so that every
# module a workspace shows is actionable — a permanently-unenableable module
# would resurrect the state that ADR deleted. So local mode does not seed
# these, and filters them out of both module read paths.
#
# This module stays SETTINGS-FREE: the mode arrives as the explicit
# ``include_cloud_only`` argument below, supplied by the caller. The
# predicate behind it lives in ``core.config.cloud_modules_enabled`` and keys
# on ``AUTH_MODE`` (ruling D2) — deliberately not ``ENVIRONMENT``, which
# ``docker-compose.cloud.yml`` pins to ``local`` on purpose.
CLOUD_ONLY_MODULES = ("entries",)

# Module lifecycle vocabulary. ``enabled`` — active/operable; ``available``
# — installable but off; ``disabled`` — turned off by the operator;
# ``coming_soon`` — retired: all modules are fully built. Kept in the tuple only
# as migration / immutable-guard vocabulary (the migrations convert legacy
# coming_soon rows to ``available``); seeding it is rejected (normalize_module_seed).
MODULE_STATUSES = ("enabled", "available", "disabled", "coming_soon")

# Operator (data-producing) modules — the dependency + last-operational
# rules in the PATCH path key off this set.
OPERATIONAL_MODULES = ("meet", "bracket")


def derive_modules(
    kind: Optional[str], *, include_cloud_only: bool = False
) -> dict[str, str]:
    """Map a tournament's legacy ``kind`` to its seed module status set.

    The kind's own operator is ``enabled``; the foreign operator is
    ``available`` — installable / directly usable, and promotable to
    ``enabled`` via the control plane (SP-B2 multi-module enablement).
    ``display`` is ``available`` for both kinds — the bracket public display
    (SP-B3) renders the draw / live matches / results. Unknown / ``None``
    kinds fall back to the meet shape.

    ``include_cloud_only`` adds ``CLOUD_ONLY_MODULES`` (``entries``, also
    ``available`` for both kinds). Keyword-only and defaulting to ``False``
    on purpose: the default is the safe direction — a caller that forgets to
    ask omits a module, rather than seeding one the deployment cannot
    operate. The mode is the caller's to know; this layer imports no
    settings.
    """
    if kind == "bracket":
        modules = {"bracket": "enabled", "display": "available", "meet": "available"}
    else:
        # ``meet`` and any unknown / None kind.
        modules = {"meet": "enabled", "display": "available", "bracket": "available"}
    if include_cloud_only:
        modules.update({module_id: "available" for module_id in CLOUD_ONLY_MODULES})
    return modules


def display_dependency_satisfied(statuses: dict[str, str]) -> bool:
    """Whether the Display-dependency rule holds for a module status map.

    ``display`` may be ``enabled`` only if a data-producing (operational)
    module — ``meet`` or ``bracket`` — is also ``enabled``. Returns ``True``
    whenever ``display`` is not ``enabled`` (the rule is vacuously satisfied).
    Shared by the create-seed validation and the PATCH handler so the rule
    lives in exactly one place.
    """
    if statuses.get("display") != "enabled":
        return True
    return any(statuses.get(m) == "enabled" for m in OPERATIONAL_MODULES)


def normalize_module_seed(
    seeds: list[dict], *, include_cloud_only: bool = False
) -> list[dict]:
    """Validate and complete an explicit create-time module seed.

    ``seeds`` is the create endpoint's optional ``modules[]`` — each item a
    dict with ``moduleId``, ``status``, and optional ``config``. Validates
    structure (known id, no duplicates, valid status), backfills any
    seedable module not named, and returns an ordered (by ``MODULE_IDS``)
    list of ``{"module_id", "status", "config"}`` rows ready to persist.

    Backfill: any unnamed module becomes ``available`` (installable) — display
    included, since it is fully built for both operators (meet + bracket). Raises
    ``ValueError`` on malformed input; the caller maps that to a 400 and separately
    applies ``display_dependency_satisfied``.

    ``include_cloud_only`` mirrors ``derive_modules``: without it,
    ``CLOUD_ONLY_MODULES`` are neither backfilled nor accepted when named
    explicitly. Naming one is an error rather than a silent drop — persisting
    a row the read path would then hide is the confusing outcome. The route
    catches this case first and answers ``MODULE_REQUIRES_CLOUD``; this
    ValueError is the defence-in-depth for any other caller.
    """
    seedable = tuple(
        module_id
        for module_id in MODULE_IDS
        if include_cloud_only or module_id not in CLOUD_ONLY_MODULES
    )
    named: dict[str, dict] = {}
    for item in seeds:
        module_id = item.get("moduleId")
        status = item.get("status")
        if module_id in CLOUD_ONLY_MODULES and not include_cloud_only:
            raise ValueError(
                f"moduleId {module_id!r} requires a cloud-mode deployment"
            )
        if module_id not in MODULE_IDS:
            raise ValueError(f"unknown moduleId: {module_id!r}")
        if module_id in named:
            raise ValueError(f"duplicate moduleId: {module_id!r}")
        if status not in MODULE_STATUSES:
            raise ValueError(f"invalid status: {status!r}")
        # All modules are fully built — `coming_soon` is not a seedable status.
        # (It remains in MODULE_STATUSES only as immutable-guard / migration
        # vocabulary; a seed must never persist a row in that state.)
        if status == "coming_soon":
            raise ValueError("coming_soon is not a seedable module status")
        named[module_id] = {
            "module_id": module_id,
            "status": status,
            "config": item.get("config"),
        }

    # Display is fully built for both operators (meet + bracket public displays),
    # so an unnamed display backfills to 'available' (installable). It can only be
    # *enabled* when an operational module is enabled — the dependency rule
    # (display_dependency_satisfied), applied separately by the caller.
    rows: list[dict] = []
    for module_id in seedable:
        if module_id in named:
            rows.append(named[module_id])
        else:
            rows.append({"module_id": module_id, "status": "available", "config": None})
    return rows


class WorkspaceModule(Base):
    """One persisted module row for a workspace (tournament).

    Unique on ``(tournament_id, module_id)`` — at most one row per module
    per workspace. Seeded lazily from ``derive_modules(tournament.kind)``
    by ``LocalRepository.modules.ensure_modules`` the first time a read or
    mutate path touches a workspace's modules; the Alembic migration
    backfills the same set for rows that predate this table.
    """

    __tablename__ = "workspace_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("tournaments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_id: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="modules")

    __table_args__ = (
        UniqueConstraint(
            "tournament_id", "module_id", name="uq_workspace_modules_tournament_module"
        ),
    )


class SolveJobStatus(str, enum.Enum):
    """Lifecycle of a solve job (SP-CLOUD-1 job boundary).

    ``QUEUED``     — enqueued, waiting for a worker.
    ``CLAIMED``    — a worker owns the lease, child not yet running.
    ``RUNNING``    — solve subprocess executing, heartbeats expected.
    ``SUCCEEDED``  — terminal; ``result`` holds the ScheduleDTO.
    ``FAILED``     — terminal; infrastructure/validation failure after
                     retries, ``error`` holds the structured reason.
    ``INFEASIBLE`` — terminal; the solver *proved* there is no feasible
                     schedule (or exhausted its budget without one).
                     A domain outcome, never retried, never a 500.
    ``CANCELLED``  — terminal; user-requested.
    """

    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INFEASIBLE = "infeasible"
    CANCELLED = "cancelled"


# Shared WHERE fragment for the active-job partial unique index. String
# literal (not bound params) because partial-index predicates must be
# constant expressions on both dialects.
_ACTIVE_SOLVE_JOB_PREDICATE = text(
    "status IN ('queued', 'claimed', 'running')"
)


class SolveJob(Base):
    """One asynchronous CP-SAT solve — the long-running-operation record.

    The HTTP layer enqueues (in the same transaction as any related
    business writes) and polls; workers claim, execute in a child
    subprocess, heartbeat, and complete. ``params`` and
    ``input_snapshot`` are captured at submit time so the worker never
    reads live tournament tables and a job stays reproducible after the
    tournament is edited.

    Two distinct dedup mechanisms (do not conflate):
    - ``uq_solve_jobs_idempotency_key`` — client retry safety (Stripe
      semantics): a resubmit with the same key returns the original job.
    - ``uq_solve_jobs_active`` — business rule: at most one *active*
      job per ``(tournament_id, type)``, enforced declaratively by a
      partial unique index (works on both SQLite and Postgres; no
      advisory locks).
    """

    __tablename__ = "solve_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=SolveJobStatus.QUEUED.value, nullable=False
    )
    # Solver parameters persisted at submit (random_seed, num_workers,
    # max_deterministic_time, wall-clock ceiling, candidate_pool_size…).
    # The worker reads ONLY from here — never from live settings — so a
    # re-run reproduces the original solve.
    params: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Full solver input (the stateless GenerateScheduleRequest shape).
    input_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Terminal payloads. ``result`` holds the ScheduleDTO for both
    # ``succeeded`` and ``infeasible`` (the DTO carries status +
    # infeasibleReasons); ``error`` is structured {code, message, detail}.
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Coarse live progress written on worker heartbeats (phase,
    # solutionCount, objective…) for the polling UI. Never authoritative.
    progress: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    # Lower = sooner. Claim order is (priority ASC, created_at ASC).
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    claimed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index(
            "uq_solve_jobs_idempotency_key",
            "idempotency_key",
            unique=True,
        ),
        Index(
            "uq_solve_jobs_active",
            "tournament_id",
            "type",
            unique=True,
            sqlite_where=_ACTIVE_SOLVE_JOB_PREDICATE,
            postgresql_where=_ACTIVE_SOLVE_JOB_PREDICATE,
        ),
        # Claim hot path: workers only ever scan queued rows, so
        # terminal-job accumulation never slows the claim query.
        Index(
            "ix_solve_jobs_claimable",
            "priority",
            "created_at",
            sqlite_where=text("status = 'queued'"),
            postgresql_where=text("status = 'queued'"),
        ),
    )


# ---- Identity & sessions (SP-CLOUD-2 Phase 1) ------------------------


class User(Base):
    """A real account row — the end of the bare-UUID identity era.

    ``password_hash`` is nullable on purpose: the local bootstrap
    operator and identities migrated from the Supabase-JWT era have no
    password until they set one (cloud: via the reset flow).
    ``email_verified`` exists from day one; the verification *flow* is
    cloud-only. Email uniqueness is case-insensitive via a functional
    unique index on ``lower(email)`` — portable to both dialects — while
    the stored value keeps the user's original casing.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    # Argon2id PHC string (contains its own salt + parameters).
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Password-reset token (SHA-256 of the mailed token; single active
    # token per user, overwritten on re-request, cleared on use).
    reset_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reset_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
    )


class DisplayToken(Base):
    """Capability token behind the public spectator display (Rule 8).

    One row per workspace; the token is a random urlsafe string stored
    RAW (unlike sessions) because the Sharing tab must re-display the
    link and the capability it grants is read-only projection data —
    revocation is rotation (new token) or row deletion. The public
    ``/display/{token}/*`` routes resolve through this table only;
    the raw tournament UUID never becomes a public capability.
    """

    __tablename__ = "display_tokens"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    __table_args__ = (Index("uq_display_tokens_token", "token", unique=True),)


class Org(Base):
    """The owning entity for workspaces (club / program).

    Every user gets a personal org at creation (GitHub/Stripe pattern)
    so the UI can ignore orgs entirely while the data model never hangs
    workspaces directly off users — retrofitting an org layer later is
    the migration everyone regrets.
    """

    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class OrgMember(Base):
    """User ↔ org membership. Roles stay minimal: owner | member."""

    __tablename__ = "org_members"

    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orgs.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="owner")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    __table_args__ = (Index("ix_org_members_user", "user_id"),)


class AuthSession(Base):
    """Server-side session record backing the auth cookie.

    The cookie carries an opaque random token; only its SHA-256 lands
    here, so a leaked DB dump can't be replayed as live sessions.
    Revocation is a timestamp (not a delete) so audit/debugging keeps
    the row until retention pruning.
    """

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("uq_auth_sessions_token_hash", "token_hash", unique=True),
        Index("ix_auth_sessions_user", "user_id"),
    )


class AuthThrottle(Base):
    """Credential-endpoint backoff counters (per account and per IP).

    DB-backed (no Redis) and dual-dialect; one row per throttle key
    (``account:<lower-email>`` or ``ip:<addr>``). Enough to blunt
    credential stuffing — general rate limiting is out of scope.
    """

    __tablename__ = "auth_throttle"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ---- Entries (SP-PROGRAM-1 Phase 5 / SP-E1-1) ----------------------------
#
# Public self-service registration: the first public *write* surface. The
# full schema from the design spec's §4 sketch lands in one migration (E1
# rule 6) even though the E1 walking skeleton uses only a subset — the
# doubles pointers, the payment columns and the verification timestamp are
# created now precisely so E2/E3/E5 are feature work, not migration churn.
#
# Nothing here is mode-aware. The cloud-only rule lives on the *module* row
# (``CLOUD_ONLY_MODULES`` above), so a database that moves cloud → local
# hides the Entries module but keeps every entry intact and readable when it
# moves back. Filtering is a projection, never a migration.
#
# ---- the account level (SP-E1-2 / ruling R10, Phase A ruling D-A2) -------
#
# Entrants are a SECOND PRINCIPAL TYPE, and they live in their own tables —
# not as rows in ``users``. The audit that decided it (spec Q13 §3 named the
# four questions; the tree answered them) turned on one measurement: 27
# session-gated routes carry no ``{tournament_id}`` and therefore sit outside
# the OpenAPI-derived tenancy test, ``POST /tournaments`` and ``POST
# /invites/{token}/accept`` among them. Reusing ``users`` would have made an
# entrant a principal those 27 routes already accept, and the guard would
# have been a discriminator check on each — a check that is fail-OPEN when
# forgotten. A sibling table makes entrant membership unrepresentable: the
# membership tables' FKs point at ``users``, and nothing here can satisfy
# them.


class EntrantAccount(Base):
    """A public entrant's account — a credential for acting on their own
    submissions, and nothing else (spec Q13 §5).

    **No org. No role. No ``tournament_members`` row. Ever.** That sentence
    is what keeps the tenancy model from acquiring a second meaning, and the
    absence of the columns is how it is enforced rather than remembered.

    Password storage, policy and token hashing are the shipped mechanisms
    reused verbatim (``identity/auth.py``): Argon2id PHC strings, NIST
    800-63B length-only policy, SHA-256 of a mailed reset token. What is not
    reused is the session plumbing — see ``EntrantSession``.

    **Not workspace-scoped**, unlike every other table in this block: an
    account outlives any one tournament, which is the entire point of it.
    So there is no ``tournament_id`` and no cascade from ``tournaments``.

    Email uniqueness is case-insensitive **within the entrant namespace**
    only. One human may hold an operator account and an entrant account on
    the same address; that is a mild product oddity and a deliberate one —
    a shared namespace would let an entrant signup collide with, or probe
    for, a director's account.
    """

    __tablename__ = "entrant_accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    # Argon2id PHC string (contains its own salt + parameters).
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # R12: the ONLY optional contact field, collected only where the director
    # turned it on (``entry_pages.collect_phone``). It lands on the ACCOUNT
    # rather than the entry because it is submitter contact data.
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Verification and reset are E2 (program Phase 7); the columns exist now
    # so that slice is feature work rather than migration churn, exactly as
    # the doubles and payment columns below already do.
    reset_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reset_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # E2: the mailed double-opt-in credential. A SEPARATE pair from the reset
    # tokens above, not a reuse of them — one column whose meaning depended on
    # which route wrote it last would make a verification link replayable as a
    # password reset, which is a privilege escalation by column-sharing.
    verify_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    verify_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (
        Index("uq_entrant_accounts_email_lower", text("lower(email)"), unique=True),
    )


class EntrantSession(Base):
    """Server-side session record behind the ``play.*`` entrant cookie.

    Structurally a twin of ``AuthSession`` — opaque random token in the
    cookie, only its SHA-256 stored, revocation as a timestamp — and
    deliberately **not the same table** (ruling D-A3).

    The alternative was an audience discriminator on ``AuthSession``. Both
    designs have a failure mode and they are not symmetrical: a discriminator
    fails *open* the day a resolver forgets to check it, while a second table
    cannot be confused by construction — this FK points at
    ``entrant_accounts``, so an entrant session that named a ``users`` row
    would be a database error rather than a privilege escalation.

    The cost is the ~40 lines of session plumbing in ``identity/entrants.py``
    that mirror ``identity/auth.py``. That duplication is the price of the
    property and is held to the original's behaviour by
    ``tests/unit/test_entrants_service.py`` against
    ``tests/unit/test_auth_characterization.py``.
    """

    __tablename__ = "entrant_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entrant_accounts.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("uq_entrant_sessions_token_hash", "token_hash", unique=True),
        Index("ix_entrant_sessions_account", "account_id"),
    )


class Submission(Base):
    """One form act, covering 1–N events (ruling R13, spec Q12 §R3).

    **This table is a level boundary, and the block comments below say
    which level.** R7 kept the submitter block and the player block
    structurally separate inside one ``entries`` row and promised the split
    would then be a column move; R13 collects on that promise, and this is
    where the *act* half landed.

    Three things moved **up** from ``entries`` and the reason is the same
    for all three: a form act covering three events is **one** agreement,
    **one** retry unit and **one** payment. Left on the entry they would
    either duplicate across N rows — three rows each claiming to be "the"
    fee total — or have to be reconstructed later by grouping on a
    timestamp.

    ``uq_submissions_tournament_account_idempotency_key`` is ruling D4
    carried up a level and then narrowed to the principal (Phase 6 §4):
    **tenant- and account-scoped**, unlike the solve rail's global index.
    The submit route is reachable by anyone holding a public slug, so
    resolving a client-supplied key globally would let an outsider probe
    another tenant's keyspace; resolving it tenant-wide would let one
    entrant's guessed key collide with — and, through the replay lookup,
    read back — another entrant's submission. NULL keys stay exempt on
    both dialects.
    """

    __tablename__ = "submissions"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entrant_accounts.id", ondelete="CASCADE"), nullable=False
    )

    # ---- the act (R13) ------------------------------------------------
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Q11: acknowledgment gates the submission, and the version agreed to is
    # recorded at that instant. "They agreed to something at some point" is
    # not a record.
    regulations_accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    regulations_version_accepted: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )

    # ---- money (R14; Q8's payment boundary untouched) ------------------
    # The running total the form showed, snapshotted. Spec Seam B: the total
    # shown to the entrant IS the total recorded — never recomputed silently
    # afterwards, because a price that changes after agreement is not a
    # price.
    fee_total_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # How the total was derived (the schedule that applied, the per-event
    # components, the basis name), so a dispute months later is answerable
    # without re-deriving prices from a config that has since been edited.
    fee_basis: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payment_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    account = relationship("EntrantAccount", lazy="joined")

    __table_args__ = (
        # Ruling D4, one level up, narrowed to the principal (Phase 6 §4).
        # It must match ``entries.submissions.find_by_idempotency_key``
        # column for column: that function is what the IntegrityError
        # recovery re-reads with, and an index wider than the lookup turns
        # a foreign entrant's key collision into an unhandled 500 instead
        # of a fresh submission. NULLs compare distinct on both dialects,
        # so a NULL key is still exempt (``account_id`` is NOT NULL).
        Index(
            "uq_submissions_tournament_account_idempotency_key",
            "tournament_id",
            "account_id",
            "idempotency_key",
            unique=True,
        ),
        Index("ix_submissions_account", "account_id"),
    )


class EntryPlayer(Base):
    """The human being entered (ruling R13's leaf, decision D-A4).

    **Its own table rather than namespaced fields on the entry**, decided
    against the tree rather than the spec (D-A4): the §4 index the soft
    duplicate flag runs on is ``(entry_event_id, entry_player_id)``, which
    needs a player id to point at, and ``remarks`` describes a *human's*
    availability — three events for one child must not carry three copies
    of one sentence, because the commit seam writes it onto a roster
    **player**.

    The invariant R13 states and this table enforces structurally: **player
    fields are never mixed into contact/account fields.** Contact data
    lives on ``entrant_accounts`` (the person who *acts*); this is the
    person who *plays*, and the two are routinely different — a parent
    entering two children, a club representative entering eight players.

    ``account_id`` says who may act for this player. It is not ownership of
    a human being; it is the join that lets "my entries" (E2) show a parent
    their children's entries without a second identity system.

    **R12's never-in-v1 list, recorded because absence is a decision:** no
    postal address, no federation or member id, no date of birth beyond
    ``birth_year`` as an eligibility field. GDPR minimization governs
    (Q10), and a column that does not exist cannot be collected by
    accident.
    """

    __tablename__ = "entry_players"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entrant_accounts.id", ondelete="CASCADE"), nullable=False
    )
    # Published on the public entrant list (unless the entry opts out).
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # R12: REQUIRED. Without it MS/WD/XD event filtering is impossible,
    # which is the only reason the field exists. Enforcement of the *match*
    # is soft (Q14 §5) — the form filters by default, an override path
    # exists, and a mismatch is an attention flag an operator resolves.
    # NOT NULL is about the field being collected, not about the match.
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    # Free text, optional, never validated against a club registry we do
    # not have and are not going to invent.
    club: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # A plain eligibility field (U15, O40) — never a trigger for automatic
    # behavior, and emphatically not a GDPR special category.
    birth_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # The free-text availability note, carried verbatim onto the roster
    # player by the commit seam. Never parsed, never inferred from, never
    # fed to the solver: a free-text field that silently became a
    # constraint would be the worst kind of automatic decision (I4). It
    # lives HERE and not on the entry because it describes a human.
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # E2 / ruling D7: withdraw-and-erase scrubs the three fields above and
    # stamps this. The row survives — the submission it belongs to, its
    # entries, their states and the fee history are the director's records
    # and are not the entrant's to delete. What is erased is the human.
    # NULL is the normal state; a stamped row renders as "details erased"
    # rather than as somebody who typed their name badly.
    erased_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (Index("ix_entry_players_account", "account_id"),)


class EntryEvent(Base):
    """One entry-facing event within a workspace (spec Q2).

    Entries owns its own events table rather than borrowing one, because
    Meet has no events concept at all — it carries a flat player list inside
    the state blob and expresses divisions through ``PlayerDTO.ranks[]``
    codes. So ``code`` is the pivot: for a Meet workspace it maps onto that
    rank vocabulary, and for a Bracket workspace ``bracket_event_id`` points
    at the matching ``bracket_events`` row.

    ``bracket_event_id`` is a deliberately **unconstrained** pointer (see the
    migration docstring): the commit seam already specifies "an unmappable
    code is skipped and reported, never guessed", so a dangling pointer is a
    handled state — whereas a real FK would have to cascade, letting a draw
    rebuild silently destroy entry configuration and every entry under it.

    **``code`` is also the entrant tier's public event key** (R-DM-11(b)):
    it is what the public page groups entrants by and what the player page
    names events with, so once the workspace's ``entry_pages`` row has any
    publication flag on, renaming it changes what a published address
    describes. There is no update route today and there must not be one that
    can rename a *published* code — a draft one stays renameable, or a
    director loses their correction path. The absence is pinned, derived
    from the live route table, by
    ``tests/backend/test_event_code_unrenameable.py``; add a refusal in the
    owning service before you add the route.
    """

    __tablename__ = "entry_events"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # 'MS', 'XD1' — the Meet ranks[] vocabulary or a bracket event id.
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    discipline: Mapped[str] = mapped_column(String(200), nullable=False)
    # 'singles' | 'doubles'. E1 is singles-only; doubles is E3.
    entry_type: Mapped[str] = mapped_column(
        String(20), default="singles", nullable=False
    )
    bracket_event_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    #: The mapped ``meet_events.id`` (a division code, R-DM-5). FK-LESS for
    #: the same reason as ``bracket_event_id`` above, and more forcefully:
    #: ``meet_events`` rows are DERIVED from the state blob and are deleted
    #: whenever a code leaves ``config.rankCounts`` — so a cascading FK would
    #: let one config edit (or a backup restore) destroy every entry under a
    #: division, and a restricting one would make the blob write itself fail.
    #: A dangling pointer is the already-handled state: an unmappable code is
    #: skipped and reported, never guessed.
    meet_event_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    cap: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # R14: the PER-EVENT FALLBACK, kept rather than replaced. It is how
    # flight-tiered pricing (CAN-AM: $50 A flight, $30 all others) is
    # expressed, and it is unused when the tournament carries a fee
    # schedule on ``entry_pages``.
    fee_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # R12: 'M' | 'F' | 'mixed' | NULL (open). Drives the form's default
    # event filtering. SOFT — never a hard block (Q14 §5).
    gender_constraint: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    opens_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closes_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # R14 §3: SEPARATE from closes_at, because the incumbent models the two
    # separately and organisers use the gap (Badminton Ontario closes
    # entries Tuesday and accepts withdrawals until Wednesday). Feeds E2's
    # withdrawal path and COMMITTED_ENTRY_WITHDREW.
    withdraws_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    retention_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (
        Index("ix_entry_events_bracket_event", "tournament_id", "bracket_event_id"),
        Index("ix_entry_events_meet_event", "tournament_id", "meet_event_id"),
    )


class Entry(Base):
    """One entry: one event, for one player-unit, within one act (R13).

    **The block discipline R7 established was load-bearing and it has now
    been collected on.** The contact block and the player block were kept
    structurally separate inside this row precisely so that extracting them
    would be a column move rather than a redesign — and ruling R13 made the
    move. The contact block became ``entrant_accounts`` (who acts), the
    player block became ``entry_players`` (who plays), and the act's own
    fields — the retry key, the acceptance pair, the fee total — became
    ``submissions``. What is left here is what genuinely belongs to *one
    event for one player-unit*.

    **The read-through properties below are why Seam A did not have to
    change.** ``entries/entries.py`` reads ``entry.player_name`` and
    ``entry.remarks``, and the desk projection reads ``contact_name`` /
    ``contact_email``. Those names now resolve across the level boundary
    instead of naming columns. The seam's contract is stated as "the seam
    reads entries", and it still does; where the string physically lives is
    not part of that contract, which is exactly what made the reshape
    intake work rather than a rewrite.

    **No natural-key uniqueness, at any level.** Ruled out in Q12 and
    preserved verbatim by R13: one parent enters two children, one club rep
    enters eight players. Duplicate *suspicion* — same event + same player
    name across submissions — is a soft attention flag an operator resolves,
    and ``ix_entries_event_player`` is the non-unique index that powers the
    lookup. The one surviving uniqueness in this family is the submission's
    idempotency key, which guards a mechanical retry rather than a human
    judgement (the trap ``SolveJob`` documents from the other side).
    """

    __tablename__ = "entries"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entry_event_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    # ---- the levels this entry hangs between (R13) ---------------------
    # The act it belongs to, and the human it enters. Nullable only while
    # the narrowing half of this reshape is in flight; the writer sets both.
    submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    entry_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    # See the lifecycle state machine in the design spec §6. E1 submissions
    # land directly in 'pending' (ruling D1); 'unverified' exists in the
    # vocabulary but is only entered once E2's email verification ships.
    state: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    pending_reasons: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    # ---- doubles (E3, program Phase 8) --------------------------------
    # ``partner_entry_id`` is set on BOTH halves at acceptance and points at
    # the other one. Mutual rather than one-directional because either half
    # can be the row a reader has in hand.
    partner_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    # Who was named, in the nominator's own typing. Kept after acceptance:
    # it is what the invite was addressed to, and the accepting account's
    # address may differ (people forward mail).
    partner_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    # SHA-256 of the mailed invite token — never the token (invariant I5).
    partner_invite_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    partner_invite_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # When the invited principal accepted. The reasons list loses
    # ``awaiting_partner`` at that moment, so without this stamp the fact
    # that a human agreed would survive only as a missing string.
    partner_accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ---- publication ---------------------------------------------------
    # Absent from the public entrant list; still fully entered (Q4/I6). The
    # acknowledgment that used to sit beside it is on the submission now
    # (Q11/R13) — one act, one agreement.
    list_opt_out: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # ---- money / traceability -----------------------------------------
    # This entry's component of the submission total. Nullable because
    # tiered pricing prices the PERSON, not the event (Q14 §1) — there is no
    # true per-event price when three events cost 6000 together. The number
    # that means something is ``submissions.fee_total_cents``; the payment
    # record lives up there too, on the act that was paid for.
    fee_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Back-reference into the roster, written by the commit seam. Its
    # presence is what makes re-running the seam idempotent.
    committed_player_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "entry_event_id"],
            ["entry_events.tournament_id", "entry_events.id"],
            ondelete="CASCADE",
        ),
        # R13's two spine pointers, FK'd in the migration since
        # ``s3d8f2b5c0e1`` and absent here until SP-DM-3 P4 (F-DM-11). The
        # gap was not cosmetic: the unit suites build schema with
        # ``Base.metadata.create_all``, so an orphaned entry was
        # REPRESENTABLE in every test while raising IntegrityError in
        # production. The relationships below stay ``viewonly`` +
        # ``primaryjoin`` — a relationship is a join, never a constraint.
        ForeignKeyConstraint(
            ["tournament_id", "submission_id"],
            ["submissions.tournament_id", "submissions.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            ondelete="CASCADE",
        ),
        # NON-unique on purpose (Q12, preserved verbatim by R13). It powers
        # the soft duplicate lookup and nothing more: one account
        # legitimately enters the same event for two different players, and
        # the *same* player twice is a judgment an operator makes rather
        # than a 409 a database returns.
        Index("ix_entries_event_player", "entry_event_id", "entry_player_id"),
        Index("ix_entries_submission", "submission_id"),
        # The public, unauthenticated preview resolves a token through this.
        Index("ix_entries_partner_invite", "partner_invite_hash"),
        # SP-DM-3 P7a (F-DM-37). Vocabulary source: the six module-level
        # constants in ``entries/lifecycle.py`` — the four ``LIVE_STATES``
        # plus the two terminals that file writes (``REJECTED`` at
        # ``reject``, ``WITHDRAWN`` at ``withdraw``). Hardcoded, not
        # imported: ``db`` may not reach up into a domain package.
        CheckConstraint(
            "state IN ('unverified', 'pending', 'waitlisted', 'confirmed',"
            " 'rejected', 'withdrawn')",
            name="ck_entries_state",
        ),
    )

    # ---- read-through to the levels above and below ------------------
    # Relationships rather than joins at every call site, and lazy="joined"
    # because the desk reads every entry's player for every row — an N+1
    # over an entries desk is entirely on the wrong side of that ratio.
    player = relationship(
        "EntryPlayer",
        primaryjoin=(
            "and_(foreign(Entry.tournament_id) == EntryPlayer.tournament_id,"
            " foreign(Entry.entry_player_id) == EntryPlayer.id)"
        ),
        viewonly=True,
        lazy="joined",
    )
    submission = relationship(
        "Submission",
        primaryjoin=(
            "and_(foreign(Entry.tournament_id) == Submission.tournament_id,"
            " foreign(Entry.submission_id) == Submission.id)"
        ),
        viewonly=True,
        lazy="joined",
    )

    # The four names the shipped readers use. They were columns until R13
    # and are now one hop away; keeping the names is what let Seam A
    # (``entries/entries.py``) and the desk projection stay byte-for-byte
    # unedited through the reshape. Read-only by construction — writing an
    # entrant's name onto an entry is not a thing that should typecheck.
    player_name = association_proxy("player", "full_name")
    remarks = association_proxy("player", "remarks")

    @property
    def contact_email(self) -> Optional[str]:
        """The submitting account's address — who to reach about this act."""
        submission = self.submission
        account = submission.account if submission is not None else None
        return account.email if account is not None else None

    @property
    def contact_name(self) -> Optional[str]:
        """A name for the submitter, falling back to their address.

        An entrant account carries an optional display name (nothing forces
        one at signup), and the desk needs *something* to render. The
        address is the honest fallback: it is what we actually know.
        """
        submission = self.submission
        account = submission.account if submission is not None else None
        if account is None:
            return None
        return account.display_name or account.email


class EntryPage(Base):
    """The public entry page for a workspace (spec Q4, Q11).

    One row per workspace. ``slug`` is the discoverable public address of
    the *page* — deliberately not a capability token, because an entry page
    is meant to be shared, which is exactly what a capability URL exists to
    prevent. Per-entrant capability used to live on
    ``Entry.manage_token_hash``; ruling R10 retired it, and managing an
    entry is login-gated "my entries" (E2) against an entrant account.

    ``regulations_text`` is the director's own words; ShuttleWorks ships no
    template and no default legal copy. ``waiver_required`` is director
    discretion — the software never requires a waiver on the operator's
    behalf. ``regulations_version`` bumps on every text edit so an entry's
    recorded ``regulations_version_accepted`` means something in a dispute.
    """

    __tablename__ = "entry_pages"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    intro_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    regulations_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    waiver_required: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    regulations_version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    # When the regulations text last actually changed (set alongside the
    # version bump, same actually-changed condition). ``updated_at`` cannot
    # serve the public document row — it bumps on any field. NULL = never
    # edited since the column existed; the row renders version-only.
    regulations_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ---- publication gates (SP-P7 §4) ----------------------------------
    # TD-controlled, default OFF, independent — the public tier reads them
    # and renders any combination coherently. Same home argument as the
    # venue columns below: public-page configuration, outside the blob, so
    # a toggle can never 409 against CONFIG_LOCKED. My-entries is NOT gated
    # by these (an entrant always sees their own), except per-event result
    # badges, which respect ``results_published``.
    entrants_published: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    draws_published: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    results_published: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # ---- money & payment (R14) ----------------------------------------
    # CUMULATIVE totals in cents by event count — {"1":4000,"2":5500} — not
    # increments, because that is how directors *publish* them: "$40 / $55 /
    # $60" is a price list they copy, "$40 then +$15" is a derivation they
    # would have to perform and get wrong. NULL falls back to summing
    # ``entry_events.fee_cents``.
    fee_schedule: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Free text, rendered publicly: Zelle, cash at check-in, a PayPal
    # address, in the director's own words. v1 payment is manual and Q8's
    # integration boundary is untouched.
    payment_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ---- entry policy (R14 §4) -----------------------------------------
    # Form-enforced with the rule stated, operator-overridable at the desk
    # (I4): the software prevents the accident, the operator decides the
    # exception.
    max_events_per_person: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    discipline_caps: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # ---- field policy (R12) --------------------------------------------
    # OFF by default. The phone number lands on the ACCOUNT, not the entry,
    # because it is submitter contact data.
    collect_phone: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # ---- public page identity (R14 §6) ---------------------------------
    # AUDITED FACT: the tree has no venue name or address anywhere —
    # "venue" in ShuttleWorks is structural scheduling data only
    # (courtCount / intervalMinutes / dayStart / dayEnd). These two columns
    # live HERE rather than on ``tournaments`` or in the state blob:
    # publication data read only by the public page, and deliberately
    # outside the blob so a venue address can never 409 against the
    # fail-closed CONFIG_LOCKED guard.
    venue_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    venue_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (Index("uq_entry_pages_slug", "slug", unique=True),)
