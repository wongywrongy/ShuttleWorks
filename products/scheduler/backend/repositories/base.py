"""Repository protocols — one per ORM entity.

Step 1 ships only the methods the existing routes need; later steps
widen the protocols (``list_all`` and ``create`` for tournaments in
Step 2, role-checked variants in Step 5). The narrow surface now keeps
the migration tractable.
"""
from __future__ import annotations

import uuid
from typing import Optional, Protocol

from database.models import MatchState, Tournament, TournamentBackup


class TournamentRepository(Protocol):
    """Tournament document persistence."""

    def get_singleton(self) -> Optional[Tournament]:
        """Return the only tournament row, or None if the table is empty.

        Step 1 routes are single-tournament; Step 2 will introduce
        explicit ``tournament_id`` scoping and the singleton concept
        retires.
        """
        ...

    def upsert_singleton(self, payload: dict) -> Tournament:
        """Insert the tournament row if missing, otherwise overwrite ``data``.

        ``payload`` is the wire-format ``TournamentStateDTO`` dict. The
        method stamps ``updated_at`` server-side and extracts the
        denormalised ``name`` from ``payload["config"]["tournamentName"]``
        so the Step 6 dashboard can list rows without parsing the blob.
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
