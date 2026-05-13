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
from typing import Iterable, Iterator, Optional

import sys as _sys


def _conflict_error_class():
    """Resolve ``ConflictError`` against the current ``sys.modules``.

    The test suite contains module-level ``del sys.modules['app']`` /
    ``del sys.modules['app.*']`` lines (sprinkled across many
    ``test_*.py`` files for legacy reasons). They run during pytest
    collection and can wipe ``app.exceptions`` before the
    ``purge_backend_modules`` exemption takes effect. The result is
    multiple ``ConflictError`` classes alive simultaneously, one
    cached in ``repositories.local`` and another in test modules that
    imported after a later wipe. ``pytest.raises(ConflictError)``
    fails on class-identity in that case.

    Looking up the class through ``sys.modules`` at raise-time gives
    us whichever class is *currently* canonical — the same one the
    test resolves via ``from app.exceptions import ConflictError`` at
    its own collection time, assuming the test module collected after
    all the wipes (which the alphabetical ``tests/unit/...`` collection
    order guarantees in this suite).
    """
    mod = _sys.modules.get("app.exceptions")
    if mod is None:
        from app import exceptions as mod  # noqa: F811
    return mod.ConflictError

from fastapi import Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.time_utils import now_iso
from database.models import (
    Command,
    InviteLink,
    Match,
    MatchState,
    MatchStatus,
    Tournament,
    TournamentBackup,
    TournamentMember,
)
from database.session import SessionLocal
from services.sync_service import SyncService

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


_TOURNAMENT_NAME_FROM_PAYLOAD_KEYS = ("config", "tournamentName")
_ALLOWED_UPDATE_FIELDS = frozenset({"name", "status", "tournament_date"})


def _extract_name(payload: dict) -> Optional[str]:
    cfg = payload.get("config") if isinstance(payload.get("config"), dict) else None
    return cfg.get("tournamentName") if cfg else None


def _extract_date(payload: dict) -> Optional[str]:
    cfg = payload.get("config") if isinstance(payload.get("config"), dict) else None
    return cfg.get("tournamentDate") if cfg else None


def _stamp_payload(payload: dict) -> dict:
    """Apply server-stamped metadata + strip the legacy SHA field."""
    stamped = {
        **payload,
        "updatedAt": now_iso(),
        "version": CURRENT_TOURNAMENT_SCHEMA_VERSION,
    }
    stamped.pop("_integrity", None)
    return stamped


class _LocalTournamentRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ---- Multi-tournament queries (Step 2+) ----------------------------

    def list_all(self) -> list[Tournament]:
        """Newest-first list."""
        return list(
            self.session.scalars(
                select(Tournament).order_by(Tournament.created_at.desc())
            )
        )

    def get_by_id(self, tournament_id: uuid.UUID) -> Optional[Tournament]:
        return self.session.get(Tournament, tournament_id)

    def create(
        self,
        *,
        name: Optional[str] = None,
        tournament_date: Optional[str] = None,
        owner_id: Optional[uuid.UUID] = None,
        owner_email: Optional[str] = None,
    ) -> Tournament:
        row = Tournament(
            owner_id=owner_id,
            owner_email=owner_email,
            name=name,
            tournament_date=tournament_date,
            data={},
            schema_version=CURRENT_TOURNAMENT_SCHEMA_VERSION,
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def update(
        self,
        tournament_id: uuid.UUID,
        fields: dict,
    ) -> Optional[Tournament]:
        row = self.get_by_id(tournament_id)
        if row is None:
            return None
        for key, value in fields.items():
            if key in _ALLOWED_UPDATE_FIELDS:
                setattr(row, key, value)
        self.session.commit()
        self.session.refresh(row)
        return row

    def delete(self, tournament_id: uuid.UUID) -> bool:
        row = self.get_by_id(tournament_id)
        if row is None:
            return False
        # CASCADE wipes match_states + tournament_backups via the FK
        # ondelete='CASCADE' declared on those models.
        self.session.delete(row)
        self.session.commit()
        return True

    def upsert_data(self, tournament_id: uuid.UUID, payload: dict) -> Tournament:
        """Replace the ``data`` blob on an explicit tournament."""
        row = self.get_by_id(tournament_id)
        if row is None:
            raise KeyError(tournament_id)
        stamped = _stamp_payload(payload)
        row.data = stamped
        # Keep the denormalised columns in sync when the payload's config
        # carries them. The DELETE side is gated by Step 6's status pill.
        new_name = _extract_name(stamped)
        if new_name is not None:
            row.name = new_name
        new_date = _extract_date(stamped)
        if new_date is not None:
            row.tournament_date = new_date
        row.schema_version = CURRENT_TOURNAMENT_SCHEMA_VERSION
        # Step E: stage tournament sync in the same transaction.
        self.session.flush()
        SyncService.enqueue_tournament(self.session, row)
        self.session.commit()
        self.session.refresh(row)
        return row


class _LocalMatchRepo:
    """Per-match operational state — status, version, court, time_slot.

    The ``matches`` table is the source of truth that the
    architecture-adjustment arc's state machine + solver-locking +
    sync layers key off. Every write increments ``version`` by 1.
    Passing ``expected_version`` to ``upsert`` / ``set_status``
    enables optimistic-concurrency checks at the repository layer
    (raises ``ConflictError`` on mismatch); the HTTP ``If-Match``
    wrapper that surfaces this to clients lands in Step D.
    """

    _MUTABLE_FIELDS = frozenset({"court_id", "time_slot", "status"})

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(
        self,
        tournament_id: uuid.UUID,
        match_id: str,
    ) -> Optional[Match]:
        return self.session.get(Match, (tournament_id, match_id))

    def list_for_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> list[Match]:
        return list(
            self.session.scalars(
                select(Match)
                .where(Match.tournament_id == tournament_id)
                .order_by(Match.id.asc())
            )
        )

    def get_by_statuses(
        self,
        tournament_id: uuid.UUID,
        statuses: "Iterable[str]",
    ) -> list[Match]:
        status_values = [
            s.value if isinstance(s, MatchStatus) else s for s in statuses
        ]
        if not status_values:
            return []
        return list(
            self.session.scalars(
                select(Match)
                .where(
                    Match.tournament_id == tournament_id,
                    Match.status.in_(status_values),
                )
                .order_by(Match.id.asc())
            )
        )

    def upsert(
        self,
        tournament_id: uuid.UUID,
        match_id: str,
        fields: dict,
        *,
        expected_version: Optional[int] = None,
    ) -> Match:
        row = self.get(tournament_id, match_id)
        if row is None:
            if expected_version is not None and expected_version != 0:
                raise _conflict_error_class()(
                    match_id=match_id,
                    current_version=0,
                    seen_version=expected_version,
                    message=(
                        f"Match {match_id} does not exist yet "
                        f"(expected version {expected_version})."
                    ),
                )
            row = Match(tournament_id=tournament_id, id=match_id, version=1)
            self.session.add(row)
            new_row = True
        else:
            new_row = False
            if (
                expected_version is not None
                and expected_version != row.version
            ):
                raise _conflict_error_class()(
                    match_id=match_id,
                    current_version=row.version,
                    seen_version=expected_version,
                    message=(
                        f"Match {match_id} was updated since you last "
                        f"loaded it (current version {row.version}, "
                        f"you sent {expected_version})."
                    ),
                )

        normalised = self._normalise_status(fields)
        for key, value in normalised.items():
            if key in self._MUTABLE_FIELDS:
                setattr(row, key, value)

        if not new_row:
            row.version = row.version + 1

        # Step E: stage the Supabase sync row in the same transaction
        # so the outbox invariant holds (queue row exists iff match
        # was committed). flush() first to materialise the version
        # change before payload serialisation.
        self.session.flush()
        SyncService.enqueue_match(self.session, row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def set_status(
        self,
        tournament_id: uuid.UUID,
        match_id: str,
        status: "str | MatchStatus",
        *,
        expected_version: Optional[int] = None,
    ) -> Match:
        return self.upsert(
            tournament_id,
            match_id,
            {"status": status},
            expected_version=expected_version,
        )

    def bulk_project_from_schedule(
        self,
        tournament_id: uuid.UUID,
        matches: list[dict],
        assignments: list[dict],
    ) -> int:
        """Project JSONB matches + schedule assignments into SQL rows.

        Insert rows for newly-introduced match ids; update court_id +
        time_slot on existing rows without resetting status or version;
        delete rows whose match id is no longer in ``matches``.
        ``version`` increments by 1 only on rows whose court_id or
        time_slot actually changes — pure projection re-runs against
        an unchanged schedule are no-ops.
        """
        match_ids_in_payload: set[str] = set()
        court_slot_by_id: dict[str, tuple[Optional[int], Optional[int]]] = {}
        if isinstance(assignments, list):
            for assignment in assignments:
                if not isinstance(assignment, dict):
                    continue
                mid = assignment.get("matchId")
                if not mid:
                    continue
                court_slot_by_id[mid] = (
                    assignment.get("courtId"),
                    assignment.get("slotId"),
                )

        ordered_ids: list[str] = []
        if isinstance(matches, list):
            for match in matches:
                if not isinstance(match, dict):
                    continue
                mid = match.get("id")
                if not mid or mid in match_ids_in_payload:
                    continue
                match_ids_in_payload.add(mid)
                ordered_ids.append(mid)

        existing = {
            row.id: row
            for row in self.session.scalars(
                select(Match).where(Match.tournament_id == tournament_id)
            )
        }

        touched = 0
        sync_rows: list[Match] = []  # only inserts/updates — deletes don't sync
        for mid in ordered_ids:
            court_id, time_slot = court_slot_by_id.get(mid, (None, None))
            row = existing.get(mid)
            if row is None:
                row = Match(
                    tournament_id=tournament_id,
                    id=mid,
                    court_id=court_id,
                    time_slot=time_slot,
                    status=MatchStatus.SCHEDULED.value,
                    version=1,
                )
                self.session.add(row)
                touched += 1
                sync_rows.append(row)
                continue
            if row.court_id != court_id or row.time_slot != time_slot:
                row.court_id = court_id
                row.time_slot = time_slot
                row.version = row.version + 1
                touched += 1
                sync_rows.append(row)

        # Drop rows whose match id is no longer present in the payload.
        for mid, row in existing.items():
            if mid not in match_ids_in_payload:
                self.session.delete(row)
                touched += 1

        if touched:
            # Flush so newly-inserted rows have their generated ids /
            # defaults populated before payload serialisation.
            self.session.flush()
            for sync_row in sync_rows:
                SyncService.enqueue_match(self.session, sync_row)
            self.session.commit()
        return touched

    @staticmethod
    def _normalise_status(fields: dict) -> dict:
        """Coerce ``MatchStatus`` enum members in ``status`` to string values."""
        if "status" not in fields:
            return fields
        status = fields["status"]
        if isinstance(status, MatchStatus):
            return {**fields, "status": status.value}
        return fields


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


class _LocalMemberRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_role(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Optional[str]:
        row = self.session.get(TournamentMember, (tournament_id, user_id))
        return row.role if row is not None else None

    def add_member(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> TournamentMember:
        existing = self.session.get(TournamentMember, (tournament_id, user_id))
        if existing is not None:
            existing.role = role
            self.session.commit()
            self.session.refresh(existing)
            return existing
        row = TournamentMember(
            tournament_id=tournament_id,
            user_id=user_id,
            role=role,
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def set_role(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> Optional[TournamentMember]:
        row = self.session.get(TournamentMember, (tournament_id, user_id))
        if row is None:
            return None
        row.role = role
        self.session.commit()
        self.session.refresh(row)
        return row

    def remove_member(
        self,
        tournament_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> bool:
        row = self.session.get(TournamentMember, (tournament_id, user_id))
        if row is None:
            return False
        self.session.delete(row)
        self.session.commit()
        return True

    def list_for_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> list[TournamentMember]:
        return list(
            self.session.scalars(
                select(TournamentMember)
                .where(TournamentMember.tournament_id == tournament_id)
                .order_by(TournamentMember.joined_at.asc())
            )
        )

    def list_tournament_ids_for_user(
        self,
        user_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        return list(
            self.session.scalars(
                select(TournamentMember.tournament_id)
                .where(TournamentMember.user_id == user_id)
            )
        )


class _LocalInviteLinkRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        tournament_id: uuid.UUID,
        role: str,
        created_by: uuid.UUID,
    ) -> InviteLink:
        row = InviteLink(
            tournament_id=tournament_id,
            role=role,
            created_by=created_by,
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def list_for_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> list[InviteLink]:
        return list(
            self.session.scalars(
                select(InviteLink)
                .where(InviteLink.tournament_id == tournament_id)
                .order_by(InviteLink.created_at.desc())
            )
        )

    def get(self, token: uuid.UUID) -> Optional[InviteLink]:
        return self.session.get(InviteLink, token)

    def revoke(self, token: uuid.UUID) -> bool:
        row = self.session.get(InviteLink, token)
        if row is None:
            return False
        if row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            self.session.commit()
        return True


class _LocalCommandRepo:
    """Audit-trail accessors for the ``commands`` table.

    Reads only — writes happen inside ``LocalRepository.process_command``
    so the idempotency / version / transition checks and the match
    update all land in one transaction. Splitting the writes into
    their own method would let a caller forget to commit them
    together with the match update.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, command_id: uuid.UUID) -> Optional[Command]:
        return self.session.get(Command, command_id)


def _ensure_utc_aware(dt: datetime) -> datetime:
    """SQLite drops tz info on round-trip even with ``DateTime(timezone=True)``.
    Coerce naive datetimes to UTC-aware so comparisons don't TypeError."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def is_invite_valid(invite: InviteLink, *, now: Optional[datetime] = None) -> bool:
    """Pure check: an invite is valid iff it's neither revoked nor expired.

    Exported so route handlers and tests share the same definition.
    """
    if invite.revoked_at is not None:
        return False
    if invite.expires_at is not None:
        cutoff = now or datetime.now(timezone.utc)
        if _ensure_utc_aware(invite.expires_at) < _ensure_utc_aware(cutoff):
            return False
    return True


class LocalRepository:
    """Façade: holds the session and exposes the sub-repositories."""

    BACKUP_KEEP = 10  # mirrors the legacy on-disk rotation count

    def __init__(self, session: Session) -> None:
        self.session = session
        self.tournaments = _LocalTournamentRepo(session)
        self.matches = _LocalMatchRepo(session)
        self.match_states = _LocalMatchStateRepo(session)
        self.commands = _LocalCommandRepo(session)
        self.backups = _LocalTournamentBackupRepo(session)
        self.members = _LocalMemberRepo(session)
        self.invite_links = _LocalInviteLinkRepo(session)

    # ---- High-level orchestration (id-explicit, Step 2+) ----------------

    def commit_tournament_state(
        self,
        tournament_id: uuid.UUID,
        payload: dict,
    ) -> Tournament:
        """Snapshot the prior state into a backup, then write the new one.

        The first ``PUT`` after the tournament was created (when
        ``data == {}``) skips the backup — there's nothing meaningful to
        snapshot. Subsequent writes back up the prior payload, rotate to
        ``BACKUP_KEEP`` entries, then upsert.

        After the upsert, the per-match SQL projection runs so the
        ``matches`` table stays in sync with the canonical
        ``tournaments.data`` blob. New matches get rows; deleted
        matches lose theirs; existing rows have their ``court_id`` and
        ``time_slot`` refreshed from the schedule. The projection
        preserves ``status`` and ``version`` on existing rows so a
        schedule commit doesn't undo a ``called`` / ``playing`` state
        the operator put there.
        """
        prior = self.tournaments.get_by_id(tournament_id)
        if prior is None:
            raise KeyError(tournament_id)
        if prior.data:  # non-empty payload — worth a snapshot
            self.backups.create(
                tournament_id=tournament_id,
                snapshot=prior.data,
                filename=_backup_filename(prior.data),
            )
            self.backups.rotate(tournament_id, keep=self.BACKUP_KEEP)
        result = self.tournaments.upsert_data(tournament_id, payload)
        self._project_matches_from_payload(tournament_id, payload)
        return result

    def _project_matches_from_payload(
        self,
        tournament_id: uuid.UUID,
        payload: dict,
    ) -> None:
        """Run ``matches.bulk_project_from_schedule`` from the payload shape."""
        if not isinstance(payload, dict):
            return
        matches = payload.get("matches") or []
        schedule = payload.get("schedule") or {}
        assignments = (
            schedule.get("assignments") if isinstance(schedule, dict) else None
        ) or []
        if not isinstance(matches, list):
            matches = []
        if not isinstance(assignments, list):
            assignments = []
        self.matches.bulk_project_from_schedule(
            tournament_id, matches, assignments
        )

    def snapshot_tournament(
        self,
        tournament_id: uuid.UUID,
    ) -> Optional[TournamentBackup]:
        """``POST /tournaments/{id}/state/backup`` — manual snapshot."""
        current = self.tournaments.get_by_id(tournament_id)
        if current is None:
            return None
        if not current.data:
            return None
        backup = self.backups.create(
            tournament_id=tournament_id,
            snapshot=current.data,
        )
        self.backups.rotate(tournament_id, keep=self.BACKUP_KEEP)
        return backup

    def restore_tournament_from_backup(
        self,
        tournament_id: uuid.UUID,
        filename: str,
    ) -> Tournament:
        """Replace ``data`` for a tournament with a stored backup.

        Raises ``FileNotFoundError`` when either the tournament or the
        filename is missing — callers map both to HTTP 404. The
        matches-table projection re-runs against the restored payload
        so the per-match SQL rows match the new ``data`` blob.
        """
        current = self.tournaments.get_by_id(tournament_id)
        if current is None:
            raise FileNotFoundError(filename)
        backup = self.backups.get_by_filename(tournament_id, filename)
        if backup is None:
            raise FileNotFoundError(filename)
        result = self.tournaments.upsert_data(tournament_id, backup.snapshot)
        self._project_matches_from_payload(tournament_id, backup.snapshot)
        return result

    def process_command(
        self,
        *,
        tournament_id: uuid.UUID,
        command_id: uuid.UUID,
        match_id: str,
        action: str,
        target_status: MatchStatus,
        payload: Optional[dict],
        seen_version: int,
        submitted_by: uuid.UUID,
    ) -> ProcessedCommand:
        """Process one operator command atomically.

        Runs the prompt's five-step pipeline inside a single
        transaction. The three call paths each commit at most once:

        - **Idempotent replay** (existing row, ``applied_at`` set):
          read-only; no commit; returns ``ProcessedCommand(is_replay=True)``.
        - **Duplicate rejection** (existing row, ``rejected_at`` set):
          read-only; no commit; raises ``ConflictError`` with the
          original ``rejection_reason``.
        - **Fresh apply / fresh rejection:** one ``self.session.commit()``
          at the end, either persisting (match update + applied
          command row) or (rejected command row alone).

        Concurrency note: ``session.get(Match, ...)`` then
        ``match.version += 1`` is a check-then-write race. Fine for
        SQLite local-first single-worker, which is the target
        deployment for the operator-cockpit cutover. Postgres /
        multi-worker would need ``SELECT ... FOR UPDATE`` or a
        conditional ``UPDATE ... WHERE version = :seen``; flagged for
        Step H follow-up if the deployment topology ever widens.
        """
        from services.match_state import assert_valid_transition

        ce_cls = _conflict_error_class()

        # Step 1 & 2 — idempotency / duplicate rejection check.
        existing = self.session.get(Command, command_id)
        if existing is not None:
            if existing.applied_at is not None:
                # Step 1: replay of an already-applied command.
                match = self.session.get(Match, (tournament_id, match_id))
                if match is None:
                    # Match row deleted between original apply and
                    # replay — unusual but possible after schedule
                    # regeneration. Surface a normal 409 conflict; the
                    # operator can re-sync.
                    raise ce_cls(
                        match_id=match_id,
                        message=(
                            f"Match {match_id} no longer exists; "
                            "the schedule may have been regenerated."
                        ),
                    )
                return ProcessedCommand(
                    match=match, command=existing, is_replay=True
                )
            if existing.rejected_at is not None:
                # Step 2: replay of a previously-rejected command.
                raise ce_cls(
                    match_id=match_id,
                    message=(
                        existing.rejection_reason
                        or "Command was previously rejected."
                    ),
                )
            # Row exists with neither applied_at nor rejected_at — the
            # processor crashed mid-flight on a prior call. Treat as a
            # transient retry-friendly state and fall through to
            # re-evaluate; the writes below will fail-loud on the PK
            # collision if we try to insert another row, so we update
            # the existing one in place via the apply / reject branches.
            command_row = existing
            command_was_pre_existing = True
        else:
            command_row = None
            command_was_pre_existing = False

        # Step 3 — version check.
        match = self.session.get(Match, (tournament_id, match_id))
        if match is None:
            # No match row to act against — reject the command. The
            # PK collision case above doesn't apply because we already
            # checked existing; this is a fresh insert.
            self._stamp_rejection(
                command_row,
                command_id=command_id,
                tournament_id=tournament_id,
                match_id=match_id,
                action=action,
                payload=payload,
                submitted_by=submitted_by,
                reason="match_not_found",
            )
            self.session.commit()
            raise ce_cls(
                match_id=match_id,
                message=f"Match {match_id} not found in tournament {tournament_id}.",
            )

        if match.version != seen_version:
            self._stamp_rejection(
                command_row,
                command_id=command_id,
                tournament_id=tournament_id,
                match_id=match_id,
                action=action,
                payload=payload,
                submitted_by=submitted_by,
                reason="stale_version",
            )
            self.session.commit()
            raise ce_cls(
                match_id=match_id,
                current_version=match.version,
                seen_version=seen_version,
                message=(
                    "Match was updated since you last loaded it. "
                    "Reload and retry."
                ),
            )

        # Step 4 — transition guard. Raises ConflictError on illegal
        # transitions; we catch, stamp the rejection, commit, re-raise.
        try:
            assert_valid_transition(match_id, match.status, target_status)
        except ce_cls as exc:
            self._stamp_rejection(
                command_row,
                command_id=command_id,
                tournament_id=tournament_id,
                match_id=match_id,
                action=action,
                payload=payload,
                submitted_by=submitted_by,
                reason=exc.message,
            )
            self.session.commit()
            raise

        # Step 5 — apply. Update match status + version; insert/finalise
        # the applied command row; commit once.
        match.status = target_status.value
        match.version = match.version + 1

        if command_row is None:
            command_row = Command(
                id=command_id,
                tournament_id=tournament_id,
                match_id=match_id,
                action=action,
                payload=payload,
                submitted_by=submitted_by,
            )
            self.session.add(command_row)
        else:
            # Pre-existing row from a crashed prior call — re-stamp.
            command_row.action = action
            command_row.payload = payload
            command_row.submitted_by = submitted_by
        command_row.applied_at = datetime.now(timezone.utc)
        command_row.rejected_at = None
        command_row.rejection_reason = None

        # Step E: stage Supabase sync in the same transaction as the
        # command-apply write. ``flush`` so ``match.version`` is at
        # its post-increment value before payload serialisation.
        self.session.flush()
        SyncService.enqueue_match(self.session, match)

        self.session.commit()
        self.session.refresh(match)
        self.session.refresh(command_row)
        return ProcessedCommand(
            match=match, command=command_row, is_replay=False
        )

    def _stamp_rejection(
        self,
        command_row: Optional[Command],
        *,
        command_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: str,
        action: str,
        payload: Optional[dict],
        submitted_by: uuid.UUID,
        reason: str,
    ) -> Command:
        """Populate fields on a rejection command row (insert or update)."""
        if command_row is None:
            command_row = Command(
                id=command_id,
                tournament_id=tournament_id,
                match_id=match_id,
                action=action,
                payload=payload,
                submitted_by=submitted_by,
            )
            self.session.add(command_row)
        else:
            command_row.action = action
            command_row.payload = payload
            command_row.submitted_by = submitted_by
        command_row.applied_at = None
        command_row.rejected_at = datetime.now(timezone.utc)
        command_row.rejection_reason = reason
        return command_row

    def close(self) -> None:
        self.session.close()


from dataclasses import dataclass as _dataclass


@_dataclass
class ProcessedCommand:
    """Return value of ``LocalRepository.process_command``.

    Carries the current match row and the corresponding command row.
    ``is_replay`` is True when the call short-circuited on a prior
    applied command (idempotency hit), False on a fresh apply.
    Rejection paths raise ``ConflictError`` rather than returning a
    ``ProcessedCommand``.
    """

    match: Match
    command: Command
    is_replay: bool


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
