"""Smoke test: the smallest scenario against an ephemeral backend.

Slow by design (boots uvicorn + runs a CP-SAT solve); it lives here —
outside the product's pytest rootdir — so the CI PR gate never runs it.
Invoke with:  cd products/scheduler/simulator && pytest tests/test_smoke.py
"""
from __future__ import annotations

from tournament_sim.runner import ScenarioRunner
from tournament_sim.scenarios import SmallMeet
from tournament_sim.server import EphemeralServer


def test_small_meet_ephemeral():
    with EphemeralServer() as base_url:
        report = ScenarioRunner(
            scenario=SmallMeet(), base_url=base_url, seed=42, cleanup=True
        ).run()
    assert report.ok, "small-meet violations:\n" + "\n".join(str(v) for v in report.violations)
    assert report.stats.requests > 0
    assert not report.stats.server_errors
