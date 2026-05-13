"""SQLAlchemy 2.0 ORM models for the scheduler backend.

Three tables back the routes that used to read and write JSON files:

- ``tournaments``   — one row per tournament document; the full
  ``TournamentStateDTO`` payload lives in the ``data`` JSON column. The
  scalar columns (``name``, ``status``, ``owner_id``, ``tournament_date``)
  are denormalised for the multi-tournament list view that lands in
  Step 6, and for the ownership check in Step 5.
- ``match_states``  — live operator status per match, scoped to a
  tournament via the (``tournament_id``, ``match_id``) composite PK. The
  previous ``data/match_states.json`` was tournament-scoped implicitly
  because the system only ran one tournament; the explicit FK
  here is what unlocks Step 2's multi-tournament routes.
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

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
