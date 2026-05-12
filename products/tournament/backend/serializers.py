"""Translate scheduler_core / tournament objects to API DTOs."""
from __future__ import annotations

from typing import Set

from scheduler_core.domain.tournament import ParticipantType, TournamentState

from backend.schemas import (
    AssignmentOut,
    BracketSlotOut,
    EventOut,
    ParticipantOut,
    PlayUnitOut,
    ResultOut,
    TournamentOut,
)
from backend.state import TournamentSlot


def serialize_tournament(slot: TournamentSlot) -> TournamentOut:
    state = slot.state

    started_ids = _started_play_unit_ids(state)
    finished_ids = _finished_play_unit_ids(state)

    play_units: list[PlayUnitOut] = []
    events_out: list[EventOut] = []

    for event_id, draw in slot.draws.items():
        meta = slot.events.get(event_id)
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

        events_out.append(
            EventOut(
                id=event_id,
                discipline=meta.discipline if meta else event_id,
                format=meta.format if meta else "se",
                bracket_size=meta.bracket_size if meta else None,
                participant_count=meta.participant_count if meta else 0,
                rounds=list(draw.rounds),
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
        ParticipantOut(
            id=p.id,
            name=p.name,
            members=list(p.member_ids)
            if p.type == ParticipantType.TEAM and p.member_ids
            else None,
        )
        for p in state.participants.values()
    ]

    return TournamentOut(
        courts=slot.config.court_count,
        total_slots=slot.config.total_slots,
        rest_between_rounds=slot.rest_between_rounds,
        interval_minutes=slot.config.interval_minutes,
        start_time=slot.start_time,
        events=events_out,
        participants=participants,
        play_units=play_units,
        assignments=assignments,
        results=results,
    )


def _started_play_unit_ids(state: TournamentState) -> Set[str]:
    return {
        a.play_unit_id
        for a in state.assignments.values()
        if a.actual_start_slot is not None
        and a.play_unit_id not in state.results
    }


def _finished_play_unit_ids(state: TournamentState) -> Set[str]:
    return set(state.results.keys())
