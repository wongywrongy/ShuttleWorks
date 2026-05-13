"""Single owner of on-disk state.

PersistenceService is constructed once at app startup, held on
``app.state.persistence``, and injected into route handlers via the
``get_persistence`` Depends() factory. All filesystem I/O for
``tournament.json`` and ``match_states.json`` flows through this module:
atomic write, rolling backup rotation, corruption-recovery read.

A single ``asyncio.Lock`` serialises every read-modify-write cycle of
either resource. The lock is intentionally global rather than per-
resource: the cost is negligible (uvicorn single-worker, fs ops sub-ms)
and it cleanly forbids the cross-resource race that motivated the
unification.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional, Tuple

from fastapi import Request

from app.paths import data_dir, ensure_data_dir
from app.time_utils import now_iso
from api import _backups

log = logging.getLogger("scheduler.persistence")

CURRENT_TOURNAMENT_SCHEMA_VERSION = 2


def _migrate_tournament(raw: dict) -> dict:
    """Upgrade an older payload in place to the current schema version."""
    from app.error_codes import ErrorCode, http_error  # late import — avoid circularity

    version = int(raw.get("version") or 1)
    if version > CURRENT_TOURNAMENT_SCHEMA_VERSION:
        raise http_error(
            409,
            ErrorCode.STATE_TOO_NEW,
            f"state file schema version {version} is newer than this "
            f"app's {CURRENT_TOURNAMENT_SCHEMA_VERSION}; upgrade the app or "
            f"restore an older backup",
        )
    if version < 2:
        raw.setdefault("scheduleVersion", 0)
        raw.setdefault("scheduleHistory", [])
        cfg = raw.get("config")
        if isinstance(cfg, dict):
            cfg.setdefault("closedCourts", [])
            cfg.setdefault("courtClosures", [])
            cfg.setdefault("clockShiftMinutes", 0)
    raw["version"] = CURRENT_TOURNAMENT_SCHEMA_VERSION
    return raw


class PersistenceService:
    """Owns both state files and one write lock."""

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self._base_override = base_dir
        self._lock = asyncio.Lock()

    @property
    def base_dir(self) -> Path:
        return self._base_override or data_dir()

    @property
    def tournament_path(self) -> Path:
        return self.base_dir / "tournament.json"

    @property
    def match_states_path(self) -> Path:
        return self.base_dir / "match_states.json"

    # ---- Tournament state ----------------------------------------------

    async def read_tournament_state(
        self,
    ) -> Tuple[Optional[dict], Optional[str]]:
        """Read + migrate the tournament snapshot or auto-recover from a backup.

        Returns ``(payload, recovered_from)``. ``payload`` is None when the
        file doesn't exist and no backup is available. ``recovered_from``
        is the backup filename when we promoted one.
        """
        async with self._lock:
            return self._read_tournament_unlocked()

    def _read_tournament_unlocked(self) -> Tuple[Optional[dict], Optional[str]]:
        if not self.tournament_path.exists():
            return None, None
        data, recovered_from = _backups.read_with_recovery(
            self.base_dir, self.tournament_path
        )
        data = _migrate_tournament(data)
        return data, recovered_from

    async def write_tournament_state(self, payload: dict) -> dict:
        """Atomic write + backup rotation. Stamps updatedAt + version."""
        async with self._lock:
            return self._write_tournament_unlocked(payload)

    def _write_tournament_unlocked(self, payload: dict) -> dict:
        ensure_data_dir()
        stamped = {
            **payload,
            "updatedAt": now_iso(),
            "version": CURRENT_TOURNAMENT_SCHEMA_VERSION,
        }
        tournament_name = None
        cfg = stamped.get("config")
        if isinstance(cfg, dict):
            tournament_name = cfg.get("tournamentName")
        try:
            _backups.create_backup(self.base_dir, self.tournament_path, tournament_name)
        except OSError as e:
            log.warning("backup rotation failed: %s", e)
        _backups.atomic_write_json(self.tournament_path, stamped)
        return stamped

    async def update_tournament_state(
        self,
        mutator: Callable[[Optional[dict]], dict],
    ) -> dict:
        """Read-modify-write atomically under the lock.

        ``mutator`` receives the current payload (or None when the file
        doesn't exist) and must return the new payload dict. Used by the
        proposal-commit path where the version bump + history append
        must happen atomically with the disk write.
        """
        async with self._lock:
            current, _ = self._read_tournament_unlocked()
            new_payload = mutator(current)
            return self._write_tournament_unlocked(new_payload)

    # ---- Match state ----------------------------------------------------

    async def read_match_states(self) -> dict:
        """Return the parsed match-states payload (raw dict) or an empty default."""
        async with self._lock:
            return self._read_match_states_unlocked()

    def _read_match_states_unlocked(self) -> dict:
        if not self.match_states_path.exists():
            if (
                _backups.latest_backup(self.base_dir, self.match_states_path.stem)
                is None
            ):
                return {"matchStates": {}, "lastUpdated": now_iso(), "version": "1.0"}
        try:
            data, recovered_from = _backups.read_with_recovery(
                self.base_dir, self.match_states_path
            )
        except FileNotFoundError:
            return {"matchStates": {}, "lastUpdated": now_iso(), "version": "1.0"}
        if recovered_from is not None:
            log.warning("match-state recovered from %s", recovered_from)
        return data

    async def write_match_states(self, payload: dict) -> dict:
        async with self._lock:
            return self._write_match_states_unlocked(payload)

    def _write_match_states_unlocked(self, payload: dict) -> dict:
        ensure_data_dir()
        payload["lastUpdated"] = now_iso()
        _backups.atomic_write_json(self.match_states_path, payload)
        try:
            _backups.create_backup(self.base_dir, self.match_states_path)
        except OSError as e:
            log.warning("match-state backup rotation failed: %s", e)
        return payload

    async def update_match_states(
        self,
        mutator: Callable[[dict], dict],
    ) -> dict:
        """Read-modify-write atomically under the lock."""
        async with self._lock:
            current = self._read_match_states_unlocked()
            new_payload = mutator(current)
            return self._write_match_states_unlocked(new_payload)

    # ---- Backup management (tournament resource) -----------------------

    async def list_tournament_backups(self) -> list[dict]:
        async with self._lock:
            return _backups.list_backups(self.base_dir, self.tournament_path.stem)

    async def create_tournament_backup(self) -> Optional[Path]:
        async with self._lock:
            if not self.tournament_path.exists():
                return None
            return _backups.create_backup(self.base_dir, self.tournament_path)

    async def restore_tournament_backup(self, filename: str) -> None:
        async with self._lock:
            _backups.restore_backup(self.base_dir, self.tournament_path, filename)


def get_persistence(request: Request) -> PersistenceService:
    """FastAPI dependency — pulls the singleton off app.state.

    Lazily constructs the service if no lifespan has set one yet
    (test fixtures that build a minimal FastAPI app without running
    the production lifespan rely on this).
    """
    svc = getattr(request.app.state, "persistence", None)
    if svc is None:
        svc = PersistenceService()
        request.app.state.persistence = svc
    return svc
