"""Application service for the bracket result vertical slice.

The bracket routes historically performed a read, domain mutation, and a
number of repository calls that each committed independently.  That shape
could acknowledge a result while only some of its advancement rows had been
written.  This module is the use-case boundary: hydration, domain
advancement, normalized persistence, the legacy session snapshot, and the
optional operation/outbox hook all run in one transaction owned here.

The domain engine remains pure.  The import of :mod:`bracket.brackets` is
deliberately local because that module owns the transport DTOs and imports
this service from its route handlers.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Optional, Protocol
import uuid

from fastapi import HTTPException

from repositories import LocalRepository
from scheduler_core.domain.tournament import WinnerSide


class BracketOperationHook(Protocol):
    """Optional adapter for an immutable operation + outbox append.

    The hook is called after all bracket rows have been staged and before the
    unit of work commits.  Implementations must only use the supplied
    repository/session and must not perform network I/O.  It is intentionally
    structural so the operation/outbox adapter can land independently of the
    bracket vertical slice.
    """

    def record_result(
        self,
        *,
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        operation_id: Optional[uuid.UUID],
        play_unit_id: str,
        winner_side: str,
        seen_version: Optional[int],
        finished_at_slot: Optional[int],
        walkover: bool,
        score: Optional[dict],
        reason: Optional[str],
    ) -> None:
        ...


@dataclass(frozen=True)
class BracketResultOutcome:
    """State returned by a successful result use case."""

    session: Any
    replay: bool = False


def _get_event_operation(session, operation_id: uuid.UUID):
    from db.models import EventOperation

    return session.get(EventOperation, operation_id)


@contextmanager
def bracket_unit_of_work(repo: LocalRepository) -> Iterator[Any]:
    """Own one commit/rollback for a bracket use case.

    FastAPI's authorization dependency can issue a read using the same
    request-scoped SQLAlchemy session before the route runs, which means the
    session may already have an implicit transaction.  In that case we adopt
    that transaction and still remain the only code path that commits the
    bracket operation.  No repository method called by this service is
    allowed to commit; their ``commit=False`` variants only flush.
    """

    with repo.transaction() as session:
        yield session


class BracketResultService:
    """Record a bracket result atomically, with optional operation hooks."""

    def __init__(
        self,
        operation_hook: Optional[BracketOperationHook | Callable[..., None]] = None,
        *,
        node_id: Optional[uuid.UUID] = None,
        actor_id: Optional[uuid.UUID] = None,
    ) -> None:
        self.operation_hook = operation_hook
        self.node_id = node_id
        self.actor_id = actor_id

    def apply(
        self,
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        *,
        play_unit_id: str,
        winner_side: str,
        seen_version: Optional[int] = None,
        finished_at_slot: Optional[int] = None,
        walkover: bool = False,
        score: Optional[dict] = None,
        reason: Optional[str] = None,
        operation_id: Optional[uuid.UUID] = None,
    ) -> BracketResultOutcome:
        """Apply one result and return the hydrated post-commit view.

        ``operation_id`` activates the command idempotency guard.  The legacy
        ``POST /results`` path leaves it unset and retains its existing
        re-record behavior.  For command calls, replay is checked before the
        optimistic version guard, preserving at-least-once delivery.
        """

        # Imports stay local to avoid a route/service import cycle and keep
        # this application layer independent from FastAPI DTO definitions.
        from bracket.brackets import (
            _ensure_tournament_exists,
            _hydrate_session,
            _load_match_versions,
            _persist_result_advancement,
            _persist_session_metadata,
            _require_resolved_play_unit,
        )
        from bracket.advancement import record_result

        # Once checkout begins, the cloud copy is a read projection.  The
        # event node remains writable with the same authority row in its own
        # database; topology, not reachability, selects the policy.
        from core.config import settings
        from sync.service import tournament_is_checked_out

        if (
            settings.deployment_profile == "cloud"
            and repo.execute_query(tournament_is_checked_out, tournament_id)
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Tournament is checked out to an event node; cloud bracket "
                    "operations are read-only."
                ),
            )

        with bracket_unit_of_work(repo) as db:
            _ensure_tournament_exists(repo, tournament_id)
            session = _hydrate_session(repo, tournament_id)
            if session is None:
                raise HTTPException(
                    status_code=404,
                    detail="no bracket configured for this tournament",
                )

            # The command UUID is the durable idempotency key for the new
            # operation path.  It is read from the existing snapshot for
            # compatibility with workspaces created before operation tables.
            if operation_id is not None and self._is_replay(db, session, operation_id):
                return BracketResultOutcome(session=session, replay=True)

            pu = session.state.play_units.get(play_unit_id)
            if pu is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"play_unit {play_unit_id!r} not found",
                )
            _require_resolved_play_unit(session, play_unit_id, action="record this result")

            if seen_version is not None:
                current_version = session.match_versions.get(play_unit_id, 1)
                if seen_version != current_version:
                    # Keep the existing conflict type/shape at the route
                    # boundary.  Import lazily to survive the test suite's
                    # backend-module purge behavior.
                    from core.exceptions import ConflictError

                    raise ConflictError(
                        match_id=play_unit_id,
                        current_version=current_version,
                        seen_version=seen_version,
                        message=(
                            f"Bracket match {play_unit_id!r} was updated since "
                            f"you last loaded it (current version {current_version}, "
                            f"you sent {seen_version})."
                        ),
                    )

            existing = session.state.results.get(play_unit_id)
            if existing is not None:
                exact = (
                    existing.winner_side.value == winner_side
                    and existing.finished_at_slot == finished_at_slot
                    and existing.walkover == walkover
                    and existing.score == score
                )
                if not exact:
                    raise HTTPException(
                        status_code=409,
                        detail="Result already recorded for this match",
                    )
                # Preserve the legacy /results behavior for an exact retry.
                # The command path normally returns above on its idempotency
                # key and never reaches this branch.
                session.state.results.pop(play_unit_id)

            try:
                affected = record_result(
                    session.state,
                    session.draws,
                    play_unit_id,
                    WinnerSide(winner_side),
                    finished_at_slot=finished_at_slot,
                    walkover=walkover,
                    score=score,
                    reason=reason,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            if operation_id is not None:
                session.applied_command_ids.add(str(operation_id))

            _persist_result_advancement(
                repo,
                tournament_id,
                session,
                play_unit_id,
                affected,
            )
            if operation_id is not None:
                _persist_session_metadata(
                    repo,
                    tournament_id,
                    session=session,
                    commit=False,
                )

            hook = self.operation_hook or getattr(repo, "bracket_operation_hook", None)
            # The sync adapter is the default hook once operation tables are
            # available.  Keeping this lookup lazy preserves compatibility
            # with older composition roots and makes the application service
            # straightforward to unit-test with a callback.
            if hook is None and settings.deployment_profile != "cloud":
                hook = self._default_operation_hook
            if hook is not None:
                effective_operation_id = operation_id or uuid.uuid4()
                args = dict(
                    repo=repo,
                    tournament_id=tournament_id,
                    operation_id=effective_operation_id,
                    play_unit_id=play_unit_id,
                    winner_side=winner_side,
                    seen_version=seen_version,
                    finished_at_slot=finished_at_slot,
                    walkover=walkover,
                    score=score,
                    reason=reason,
                )
                if hasattr(hook, "record_result"):
                    hook.record_result(**args)
                else:
                    hook(**args)

            # Ensure all staged changes are visible to the returned DTO and
            # that integrity errors are raised before the UoW commits.
            db.flush()
            session.match_versions = _load_match_versions(repo, tournament_id)
            return BracketResultOutcome(session=session)

    @staticmethod
    def serialize(outcome: BracketResultOutcome) -> Any:
        """Serialize an outcome after its transaction has committed."""

        from bracket.brackets import _serialize_session

        return _serialize_session(outcome.session)

    @staticmethod
    def _is_replay(
        db: Any,
        session: Any,
        operation_id: uuid.UUID,
    ) -> bool:
        """Use the operation log as authority, with legacy snapshot fallback.

        ``applied_command_ids`` predates the event operation protocol and is
        retained only so old workspaces remain replay-safe while they migrate.
        New commands are identified by the immutable operation primary key.
        """

        try:
            from db.models import EventOperation

            if db.get(EventOperation, operation_id) is not None:
                return True
        except (ImportError, AttributeError):
            # A compatibility composition root may not yet expose operation
            # tables; the snapshot fallback below keeps that root functional.
            pass
        return str(operation_id) in session.applied_command_ids

    def _default_operation_hook(self, **args: Any) -> None:
        """Append the result operation and outbox row in this UoW.

        Node identity is configured in event-node deployments.  Development
        and pre-checkout callers receive a deterministic UUID derived from
        the configured database URL, so repeated process starts use the same
        identity without creating a new authority on every request.  The
        local bootstrap principal is the actor fallback until authenticated
        actor propagation is added to the route contract.
        """

        from core.config import settings
        from core.dependencies import LOCAL_DEV_USER_UUID
        from sync.service import append_local_operation

        node_id = self.node_id
        if node_id is None:
            configured = getattr(settings, "node_id", "")
            try:
                node_id = uuid.UUID(configured) if configured else None
            except (ValueError, AttributeError, TypeError):
                node_id = None
        if node_id is None:
            node_id = uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"shuttleworks:event-node:{settings.database_url}",
            )
        actor_id = self.actor_id or LOCAL_DEV_USER_UUID
        append_local_operation(
            args["repo"].session,
            tournament_id=args["tournament_id"],
            node_id=node_id,
            actor_id=actor_id,
            command_type="match.record_result.v3",
            aggregate_type="bracket_match",
            aggregate_id=args["play_unit_id"],
            payload={
                "winner_side": args["winner_side"],
                "finished_at_slot": args["finished_at_slot"],
                "walkover": args["walkover"],
                "score": args["score"],
                "reason": args["reason"],
            },
            expected_version=args.get("seen_version"),
            operation_id=args["operation_id"],
        )


class BracketPinService:
    """Atomically apply a planning-only pin and its deterministic snapshot.

    The solver mutates only the bracket session assignment plan.  The
    resulting snapshot and the immutable ``bracket.pin.v1`` operation are
    staged in the same unit of work, so a failed outbox append cannot leave a
    pin acknowledged in the bracket blob without an operation to replay.
    """

    def apply(
        self,
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        *,
        play_unit_id: str,
        slot_id: int,
        court_id: int,
        command_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> BracketResultOutcome:
        from bracket.brackets import (
            _bracket_locked_play_unit_ids,
            _bracket_solver_options,
            _ensure_tournament_exists,
            _hydrate_session,
            _persist_session_metadata,
            _serialize_session,
            TournamentDriver,
        )
        from core.config import settings
        from db.models import EventOperation
        from sync.service import append_local_operation, tournament_is_checked_out

        operation_id = command_id or uuid.uuid4()
        # Hydration, validation, and CP-SAT execution are deliberately outside
        # the write transaction. A long-running solve must not hold a write
        # lock or make unrelated event-node commands wait behind it.
        _ensure_tournament_exists(repo, tournament_id)
        session = _hydrate_session(repo, tournament_id)
        if session is None:
            raise HTTPException(
                status_code=404,
                detail="no bracket configured for this tournament",
            )
        existing = repo.execute_query(_get_event_operation, operation_id)
        if existing is not None:
            return self._replay_or_reject(
                repo, tournament_id, existing, play_unit_id, slot_id, court_id
            )
        if (
            settings.deployment_profile == "cloud"
            and repo.execute_query(tournament_is_checked_out, tournament_id)
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Tournament is checked out to an event node; cloud bracket "
                    "operations are read-only."
                ),
            )
        if play_unit_id not in session.state.play_units:
            raise HTTPException(
                status_code=404,
                detail=f"play_unit {play_unit_id!r} not found",
            )
        if play_unit_id in _bracket_locked_play_unit_ids(
            session.state, session.config.current_slot
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "locked",
                    "message": (
                        f"play_unit {play_unit_id!r} is locked "
                        "(played / started / past) and cannot be re-pinned"
                    ),
                },
            )
        tournament = repo.tournaments.get_by_id(tournament_id)
        data_blob = (tournament.data or {}) if tournament else {}
        session_cfg = data_blob.get("bracket_session") or {}
        # Hydration/config reads open SQLAlchemy's implicit read transaction;
        # close it explicitly before CP-SAT starts.
        repo.discard_transaction()
        driver = TournamentDriver(
            state=session.state,
            config=session.config,
            solver_options=_bracket_solver_options(
                float(session_cfg.get("time_limit_seconds", 5.0)),
                data_blob.get("config") or {},
            ),
            rest_between_rounds=session.rest_between_rounds,
            player_extras=session.player_extras,
        )
        try:
            result = driver.repin_and_resolve(
                play_unit_id, slot_id=slot_id, court_id=court_id
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=409,
                detail={"error": "infeasible", "reasons": [str(exc)]},
            ) from exc
        if not result.scheduled:
            reasons = (
                list(result.schedule_result.infeasible_reasons)
                if result.schedule_result is not None
                else []
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "infeasible",
                    "reasons": reasons
                    or [f"solver returned {result.status.value}"],
                },
            )

        # A concurrent command may have claimed this UUID while solving. The
        # second check below makes the operation identity authoritative.
        with bracket_unit_of_work(repo) as db:
            existing = db.get(EventOperation, operation_id)
            if existing is not None:
                db.rollback()
                return self._replay_or_reject(
                    repo, tournament_id, existing, play_unit_id, slot_id, court_id
                )
            # Include the command identity in the persisted compatibility
            # snapshot before writing metadata and appending the operation.
            session.applied_command_ids.add(str(operation_id))
            _persist_session_metadata(
                repo, tournament_id, session=session, commit=False
            )
            snapshot = _serialize_session(session).model_dump(mode="json")
            if settings.deployment_profile != "cloud":
                from core.dependencies import LOCAL_DEV_USER_UUID

                node_id = None
                configured = getattr(settings, "node_id", "")
                if configured:
                    try:
                        node_id = uuid.UUID(configured)
                    except (ValueError, TypeError, AttributeError):
                        node_id = None
                if node_id is None:
                    node_id = uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"shuttleworks:event-node:{settings.database_url}",
                    )
                append_local_operation(
                    db,
                    tournament_id=tournament_id,
                    node_id=node_id,
                    actor_id=actor_id or LOCAL_DEV_USER_UUID,
                    command_type="bracket.pin.v1",
                    aggregate_type="bracket_tournament",
                    aggregate_id=str(tournament_id),
                    payload={
                        "playUnitId": play_unit_id,
                        "slotId": slot_id,
                        "courtId": court_id,
                        "bracketSnapshot": snapshot,
                    },
                    expected_version=None,
                    operation_id=operation_id,
                )
            db.flush()
            return BracketResultOutcome(session=session)

    @staticmethod
    def _replay_or_reject(
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        operation: Any,
        play_unit_id: str,
        slot_id: int,
        court_id: int,
    ) -> BracketResultOutcome:
        payload = operation.payload or {}
        if operation.command_type != "bracket.pin.v1" or any(
            payload.get(key) != value
            for key, value in (
                ("playUnitId", play_unit_id),
                ("slotId", slot_id),
                ("courtId", court_id),
            )
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "command_id_reuse",
                    "message": "command_id was already used for a different bracket pin",
                },
            )
        from bracket.brackets import _hydrate_session

        session = _hydrate_session(repo, tournament_id)
        return BracketResultOutcome(session=session, replay=True)


def record_bracket_result(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    **kwargs: Any,
) -> BracketResultOutcome:
    """Convenience entry point for composition roots and tests."""

    return BracketResultService().apply(repo, tournament_id, **kwargs)


class BracketMatchActionService:
    """Apply the live bracket clock action as one operation-boundary UoW."""

    def apply(
        self,
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        *,
        play_unit_id: str,
        action: str,
        slot: int | None,
        actor_id: uuid.UUID,
        operation_id: uuid.UUID,
    ) -> BracketResultOutcome:
        from bracket.brackets import (
            _ensure_tournament_exists,
            _hydrate_session,
            _persist_session_metadata,
            _require_resolved_play_unit,
        )
        from core.config import settings
        from db.models import EventOperation
        from fastapi import HTTPException
        from sync.service import append_local_operation

        with bracket_unit_of_work(repo) as db:
            _ensure_tournament_exists(repo, tournament_id)
            state = _hydrate_session(repo, tournament_id)
            if state is None:
                raise HTTPException(
                    status_code=404,
                    detail="no bracket configured for this tournament",
                )
            if db.get(EventOperation, operation_id) is not None:
                return BracketResultOutcome(session=state, replay=True)
            assignment = state.state.assignments.get(play_unit_id)
            if assignment is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"no assignment for play_unit {play_unit_id!r}",
                )
            if action in ("start", "finish"):
                _require_resolved_play_unit(
                    state,
                    play_unit_id,
                    action=f"{action} this match",
                )
            has_result = play_unit_id in state.state.results
            if action == "start":
                if has_result:
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot start a bracket match that already has a result",
                    )
                assignment.actual_start_slot = slot if slot is not None else assignment.slot_id
                assignment.actual_end_slot = None
            elif action == "finish":
                if assignment.actual_start_slot is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot finish a bracket match before it has started",
                    )
                assignment.actual_end_slot = (
                    slot
                    if slot is not None
                    else assignment.slot_id + assignment.duration_slots
                )
            elif action == "reset":
                if has_result:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Cannot reset a bracket match with a recorded result; "
                            "reset the bracket to redo a played match"
                        ),
                    )
                assignment.actual_start_slot = None
                assignment.actual_end_slot = None
            _persist_session_metadata(repo, tournament_id, session=state, commit=False)
            if settings.deployment_profile != "cloud":
                node_id = (
                    uuid.UUID(settings.node_id)
                    if getattr(settings, "node_id", "")
                    else uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"shuttleworks:event-node:{settings.database_url}",
                    )
                )
                append_local_operation(
                    db,
                    tournament_id=tournament_id,
                    node_id=node_id,
                    actor_id=actor_id,
                    command_type="bracket.match_action.v1",
                    aggregate_type="bracket_match",
                    aggregate_id=play_unit_id,
                    payload={
                        "action": action,
                        "slot": slot,
                        "actualStartSlot": assignment.actual_start_slot,
                        "actualEndSlot": assignment.actual_end_slot,
                    },
                    expected_version=None,
                    operation_id=operation_id,
                )
            db.flush()
            return BracketResultOutcome(session=state)


class BracketAssignmentService:
    """Atomically publish a direct court assignment or its removal."""

    def apply(
        self,
        repo: LocalRepository,
        tournament_id: uuid.UUID,
        *,
        play_unit_id: str,
        action: str,
        slot_id: int | None,
        court_id: int | None,
        actor_id: uuid.UUID,
        command_id: uuid.UUID | None = None,
    ) -> BracketResultOutcome:
        from bracket.brackets import (
            _ensure_tournament_exists,
            _hydrate_session,
            _materialize_operations_assignment,
            _persist_session_metadata,
            _require_resolved_play_unit,
        )
        from core.config import settings
        from db.models import EventOperation
        from fastapi import HTTPException
        from sync.service import append_local_operation

        if action not in {"assign", "unassign"}:
            raise ValueError(f"unsupported bracket assignment action: {action}")
        if action == "assign" and (slot_id is None or court_id is None):
            raise ValueError("assign requires a slot and court")
        operation_id = command_id or uuid.uuid4()
        with bracket_unit_of_work(repo) as db:
            _ensure_tournament_exists(repo, tournament_id)
            state = _hydrate_session(repo, tournament_id)
            if state is None:
                raise HTTPException(
                    status_code=404,
                    detail="no bracket configured for this tournament",
                )
            if db.get(EventOperation, operation_id) is not None:
                return BracketResultOutcome(session=state, replay=True)
            pu = state.state.play_units.get(play_unit_id)
            if pu is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"play_unit {play_unit_id!r} not found",
                )
            if action == "assign":
                _require_resolved_play_unit(
                    state,
                    play_unit_id,
                    action="send this match to court",
                )
                duration = pu.expected_duration_slots or 1
                from scheduler_core.domain.tournament import TournamentAssignment

                state.state.assignments[play_unit_id] = TournamentAssignment(
                    play_unit_id=play_unit_id,
                    slot_id=slot_id,
                    court_id=court_id,
                    duration_slots=duration,
                    actual_start_slot=None,
                )
            else:
                state.state.assignments.pop(play_unit_id, None)
            _persist_session_metadata(
                repo,
                tournament_id,
                session=state,
                commit=False,
            )
            _materialize_operations_assignment(
                repo,
                tournament_id,
                play_unit_id,
                court_id=court_id if action == "assign" else None,
                slot_id=slot_id if action == "assign" else None,
                commit=False,
            )
            if settings.deployment_profile != "cloud":
                node_id = (
                    uuid.UUID(settings.node_id)
                    if getattr(settings, "node_id", "")
                    else uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"shuttleworks:event-node:{settings.database_url}",
                    )
                )
                append_local_operation(
                    db,
                    tournament_id=tournament_id,
                    node_id=node_id,
                    actor_id=actor_id,
                    command_type="bracket.assignment.v1",
                    aggregate_type="bracket_match",
                    aggregate_id=play_unit_id,
                    payload={
                        "action": action,
                        "courtId": court_id if action == "assign" else None,
                        "slotId": slot_id if action == "assign" else None,
                    },
                    expected_version=None,
                    operation_id=operation_id,
                )
            db.flush()
            return BracketResultOutcome(session=state)
