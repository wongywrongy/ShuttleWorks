"""CLI — ``python -m tournament_sim run|list ...``

Examples:
    python -m tournament_sim run --scenario small-meet --seed 42 --base-url http://localhost:8600
    python -m tournament_sim run --scenario bracket --format double_elimination --ephemeral
    python -m tournament_sim run --scenario full-meet --pace realtime:10
    python -m tournament_sim list
"""
from __future__ import annotations

import argparse
import sys

from .runner import CompressedPacer, RealtimePacer, ScenarioRunner
from .scenarios import FORMATS, SCENARIOS, Bracket

DEFAULT_BASE_URL = "http://localhost:8600"


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="tournament_sim",
                                description="ShuttleWorks full-tournament workflow simulator (internal dev tool)")
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run one scenario")
    run.add_argument("--scenario", default="small-meet", choices=sorted(SCENARIOS))
    run.add_argument("--seed", type=int, default=42)
    group = run.add_mutually_exclusive_group()
    group.add_argument("--base-url", default=DEFAULT_BASE_URL,
                       help=f"target backend (default {DEFAULT_BASE_URL}; use http://localhost:8000 for the Docker stack)")
    group.add_argument("--ephemeral", action="store_true",
                       help="boot an isolated backend (fresh sqlite, free port) for this run and tear it down after")
    run.add_argument("--format", dest="fmt", default="se", choices=FORMATS,
                     help="draw format for the bracket scenario")
    run.add_argument("--players", type=int, default=16, help="participants per bracket event")
    run.add_argument("--pace", default="compressed",
                     help='"compressed" (default) or "realtime[:factor]" — e.g. realtime:10 plays 10x speed')
    run.add_argument("--json", dest="json_path", default=None, help="also write the report as JSON to this path")
    run.add_argument("--cleanup", action="store_true",
                     help="DELETE the tournament after the run (default keeps it for UI inspection)")
    run.add_argument("--server-log", default=None, help="capture the ephemeral backend's output to this file")

    sub.add_parser("list", help="list scenarios")
    return p


def _make_pacer(spec: str, interval_minutes: int = 30):
    if spec == "compressed":
        return CompressedPacer()
    if spec.startswith("realtime"):
        factor = 1.0
        if ":" in spec:
            factor = float(spec.split(":", 1)[1])
        return RealtimePacer(interval_minutes=interval_minutes, factor=factor)
    raise SystemExit(f"unknown --pace {spec!r}")


def _make_scenario(args):
    cls = SCENARIOS[args.scenario]
    if cls is Bracket:
        return Bracket(fmt=args.fmt, participants=args.players)
    return cls()


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.cmd == "list":
        for name in sorted(SCENARIOS):
            print(f"{name:12s} {SCENARIOS[name].description}")
        return 0

    scenario = _make_scenario(args)
    pacer = _make_pacer(args.pace)

    def _run(base_url: str) -> int:
        runner = ScenarioRunner(scenario=scenario, base_url=base_url,
                                seed=args.seed, pacer=pacer, cleanup=args.cleanup)
        report = runner.run()
        print(report.render_text())
        if args.json_path:
            with open(args.json_path, "w", encoding="utf-8") as fh:
                fh.write(report.to_json())
            print(f"json report -> {args.json_path}")
        return 0 if report.ok else 1

    if args.ephemeral:
        from .server import EphemeralServer

        with EphemeralServer(log_to=args.server_log) as base_url:
            print(f"ephemeral backend up at {base_url}")
            return _run(base_url)
    return _run(args.base_url)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
