"""Sync SQLAlchemy implementation of the repository protocols.

One ``LocalRepository`` per request, opened on demand by FastAPI via
the ``get_repository`` dependency. Each repository call commits on
success so route handlers don't manage transactions explicitly — this
mirrors the previous ``PersistenceService`` contract where every method
was a self-contained atomic unit. Multi-statement transactions (Step 2's
proposal commit, for example) can still call ``self.session.flush()`` /
``self.session.commit()`` directly when needed.

The split into ``_LocalTournamentRepo`` / ``_LocalMatchStateRepo`` /
``_LocalTournamentBackupRepo`` mirrors the protocols in ``base.py``.
``LocalRepository.tournaments`` / ``.match_states`` / ``.backups`` are
the public entry points.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, Optional

from fastapi import Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.time_utils import now_iso
from database.models import MatchState, Tournament, TournamentBackup
from database.session import SessionLocal

log = logging.getLogger("scheduler.repositories")

# Matches the on-disk shape of the legacy backup files so any UI that
# parses the filename keeps working.
_FILENAME_SLUG = re.compile(r"[^a-zA-Z0-9-]+")
CURRENT_TOURNAMENT_SCHEMA_VERSION = 2


def _slugify(value: str) -> str:
    return _FILENAME_SLUG.sub("-", value.strip().lower()).strip("-") or "tournament"


def _backup_filename(payload: dict) -> str:
    """Reproduce the legacy filename shape ``tournament-<slug>-<ts>.json``.

    The frontend's backup-list UI renders this string verbatim, so we
    can't drop the ``.json`` suffix even though nothing on disk is JSON
    anymore.
    """
    name = None
    cfg = payload.get("config") if isinstance(payload, dict) else None
    if isinstance(cfg, dict):
        name = cfg.get("tournamentName")
    slug = _slugify(name or "tournament")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S-%f")
    return f"tournament-{slug}-{ts}.json"


class _LocalTournamentRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_singleton(self) -> Optional[Tournament]:
        return self.session.scalar(
            select(Tournament).order_by(Tournament.created_at.asc()).limit(1)
        )

    def upsert_singleton(self, payload: dict) -> Tournament:
        stamped = {
            **payload,
            "updatedAt": now_iso(),
            "version": CURRENT_TOURNAMENT_SCHEMA_VERSION,
        }
        # Strip the legacy on-disk integrity hash if a client round-trips
        # one — it has no analog in the SQL world and lingering in the
        # payload would confuse Step 2's API consumers.
        stamped.pop("_integrity", None)

        cfg = stamped.get("config") if isinstance(stamped.get("config"), dict) else None
        name = cfg.get("tournamentName") if cfg else None
        tdate = cfg.get("tournamentDate") if cfg else None

        existing = self.get_singleton()
        if existing is None:
            row = Tournament(
                data=stamped,
                name=name,
                tournament_date=tdate,
                schema_version=CURRENT_TOURNAMENT_SCHEMA_VERSION,
            )
            self.session.add(row)
            self.session.commit()
            self.session.refresh(row)
            return row

        existing.data = stamped
        existing.name = name
        existing.tournament_date = tdate
        existing.schema_version = CURRENT_TOURNAMENT_SCHEMA_VERSION
        self.session.commit()
        self.session.refresh(existing)
        return existing


class _LocalMatchStateRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_tournament(self, tournament_id: uuid.UUID) -> list[MatchState]:
        return list(
            self.session.scalars(
                select(MatchState)
                .where(MatchState.tournament_id == tournament_id)
                .order_by(MatchState.match_id.asc())
            )
        )

    def get(self, tournament_id: uuid.UUID, match_id: str) -> Optional[MatchState]:
        return self.session.get(MatchState, (tournament_id, match_id))

    def upsert(
        self,
        tournament_id: uuid.UUID,
        match_id: str,
        fields: dict,
    ) -> MatchState:
        row = self.get(tournament_id, match_id)
        if row is None:
            row = MatchState(tournament_id=tournament_id, match_id=match_id)
            self.session.add(row)
        # Apply known fields; ignore unknown ones to be forgiving toward
        # the old ``extra="allow"`` MatchStateDTO shape (clients may send
        # extra keys we don't care about).
        for key, value in fields.items():
            if hasattr(row, key) and key not in ("tournament_id", "match_id"):
                setattr(row, key, value)
        self.session.commit()
        self.session.refresh(row)
        return row

    def delete(self, tournament_id: uuid.UUID, match_id: str) -> bool:
        row = self.get(tournament_id, match_id)
        if row is None:
            return False
        self.session.delete(row)
        self.session.commit()
        return True

    def reset_all(self, tournament_id: uuid.UUID) -> int:
        result = self.session.execute(
            delete(MatchState).where(MatchState.tournament_id == tournament_id)
        )
        self.session.commit()
        return result.rowcount or 0

    def bulk_upsert(
        self,
        tournament_id: uuid.UUID,
        updates: dict[str, dict],
    ) -> int:
        if not updates:
            return 0
        for match_id, fields in updates.items():
            row = self.get(tournament_id, match_id)
            if row is None:
                row = MatchState(tournament_id=tournament_id, match_id=match_id)
                self.session.add(row)
            for key, value in fields.items():
                if hasattr(row, key) and key not in ("tournament_id", "match_id"):
                    setattr(row, key, value)
        self.session.commit()
        return len(updates)


class _LocalTournamentBackupRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_tournament(self, tournament_id: uuid.UUID) -> list[TournamentBackup]:
        return list(
            self.session.scalars(
                select(TournamentBackup)
                .where(TournamentBackup.tournament_id == tournament_id)
                .order_by(TournamentBackup.created_at.desc())
            )
        )

    def get_by_filename(
        self,
        tournament_id: uuid.UUID,
        filename: str,
    ) -> Optional[TournamentBackup]:
        return self.session.scalar(
            select(TournamentBackup).where(
                TournamentBackup.tournament_id == tournament_id,
                TournamentBackup.filename == filename,
            )
        )

    def create(
        self,
        tournament_id: uuid.UUID,
        snapshot: dict,
        filename: Optional[str] = None,
    ) -> TournamentBackup:
        fname = filename or _backup_filename(snapshot)
        size_bytes = len(json.dumps(snapshot, sort_keys=True).encode("utf-8"))
        row = TournamentBackup(
            tournament_id=tournament_id,
            filename=fname,
            snapshot=snapshot,
            size_bytes=size_bytes,
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def rotate(self, tournament_id: uuid.UUID, keep: int) -> int:
        all_backups = self.list_for_tournament(tournament_id)
        to_delete = all_backups[keep:]
        for row in to_delete:
            self.session.delete(row)
        if to_delete:
            self.session.commit()
        return len(to_delete)


class LocalRepository:
    """Façade: holds the session and exposes the three sub-repositories."""

    BACKUP_KEEP = 10  # mirrors the legacy on-disk rotation count

    def __init__(self, session: Session) -> None:
        self.session = session
        self.tournaments = _LocalTournamentRepo(session)
        self.match_states = _LocalMatchStateRepo(session)
        self.backups = _LocalTournamentBackupRepo(session)

    # ---- High-level orchestration that mirrors the legacy semantics ----

    def commit_tournament_state(self, payload: dict) -> Tournament:
        """Snapshot the prior state into a backup, then upsert the new one.

        Replaces the legacy ``_write_tournament_unlocked`` flow: every PUT
        creates a backup of the *previous* live content, then writes the
        new content. First-ever PUT has nothing to back up.
        """
        prior = self.tournaments.get_singleton()
        if prior is not None:
            self.backups.create(
                tournament_id=prior.id,
                snapshot=prior.data,
                filename=_backup_filename(prior.data),
            )
            self.backups.rotate(prior.id, keep=self.BACKUP_KEEP)
        return self.tournaments.upsert_singleton(payload)

    def snapshot_current_tournament(self) -> Optional[TournamentBackup]:
        """``POST /tournament/state/backup`` — manual on-demand snapshot."""
        current = self.tournaments.get_singleton()
        if current is None:
            return None
        backup = self.backups.create(
            tournament_id=current.id,
            snapshot=current.data,
        )
        self.backups.rotate(current.id, keep=self.BACKUP_KEEP)
        return backup

    def restore_tournament_from_backup(self, filename: str) -> Tournament:
        """Replace the singleton tournament's ``data`` with a backup row.

        Raises ``FileNotFoundError`` when the filename doesn't exist for
        the current tournament — caller maps to HTTP 404.
        """
        current = self.tournaments.get_singleton()
        if current is None:
            raise FileNotFoundError(filename)
        backup = self.backups.get_by_filename(current.id, filename)
        if backup is None:
            raise FileNotFoundError(filename)
        return self.tournaments.upsert_singleton(backup.snapshot)

    def close(self) -> None:
        self.session.close()


@contextmanager
def open_repository() -> Iterator[LocalRepository]:
    """Open a fresh session + repository outside of a request scope.

    Used by background workers (``services.suggestions_worker``) that
    have no ``Request`` to hang the session lifetime off of. The session
    is closed on exit; do not hold references to ORM rows past the
    block — read them into DTOs first.
    """
    session = SessionLocal()
    try:
        yield LocalRepository(session)
    finally:
        session.close()


def get_repository(request: Request) -> LocalRepository:
    """FastAPI dependency — opens a session, yields a repository, closes
    the session when the request ends.

    Unlike a typical generator dependency we don't use ``yield`` here:
    FastAPI calls plain-callable dependencies once per request and
    expects the returned object back. Per-request cleanup runs in a
    ``http`` middleware in ``app.main`` that calls ``repo.close()``;
    keeping it explicit avoids the generator/lifetime gotchas SQLAlchemy
    has when a sync session is yielded across a sync threadpool boundary.

    The previous ``PersistenceService`` / ``get_persistence`` pair has
    been removed; this dependency is the sole entry point for
    HTTP-scoped persistence access.
    """
    # SessionLocal is module-level so changes to ``settings.database_url``
    # after import don't take effect. Tests work around this by purging
    # cached backend modules before re-importing — same pattern the
    # existing conftest already uses.
    session = SessionLocal()
    repo = LocalRepository(session)
    # Stash on request state so a middleware can close it after the
    # response is returned. If routes only ever return through normal
    # paths (no streaming), this works regardless of whether the handler
    # is sync or async.
    request.state.repository = repo
    return repo
