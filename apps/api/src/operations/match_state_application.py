"""Atomic application boundary for live match-state mutations.

The legacy match-state adapter updates two tables that represent the same
operator action.  This service owns their transaction and, on an event node,
appends the matching durable operation/outbox record before committing.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime

from db.models import EventOperation, MatchStatus
from repositories import LocalRepository
from sync.service import append_local_operation


def _commit(repo: LocalRepository) -> None:
    """Keep transaction ownership explicit without duplicating commit seams."""
    repo.commit_pending()


def _event_node_id() -> uuid.UUID | None:
    # Resolve settings at call time because the backend test harness reloads
    # core modules between isolated application profiles.
    from core.config import settings

    if settings.deployment_profile != "event_node":
        return None
    try:
        return uuid.UUID(settings.node_id)
    except (ValueError, AttributeError) as exc:
        raise ValueError("event-node match mutations require a UUID node identity") from exc


def _append_if_event_node(
    repo: LocalRepository,
    *,
    tournament_id: uuid.UUID,
    match_id: str,
    actor_id: uuid.UUID,
    command_type: str,
    payload: dict,
    expected_version: int | None,
    operation_id: uuid.UUID | None = None,
) -> None:
    node_id = _event_node_id()
    if node_id is None:
        return
    repo.stage(
        append_local_operation,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=actor_id,
        command_type=command_type,
        aggregate_type="match",
        aggregate_id=match_id,
        payload=payload,
        expected_version=expected_version,
        operation_id=operation_id or uuid.uuid4(),
    )


class MatchStateApplication:
    """One-transaction use cases for PUT and DELETE match-state writes."""

    def __init__(self, repo: LocalRepository):
        self.repo = repo

    def update(
        self,
        *,
        tournament_id: uuid.UUID,
        match_id: str,
        fields: dict,
        target_status: MatchStatus,
        expected_version: int,
        actor_id: uuid.UUID,
    ):
        try:
            canonical = self.repo.matches.set_status(
                tournament_id,
                match_id,
                target_status,
                expected_version=expected_version,
                commit=False,
            )
            state = self.repo.match_states.upsert(tournament_id, match_id, fields, commit=False)
            _append_if_event_node(
                self.repo,
                tournament_id=tournament_id,
                match_id=match_id,
                actor_id=actor_id,
                command_type="match_state.update.v1",
                payload={"status": target_status.value, **fields},
                expected_version=expected_version,
            )
            _commit(self.repo)
            self.repo.refresh(canonical)
            self.repo.refresh(state)
            return state, canonical
        except Exception:
            self.repo.discard_transaction()
            raise

    def delete(
        self,
        *,
        tournament_id: uuid.UUID,
        match_id: str,
        expected_version: int,
        actor_id: uuid.UUID,
    ):
        try:
            self.repo.match_states.delete(tournament_id, match_id, commit=False)
            canonical = self.repo.matches.set_status(
                tournament_id,
                match_id,
                MatchStatus.SCHEDULED,
                expected_version=expected_version,
                commit=False,
            )
            _append_if_event_node(
                self.repo,
                tournament_id=tournament_id,
                match_id=match_id,
                actor_id=actor_id,
                command_type="match_state.delete.v1",
                payload={"status": MatchStatus.SCHEDULED.value, "deleted": True},
                expected_version=expected_version,
            )
            _commit(self.repo)
            self.repo.refresh(canonical)
            return canonical
        except Exception:
            self.repo.discard_transaction()
            raise

    def reset_all(
        self,
        *,
        tournament_id: uuid.UUID,
        actor_id: uuid.UUID,
        operation_id: uuid.UUID,
    ) -> int:
        """Reset the exact current match set in one retry-safe transaction."""
        try:
            existing = self.repo.execute_query(
                lambda session: session.get(EventOperation, operation_id)
            )
            if existing is not None:
                if (
                    existing.tournament_id != tournament_id
                    or existing.command_type != "match_state.reset_all.v1"
                ):
                    raise ValueError("operation id is already used by another command")
                return int(existing.payload.get("clearedStateCount", 0))

            cleared = self.repo.match_states.reset_all(tournament_id, commit=False)
            affected: list[dict[str, object]] = []
            for row in sorted(
                self.repo.matches.list_for_tournament(tournament_id),
                key=lambda item: item.id,
            ):
                canonical = (
                    row
                    if row.status == MatchStatus.SCHEDULED.value
                    else self.repo.matches.set_status(
                        tournament_id,
                        row.id,
                        MatchStatus.SCHEDULED,
                        expected_version=row.version,
                        commit=False,
                    )
                )
                affected.append(
                    {
                        "matchId": canonical.id,
                        "status": MatchStatus.SCHEDULED.value,
                        "version": canonical.version,
                    }
                )
            _append_if_event_node(
                self.repo,
                tournament_id=tournament_id,
                match_id=str(tournament_id),
                actor_id=actor_id,
                command_type="match_state.reset_all.v1",
                payload={
                    "clearedStateCount": cleared,
                    "affectedMatches": affected,
                },
                expected_version=None,
                operation_id=operation_id,
            )
            _commit(self.repo)
            return cleared
        except Exception:
            self.repo.discard_transaction()
            raise

    def bulk_merge(
        self,
        *,
        tournament_id: uuid.UUID,
        updates: dict[str, dict],
        idempotency_key: str,
        actor_id: uuid.UUID,
    ) -> dict:
        """Merge a sorted state map and record one replayable operation."""
        if not idempotency_key or len(idempotency_key) > 200:
            raise ValueError("Idempotency-Key must be between 1 and 200 characters")
        canonical = json.dumps(updates, sort_keys=True, separators=(",", ":"), default=str)
        fingerprint = hashlib.sha256(canonical.encode()).hexdigest()
        operation_id = uuid.uuid5(
            uuid.NAMESPACE_URL, f"shuttleworks:match-state-bulk:{tournament_id}:{idempotency_key}"
        )
        try:
            existing = self.repo.execute_query(
                lambda session: session.get(EventOperation, operation_id)
            )
            if existing is not None:
                if existing.payload.get("requestHash") != fingerprint:
                    raise ValueError("Idempotency-Key was already used with a different payload")
                return existing.payload
            fields_map = {mid: fields for mid, fields in sorted(updates.items())}
            payload_updates = {
                mid: {
                    key: value.isoformat() if isinstance(value, datetime) else value
                    for key, value in fields.items()
                }
                for mid, fields in fields_map.items()
            }
            affected = []
            for match_id, fields in fields_map.items():
                status = fields.get("status", "scheduled")
                target = MatchStatus("playing" if status == "started" else status)
                row = self.repo.matches.set_status(tournament_id, match_id, target, commit=False)
                affected.append({"matchId": match_id, "status": row.status, "version": row.version})
            self.repo.match_states.bulk_upsert(tournament_id, fields_map, commit=False)
            payload = {
                "requestHash": fingerprint,
                "updates": payload_updates,
                "resultingVersions": {item["matchId"]: item["version"] for item in affected},
                "affectedMatches": affected,
            }
            _append_if_event_node(
                self.repo,
                tournament_id=tournament_id,
                match_id=str(tournament_id),
                actor_id=actor_id,
                command_type="match_state.bulk_upsert.v1",
                payload=payload,
                expected_version=None,
                operation_id=operation_id,
            )
            _commit(self.repo)
            return payload
        except Exception:
            self.repo.discard_transaction()
            raise

    def replace_import(
        self,
        *,
        tournament_id: uuid.UUID,
        updates: dict[str, dict],
        statuses: dict[str, MatchStatus],
        snapshot: list[dict],
        idempotency_key: str | None,
        last_updated: str,
        actor_id: uuid.UUID,
        source_schema_version: str | int = "1.0",
    ) -> dict:
        """Replace all match state in one transaction and operation.

        The validated wire snapshot is sorted before hashing and persisted in
        the operation. This gives cloud replay a complete replacement input,
        rather than making it depend on the rows present when replay occurs.
        """
        if idempotency_key is not None and (not idempotency_key or len(idempotency_key) > 200):
            raise ValueError("Idempotency-Key must be between 1 and 200 characters")
        ordered_snapshot = sorted(
            (dict(row) for row in snapshot),
            key=lambda row: str(row.get("matchId", "")),
        )
        canonical = json.dumps(ordered_snapshot, sort_keys=True, separators=(",", ":"), default=str)
        snapshot_digest = hashlib.sha256(canonical.encode()).hexdigest()
        event_node_id = _event_node_id()
        operation_id = None
        if event_node_id is not None:
            if not idempotency_key:
                raise ValueError("Idempotency-Key header required for event-node imports")
            operation_id = uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"shuttleworks:match-state-replace:{tournament_id}:{idempotency_key}",
            )
            existing = self.repo.execute_query(
                lambda session: session.get(EventOperation, operation_id)
            )
            if existing is not None:
                if existing.command_type != "match_state.replace.v1":
                    raise ValueError("Idempotency-Key is already used by another operation")
                if existing.payload.get("snapshotDigest") != snapshot_digest:
                    raise ValueError("Idempotency-Key was already used with a different snapshot")
                return dict(existing.payload.get("response") or {})

        try:
            self.repo.match_states.reset_all(tournament_id, commit=False)
            resulting_versions: dict[str, int] = {}
            # Preserve existing replacement behavior for canonical rows not
            # present in the import: reset only non-scheduled rows. Imported
            # rows are then applied exactly once below.
            for row in self.repo.matches.list_for_tournament(tournament_id):
                if row.id not in statuses and row.status != MatchStatus.SCHEDULED.value:
                    canonical_row = self.repo.matches.set_status(
                        tournament_id,
                        row.id,
                        MatchStatus.SCHEDULED,
                        expected_version=row.version,
                        commit=False,
                    )
                    resulting_versions[row.id] = canonical_row.version
            for match_id in sorted(updates):
                canonical_row = self.repo.matches.set_status(
                    tournament_id, match_id, statuses[match_id], commit=False
                )
                resulting_versions[match_id] = canonical_row.version
                self.repo.match_states.upsert(
                    tournament_id, match_id, updates[match_id], commit=False
                )

            response = {
                "message": "Tournament state imported successfully",
                "matchCount": len(updates),
                "lastUpdated": last_updated,
            }
            if event_node_id is not None:
                _append_if_event_node(
                    self.repo,
                    tournament_id=tournament_id,
                    match_id=str(tournament_id),
                    actor_id=actor_id,
                    command_type="match_state.replace.v1",
                    payload={
                        "idempotencyKey": idempotency_key,
                        "sourceSchemaVersion": source_schema_version,
                        "snapshotDigest": snapshot_digest,
                        "snapshot": ordered_snapshot,
                        "resultingVersions": resulting_versions,
                        "response": response,
                    },
                    expected_version=None,
                    operation_id=operation_id,
                )
            _commit(self.repo)
            return response
        except Exception:
            self.repo.discard_transaction()
            raise
