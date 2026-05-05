"""Round-robin pool generation via the standard circle method.

Every participant plays every other participant once per `rounds`
cycle. With `N` participants:

- N even: `N - 1` rounds, `N/2` matches per round, every participant
  plays every round.
- N odd: `N` rounds, `(N - 1)/2` matches per round, one participant
  sits out (a "bye") each round.

The circle method fixes participant 0 and rotates the others. For odd
N we add a phantom BYE participant and drop matches involving it.
"""
from __future__ import annotations

from typing import List, Sequence

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    PlayUnit,
    PlayUnitKind,
)

from tournament.draw import BYE, BracketSlot, Draw


def generate_round_robin(
    participants: Sequence[Participant],
    *,
    rounds: int = 1,
    event_id: str = "rr",
    duration_slots: int = 1,
    play_unit_id_prefix: str = "RR",
) -> Draw:
    """Generate a round-robin draw."""
    if len(participants) < 2:
        raise ValueError("need at least 2 participants")
    if rounds < 1:
        raise ValueError("rounds must be >= 1")

    work_list: List[Participant] = list(participants)
    if len(work_list) % 2 == 1:
        work_list.append(
            Participant(id=BYE, name="(bye)", metadata={"bye": True})
        )

    n = len(work_list)
    half = n // 2
    indices = list(range(n))

    play_units: dict = {}
    slots: dict = {}
    round_lists: List[List[str]] = []
    participants_map = {p.id: p for p in participants}

    for cycle in range(rounds):
        for r in range(n - 1):
            round_index = cycle * (n - 1) + r
            round_play_units: List[str] = []

            top = indices[:half]
            bottom = list(reversed(indices[half:]))

            for match_index, (i_a, i_b) in enumerate(zip(top, bottom)):
                a = work_list[i_a]
                b = work_list[i_b]
                if a.id == BYE or b.id == BYE:
                    continue  # skip phantom bye match
                pu_id = (
                    f"{play_unit_id_prefix}-R{round_index}-{match_index}"
                )
                pu = PlayUnit(
                    id=pu_id,
                    event_id=event_id,
                    side_a=[a.id],
                    side_b=[b.id],
                    expected_duration_slots=duration_slots,
                    kind=PlayUnitKind.MATCH,
                    metadata={
                        "round": round_index,
                        "match_index": match_index,
                        "cycle": cycle,
                    },
                )
                play_units[pu_id] = pu
                slots[pu_id] = (
                    BracketSlot.of_participant(a.id),
                    BracketSlot.of_participant(b.id),
                )
                round_play_units.append(pu_id)

            round_lists.append(round_play_units)

            # Rotate: keep index[0] fixed, rotate the rest clockwise.
            indices = [indices[0]] + [indices[-1]] + indices[1:-1]

    event = Event(
        id=event_id,
        type_tags=["round_robin"],
        format_plugin_name="round_robin",
        parameters={
            "participant_count": len(participants),
            "rounds": rounds,
        },
    )

    return Draw(
        event=event,
        participants=participants_map,
        play_units=play_units,
        slots=slots,
        rounds=round_lists,
    )
