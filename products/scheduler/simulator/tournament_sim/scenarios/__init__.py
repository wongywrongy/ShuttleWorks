"""Scenario registry — ``name -> builder(**kwargs)``."""
from __future__ import annotations

from .bracket import FORMATS, Bracket
from .chaos import Chaos
from .full_meet import FullMeet
from .mixed import Mixed
from .small_meet import SmallMeet

SCENARIOS = {
    SmallMeet.name: SmallMeet,
    FullMeet.name: FullMeet,
    Bracket.name: Bracket,
    Mixed.name: Mixed,
    Chaos.name: Chaos,
}

__all__ = ["SCENARIOS", "FORMATS", "Bracket", "Chaos", "FullMeet", "Mixed", "SmallMeet"]
