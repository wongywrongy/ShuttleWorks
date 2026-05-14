"""Process-local tournament state.

The prototype keeps a single tournament in memory. On reset the slot
is cleared. No persistence — this is a prototype harness.

PR 2 of the backend-merge arc moved ``EventMeta`` into the shared
``services.bracket.state`` so both this product and the scheduler
backend describe events with the same shape. ``TournamentSlot`` (with
its driver field) stays here because it's the per-product wrapper —
the scheduler backend uses ``_BracketSession`` from
``api.brackets`` instead, which omits the driver.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from threading import RLock
from typing import Dict, Optional

from scheduler_core.domain.models import ScheduleConfig
from scheduler_core.domain.tournament import TournamentState

from services.bracket.draw import Draw
from services.bracket.scheduler import TournamentDriver
from services.bracket.state import EventMeta  # re-exported below


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
