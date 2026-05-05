"""Translate scheduler_core / tournament objects to API DTOs."""
from __future__ import annotations

from typing import Set

from scheduler_core.domain.tournament import TournamentState

from backend.schemas import (
    AssignmentOut,
    BracketSlotOut,
    ParticipantOut,
    PlayUnitOut,
    ResultOut,
    TournamentOut,
)
from backend.state import TournamentSlot
from tournament.draw import Draw


def serialize_tournament(slot: TournamentSlot) -> TournamentOut:
    state = slot.state
    draw = slot.draw

    started_ids = _started_play_unit_ids(state)
    finished_ids = _finished_play_unit_ids(state)

    play_units = []
    for round_index, round_pu_ids in enumerate(draw.rounds):
        for match_index, pu_id in enumerate(round_pu_ids):
            pu = state.play_units[pu_id]
            slot_a, slot_b = draw.slots[pu_id]
            play_units.append(
                PlayUnitOut(
                    id=pu.id,
                    event_id=pu.event_id,
                    round_index=round_index,
                    match_index=match_index,
                    side_a=list(pu.side_a) if pu.side_a else None,
                    side_b=list(pu.side_b) if pu.side_b else None,
                    duration_slots=pu.expected_duration_slots or 1,
                    dependencies=list(pu.dependencies),
                    slot_a=BracketSlotOut(
                        participant_id=slot_a.participant_id,
                        feeder_play_unit_id=slot_a.feeder_play_unit_id,
                    ),
                    slot_b=BracketSlotOut(
                        participant_id=slot_b.participant_id,
                        feeder_play_unit_id=slot_b.feeder_play_unit_id,
                    ),
                )
            )

    assignments = [
        AssignmentOut(
            play_unit_id=a.play_unit_id,
            slot_id=a.slot_id,
            court_id=a.court_id,
            duration_slots=a.duration_slots,
            actual_start_slot=a.actual_start_slot,
            actual_end_slot=a.actual_end_slot,
            started=a.play_unit_id in started_ids,
            finished=a.play_unit_id in finished_ids,
        )
        for a in state.assignments.values()
    ]

    results = [
        ResultOut(
            play_unit_id=pu_id,
            winner_side=r.winner_side.value,
            walkover=r.walkover,
            finished_at_slot=r.finished_at_slot,
        )
        for pu_id, r in state.results.items()
    ]

    participants = [
        ParticipantOut(id=p.id, name=p.name)
        for p in state.participants.values()
    ]

    return TournamentOut(
        format=slot.format,
        courts=slot.config.court_count,
        total_slots=slot.config.total_slots,
        duration_slots=slot.duration_slots,
        rest_between_rounds=slot.rest_between_rounds,
        interval_minutes=slot.config.interval_minutes,
        participants=participants,
        play_units=play_units,
        rounds=draw.rounds,
        assignments=assignments,
        results=results,
    )


def _started_play_unit_ids(state: TournamentState) -> Set[str]:
    """A PlayUnit is 'started' when its assignment has actual_start_slot."""
    return {
        a.play_unit_id
        for a in state.assignments.values()
        if a.actual_start_slot is not None
        and a.play_unit_id not in state.results
    }


def _finished_play_unit_ids(state: TournamentState) -> Set[str]:
    return set(state.results.keys())
