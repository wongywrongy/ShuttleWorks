"""RunReport — end-of-run summary: phases, request stats, violations.

Exit code contract: 0 iff zero violations (which includes zero 5xx via the
hygiene check). ``to_json`` output is deterministic for a given seed once
timing fields are stripped — the double-run reproducibility check diffs
exactly that.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from .client import ApiStats
from .invariants import Violation


@dataclass
class PhaseTiming:
    name: str
    seconds: float


@dataclass
class RunReport:
    scenario: str
    seed: int
    base_url: str
    tid: str | None = None
    ok: bool = False
    wall_seconds: float = 0.0
    phases: list[PhaseTiming] = field(default_factory=list)
    violations: list[Violation] = field(default_factory=list)
    stats: ApiStats = field(default_factory=ApiStats)
    notes: list[str] = field(default_factory=list)

    # ---- rendering -----------------------------------------------------

    def render_text(self) -> str:
        lines: list[str] = []
        verdict = "PASS" if self.ok else "FAIL"
        lines.append(f"=== tournament-sim: {self.scenario} (seed {self.seed}) — {verdict} ===")
        lines.append(f"target: {self.base_url}   tournament: {self.tid or '-'}")
        lines.append(f"wall: {self.wall_seconds:.1f}s   requests: {self.stats.requests}"
                     f"   max-latency: {self.stats.latency_max_ms:.0f}ms")
        if self.phases:
            lines.append("phases: " + ", ".join(f"{p.name} {p.seconds:.1f}s" for p in self.phases))
        by_status = ", ".join(f"{k}:{v}" for k, v in sorted(self.stats.by_status.items()))
        lines.append(f"status codes: {by_status}")
        if self.notes:
            lines.extend(f"  note: {n}" for n in self.notes)
        if self.violations:
            lines.append(f"VIOLATIONS ({len(self.violations)}):")
            lines.extend(f"  - {v}" for v in self.violations)
        else:
            lines.append("violations: none")
        return "\n".join(lines)

    def to_json(self, *, include_timings: bool = True) -> str:
        payload = {
            "scenario": self.scenario,
            "seed": self.seed,
            "ok": self.ok,
            "tid": self.tid,
            "violations": [
                {"phase": v.phase, "check": v.check, "detail": v.detail}
                for v in self.violations
            ],
            "requests": self.stats.requests,
            "byStatus": {str(k): v for k, v in sorted(self.stats.by_status.items())},
            "byEndpoint": dict(sorted(self.stats.by_endpoint.items())),
            "serverErrors": self.stats.server_errors,
            "unexpected4xx": self.stats.unexpected_4xx,
            "notes": self.notes,
        }
        if include_timings:
            payload["wallSeconds"] = round(self.wall_seconds, 2)
            payload["phases"] = [{"name": p.name, "seconds": round(p.seconds, 2)} for p in self.phases]
            payload["latencyMaxMs"] = round(self.stats.latency_max_ms, 1)
        return json.dumps(payload, indent=2)
