"""Repository protocols — one per ORM entity.

Step 1 ships only the methods the existing routes need; later steps
widen the protocols (``list_all`` and ``create`` for tournaments in
Step 2, role-checked variants in Step 5). The narrow surface now keeps
the migration tractable.
"""
from __future__ import annotations

import uuid
from typing import List, Optional, Protocol

from database.models import MatchState, Tournament, TournamentBackup

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
    ) -> Tournament:
        """Insert an empty tournament row.

        ``data`` starts as ``{}``; the first ``PUT /tournaments/{id}/state``
        fills it. ``owner_id`` is populated from Step 4's Supabase JWT;
        nullable until then.
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
