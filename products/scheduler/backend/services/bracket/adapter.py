"""Translate a TournamentState slice into a scheduler_core SchedulingProblem.

Each call schedules a single wave of "ready" PlayUnits — those whose
dependencies have results and whose sides are concrete. Prior rounds
are NOT included; they're already done. We advance `current_slot`
past the last completed PlayUnit's end so the engine never tries to
place a match before then.
"""
from __future__ import annotations

from typing import Iterable, List, Sequence

from scheduler_core.domain.models import (
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverOptions,
)
from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
)


def build_problem(
    state: TournamentState,
    ready_play_unit_ids: Sequence[str],
    *,
    config: ScheduleConfig,
    solver_options: SolverOptions | None = None,
    previous_assignments: List[PreviousAssignment] | None = None,
) -> ScheduleRequest:
    """Assemble a SchedulingProblem for the engine.

    All PlayUnit / participant lookups go through `state` — for
    multi-event tournaments the state already holds everyone across
    events, so the engine sees one global match + player set per
    solve and player-no-overlap covers cross-event conflicts.

    `previous_assignments` carries the locked/pinned partition for a
    re-pin solve (see `TournamentDriver.repin_and_resolve`); when
    `None` it defaults to `[]`, preserving the append-only
    `schedule_next_round` behaviour.
    """
    if not ready_play_unit_ids:
        raise ValueError("no ready play units to schedule")

    matches: List[Match] = []
    referenced_player_ids: set[str] = set()

    for pu_id in ready_play_unit_ids:
        pu = state.play_units.get(pu_id)
        if pu is None:
            raise KeyError(f"unknown play unit {pu_id!r}")
        if not pu.side_a or not pu.side_b:
            raise ValueError(
                f"play unit {pu_id!r} has unresolved sides; cannot schedule"
            )

        side_a = expand_side(pu.side_a, state.participants)
        side_b = expand_side(pu.side_b, state.participants)
        if not side_a or not side_b:
            raise ValueError(
                f"play unit {pu_id!r} expanded to empty side"
            )

        matches.append(
            Match(
                id=pu.id,
                event_code=pu.event_id,
                duration_slots=pu.expected_duration_slots or 1,
                side_a=side_a,
                side_b=side_b,
            )
        )
        referenced_player_ids.update(side_a)
        referenced_player_ids.update(side_b)

    availability_window = (config.current_slot, config.total_slots)
    players = build_players(
        referenced_player_ids,
        state.participants,
        availability_window=availability_window,
    )

    return ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        previous_assignments=list(previous_assignments or []),
        solver_options=solver_options,
    )


def expand_side(
    side: Iterable[str], participants: dict
) -> List[str]:
    """Expand a side's participant ids to player ids.

    Singles: side has one participant id; expanded list has one
    matching player id (same string).
    Teams: side has one participant id of type TEAM; expanded list
    has every member id.
    """
    expanded: List[str] = []
    for pid in side:
        p: Participant | None = participants.get(pid)
        if p is None:
            expanded.append(pid)
            continue
        if p.type == ParticipantType.TEAM and p.member_ids:
            expanded.extend(p.member_ids)
        else:
            expanded.append(pid)
    return expanded


def build_players(
    player_ids: set[str],
    participants: dict,
    *,
    availability_window: tuple[int, int],
) -> List[Player]:
    """Build engine Players for a round.

    `availability_window` is the (current_slot, total_slots) range; we
    pass it as a single availability tuple on every player so the
    engine refuses to place this round's matches before
    `current_slot`. This is the simplest way to honor layered
    scheduling without modifying the engine.
    """
    start, end = availability_window
    if start < 0 or end <= start:
        availability: List[tuple[int, int]] = []
    else:
        availability = [(start, end)]

    out: List[Player] = []
    for pid in sorted(player_ids):
        p = participants.get(pid)
        if p is not None:
            out.append(Player(id=pid, name=p.name, availability=list(availability)))
        else:
            out.append(Player(id=pid, name=pid, availability=list(availability)))
    return out


def advance_current_slot(
    state: TournamentState,
    *,
    base_current_slot: int,
    rest_between_rounds: int,
) -> int:
    """Compute `current_slot` for the next round's solve.

    Picks the maximum end-slot across already-assigned PlayUnits. If
    no rounds are scheduled yet, returns `base_current_slot`.
    """
    finishes = [
        a.actual_end_slot if a.actual_end_slot is not None
        else a.slot_id + a.duration_slots
        for a in state.assignments.values()
    ]
    if not finishes:
        return base_current_slot
    return max(finishes) + max(0, rest_between_rounds)
