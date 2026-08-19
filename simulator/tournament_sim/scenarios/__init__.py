"""Scenario registry — ``name -> builder(**kwargs)``."""
from __future__ import annotations

from .bracket import FORMATS, Bracket
from .chaos import Chaos
from .demo import Demo
from .entry_states import EntryStates
from .full_meet import FullMeet
from .mixed import Mixed
from .small_meet import SmallMeet

SCENARIOS = {
    SmallMeet.name: SmallMeet,
    FullMeet.name: FullMeet,
    Bracket.name: Bracket,
    Mixed.name: Mixed,
    Chaos.name: Chaos,
    Demo.name: Demo,
    EntryStates.name: EntryStates,
}

__all__ = [
    "SCENARIOS", "FORMATS", "Bracket", "Chaos", "Demo", "EntryStates",
    "FullMeet", "Mixed", "SmallMeet",
]
