"""ScenarioRunner + pacing.

Pacing is entirely sim-side (the backend has no wall clock — match state
advances only on explicit commands):

- ``CompressedPacer``      — no sleeps; a full tournament day in seconds.
- ``RealtimePacer(factor)`` — sleeps scaled by the configured slot length
  so a dev can watch the Display/Run surfaces evolve in a browser.
  ``factor=10`` plays a 30-minute slot in 3 minutes.
"""
from __future__ import annotations

import time

from .client import ApiStats, SimClient
from .context import RunContext
from .invariants import check_api_hygiene
from .ledger import SimLedger
from .report import PhaseTiming, RunReport
from .results import WinnerModel


class Pacer:
    def between_steps(self) -> None: ...
    def match_duration(self, duration_slots: int) -> None: ...


class CompressedPacer(Pacer):
    pass  # never sleeps


class RealtimePacer(Pacer):
    def __init__(self, interval_minutes: int = 30, factor: float = 60.0):
        self.interval_minutes = interval_minutes
        self.factor = max(factor, 0.001)

    def between_steps(self) -> None:
        time.sleep(min(60.0, (self.interval_minutes * 60) / self.factor / 10))

    def match_duration(self, duration_slots: int) -> None:
        time.sleep(min(600.0, duration_slots * (self.interval_minutes * 60) / self.factor))


class ScenarioRunner:
    """Owns client/ledger/report lifecycle around one scenario run."""

    def __init__(
        self,
        *,
        scenario,
        base_url: str,
        seed: int,
        pacer: Pacer | None = None,
        cleanup: bool = False,
    ) -> None:
        self.scenario = scenario
        self.base_url = base_url
        self.seed = seed
        self.pacer = pacer or CompressedPacer()
        self.cleanup = cleanup

    def run(self) -> RunReport:
        stats = ApiStats()
        client = SimClient(self.base_url, stats=stats)
        report = RunReport(scenario=self.scenario.name, seed=self.seed, base_url=self.base_url, stats=stats)
        ctx = RunContext(
            client=client,
            seed=self.seed,
            ledger=SimLedger(),
            winner_model=WinnerModel(self.seed, {}),  # scenario swaps in real ratings
            pacer=self.pacer,
        )
        start = time.perf_counter()
        try:
            client.health()
            self.scenario.run(ctx, phase_cb=lambda name, secs: report.phases.append(PhaseTiming(name, secs)))
        except Exception as exc:  # a crash is itself a finding, not a stack dump
            from .invariants import Violation
            ctx.violations.append(Violation("run", "exception", f"{type(exc).__name__}: {exc}"))
        finally:
            report.wall_seconds = time.perf_counter() - start
            report.tid = ctx.tid
            report.notes = ctx.notes
            ctx.violations.extend(check_api_hygiene(stats))
            report.violations = list(ctx.violations)
            report.ok = not report.violations
            if self.cleanup and ctx.tid:
                try:
                    client.delete_tournament(ctx.tid)
                except Exception:
                    report.notes.append(f"cleanup failed for {ctx.tid}")
            client.close()
        return report


class Phase:
    """``with Phase("solve", cb): ...`` — timed phase block for scenarios."""

    def __init__(self, name: str, cb):
        self.name, self.cb = name, cb

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *exc):
        self.cb(self.name, time.perf_counter() - self._start)
