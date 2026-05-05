"""Suggestions inbox: routes + speculative-solve handler.

The handler is built per-app at startup (`build_handler`). It runs
inside the SuggestionsWorker's task; each invocation reads the
current persisted state, runs a warm-restart at a low time
budget with a cancellation token, and stamps a Suggestion if the
result improves on the live schedule.

Phase 3 adds the HTTP routes for listing/applying/dismissing.
Phase 3.4 adds the REPAIR handler driven by advisories.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, FastAPI, Request

from app.error_codes import ErrorCode, http_error

import app.scheduler_core_path  # noqa: F401
from app.schemas import (
    ProposalKind,
    SUGGESTION_TTL_MINUTES,
    ScheduleDTO,
    Suggestion,
    TournamentConfig,
)
from api.schedule_proposals import (
    _build_proposal,
    _evict_expired,
    _evict_expired_suggestions,
    _get_lock,
    _get_store,
    _get_suggestion_store,
    _read_persisted_state,
)
from api.schedule_warm_restart import (
    WarmRestartRequest,
    _run_warm_restart_with_cancel,
)
from scheduler_core.engine.cancel_token import CancelToken
from services.suggestions_worker import (
    HandlerFn,
    TriggerEvent,
    TriggerKind,
)

router = APIRouter(prefix="/schedule/suggestions", tags=["schedule-suggestions"])
log = logging.getLogger("scheduler.suggestions")


def _format_metric(*, finish_delta_min: int, moves: int) -> str:
    """Human copy for the Suggestion.metric field. Tabular-nums-safe.

    Negative finish deltas use the true minus sign (U+2212) so
    right-aligned tabular columns line up with positive numbers.
    """
    if finish_delta_min < 0:
        delta = f"−{abs(finish_delta_min)} min finish"
    elif finish_delta_min > 0:
        delta = f"+{finish_delta_min} min finish"
    else:
        delta = "0 min finish"
    return f"{delta}, {moves} moves"


def _expires_at(now: datetime | None = None) -> str:
    n = now or datetime.now(timezone.utc)
    return (n + timedelta(minutes=SUGGESTION_TTL_MINUTES)).isoformat()


def _finish_delta_minutes(
    old: ScheduleDTO,
    new: ScheduleDTO,
    config: TournamentConfig,
) -> int:
    """How many minutes earlier (negative) or later (positive) the
    new schedule's last match finishes vs. the old."""
    def end_slot(s: ScheduleDTO) -> int:
        if not s.assignments:
            return 0
        return max(a.slotId + a.durationSlots for a in s.assignments)
    return (end_slot(new) - end_slot(old)) * (config.intervalMinutes or 1)


async def _handle_optimize(
    app: FastAPI, event: TriggerEvent, token: CancelToken,
) -> None:
    """Run a warm-restart speculation against persisted state.

    Stamps a Suggestion only if the new schedule finishes earlier
    than the live one (operator-confidence rule: never offer
    zero-value applies). The "fewer moves at same finish" branch is
    deferred — solver returns earliest-finish-first under the
    stay-close objective, so we'd need a second solve at higher
    weight to evaluate it.
    """
    persisted = _read_persisted_state()
    if persisted is None or persisted.schedule is None or persisted.config is None:
        log.debug("suggestions: no persisted schedule to optimize against")
        return

    # Match states live in a separate persistence file.
    from api.match_state import _read_state_file
    try:
        match_state_file = _read_state_file()
        match_states = match_state_file.matchStates
    except Exception:
        log.exception("suggestions: failed to read match_states")
        match_states = {}

    wr_req = WarmRestartRequest(
        originalSchedule=persisted.schedule,
        config=persisted.config,
        players=persisted.players,
        matches=persisted.matches,
        matchStates=match_states,
        stayCloseWeight=5,
        timeBudgetSec=6.0,
    )

    # CPU-bound solve in a thread so the event loop stays
    # responsive. Cancellation token threads through to
    # solver.StopSearch().
    loop = asyncio.get_running_loop()

    def _solve_sync():
        return _run_warm_restart_with_cancel(wr_req, cancel_token=token)

    try:
        new_schedule, moved = await loop.run_in_executor(None, _solve_sync)
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("optimize speculation failed")
        return

    # Compute improvement metrics.
    finish_delta = _finish_delta_minutes(
        persisted.schedule, new_schedule, persisted.config,
    )

    # The schedule is "better" if it finishes earlier. If the finish
    # is unchanged, we don't surface a suggestion — operator-confidence
    # rule per PRODUCT.md (don't ask them to apply zero-value moves).
    if finish_delta >= 0:
        log.debug(
            "suggestions: optimize found no improvement "
            "(finish_delta=%dmin, moves=%d) — skipping",
            finish_delta, len(moved),
        )
        return

    # Stamp the proposal + suggestion.
    store = _get_store(app)
    suggestion_store = _get_suggestion_store(app)
    lock = _get_lock(app)
    async with lock:
        _evict_expired(store)
        _evict_expired_suggestions(suggestion_store)

        proposal = _build_proposal(
            store,
            kind=ProposalKind.WARM_RESTART,
            proposed_schedule=new_schedule,
            committed_schedule=persisted.schedule,
            matches=persisted.matches,
            players=persisted.players,
            groups=list(persisted.groups or []),
            from_version=persisted.scheduleVersion,
            summary="Re-optimize from now",
        )

        sug = Suggestion(
            kind="optimize",
            title="Re-optimize from now",
            metric=_format_metric(
                finish_delta_min=finish_delta, moves=len(moved),
            ),
            proposalId=proposal.id,
            fingerprint=event.fingerprint,
            fromScheduleVersion=persisted.scheduleVersion,
            expiresAt=_expires_at(),
        )
        suggestion_store[sug.id] = sug
        log.info(
            "suggestions: stamped optimize id=%s finishΔ=%dmin moves=%d",
            sug.id, finish_delta, len(moved),
        )


def build_handler(app: FastAPI) -> HandlerFn:
    """Factory: returns a handler fn closed over `app` for the worker.

    Phase 3.4 will extend this to dispatch REPAIR triggers to a
    parallel handler. PERIODIC triggers route to the same OPTIMIZE
    handler — periodic is a heartbeat that re-checks for
    improvements.
    """
    async def handler(event: TriggerEvent, token: CancelToken) -> None:
        if event.kind in (TriggerKind.OPTIMIZE, TriggerKind.PERIODIC):
            await _handle_optimize(app, event, token)
        elif event.kind == TriggerKind.REPAIR:
            log.debug("suggestions: REPAIR handler not yet wired (Phase 3.4)")
        else:
            log.warning("suggestions: unknown trigger kind: %s", event.kind)
    return handler


# ---------- HTTP routes -----------------------------------------------------


# Severity tier for sort: repair (most urgent) > director > optimize > candidate.
_KIND_TIER = {"repair": 0, "director": 1, "optimize": 2, "candidate": 3}


@router.get("", response_model=list[Suggestion])
async def list_suggestions(http_request: Request) -> list[Suggestion]:
    """Active suggestions, sorted by severity then creation time.

    Drops expired entries before returning. The frontend polls this
    endpoint every ~8s and rebuilds the rail from the response.
    """
    store = _get_suggestion_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        return sorted(
            store.values(),
            key=lambda s: (_KIND_TIER.get(s.kind, 99), s.createdAt),
        )


@router.post("/{suggestion_id}/apply")
async def apply_suggestion(suggestion_id: str, http_request: Request):
    """Commit the proposal underlying a suggestion.

    Drops the suggestion before invoking commit so a 409 (stale
    version) doesn't leave a dead entry in the inbox — the
    frontend's next poll will reconcile.
    """
    from api.schedule_proposals import commit_proposal

    store = _get_suggestion_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        sug = store.pop(suggestion_id, None)
    if sug is None:
        raise http_error(
            410, ErrorCode.PROPOSAL_EXPIRED,
            "suggestion expired or not found",
        )
    return await commit_proposal(sug.proposalId, http_request)


@router.post("/{suggestion_id}/dismiss")
async def dismiss_suggestion(suggestion_id: str, http_request: Request) -> dict:
    """Drop a suggestion and cancel its underlying proposal."""
    store = _get_suggestion_store(http_request.app)
    proposal_store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        sug = store.pop(suggestion_id, None)
        if sug is None:
            raise http_error(
                410, ErrorCode.PROPOSAL_EXPIRED,
                "suggestion expired or not found",
            )
        proposal_store.pop(sug.proposalId, None)
    return {"dismissed": True}
