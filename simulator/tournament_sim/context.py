"""RunContext — the state one simulated tournament run threads through
actors, scenarios, and invariants.

Lives in its own module so ``actors`` / ``scenarios`` / ``runner`` can all
import it without cycles.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:  # only for type hints — no runtime import cycles
    from .client import SimClient
    from .ledger import SimLedger
    from .results import WinnerModel
    from .runner import Pacer


@dataclass
class RunContext:
    client: "SimClient"
    seed: int
    ledger: "SimLedger"
    winner_model: "WinnerModel"
    pacer: "Pacer"
    tid: Optional[str] = None  # workspace/tournament id, set after create
    #: per-match canonical ``matches.version`` — THE source of ``seen_version``
    #: truth. Updated from every CommandResponse; bootstrapped lazily from the
    #: single-match GET's ETag.
    versions: dict[str, int] = field(default_factory=dict)
    #: violations accumulated across phases (invariants append here)
    violations: list = field(default_factory=list)
    #: free-form notes for the report (phase timings etc.)
    notes: list[str] = field(default_factory=list)
