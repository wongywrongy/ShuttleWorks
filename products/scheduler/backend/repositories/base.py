"""Repository protocols — one per ORM entity.

Step 1 ships only the methods the existing routes need; later steps
widen the protocols (``list_all`` and ``create`` for tournaments in
Step 2, role-checked variants in Step 5). The narrow surface now keeps
the migration tractable.
"""
from __future__ import annotations

import uuid
from typing import List, Optional, Protocol

from database.models import (
    InviteLink,
    MatchState,
    Tournament,
    TournamentBackup,
    TournamentMember,
)

# Note: ``List[Tournament]`` rendered as ``list[Tournament]`` below uses
# PEP 585 generics (Python 3.9+); kept consistent with the rest of the
# backend code which targets 3.11.


class TournamentRepository(Protocol):
    """Tournament document persistence."""

    def list_all(self) -> list[Tournament]:
        """Newest-first list for the dashboard view."""
        ...

    def create(
        self,
        *,
        name: Optional[str] = None,
        tournament_date: Optional[str] = None,
        owner_id: Optional[uuid.UUID] = None,
        owner_email: Optional[str] = None,
    ) -> Tournament:
        """Insert an empty tournament row.

        ``data`` starts as ``{}``; the first ``PUT /tournaments/{id}/state``
        fills it. ``owner_id`` is populated from Step 4's Supabase JWT;
        ``owner_email`` is denormalised from the same auth context so
        Step 6's dashboard can show "Shared with You" rows without
        joining across Supabase's auth schema.
        """
        ...

    def get_by_id(self, tournament_id: uuid.UUID) -> Optional[Tournament]:
        ...

    def update(
        self,
        tournament_id: uuid.UUID,
        fields: dict,
    ) -> Optional[Tournament]:
        """Apply whitelisted scalar updates (name, status, tournament_date).

        Returns the updated row, or ``None`` if no row exists with that id.
        """
        ...

    def delete(self, tournament_id: uuid.UUID) -> bool:
        """Delete the tournament + its CASCADE children. Returns False
        if no row existed."""
        ...

    def upsert_data(self, tournament_id: uuid.UUID, payload: dict) -> Tournament:
        """Replace the ``data`` blob for an explicit tournament.

        ``payload`` is the wire-format ``TournamentStateDTO`` dict. The
        method stamps ``updated_at`` server-side and refreshes the
        denormalised ``name`` from ``payload["config"]["tournamentName"]``.
        Raises ``KeyError`` if no row exists with that id.
        """
        ...


class MatchStateRepository(Protocol):
    """Live operator status per match."""

    def list_for_tournament(self, tournament_id: uuid.UUID) -> list[MatchState]:
        ...

    def get(self, tournament_id: uuid.UUID, match_id: str) -> Optional[MatchState]:
        ...

    def upsert(
        self,
        tournament_id: uuid.UUID,
        match_id: str,
        fields: dict,
    ) -> MatchState:
        ...

    def delete(self, tournament_id: uuid.UUID, match_id: str) -> bool:
        """Return True if a row was deleted, False if it didn't exist."""
        ...

    def reset_all(self, tournament_id: uuid.UUID) -> int:
        """Drop every match-state row for the tournament. Returns the count."""
        ...

    def bulk_upsert(
        self,
        tournament_id: uuid.UUID,
        updates: dict[str, dict],
    ) -> int:
        """Apply many match-state updates in one transaction. Returns the
        number of rows affected."""
        ...


class MemberRepository(Protocol):
    """Per-tournament role assignments.

    Step 5: every protected route resolves the caller's role for the
    tournament via ``get_role`` and rejects when below the required
    threshold.
    """

    def get_role(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Optional[str]:
        ...

    def add_member(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> TournamentMember:
        ...

    def set_role(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> Optional[TournamentMember]:
        """Update an existing member's role; returns None if not found."""
        ...

    def remove_member(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> bool:
        ...

    def list_for_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> list[TournamentMember]:
        ...

    def list_tournament_ids_for_user(
        self,
        user_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        """Tournament ids the user is a member of (any role)."""
        ...


class InviteLinkRepository(Protocol):
    """Step 5 lands the schema; Step 7 will widen this protocol with
    resolve/revoke/accept semantics. Keeping the surface narrow until
    then avoids designing the API before the routes exist."""

    def create(
        self,
        tournament_id: uuid.UUID,
        role: str,
        created_by: uuid.UUID,
    ) -> InviteLink:
        ...

    def list_for_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> list[InviteLink]:
        ...


class TournamentBackupRepository(Protocol):
    """Opt-in snapshots of a tournament's ``data`` blob."""

    def list_for_tournament(self, tournament_id: uuid.UUID) -> list[TournamentBackup]:
        """Newest first."""
        ...

    def get_by_filename(
        self,
        tournament_id: uuid.UUID,
        filename: str,
    ) -> Optional[TournamentBackup]:
        ...

    def create(
        self,
        tournament_id: uuid.UUID,
        snapshot: dict,
        filename: str,
    ) -> TournamentBackup:
        ...

    def rotate(self, tournament_id: uuid.UUID, keep: int) -> int:
        """Delete all but the newest ``keep`` backups. Returns the number
        deleted."""
        ...
