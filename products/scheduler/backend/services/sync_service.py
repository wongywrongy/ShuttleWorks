"""SQLite → Supabase Postgres replication (Step E of the arc).

Outbox-pattern replication. Every match / tournament write inserts a
``sync_queue`` row in the same transaction as the data change; a
background daemon thread drains the queue by pushing each row to
Supabase Postgres and deleting on success. Failures increment the
row's ``attempts`` and the worker moves on. Rows that hit 10 failed
attempts are logged but kept indefinitely for manual remediation.

Why outbox-pattern rather than the prompt's "try direct, fallback to
queue" two-stage design:
- The outbox guarantees the queue entry exists iff the data write
  committed, by putting both writes in one transaction. The two-stage
  design has three observable states (in-flight, succeeded,
  failed-and-queued) and any of them can be left dangling if the
  request thread crashes mid-flight.
- Idempotency is built in. The Supabase push uses ``upsert(...,
  on_conflict='tournament_id,id')`` so re-pushing a row after a
  failed local DELETE is safe.

The service is thread-safe by construction: callers stage rows in
their own request-thread session; the worker opens its own
``SessionLocal()`` per iteration. No state is shared across threads
except the ``stop_event`` flag.

For tests, instantiate ``SyncService(supabase_client=<mock>)`` and
call ``flush_queue()`` directly to drain synchronously.
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings as default_settings
from database.models import (
    BracketEvent,
    BracketMatch,
    BracketResult,
    Match,
    SyncQueue,
    Tournament,
)
from database.session import SessionLocal

log = logging.getLogger("scheduler.sync")


# After this many failed pushes, the row is left alone forever (logged
# but neither retried nor deleted). Operator must inspect.
MAX_ATTEMPTS = 10

# Worker poll interval. Short enough to feel real-time when Supabase is
# reachable; long enough that a chronic outage doesn't hammer the
# event loop.
_WORKER_INTERVAL_SECONDS = 5.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SyncService:
    """Outbox-pattern replicator for matches and tournaments."""

    def __init__(
        self,
        *,
        supabase_client: Any = None,
        settings: Any = None,
        session_factory: Any = None,
        worker_interval_seconds: float = _WORKER_INTERVAL_SECONDS,
    ) -> None:
        # Dependency injection for tests — production callers leave
        # both None and the service lazily constructs a real Supabase
        # client at first use. ``session_factory`` likewise defaults to
        # the module-level ``SessionLocal``; tests inject their own
        # in-memory engine factory so the worker exercises a real
        # SQLAlchemy session against the test's schema.
        self._injected_client = supabase_client
        self._settings = settings if settings is not None else default_settings
        self._session_factory = session_factory
        self._worker_interval = worker_interval_seconds
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._client_cache: Any = None

    # ---- staging (called from request threads) -------------------------

    @staticmethod
    def enqueue_match(session: Session, match: Match) -> SyncQueue:
        """Stage a match write for sync. Caller is responsible for commit.

        The same session that just modified ``match`` is the right one
        to add the queue row to — both inserts land in one transaction,
        giving the outbox invariant.
        """
        row = SyncQueue(
            entity_type="match",
            entity_id=match.id,
            payload=_match_to_payload(match),
        )
        session.add(row)
        return row

    @staticmethod
    def enqueue_tournament(session: Session, tournament: Tournament) -> SyncQueue:
        """Stage a tournament write for sync. Caller commits."""
        row = SyncQueue(
            entity_type="tournament",
            entity_id=str(tournament.id),
            payload=_tournament_to_payload(tournament),
        )
        session.add(row)
        return row

    @staticmethod
    def enqueue_bracket_event(
        session: Session, event: BracketEvent
    ) -> SyncQueue:
        """Stage a bracket-event write for sync. Caller commits."""
        row = SyncQueue(
            entity_type="bracket_event",
            entity_id=event.id,
            payload=_bracket_event_to_payload(event),
        )
        session.add(row)
        return row

    @staticmethod
    def enqueue_bracket_match(
        session: Session, match: BracketMatch
    ) -> SyncQueue:
        """Stage a bracket-match write for sync. Caller commits."""
        row = SyncQueue(
            entity_type="bracket_match",
            entity_id=match.id,
            payload=_bracket_match_to_payload(match),
        )
        session.add(row)
        return row

    @staticmethod
    def enqueue_bracket_result(
        session: Session, result: BracketResult
    ) -> SyncQueue:
        """Stage a bracket-result write for sync. Caller commits."""
        row = SyncQueue(
            entity_type="bracket_result",
            entity_id=result.bracket_match_id,
            payload=_bracket_result_to_payload(result),
        )
        session.add(row)
        return row

    # ---- worker lifecycle ----------------------------------------------

    def start(self) -> None:
        """Spawn the background daemon worker. Idempotent."""
        if self._worker_thread is not None and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        thread = threading.Thread(
            target=self._worker_loop,
            name="sync-service-worker",
            daemon=True,
        )
        thread.start()
        self._worker_thread = thread
        log.info("sync_service.started")

    def stop(self, *, timeout: float = 5.0) -> None:
        """Signal the worker to exit and join. Safe to call when stopped."""
        if self._worker_thread is None:
            return
        self._stop_event.set()
        self._worker_thread.join(timeout=timeout)
        self._worker_thread = None
        log.info("sync_service.stopped")

    def _worker_loop(self) -> None:
        """Continuously drain ``sync_queue``."""
        while not self._stop_event.is_set():
            try:
                self.flush_queue()
            except Exception:
                log.exception("sync_service.worker_iteration_failed")
            # Use wait() so stop() can interrupt the sleep early.
            self._stop_event.wait(timeout=self._worker_interval)

    # ---- queue drain (public for tests) -------------------------------

    def flush_queue(self) -> int:
        """Drain the queue once. Returns the count of rows successfully pushed.

        Public so tests can call it synchronously without spinning up
        the background thread.
        """
        client = self._get_client()
        if client is None:
            # Local-dev mode (SUPABASE_URL blank) — nothing to push.
            return 0

        # Resolve the session factory at call time. Default uses the
        # module-level ``SessionLocal``; tests can inject their own.
        # Per-call resolution survives module re-imports caused by
        # other test modules' ``isolate_test_database`` purges.
        session_factory = self._session_factory or SessionLocal

        pushed = 0
        with session_factory() as session:
            rows = list(
                session.scalars(
                    select(SyncQueue)
                    .where(SyncQueue.attempts < MAX_ATTEMPTS)
                    .order_by(SyncQueue.created_at.asc())
                )
            )
            for row in rows:
                if self._stop_event.is_set():
                    break
                if self._process_row(session, client, row):
                    pushed += 1
        return pushed

    def _process_row(self, session: Session, client: Any, row: SyncQueue) -> bool:
        """Push one row; delete on success, increment attempts on failure.

        Returns True on success, False on failure (caller bookkeeps).
        """
        try:
            if row.entity_type == "match":
                client.table("matches").upsert(
                    row.payload, on_conflict="tournament_id,id"
                ).execute()
            elif row.entity_type == "tournament":
                client.table("tournaments").upsert(
                    row.payload, on_conflict="id"
                ).execute()
            elif row.entity_type == "bracket_event":
                client.table("bracket_events").upsert(
                    row.payload, on_conflict="tournament_id,id"
                ).execute()
            elif row.entity_type == "bracket_match":
                client.table("bracket_matches").upsert(
                    row.payload,
                    on_conflict="tournament_id,bracket_event_id,id",
                ).execute()
            elif row.entity_type == "bracket_result":
                client.table("bracket_results").upsert(
                    row.payload,
                    on_conflict=(
                        "tournament_id,bracket_event_id,bracket_match_id"
                    ),
                ).execute()
            else:
                # Unknown entity type — log + cap so it isn't retried forever.
                log.warning(
                    "sync_service.unknown_entity_type",
                    extra={"entity_type": row.entity_type, "id": str(row.id)},
                )
                row.attempts = MAX_ATTEMPTS
                row.last_attempt = _utcnow()
                session.commit()
                return False
        except Exception as exc:
            row.attempts = row.attempts + 1
            row.last_attempt = _utcnow()
            if row.attempts >= MAX_ATTEMPTS:
                log.warning(
                    "sync_service.row_capped_at_max_attempts",
                    extra={
                        "id": str(row.id),
                        "entity_type": row.entity_type,
                        "entity_id": row.entity_id,
                        "error": repr(exc),
                    },
                )
            else:
                log.info(
                    "sync_service.push_failed_retrying",
                    extra={
                        "id": str(row.id),
                        "attempts": row.attempts,
                        "error": repr(exc),
                    },
                )
            session.commit()
            return False

        session.delete(row)
        session.commit()
        return True

    # ---- Supabase client lazy construction ----------------------------

    def _get_client(self) -> Any:
        """Resolve the Supabase client — injected first, lazy-built second.

        Production callers leave the constructor parameter ``None``;
        the first ``_get_client`` call constructs the client from
        ``settings.supabase_url`` / ``settings.supabase_anon_key``.
        Local-dev mode (``SUPABASE_URL=""``) returns ``None`` so the
        worker becomes a no-op.
        """
        if self._injected_client is not None:
            return self._injected_client
        if self._client_cache is not None:
            return self._client_cache
        url = getattr(self._settings, "supabase_url", "") or ""
        key = getattr(self._settings, "supabase_anon_key", "") or ""
        if not url or not key:
            return None
        try:
            from supabase import create_client  # local import — heavy
            self._client_cache = create_client(url, key)
        except Exception:
            log.exception("sync_service.client_construction_failed")
            return None
        return self._client_cache


# ---- payload builders ---------------------------------------------------


def _match_to_payload(match: Match) -> dict:
    """Serialise a Match row into the JSON payload Supabase expects."""
    return {
        "tournament_id": str(match.tournament_id),
        "id": match.id,
        "court_id": match.court_id,
        "time_slot": match.time_slot,
        "status": match.status,
        "version": match.version,
        # Timestamps round-trip as ISO strings; Supabase's timestamp
        # column accepts them.
        "created_at": _isoformat(match.created_at),
        "updated_at": _isoformat(match.updated_at),
    }


def _tournament_to_payload(tournament: Tournament) -> dict:
    """Serialise a Tournament row into the JSON payload Supabase expects."""
    return {
        "id": str(tournament.id),
        "owner_id": str(tournament.owner_id) if tournament.owner_id else None,
        "owner_email": tournament.owner_email,
        "name": tournament.name,
        "status": tournament.status,
        "tournament_date": tournament.tournament_date,
        "data": tournament.data,
        "schema_version": tournament.schema_version,
        "created_at": _isoformat(tournament.created_at),
        "updated_at": _isoformat(tournament.updated_at),
    }


def _bracket_event_to_payload(event: BracketEvent) -> dict:
    """Serialise a BracketEvent row for Supabase upsert."""
    return {
        "tournament_id": str(event.tournament_id),
        "id": event.id,
        "discipline": event.discipline,
        "format": event.format,
        "duration_slots": event.duration_slots,
        "bracket_size": event.bracket_size,
        "seeded_count": event.seeded_count,
        "rr_rounds": event.rr_rounds,
        "config": event.config,
        "version": event.version,
        "created_at": _isoformat(event.created_at),
        "updated_at": _isoformat(event.updated_at),
    }


def _bracket_match_to_payload(match: BracketMatch) -> dict:
    """Serialise a BracketMatch row for Supabase upsert."""
    return {
        "tournament_id": str(match.tournament_id),
        "bracket_event_id": match.bracket_event_id,
        "id": match.id,
        "round_index": match.round_index,
        "match_index": match.match_index,
        "kind": match.kind,
        "slot_a": match.slot_a,
        "slot_b": match.slot_b,
        "side_a": match.side_a,
        "side_b": match.side_b,
        "dependencies": match.dependencies,
        "expected_duration_slots": match.expected_duration_slots,
        "duration_variance_slots": match.duration_variance_slots,
        "child_unit_ids": match.child_unit_ids,
        "meta": match.meta,
        "version": match.version,
        "created_at": _isoformat(match.created_at),
        "updated_at": _isoformat(match.updated_at),
    }


def _bracket_result_to_payload(result: BracketResult) -> dict:
    """Serialise a BracketResult row for Supabase upsert."""
    return {
        "tournament_id": str(result.tournament_id),
        "bracket_event_id": result.bracket_event_id,
        "bracket_match_id": result.bracket_match_id,
        "winner_side": result.winner_side,
        "score": result.score,
        "finished_at_slot": result.finished_at_slot,
        "walkover": result.walkover,
        "created_at": _isoformat(result.created_at),
    }


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()
