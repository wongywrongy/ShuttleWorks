"""CLI — ``python -m tournament_sim run|seed|list ...``

Examples:
    python -m tournament_sim run --scenario small-meet --seed 42 --base-url http://localhost:8600
    python -m tournament_sim run --scenario bracket --format double_elimination --ephemeral
    python -m tournament_sim run --scenario full-meet --pace realtime:10
    python -m tournament_sim list
    python -m tournament_sim seed preview data/bwf-finals.txt
    python -m tournament_sim seed apply data/bwf-finals.txt --seed-key bwf-recent
"""

from __future__ import annotations

import argparse
import sys

from .runner import CompressedPacer, RealtimePacer, ScenarioRunner
from .scenarios import FORMATS, SCENARIOS, Bracket

DEFAULT_BASE_URL = "http://localhost:8600"


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="tournament_sim",
        description="ShuttleWorks full-tournament workflow simulator (internal dev tool)",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run one scenario")
    run.add_argument("--scenario", default="small-meet", choices=sorted(SCENARIOS))
    run.add_argument("--seed", type=int, default=42)
    group = run.add_mutually_exclusive_group()
    group.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"target backend (default {DEFAULT_BASE_URL}; use http://localhost:8000 for the Docker stack)",
    )
    group.add_argument(
        "--ephemeral",
        action="store_true",
        help="boot an isolated backend (fresh sqlite, free port) for this run and tear it down after",
    )
    run.add_argument(
        "--format",
        dest="fmt",
        default="se",
        choices=FORMATS,
        help="draw format for the bracket scenario",
    )
    run.add_argument("--players", type=int, default=16, help="participants per bracket event")
    run.add_argument(
        "--pace",
        default="compressed",
        help='"compressed" (default) or "realtime[:factor]" — e.g. realtime:10 plays 10x speed',
    )
    run.add_argument(
        "--json", dest="json_path", default=None, help="also write the report as JSON to this path"
    )
    run.add_argument(
        "--cleanup",
        action="store_true",
        help="DELETE the tournament after the run (default keeps it for UI inspection)",
    )
    run.add_argument(
        "--server-log", default=None, help="capture the ephemeral backend's output to this file"
    )

    sub.add_parser("list", help="list scenarios")

    seed = sub.add_parser("seed", help="inspect or apply a source dataset")
    seed_sub = seed.add_subparsers(dest="seed_cmd", required=True)
    for command in ("preview", "apply", "status", "reset", "resume"):
        command_parser = seed_sub.add_parser(command)
        if command in {"preview", "apply", "resume"}:
            command_parser.add_argument("path", help="UTF-8 pipe-delimited source file")
            command_parser.add_argument(
                "--notes",
                help="optional UTF-8 TNOTE companion, strictly reconciled with the source",
            )
            command_parser.add_argument(
                "--source-map",
                default="simulator/fixtures/bwf-full-match-sources.json",
                help="versioned provenance map for optional full-match sources",
            )
            command_parser.add_argument(
                "--match-data",
                help="local matches.csv from SahilMotyar/bwf-match-data (not vendored)",
            )
            command_parser.add_argument(
                "--daily-results",
                action="append",
                default=[],
                metavar="TID=HTML",
                help="cached daily-results page; repeat for T027 and T028",
            )
        if command in {"apply", "resume", "status", "reset"}:
            command_parser.add_argument("--seed-key", required=True)
        if command in {"apply", "resume"}:
            command_parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
            command_parser.add_argument("--run-dir", default=".local-testing/demo/data/import-runs")
            command_parser.add_argument("--replace", action="store_true")
        if command in {"status", "reset"}:
            command_parser.add_argument("--run-dir", default=".local-testing/demo/data/import-runs")
        if command == "reset":
            command_parser.add_argument("--confirm", required=True)
            command_parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
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

    if args.cmd == "seed":
        import json
        from pathlib import Path
        from .seed import attach_historical_sources, apply, load_file, preview, reset, status

        def load_dataset():
            dataset = load_file(args.path, args.notes)
            daily_paths = {}
            for item in args.daily_results:
                if "=" not in item:
                    raise SystemExit("--daily-results must use TID=HTML")
                tournament_id, html_path = item.split("=", 1)
                if tournament_id in daily_paths:
                    raise SystemExit(f"duplicate --daily-results for {tournament_id}")
                daily_paths[tournament_id] = html_path
            if args.match_data or daily_paths:
                attach_historical_sources(
                    dataset,
                    source_map_path=args.source_map,
                    match_data_path=args.match_data,
                    daily_results_paths=daily_paths,
                )
            return dataset

        if args.seed_cmd == "status":
            output = status(seed_key=args.seed_key, run_dir=Path(args.run_dir))
        elif args.seed_cmd == "preview":
            output = preview(load_dataset())
        else:
            from .client import SimClient

            client = SimClient(args.base_url)
            try:
                if args.seed_cmd == "reset":
                    output = reset(
                        seed_key=args.seed_key,
                        client=client,
                        run_dir=Path(args.run_dir),
                        confirm=args.confirm,
                    )
                else:
                    dataset = load_dataset()
                    output = apply(
                        dataset,
                        client,
                        seed_key=args.seed_key,
                        run_dir=Path(args.run_dir),
                        replace=args.replace,
                    )
            finally:
                client.close()
        print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if args.cmd == "list":
        for name in sorted(SCENARIOS):
            print(f"{name:12s} {SCENARIOS[name].description}")
        return 0

    scenario = _make_scenario(args)
    pacer = _make_pacer(args.pace)

    def _run(base_url: str) -> int:
        runner = ScenarioRunner(
            scenario=scenario, base_url=base_url, seed=args.seed, pacer=pacer, cleanup=args.cleanup
        )
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
