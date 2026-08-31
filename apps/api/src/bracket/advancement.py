"""Record results and propagate winners through bracket dependencies.

When a PlayUnit's result is recorded, every downstream PlayUnit that
listed it as a dependency gets its corresponding BracketSlot resolved
(participant id filled in, feeder pointer cleared) and its `side_a` /
`side_b` updated on the engine-facing PlayUnit.

For multi-event tournaments, callers pass a `draws` dict keyed by
event id; the function looks up the right Draw via the PlayUnit's
`event_id`. A single ``Draw`` is also accepted (treated as a one-event
mapping) for the single-event tests.

After each recorded result, ``_sweep_walkovers`` cascades through any
downstream PlayUnit whose remaining side is now a BYE (one feeder
walked over, the other already absent). A chain of byes — e.g. when
the field is much smaller than the bracket — resolves in one sweep
rather than waiting for each subsequent round to be scheduled.
"""
from __future__ import annotations

from typing import Dict, List, Mapping, Optional, Union

from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentState,
    WinnerSide,
)

from .draw import BYE, BracketSlot, Draw


DrawSource = Union[Draw, Mapping[str, Draw]]


def _as_draws(source: DrawSource) -> Dict[str, Draw]:
    if isinstance(source, Draw):
        return {source.event.id: source}
    return dict(source)


def record_result(
    state: TournamentState,
    draws: DrawSource,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    finished_at_slot: Optional[int],
    walkover: bool = False,
    score: Optional[dict] = None,
    reason: Optional[str] = None,
) -> List[PlayUnitId]:
    """Store a Result for ``play_unit_id`` and propagate the winner forward.

    Returns the list of downstream PlayUnit ids whose slots were
    resolved by this call. Walkovers cascade through chains of byes
    automatically — callers don't need to recurse.
    """
    draw_map = _as_draws(draws)
    pu = state.play_units.get(play_unit_id)
    if pu is None:
        raise KeyError(f"unknown play unit {play_unit_id!r}")
    draw = draw_map.get(pu.event_id)
    if draw is None:
        raise KeyError(f"no draw registered for event {pu.event_id!r}")
    if play_unit_id in state.results:
        raise ValueError(f"play unit {play_unit_id!r} already has a result")

    if winner_side == WinnerSide.A and not pu.side_a:
        raise ValueError(
            f"cannot record A win on {play_unit_id!r}: side_a is empty"
        )
    if winner_side == WinnerSide.B and not pu.side_b:
        raise ValueError(
            f"cannot record B win on {play_unit_id!r}: side_b is empty"
        )

    resolved = _record_and_propagate(
        state,
        draw,
        play_unit_id,
        winner_side,
        finished_at_slot=finished_at_slot,
        walkover=walkover,
        score=score,
        reason=reason,
    )
    swept = _sweep_walkovers(state, draw_map)
    # Return the FULL frontier of changed units, not just the recorded
    # match's direct dependents. ``_sweep_walkovers`` resolves byes
    # several layers deep; every unit it records a walkover for or
    # propagates a winner into must reach the caller, because the API's
    # ``_persist_result_advancement`` only writes rows for the ids
    # returned here. Omitting the deep frontier silently dropped those
    # slot/result updates from the DB — correct in the live response,
    # lost on the next reload. Dedupe while preserving order (resolved
    # first, then the sweep frontier).
    affected: List[PlayUnitId] = list(resolved)
    seen = set(resolved)
    for pu_id in swept:
        if pu_id not in seen:
            seen.add(pu_id)
            affected.append(pu_id)
    return affected


def reconcile_recorded_results(
    state: TournamentState,
    draws: DrawSource,
) -> List[PlayUnitId]:
    """Rebuild resolved successor sides from already-recorded results.

    Normal result entry calls :func:`record_result`, so propagation happens at
    write time. Imports and legacy rows can arrive with results already stored;
    replay those immutable facts in round order instead of preserving a second,
    contradictory state where a finished feeder still renders as ``Winner of``.
    This is an in-memory derivation and never invents a result.
    """
    draw_map = _as_draws(draws)
    touched: List[PlayUnitId] = []
    seen: set[PlayUnitId] = set()
    for draw in draw_map.values():
        for round_ids in draw.rounds:
            for play_unit_id in round_ids:
                recorded = state.results.get(play_unit_id)
                if recorded is None:
                    continue
                play_unit = state.play_units[play_unit_id]
                # Do not turn an unrecoverable terminal row into a fabricated
                # BYE. The live-operation guard reports that row instead.
                if recorded.winner_side == WinnerSide.A and not play_unit.side_a:
                    continue
                if recorded.winner_side == WinnerSide.B and not play_unit.side_b:
                    continue
                changed = _propagate_recorded_result_into_empty_slots(
                    draw,
                    play_unit_id,
                    recorded,
                )
                for downstream_id in changed:
                    if downstream_id not in seen:
                        seen.add(downstream_id)
                        touched.append(downstream_id)
    return touched


def _propagate_recorded_result_into_empty_slots(
    draw: Draw,
    play_unit_id: PlayUnitId,
    recorded: Result,
) -> List[PlayUnitId]:
    """Project one stored result without erasing historical provenance.

    Historical imports may intentionally carry both a concrete engine side and
    a feeder slot for verified topology. Only empty successor sides represent
    the legacy/import drift this reconciliation repairs.
    """
    winner = _winner_participant_id(draw, play_unit_id, recorded.winner_side)
    loser = _loser_participant_id(
        draw,
        play_unit_id,
        recorded.winner_side,
        walkover=recorded.walkover,
        reason=recorded.reason,
    )
    changed_ids: List[PlayUnitId] = []
    for downstream_id, downstream in draw.play_units.items():
        if play_unit_id not in downstream.dependencies:
            continue
        slot_a, slot_b = draw.slots[downstream_id]
        changed = False
        if slot_a.feeder_play_unit_id == play_unit_id and not downstream.side_a:
            fed = winner if slot_a.feeder_take == "winner" else loser
            slot_a = BracketSlot.of_participant(fed or BYE)
            changed = True
        if slot_b.feeder_play_unit_id == play_unit_id and not downstream.side_b:
            fed = winner if slot_b.feeder_take == "winner" else loser
            slot_b = BracketSlot.of_participant(fed or BYE)
            changed = True
        if changed:
            draw.slots[downstream_id] = (slot_a, slot_b)
            _refresh_play_unit_sides(draw, downstream_id)
            changed_ids.append(downstream_id)
    return changed_ids


def auto_walkover_byes(state: TournamentState, draw: Draw) -> None:
    """Record walkover results for any R0 PlayUnit with a BYE side.

    Goes through R0 only — chains beyond R0 are picked up by the
    cascade sweep that runs inside every ``record_result`` call.
    """
    for pu_id in list(draw.rounds[0]):
        if pu_id in state.results:
            continue
        pu = state.play_units[pu_id]
        a_empty = not pu.side_a
        b_empty = not pu.side_b
        if a_empty and b_empty:
            record_result(
                state, draw, pu_id, WinnerSide.NONE,
                finished_at_slot=None, walkover=True,
            )
        elif a_empty:
            record_result(
                state, draw, pu_id, WinnerSide.B,
                finished_at_slot=None, walkover=True,
            )
        elif b_empty:
            record_result(
                state, draw, pu_id, WinnerSide.A,
                finished_at_slot=None, walkover=True,
            )


# ---- internals ------------------------------------------------------------


def _record_and_propagate(
    state: TournamentState,
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    finished_at_slot: Optional[int],
    walkover: bool,
    score: Optional[dict],
    reason: Optional[str] = None,
) -> List[PlayUnitId]:
    """Store the result and update downstream slots. Does NOT sweep."""
    state.results[play_unit_id] = Result(
        winner_side=winner_side,
        score=score,
        finished_at_slot=finished_at_slot,
        walkover=walkover,
        reason=reason,
    )

    winner = _winner_participant_id(draw, play_unit_id, winner_side)
    loser = _loser_participant_id(
        draw, play_unit_id, winner_side, walkover=walkover, reason=reason
    )
    resolved: List[PlayUnitId] = []
    for downstream_id, downstream in draw.play_units.items():
        if play_unit_id not in downstream.dependencies:
            continue
        slot_a, slot_b = draw.slots[downstream_id]
        changed = False
        if slot_a.feeder_play_unit_id == play_unit_id:
            fed = winner if slot_a.feeder_take == "winner" else loser
            new_slot = BracketSlot.of_participant(fed or BYE)
            draw.slots[downstream_id] = (new_slot, slot_b)
            slot_a = new_slot
            changed = True
        if slot_b.feeder_play_unit_id == play_unit_id:
            fed = winner if slot_b.feeder_take == "winner" else loser
            new_slot = BracketSlot.of_participant(fed or BYE)
            draw.slots[downstream_id] = (slot_a, new_slot)
            slot_b = new_slot
            changed = True
        if changed:
            _refresh_play_unit_sides(draw, downstream_id)
            resolved.append(downstream_id)
    return resolved


def _sweep_walkovers(
    state: TournamentState, draw_map: Dict[str, Draw]
) -> List[PlayUnitId]:
    """Cascade walkovers across the whole state until stable.

    A PlayUnit becomes auto-walkover-eligible when all its
    dependencies are resolved AND at least one of its sides is now
    empty (one feeder walked over to a BYE, the other already absent).
    The loop runs until no further PlayUnits are recorded.

    Returns every PlayUnit id the sweep changed: each auto-walkovered
    unit plus the downstream units its winner propagated into. Callers
    need the full set so the persistence layer writes every changed row
    (see ``record_result``).
    """
    touched: List[PlayUnitId] = []
    changed = True
    while changed:
        changed = False
        for pu_id, pu in state.play_units.items():
            if pu_id in state.results:
                continue
            if pu.dependencies and not all(
                d in state.results for d in pu.dependencies
            ):
                continue
            a_empty = not pu.side_a
            b_empty = not pu.side_b
            if not (a_empty or b_empty):
                continue
            draw = draw_map.get(pu.event_id)
            if draw is None:
                continue
            if a_empty and b_empty:
                w = WinnerSide.NONE
            elif a_empty:
                w = WinnerSide.B
            else:
                w = WinnerSide.A
            downstream = _record_and_propagate(
                state,
                draw,
                pu_id,
                w,
                finished_at_slot=None,
                walkover=True,
                score=None,
            )
            # The unit itself got a (walkover) result, and its winner
            # may have advanced into deeper units — both must be persisted.
            touched.append(pu_id)
            touched.extend(downstream)
            changed = True
    return touched


def _winner_participant_id(
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
) -> Optional[str]:
    pu = draw.play_units[play_unit_id]
    if winner_side == WinnerSide.A:
        return pu.side_a[0] if pu.side_a else None
    if winner_side == WinnerSide.B:
        return pu.side_b[0] if pu.side_b else None
    return None  # WinnerSide.NONE — double-bye / dead branch


# Reasons that make a loser unable to continue downstream, even though
# the result itself is NOT a walkover (the winner_side is real and the
# match was actually played/started). BYE-downstream-only policy,
# decision 2026-07-15: the loser's consolation/plate/feeder_take slot
# becomes a BYE, exactly like a walkover, but the stored Result keeps
# walkover=False — a retirement/forfeit is not a walkover and must not
# be reported as one. No automatic withdrawal from the player's OTHER
# draws; that stays a manual, per-draw operator decision.
_LOSER_CANNOT_CONTINUE_REASONS = frozenset({"retired", "forfeit"})


def loser_cannot_continue(*, walkover: bool, reason: Optional[str]) -> bool:
    """True when the loser must NOT be fed into a ``feeder_take='loser'``

    slot: either a real walkover, or a ``retired``/``forfeit`` reason
    (BYE-downstream-only policy, decision 2026-07-15). Centralizes the
    predicate so the rule is written once.
    """
    return walkover or reason in _LOSER_CANNOT_CONTINUE_REASONS


def _loser_participant_id(
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    walkover: bool,
    reason: Optional[str] = None,
) -> Optional[str]:
    """The participant a ``feeder_take='loser'`` slot receives.

    POLICY: a walkover has no real loser. A bye "loses" its R1 match and
    a withdrawn player "loses" theirs, but neither may advance into a
    consolation bracket — the loser feed is ``None`` (→ BYE), and the
    normal ``_sweep_walkovers`` cascade hollows the plate match. This is
    the documented bye-hazard rule for double elimination / Monrad /
    compass (docs/explanation/architecture/draw-formats.md).

    A ``retired``/``forfeit`` reason gets the SAME BYE treatment for the
    loser feed only (see ``loser_cannot_continue``) — the result itself
    stays a real (non-walkover) result.
    """
    if loser_cannot_continue(walkover=walkover, reason=reason):
        return None
    pu = draw.play_units[play_unit_id]
    if winner_side == WinnerSide.A:
        return pu.side_b[0] if pu.side_b else None
    if winner_side == WinnerSide.B:
        return pu.side_a[0] if pu.side_a else None
    return None  # WinnerSide.NONE — no winner, no loser


def _refresh_play_unit_sides(draw: Draw, play_unit_id: PlayUnitId) -> None:
    """Sync PlayUnit.side_a/side_b with the current BracketSlot map."""
    slot_a, slot_b = draw.slots[play_unit_id]
    pu = draw.play_units[play_unit_id]
    if slot_a.is_resolved:
        pu.side_a = [slot_a.participant_id]
    elif slot_a.is_bye:
        pu.side_a = None
    if slot_b.is_resolved:
        pu.side_b = [slot_b.participant_id]
    elif slot_b.is_bye:
        pu.side_b = None
