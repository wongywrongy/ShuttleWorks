"""Process-local tournament state.

The prototype keeps a single tournament in memory. On reset the slot
is cleared. No persistence — this is a prototype harness.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from threading import RLock
from typing import Dict, Optional

from scheduler_core.domain.models import ScheduleConfig
from scheduler_core.domain.tournament import TournamentState

from tournament.draw import Draw
from tournament.scheduler import TournamentDriver


@dataclass
class EventMeta:
    """Per-event metadata held alongside the Draw."""

    id: str
    discipline: str
    format: str  # "se" or "rr"
    duration_slots: int
    bracket_size: Optional[int] = None
    participant_count: int = 0


@dataclass
class TournamentSlot:
    """The current tournament + driver."""

    state: TournamentState
    draws: Dict[str, Draw]
    driver: TournamentDriver
    config: ScheduleConfig
    events: Dict[str, EventMeta] = field(default_factory=dict)
    rest_between_rounds: int = 1
    start_time: Optional[datetime] = None


class _Container:
    def __init__(self) -> None:
        self._slot: Optional[TournamentSlot] = None
        self._lock = RLock()

    def get(self) -> TournamentSlot:
        with self._lock:
            if self._slot is None:
                raise LookupError("no tournament loaded")
            return self._slot

    def set(self, slot: TournamentSlot) -> None:
        with self._lock:
            self._slot = slot

    def clear(self) -> None:
        with self._lock:
            self._slot = None

    def has(self) -> bool:
        with self._lock:
            return self._slot is not None

    @property
    def lock(self) -> RLock:
        return self._lock


container = _Container()
