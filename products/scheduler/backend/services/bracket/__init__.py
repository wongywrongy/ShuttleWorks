"""Tournament adapter on top of scheduler_core.

Generates standard formats (single elimination, round robin) into the
existing PlayUnit/TournamentState model and feeds them to the
scheduler_core CP-SAT engine through a thin adapter.

Public surface:

    generate_single_elimination(participants, *, seed=...) -> Draw
    generate_round_robin(participants, *, rounds=1) -> Draw
    TournamentDriver — orchestrates layered round-by-round scheduling
    record_result(state, play_unit_id, winner_side, finished_at_slot) -> list[PlayUnitId]

The package never modifies scheduler_core. It produces engine
dataclasses at the boundary and translates assignments back.
"""
from __future__ import annotations

from .draw import BYE, BracketSlot, Draw
from .formats import (
    generate_round_robin,
    generate_single_elimination,
)
from .advancement import record_result
from .scheduler import RoundResult, TournamentDriver

__all__ = [
    "BYE",
    "BracketSlot",
    "Draw",
    "RoundResult",
    "TournamentDriver",
    "generate_round_robin",
    "generate_single_elimination",
    "record_result",
]
