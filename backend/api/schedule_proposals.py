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

from fastapi import APIRouter, FastAPI, HTTPException, Request
from pydantic import BaseModel

import app.scheduler_core_path  # noqa: F401
from app.error_codes import ErrorCode, http_error
from app.schemas import (  # noqa: E402
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

from api import _backups
from api.match_state import MatchStateDTO
from api.schedule_repair import RepairRequest, _run_repair
from api.schedule_warm_restart import WarmRestartRequest, _run_warm_restart


router = APIRouter(prefix="/schedule/proposals", tags=["schedule-proposals"])
log = logging.getLogger("scheduler.proposals")


# Proposal TTL: review windows of >30 min imply the operator walked
# away — recompute on demand instead of letting stale proposals
# accumulate or commit against unrelated state.
PROPOSAL_TTL = timedelta(minutes=30)
HISTORY_CAP = 5


# Per-app proposal store. Lives on `request.app.state.proposals` so it
# survives any module-reload churn the test suite triggers (the previous
# module-global approach silently spawned multiple `_PROPOSALS` dicts
# under sys.modules churn, and one half of the create/commit pipeline
# would write to a different dict than the other half read from).
#
# Single-worker uvicorn deployment is the assumption; multi-worker
# would require shared storage (Redis or similar).
_STATE_KEY = "proposals"
_LOCK_KEY = "proposals_lock"


def _get_store(app: FastAPI) -> Dict[str, Proposal]:
    store = getattr(app.state, _STATE_KEY, None)
    if store is None:
        store = {}
        setattr(app.state, _STATE_KEY, store)
    return store


def _get_lock(app: FastAPI) -> asyncio.Lock:
    """Per-app asyncio.Lock guarding the proposal store mutations.

    Two concurrent commits on the same proposal id would otherwise both
    pass the existence check and both attempt the `del store[id]`,
    racing on the persisted-state read/write too. Hold this lock across
    each endpoint's read-modify-write window.
    """
    lock = getattr(app.state, _LOCK_KEY, None)
    if lock is None:
        lock = asyncio.Lock()
        setattr(app.state, _LOCK_KEY, lock)
    return lock


_SUGGESTION_STATE_KEY = "suggestions"


def _get_suggestion_store(app: FastAPI) -> Dict[str, Suggestion]:
    """Per-app suggestion dict, mirrors the proposal store layout.

    Suggestions reference proposals by id; the suggestion's TTL is
    typically shorter than its proposal's so an unapplied suggestion
    can fall off the inbox while the underlying proposal stays live
    in case the operator opens a Disruption dialog the same kind.
    """
    store = getattr(app.state, _SUGGESTION_STATE_KEY, None)
    if store is None:
        store = {}
        setattr(app.state, _SUGGESTION_STATE_KEY, store)
    return store


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


def _read_persisted_state() -> Optional[TournamentStateDTO]:
    """Load the current committed tournament state, or None if absent."""
    # Late import — avoids a circular at module load time and lets tests
    # monkeypatch BACKEND_DATA_DIR before the helpers resolve a path.
    from api import tournament_state as ts_mod

    path = ts_mod._state_path()
    if not path.exists():
        return None
    try:
        data, _ = ts_mod._read_with_recovery(path)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("proposals: state unreadable: %s", e)
        return None
    data = ts_mod._migrate(data)
    return TournamentStateDTO(**{k: v for k, v in data.items() if k != "_integrity"})


def _persist_committed_state(
    state: TournamentStateDTO,
    new_schedule: ScheduleDTO,
    history_entry: ScheduleHistoryEntry,
    new_config: Optional[TournamentConfig] = None,
) -> TournamentStateDTO:
    """Atomically apply a committed schedule (and optional config) to disk.

    Bumps ``scheduleVersion``, appends ``history_entry`` (capped at
    HISTORY_CAP, oldest dropped), refreshes ``updatedAt``, and re-stamps
    the integrity hash via the existing atomic-write helper. When
    ``new_config`` is provided (director-action commits), the persisted
    ``config`` is replaced too.
    """
    from api import tournament_state as ts_mod
    from app.paths import data_dir, ensure_data_dir

    ensure_data_dir()
    path = ts_mod._state_path()

    # Rotate a backup of the previous live file before stomping it.
    tournament_name = (state.config.tournamentName if state.config else None)
    try:
        _backups.create_backup(data_dir(), path, tournament_name)
    except OSError as e:
        log.warning("proposals: backup rotation failed: %s", e)

    new_history = list(state.scheduleHistory) + [history_entry]
    if len(new_history) > HISTORY_CAP:
        new_history = new_history[-HISTORY_CAP:]

    update_payload = {
        "schedule": new_schedule,
        "scheduleVersion": state.scheduleVersion + 1,
        "scheduleHistory": new_history,
        "updatedAt": now_iso(),
        "version": ts_mod.CURRENT_SCHEMA_VERSION,
        "scheduleIsStale": False,
    }
    if new_config is not None:
        update_payload["config"] = new_config
    updated = state.model_copy(update=update_payload)
    try:
        _backups.atomic_write_json(path, updated.model_dump())
    except OSError as e:
        log.error("proposals: write failed: %s", e)
        raise http_error(
            500, ErrorCode.STATE_WRITE_FAILED, "could not persist schedule commit"
        )
    return updated


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


@router.post("/warm-restart", response_model=Proposal)
async def create_warm_restart_proposal(
    request: WarmRestartRequest, http_request: Request
) -> Proposal:
    """Run a stay-close warm-restart and stash the result as a proposal."""
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    new_schedule, _moved = _run_warm_restart(request)
    async with lock:
        _evict_expired(store)
        persisted = _read_persisted_state()
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


@router.post("/repair", response_model=Proposal)
async def create_repair_proposal(
    request: RepairRequest, http_request: Request
) -> Proposal:
    """Run a slice-based repair and stash the result as a proposal.

    For ``court_closed`` disruptions we also propose a config update
    that appends the closed court id to ``config.closedCourts`` —
    otherwise a subsequent re-solve would silently route matches back
    onto the closed court. Commit persists both schedule + config
    atomically.
    """
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    new_schedule, _ = _run_repair(request)

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
        persisted = _read_persisted_state()
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


@router.post("/manual-edit", response_model=Proposal)
async def create_manual_edit_proposal(
    request: ManualEditRequest, http_request: Request
) -> Proposal:
    """Pin one match to a new slot/court via warm-restart, high stay-close.

    The drag-and-drop UX feeds this endpoint. Other matches only move
    when the pinned target makes their existing positions infeasible.
    """
    store = _get_store(http_request.app)
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
        persisted = _read_persisted_state()
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


@router.get("/{proposal_id}", response_model=Proposal)
async def get_proposal(proposal_id: str, http_request: Request) -> Proposal:
    """Re-fetch a proposal by id (e.g., after a page reload)."""
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        proposal = store.get(proposal_id)
    if proposal is None:
        raise http_error(
            410, ErrorCode.PROPOSAL_EXPIRED, "proposal expired or not found"
        )
    return proposal


@router.delete("/{proposal_id}")
async def cancel_proposal(proposal_id: str, http_request: Request) -> dict:
    """Discard a proposal without committing."""
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        if proposal_id in store:
            del store[proposal_id]
    return {"cancelled": True}


@router.post("/{proposal_id}/commit", response_model=CommitResponse)
async def commit_proposal(proposal_id: str, http_request: Request) -> CommitResponse:
    """Atomically apply a proposal to the persisted tournament state.

    Optimistic-concurrency-checked: if the committed ``scheduleVersion``
    has advanced since the proposal was created, the commit is rejected
    with 409 and the operator must re-create the proposal.

    The lock around the read-version-check / write / delete window
    prevents a second concurrent commit on the same proposal id from
    seeing it exist, advancing the version, and double-committing.
    """
    store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired(store)
        proposal = store.get(proposal_id)
        if proposal is None:
            raise http_error(
                410, ErrorCode.PROPOSAL_EXPIRED, "proposal expired or not found"
            )
        persisted = _read_persisted_state()
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
        updated = _persist_committed_state(
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
        suggestion_store = _get_suggestion_store(http_request.app)
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
                fingerprint=f"opt:post-commit:{updated.scheduleVersion}",
            ))
        except Exception:
            log.exception("post-commit OPTIMIZE trigger failed")

    return CommitResponse(state=updated, historyEntry=history_entry)
