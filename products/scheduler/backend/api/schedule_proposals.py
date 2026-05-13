"""Two-phase commit pipeline for schedule changes.

Every replan / repair / director-action runs *first* through this module
to produce a `Proposal` — an in-memory ephemeral artifact that captures
the proposed schedule, a full impact diff vs. the currently committed
schedule, and the version it was forked from. The operator reviews the
impact and either commits (atomic swap + version bump + history append)
or cancels (proposal discarded).

The proposal store is in-memory only — it deliberately does *not* hit
disk so a stale review that the operator walked away from can't pollute
the persisted state. TTL eviction is lazy: every request prunes expired
proposals before doing any other work.

Endpoints:
- ``POST /schedule/proposals/warm-restart`` — create from full re-solve
- ``POST /schedule/proposals/repair``       — create from disruption slice
- ``POST /schedule/proposals/manual-edit``  — create from a single drag pin
- ``GET  /schedule/proposals/{id}``         — re-fetch (page reload, etc.)
- ``POST /schedule/proposals/{id}/commit``  — atomic swap, optimistic-locked
- ``DELETE /schedule/proposals/{id}``       — cancel and discard

Optimistic concurrency: each proposal stamps the committed
``scheduleVersion`` it was forked from. Commit fails with 409 if that
version has advanced (another operator committed in the meantime).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Path, Request
from pydantic import BaseModel

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import (
    Impact,
    MatchDTO,
    PlayerDTO,
    Proposal,
    ProposalKind,
    PreviousAssignmentDTO,
    RosterGroupDTO,
    ScheduleDTO,
    ScheduleHistoryEntry,
    Suggestion,
    TournamentConfig,
    TournamentStateDTO,
)
from app.time_utils import now_iso

from api.match_state import MatchStateDTO
from api.schedule_repair import RepairRequest, _run_repair
from api.schedule_warm_restart import WarmRestartRequest, _run_warm_restart
from repositories import LocalRepository, get_repository


router = APIRouter(
    prefix="/tournaments/{tournament_id}/schedule/proposals",
    tags=["schedule-proposals"],
)
log = logging.getLogger("scheduler.proposals")

_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))


# Proposal TTL: review windows of >30 min imply the operator walked
# away — recompute on demand instead of letting stale proposals
# accumulate or commit against unrelated state.
PROPOSAL_TTL = timedelta(minutes=30)
HISTORY_CAP = 5


# Per-app proposal/suggestion stores. Step 2 nests them by tournament_id
# so two tournaments running in the same uvicorn process keep their
# pipelines isolated. The outer dict + the lock stay on app.state for the
# same reasons as before (survives test sys.modules churn; single-worker
# uvicorn is the deployment assumption — multi-worker would require
# shared storage like Redis).
_STATE_KEY = "proposals"
_LOCK_KEY = "proposals_lock"
_SUGGESTION_STATE_KEY = "suggestions"


def _get_store(app: FastAPI, tournament_id: uuid.UUID) -> Dict[str, Proposal]:
    outer = getattr(app.state, _STATE_KEY, None)
    if outer is None:
        outer = {}
        setattr(app.state, _STATE_KEY, outer)
    inner = outer.get(tournament_id)
    if inner is None:
        inner = {}
        outer[tournament_id] = inner
    return inner


def _get_lock(app: FastAPI) -> asyncio.Lock:
    """Single app-wide ``asyncio.Lock`` guarding all proposal-store mutations.

    A per-tournament lock would let two concurrent commits on the same
    proposal id race; the app-wide lock is sub-ms-cheap under single
    uvicorn worker and removes that risk. If we ever shard tournaments
    across workers, the lock becomes per-process anyway.
    """
    lock = getattr(app.state, _LOCK_KEY, None)
    if lock is None:
        lock = asyncio.Lock()
        setattr(app.state, _LOCK_KEY, lock)
    return lock


def _get_suggestion_store(
    app: FastAPI,
    tournament_id: uuid.UUID,
) -> Dict[str, Suggestion]:
    outer = getattr(app.state, _SUGGESTION_STATE_KEY, None)
    if outer is None:
        outer = {}
        setattr(app.state, _SUGGESTION_STATE_KEY, outer)
    inner = outer.get(tournament_id)
    if inner is None:
        inner = {}
        outer[tournament_id] = inner
    return inner


def _all_suggestion_stores(app: FastAPI) -> Dict[uuid.UUID, Dict[str, Suggestion]]:
    """Used by the worker hook in ``schedule_suggestions.py`` when it
    needs to fan out across tournaments (rare; today only the advisories
    endpoint uses this)."""
    return getattr(app.state, _SUGGESTION_STATE_KEY, None) or {}


def _evict_expired_suggestions(
    store: Dict[str, Suggestion],
    now: Optional[datetime] = None,
) -> None:
    """Drop suggestions whose ``expiresAt`` is in the past.

    Mirrors `_evict_expired` for proposals. ValueError on parse falls
    through to deletion (defensive against schema migrations).
    """
    cutoff = (now or datetime.now(timezone.utc))
    for sid, sug in list(store.items()):
        try:
            expires = datetime.fromisoformat(
                sug.expiresAt.replace("Z", "+00:00")
            )
        except ValueError:
            del store[sid]
            continue
        if expires < cutoff:
            del store[sid]


# Public alias for tests that want to clear the store between runs.
def reset_store(app: FastAPI) -> None:
    """Reset both proposal + suggestion store top-levels and the lock."""
    setattr(app.state, _STATE_KEY, {})
    setattr(app.state, _LOCK_KEY, asyncio.Lock())
    setattr(app.state, _SUGGESTION_STATE_KEY, {})


# ---------- proposal-store helpers -----------------------------------------


def _evict_expired(store: Dict[str, Proposal], now: Optional[datetime] = None) -> None:
    """Drop any proposals whose ``expiresAt`` is in the past.

    Lazy eviction is sufficient because every endpoint calls this before
    doing anything else; an idle server can keep an expired proposal
    until the next request, which is fine.
    """
    cutoff = (now or datetime.now(timezone.utc))
    for pid, proposal in list(store.items()):
        try:
            expires = datetime.fromisoformat(
                proposal.expiresAt.replace("Z", "+00:00")
            )
        except ValueError:
            del store[pid]
            continue
        if expires < cutoff:
            del store[pid]


def _new_proposal_id() -> str:
    return uuid.uuid4().hex


async def _read_persisted_state(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
) -> Optional[TournamentStateDTO]:
    """Load the committed tournament state for ``tournament_id``, or None."""
    try:
        tournament = repo.tournaments.get_by_id(tournament_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("proposals: state unreadable: %s", e)
        return None
    if tournament is None or not tournament.data:
        return None
    return TournamentStateDTO(
        **{k: v for k, v in tournament.data.items() if k != "_integrity"}
    )


async def _persist_committed_state(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    state: TournamentStateDTO,
    new_schedule: ScheduleDTO,
    history_entry: ScheduleHistoryEntry,
    new_config: Optional[TournamentConfig] = None,
) -> TournamentStateDTO:
    """Apply a committed schedule (and optional config) to the DB."""
    new_history = list(state.scheduleHistory) + [history_entry]
    if len(new_history) > HISTORY_CAP:
        new_history = new_history[-HISTORY_CAP:]

    update_payload = {
        "schedule": new_schedule,
        "scheduleVersion": state.scheduleVersion + 1,
        "scheduleHistory": new_history,
        "scheduleIsStale": False,
    }
    if new_config is not None:
        update_payload["config"] = new_config
    updated = state.model_copy(update=update_payload)
    try:
        row = repo.commit_tournament_state(tournament_id, updated.model_dump())
    except KeyError:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    except Exception as e:
        log.error("proposals: write failed: %s", e)
        raise http_error(
            500, ErrorCode.STATE_WRITE_FAILED, "could not persist schedule commit"
        )
    return TournamentStateDTO(**{k: v for k, v in row.data.items() if k != "_integrity"})


def _build_proposal(
    store: Dict[str, Proposal],
    kind: ProposalKind,
    proposed_schedule: ScheduleDTO,
    committed_schedule: Optional[ScheduleDTO],
    matches: List[MatchDTO],
    players: List[PlayerDTO],
    groups: Optional[List[RosterGroupDTO]],
    from_version: int,
    summary: Optional[str] = None,
    proposed_config: Optional[TournamentConfig] = None,
    extra_clock_shift_delta: int = 0,
) -> Proposal:
    """Compose impact + bookkeeping into a Proposal and stash it.

    `compute_impact` is imported lazily so under sys.modules churn
    (e.g., test fixtures that purge `app.*` between runs) it picks up
    the current `Impact` class. We also round-trip through `model_dump`
    when constructing the `Proposal` so even if `compute_impact` was
    imported against a stale `app.schemas`, the resulting `Impact`
    instance gets re-validated against whichever `Impact` class
    `Proposal.impact` currently expects.
    """
    from services.schedule_impact import compute_impact
    impact = compute_impact(committed_schedule, proposed_schedule, matches, players, groups)
    impact_data = impact.model_dump() if hasattr(impact, "model_dump") else dict(impact)
    if extra_clock_shift_delta:
        impact_data["clockShiftMinutesDelta"] = extra_clock_shift_delta
    # Round-trip the schedule + config through model_dump for the same
    # reason — pydantic's class-identity validation rejects instances
    # whose `ScheduleDTO`/`TournamentConfig` were imported under a
    # different module-cache generation than `Proposal` was.
    proposed_schedule_data = (
        proposed_schedule.model_dump() if hasattr(proposed_schedule, "model_dump")
        else proposed_schedule
    )
    proposed_config_data = (
        proposed_config.model_dump() if proposed_config is not None
        and hasattr(proposed_config, "model_dump") else proposed_config
    )
    pid = _new_proposal_id()
    created = datetime.now(timezone.utc)
    expires = created + PROPOSAL_TTL
    proposal = Proposal(
        id=pid,
        kind=kind,
        proposedSchedule=proposed_schedule_data,
        proposedConfig=proposed_config_data,
        impact=impact_data,
        summary=summary or _impact_summary(impact, extra_clock_shift_delta),
        fromScheduleVersion=from_version,
        createdAt=created.isoformat().replace("+00:00", "Z"),
        expiresAt=expires.isoformat().replace("+00:00", "Z"),
    )
    store[pid] = proposal
    return proposal


def _impact_summary(impact: Impact, clock_shift_delta: int = 0) -> str:
    """Human-readable one-liner derived from an impact diff.

    Used as the default ``summary`` when no caller-provided one is given,
    and stored on history entries so the operator can scan the audit log.
    """
    parts: list[str] = []
    if clock_shift_delta:
        parts.append(f"clock shifts {clock_shift_delta:+d} min")
    move_count = len(impact.movedMatches)
    if move_count or not parts:
        parts.append(
            f"{move_count} match" + ("es" if move_count != 1 else "") + " move"
        )
    school_count = len(impact.affectedSchools)
    if school_count:
        parts.append(f"{school_count} school" + ("s" if school_count != 1 else "") + " affected")
    if impact.metricDelta.restViolationsDelta:
        sign = "+" if impact.metricDelta.restViolationsDelta > 0 else ""
        parts.append(f"rest {sign}{impact.metricDelta.restViolationsDelta}")
    if impact.infeasibilityWarnings:
        parts.append(f"{len(impact.infeasibilityWarnings)} warning(s)")
    return ", ".join(parts)


# ---------- request schemas ------------------------------------------------


class ManualEditRequest(BaseModel):
    """Drag-pin a single match to a new slot/court and warm-restart with a
    high stay-close weight so nothing else moves unless feasibility forces it.
    """
    originalSchedule: ScheduleDTO
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    groups: List[RosterGroupDTO] = []
    matchStates: Dict[str, MatchStateDTO] = {}
    matchId: str
    pinnedSlotId: int
    pinnedCourtId: int


class CommitResponse(BaseModel):
    """Response payload from a successful proposal commit."""
    state: TournamentStateDTO
    historyEntry: ScheduleHistoryEntry


# ---------- endpoints ------------------------------------------------------


@router.post("/warm-restart", response_model=Proposal, dependencies=[_OPERATOR])
async def create_warm_restart_proposal(
    request: WarmRestartRequest,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Proposal:
    """Run a stay-close warm-restart and stash the result as a proposal."""
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)
    new_schedule, _moved = _run_warm_restart(request)
    async with lock:
        _evict_expired(store)
        persisted = await _read_persisted_state(repo, tournament_id)
        from_version = persisted.scheduleVersion if persisted else 0
        groups = list(persisted.groups) if persisted else []
        return _build_proposal(
            store,
            kind=ProposalKind.WARM_RESTART,
            proposed_schedule=new_schedule,
            committed_schedule=request.originalSchedule,
            matches=request.matches,
            players=request.players,
            groups=groups,
            from_version=from_version,
        )


@router.post("/repair", response_model=Proposal, dependencies=[_OPERATOR])
async def create_repair_proposal(
    request: RepairRequest,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Proposal:
    """Run a slice-based repair and stash the result as a proposal.

    For ``court_closed`` disruptions we also propose a config update
    that appends the closed court id to ``config.closedCourts`` —
    otherwise a subsequent re-solve would silently route matches back
    onto the closed court. Commit persists both schedule + config
    atomically.
    """
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)
    new_schedule, _ = _run_repair(request)
    _ = repo  # ensure dependency stays in scope; used in inner block below

    # If this is a court-closure disruption, propose a config update
    # that pins the closure into TournamentConfig so it survives the
    # next generate / warm-restart. Indefinite closures (no times) go
    # into the legacy ``closedCourts``; time-bounded closures go into
    # the structured ``courtClosures`` list.
    proposed_cfg: Optional[TournamentConfig] = None
    summary_extra: Optional[str] = None
    if (
        request.disruption.type == "court_closed"
        and request.disruption.courtId is not None
    ):
        court_id = request.disruption.courtId
        from_time = request.disruption.fromTime
        to_time = request.disruption.toTime
        if from_time or to_time:
            from app.schemas import CourtClosure  # local import to avoid cycle at module-load

            existing_closures = list(request.config.courtClosures or [])
            existing_closures.append(
                CourtClosure(
                    courtId=court_id,
                    fromTime=from_time,
                    toTime=to_time,
                    reason=request.disruption.reason,
                )
            )
            proposed_cfg = request.config.model_copy(
                update={"courtClosures": existing_closures}
            )
            window = (
                f"{from_time or '…'}–{to_time or '…'}"
                if (from_time or to_time)
                else "all day"
            )
            summary_extra = f"Court {court_id} closed ({window})"
        else:
            existing = list(request.config.closedCourts or [])
            if court_id not in existing:
                existing.append(court_id)
                existing.sort()
                proposed_cfg = request.config.model_copy(
                    update={"closedCourts": existing}
                )
                summary_extra = f"Court {court_id} closed (all day)"

    async with lock:
        _evict_expired(store)
        persisted = await _read_persisted_state(repo, tournament_id)
        from_version = persisted.scheduleVersion if persisted else 0
        groups = list(persisted.groups) if persisted else []
        return _build_proposal(
            store,
            kind=ProposalKind.REPAIR,
            proposed_schedule=new_schedule,
            committed_schedule=request.originalSchedule,
            matches=request.matches,
            players=request.players,
            groups=groups,
            from_version=from_version,
            proposed_config=proposed_cfg,
            summary=summary_extra,
        )


@router.post("/manual-edit", response_model=Proposal, dependencies=[_OPERATOR])
async def create_manual_edit_proposal(
    request: ManualEditRequest,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> Proposal:
    """Pin one match to a new slot/court via warm-restart, high stay-close.

    The drag-and-drop UX feeds this endpoint. Other matches only move
    when the pinned target makes their existing positions infeasible.
    """
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)

    # Splice the pin into the originalSchedule so warm-restart honors it.
    pinned_assignments = []
    pin_applied = False
    for a in request.originalSchedule.assignments:
        if a.matchId == request.matchId:
            pinned_assignments.append(a.model_copy(update={
                "slotId": request.pinnedSlotId,
                "courtId": request.pinnedCourtId,
            }))
            pin_applied = True
        else:
            pinned_assignments.append(a)
    if not pin_applied:
        raise http_error(
            400, ErrorCode.STATE_SCHEMA_MISMATCH,
            f"matchId {request.matchId!r} not present in originalSchedule",
        )
    pinned_schedule = request.originalSchedule.model_copy(
        update={"assignments": pinned_assignments}
    )

    # Reuse the warm-restart endpoint with stayCloseWeight=10 so non-pinned
    # matches stay put unless the pinned move forces a cascade.
    wr_request = WarmRestartRequest(
        originalSchedule=pinned_schedule,
        config=request.config,
        players=request.players,
        matches=request.matches,
        matchStates=request.matchStates,
        stayCloseWeight=10,
    )
    new_schedule, _ = _run_warm_restart(wr_request)
    async with lock:
        _evict_expired(store)
        persisted = await _read_persisted_state(repo, tournament_id)
        from_version = persisted.scheduleVersion if persisted else 0
        groups = list(persisted.groups) if persisted else []
        return _build_proposal(
            store,
            kind=ProposalKind.MANUAL_EDIT,
            proposed_schedule=new_schedule,
            committed_schedule=request.originalSchedule,
            matches=request.matches,
            players=request.players,
            groups=groups or request.groups,
            from_version=from_version,
        )


@router.get("/{proposal_id}", response_model=Proposal, dependencies=[_VIEWER])
async def get_proposal(
    proposal_id: str,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
) -> Proposal:
    """Re-fetch a proposal by id (e.g., after a page reload)."""
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        proposal = store.get(proposal_id)
    if proposal is None:
        raise http_error(
            410, ErrorCode.PROPOSAL_EXPIRED, "proposal expired or not found"
        )
    return proposal


@router.delete("/{proposal_id}", dependencies=[_OPERATOR])
async def cancel_proposal(
    proposal_id: str,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
) -> dict:
    """Discard a proposal without committing."""
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        if proposal_id in store:
            del store[proposal_id]
    return {"cancelled": True}


@router.post(
    "/{proposal_id}/commit",
    response_model=CommitResponse,
    dependencies=[_OPERATOR],
)
async def commit_proposal(
    proposal_id: str,
    http_request: Request,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> CommitResponse:
    """Atomically apply a proposal to the persisted tournament state.

    Optimistic-concurrency-checked: if the committed ``scheduleVersion``
    has advanced since the proposal was created, the commit is rejected
    with 409 and the operator must re-create the proposal.

    The lock around the read-version-check / write / delete window
    prevents a second concurrent commit on the same proposal id from
    seeing it exist, advancing the version, and double-committing.
    """
    store = _get_store(http_request.app, tournament_id)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        proposal = store.get(proposal_id)
        if proposal is None:
            raise http_error(
                410, ErrorCode.PROPOSAL_EXPIRED, "proposal expired or not found"
            )
        persisted = await _read_persisted_state(repo, tournament_id)
        if persisted is None:
            raise http_error(
                409, ErrorCode.NO_COMMITTED_SCHEDULE,
                "no committed schedule exists to commit against",
            )
        if persisted.scheduleVersion != proposal.fromScheduleVersion:
            raise http_error(
                409, ErrorCode.SCHEDULE_VERSION_CONFLICT,
                f"committed schedule has advanced from version "
                f"{proposal.fromScheduleVersion} to {persisted.scheduleVersion}; "
                f"please re-review the proposal",
            )

        history_entry = ScheduleHistoryEntry(
            version=persisted.scheduleVersion,
            committedAt=now_iso(),
            trigger=proposal.kind.value,
            summary=proposal.summary,
            schedule=persisted.schedule,
        )
        updated = await _persist_committed_state(
            repo,
            tournament_id,
            persisted,
            proposal.proposedSchedule,
            history_entry,
            new_config=proposal.proposedConfig,
        )

        # Proposal is consumed — drop from the store so a second commit is
        # not possible without re-creating.
        del store[proposal_id]

        # Drop any suggestions that were built against the pre-commit
        # version — their proposalId now refers to a stale fork.
        suggestion_store = _get_suggestion_store(http_request.app, tournament_id)
        new_version = updated.scheduleVersion
        stale_sids = [
            sid for sid, sug in suggestion_store.items()
            if sug.fromScheduleVersion < new_version
        ]
        for sid in stale_sids:
            del suggestion_store[sid]

    # Fire a fresh OPTIMIZE trigger off-thread so the inbox reflects
    # the new state. Done outside the lock — the worker has its own
    # serialization. Best-effort: a missing worker (e.g., test harness
    # that didn't spawn one) is not an error.
    worker = getattr(http_request.app.state, "suggestions_worker", None)
    if worker is not None:
        from services.suggestions_worker import TriggerEvent, TriggerKind
        try:
            await worker.post(TriggerEvent(
                kind=TriggerKind.OPTIMIZE,
                fingerprint=f"opt:post-commit:{tournament_id}:{updated.scheduleVersion}",
                tournament_id=tournament_id,
            ))
        except Exception:
            log.exception("post-commit OPTIMIZE trigger failed")

    return CommitResponse(state=updated, historyEntry=history_entry)
