"""SimLedger — the simulator's own ground-truth record of what it did.

Invariants compare the SERVER's read-models against this ledger; the
ledger never re-derives product logic (standings math etc.), it only
records what the sim submitted and what the API acknowledged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MeetMatchRecord:
    match_id: str
    status: str = "scheduled"          # canonical vocab: scheduled|called|playing|finished|retired
    winner: Optional[str] = None       # "A" | "B"
    score: Optional[dict] = None       # {"sideA": int, "sideB": int}
    court_id: Optional[int] = None
    time_slot: Optional[int] = None
    side_a_group: Optional[str] = None
    side_b_group: Optional[str] = None


@dataclass
class BracketResultRecord:
    play_unit_id: str
    winner_side: str
    walkover: bool = False
    score: Optional[dict] = None
    command_id: Optional[str] = None


@dataclass
class SimLedger:
    meet_matches: dict[str, MeetMatchRecord] = field(default_factory=dict)
    bracket_results: dict[str, BracketResultRecord] = field(default_factory=dict)
    #: command ids the sim knows were already applied (for replay assertions)
    applied_command_ids: set[str] = field(default_factory=set)

    def meet(self, match_id: str) -> MeetMatchRecord:
        if match_id not in self.meet_matches:
            self.meet_matches[match_id] = MeetMatchRecord(match_id=match_id)
        return self.meet_matches[match_id]

    def record_bracket_result(
        self,
        play_unit_id: str,
        winner_side: str,
        *,
        walkover: bool = False,
        score: Optional[dict] = None,
        command_id: Optional[str] = None,
    ) -> None:
        self.bracket_results[play_unit_id] = BracketResultRecord(
            play_unit_id=play_unit_id,
            winner_side=winner_side,
            walkover=walkover,
            score=score,
            command_id=command_id,
        )
