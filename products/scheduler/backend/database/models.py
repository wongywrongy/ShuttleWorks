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
- ``Uuid`` cross-DB type maps to native UUID on Postgres (Supabase) and
  to a CHAR(32) hex string on SQLite (local dev).
- ``JSON`` is the portable type — native JSONB on Postgres, TEXT on
  SQLite. We don't query inside the blob today; if we ever need to,
  switch to ``JSONB`` on the Supabase side via a separate Alembic step.
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
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
    # Step 4 backfills this from the Supabase JWT subject. Nullable so
    # rows created before auth lands aren't rejected.
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    # Denormalised name pulled out of ``data["config"]["tournamentName"]``
    # for the Step 6 dashboard list. Nullable to mirror the existing
    # behaviour where ``tournamentName`` is optional.
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Denormalised owner email captured at create time from the
    # authenticated user. Step 6 surfaces it as ``ownerName`` in the
    # dashboard's "Shared with You" section. We don't store it in the
    # Supabase ``auth.users`` table directly because that schema
    # isn't reachable from our DB; this column is a one-way cache.
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
    # Full TournamentStateDTO payload — config + groups + players +
    # matches + schedule + history. We keep it as a single blob in
    # Step 1; later steps may normalise individual sub-entities if
    # query needs warrant it.
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Mirrors ``data["version"]``; lets Alembic-level queries reason
    # about payload schema without parsing the blob.
    schema_version: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
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


class SyncQueue(Base):
    """Outbox for SQLite → Supabase Postgres replication.

    Step E of the architecture-adjustment arc. Every match / tournament
    write inserts a row here in the same transaction as the entity
    update, then a background worker drains the queue and pushes to
    Supabase. The outbox pattern guarantees the queue entry exists iff
    the data write committed — no race between "in-flight" and
    "queued" states.

    Schema deviations from the prompt's pseudocode (forced by SQLite +
    cross-DB portability):
    - ``payload`` is the portable ``JSON`` type, not Postgres ``JSONB``.
    - UUID defaults generated app-side rather than ``DEFAULT
      gen_random_uuid()`` (SQLite has no such function).
    - ``created_at`` defaults via Python ``_utcnow`` rather than
      ``DEFAULT now()``.
    - ``entity_id`` is ``String(100)`` rather than ``UUID``: covers
      both UUID-shaped tournament ids (serialised as 36-char strings)
      and String-shaped match ids (the Step A composite-PK reality).

    Worker contract: rows are processed in ``created_at`` order. On
    successful Supabase upsert, the row is deleted. On failure, the
    worker increments ``attempts`` and moves on. Rows with
    ``attempts >= 10`` are skipped indefinitely (logged but kept for
    audit / manual remediation).
    """

    __tablename__ = "sync_queue"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_attempt: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_sync_queue_created_attempts", "created_at", "attempts"),
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
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    tournament: Mapped[Tournament] = relationship(back_populates="members")


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
