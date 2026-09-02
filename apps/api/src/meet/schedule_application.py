"""Application boundary for live schedule commits.

The solver and proposal review are deliberately outside this module.  This
boundary owns the short persistence transaction: the canonical tournament
state, its normalized match projection, the event operation, and its outbox
row either all commit or all roll back.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Optional

from db.models import EventOperation
from core.schemas import (
    ScheduleDTO,
    ScheduleHistoryEntry,
    TournamentConfig,
    TournamentStateDTO,
    state_dto_from_document,
)
from repositories import LocalRepository


SCHEDULE_COMMIT_COMMAND = "meet.schedule.commit.v1"
SCHEDULE_AGGREGATE = "tournament_schedule"


@dataclass(frozen=True)
class ScheduleCommitResult:
    state: TournamentStateDTO
    state_version: int
    operation_id: uuid.UUID


def _operation_id(proposal_id: str | None) -> uuid.UUID:
    """Use the proposal identity for retries, including non-UUID legacy ids."""
    if proposal_id:
        try:
            return uuid.UUID(hex=proposal_id)
        except (ValueError, AttributeError):
            return uuid.uuid5(uuid.NAMESPACE_URL, f"shuttleworks:schedule:{proposal_id}")
    return uuid.uuid4()


def _node_id() -> uuid.UUID:
    from core.config import settings

    raw = settings.node_id.strip()
    if not raw:
        # Local bootstrap authority uses the stable zero node identity.
        return uuid.UUID(int=0)
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise ValueError("configured NODE_ID must be a UUID") from exc


def _actor_id(actor_id: uuid.UUID | None) -> uuid.UUID:
    if actor_id is not None:
        return actor_id
    from core.dependencies import LOCAL_DEV_USER_UUID

    return LOCAL_DEV_USER_UUID


def _event_node_mode() -> bool:
    from core.config import settings

    return settings.deployment_profile == "event_node"


def _commit_payload(
    *,
    proposal_id: str | None,
    updated: TournamentStateDTO,
    history_entry: ScheduleHistoryEntry,
) -> dict[str, Any]:
    """Payload sufficient for a deterministic schedule projection/rebuild."""
    return {
        "proposalId": proposal_id,
        "scheduleVersion": updated.scheduleVersion,
        "schedule": updated.schedule.model_dump(mode="json"),
        "config": (
            updated.config.model_dump(mode="json")
            if updated.config is not None
            else None
        ),
        "historyEntry": history_entry.model_dump(mode="json"),
    }


class ScheduleCommitApplication:
    """Own one transaction for the proposal-commit mutation."""

    def __init__(
        self,
        repo: LocalRepository,
        *,
        actor_id: uuid.UUID | None = None,
        node_id: uuid.UUID | None = None,
    ) -> None:
        self.repo = repo
        self.actor_id = actor_id
        self.node_id = node_id

    def apply(
        self,
        tournament_id: uuid.UUID,
        state: TournamentStateDTO,
        new_schedule: ScheduleDTO,
        history_entry: ScheduleHistoryEntry,
        *,
        new_config: Optional[TournamentConfig] = None,
        proposal_id: str | None = None,
        traceparent: str | None = None,
    ) -> ScheduleCommitResult:
        operation_id = _operation_id(proposal_id)
        # A retry after a client/network timeout must not apply the schedule
        # twice.  The proposal store normally consumes the proposal, but this
        # check also makes direct event-node service retries safe.
        existing = self.repo.execute_query(
            lambda session: session.get(EventOperation, operation_id)
        )
        if existing is not None:
            if (
                existing.tournament_id != tournament_id
                or existing.command_type != SCHEDULE_COMMIT_COMMAND
            ):
                raise ValueError("operation id is already used by another command")
            row = self.repo.tournaments.get_by_id(tournament_id)
            if row is None:
                raise KeyError(tournament_id)
            return ScheduleCommitResult(
                state=state_dto_from_document(row.data),
                state_version=row.state_version or 0,
                operation_id=operation_id,
            )

        new_history = list(state.scheduleHistory) + [history_entry]
        # Keep the same bounded history contract as the existing endpoint.
        new_history = new_history[-5:]
        update_payload: dict[str, Any] = {
            "schedule": new_schedule,
            "scheduleVersion": state.scheduleVersion + 1,
            "scheduleHistory": new_history,
            "scheduleIsStale": False,
        }
        if new_config is not None:
            update_payload["config"] = new_config
        updated = state.model_copy(update=update_payload)

        def persist(session):
            current = self.repo.tournaments.get_by_id(tournament_id)
            if current is None:
                raise KeyError(tournament_id)
            # Repository methods stage/flush only for this path.  No helper
            # below may commit before the operation/outbox is appended.
            row = self.repo.commit_tournament_state(
                tournament_id,
                updated.model_dump(),
                expected_version=current.state_version or 0,
                commit=False,
            )
            # Only an event-node deployment owns the local operation log.
            # Cloud/local development writes remain ordinary meet writes and
            # must never synthesize a bootstrap authority or an outbox row.
            if _event_node_mode():
                from sync.service import append_local_operation

                append_local_operation(
                    session,
                    tournament_id=tournament_id,
                    node_id=self.node_id or _node_id(),
                    actor_id=_actor_id(self.actor_id),
                    command_type=SCHEDULE_COMMIT_COMMAND,
                    aggregate_type=SCHEDULE_AGGREGATE,
                    aggregate_id=str(tournament_id),
                    payload=_commit_payload(
                        proposal_id=proposal_id,
                        updated=updated,
                        history_entry=history_entry,
                    ),
                    expected_version=state.scheduleVersion,
                    operation_id=operation_id,
                    traceparent=traceparent,
                )
            return row

        row = self.repo.execute_transaction(persist)
        self.repo.refresh(row)

        return ScheduleCommitResult(
            state=state_dto_from_document(row.data),
            state_version=row.state_version or 0,
            operation_id=operation_id,
        )
