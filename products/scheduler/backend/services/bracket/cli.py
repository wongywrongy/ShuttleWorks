"""CLI entry point for the tournament prototype.

Usage:
    python -m tournament.cli demo --format se --players 32 --courts 4
    python -m tournament.cli demo --format rr --players 6 --courts 2
    python -m tournament.cli plan tournament.json > schedule.json

The `demo` subcommand is the smoke test: it generates a draw, schedules
one round, fakes results (top seed always wins for SE), and continues
until no more rounds remain.

The `plan` subcommand reads a JSON tournament definition and produces
a schedule for the first ready round. For repeated scheduling (after
recording real-world results), call it with the updated state.

JSON shape (for `plan`):

    {
      "format": "se" | "rr",
      "rounds": 1,                 // RR only; default 1
      "duration_slots": 1,
      "courts": 4,
      "total_slots": 100,
      "rest_between_rounds": 1,
      "participants": [
        {"id": "p1", "name": "Alice"},
        ...
      ],
      "results": [                 // optional, skipped on first plan
        {"play_unit_id": "M-R0-0", "winner_side": "A",
         "finished_at_slot": 2}
      ]
    }
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from typing import Iterable, List

from scheduler_core.domain.models import ScheduleConfig, SolverOptions
from scheduler_core.domain.tournament import (
    Participant,
    TournamentState,
    WinnerSide,
)

from .advancement import record_result
from .draw import Draw
from .formats import (
    generate_round_robin,
    generate_single_elimination,
)
from .scheduler import TournamentDriver
from .state import register_draw


def _make_demo_participants(n: int) -> List[Participant]:
    return [Participant(id=f"P{i+1}", name=f"Player {i+1}") for i in range(n)]


def _build_draw(args: argparse.Namespace, participants: List[Participant]) -> Draw:
    if args.format == "se":
        return generate_single_elimination(
            participants, duration_slots=args.duration_slots
        )
    if args.format == "rr":
        return generate_round_robin(
            participants,
            rounds=args.rr_rounds,
            duration_slots=args.duration_slots,
        )
    raise ValueError(f"unknown format {args.format!r}")


def _print_round(round_index: int, driver: TournamentDriver) -> None:
    print(f"--- Round {round_index} ---")
    for pu_id, a in sorted(driver.state.assignments.items()):
        if a.actual_start_slot != a.slot_id:
            continue
        pu = driver.state.play_units[pu_id]
        side_a = "/".join(pu.side_a or [])
        side_b = "/".join(pu.side_b or [])
        print(
            f"  {pu_id:12} slot={a.slot_id:3} court={a.court_id} "
            f"dur={a.duration_slots}  {side_a} vs {side_b}"
        )


def _cmd_demo(args: argparse.Namespace) -> int:
    participants = _make_demo_participants(args.players)
    draw = _build_draw(args, participants)
    state = TournamentState()
    register_draw(state, draw)

    config = ScheduleConfig(
        total_slots=args.total_slots,
        court_count=args.courts,
        interval_minutes=args.slot_minutes,
    )
    driver = TournamentDriver(
        state=state,
        config=config,
        solver_options=SolverOptions(time_limit_seconds=args.time_limit),
        rest_between_rounds=args.rest,
    )

    print(
        f"Format={args.format} participants={args.players} courts={args.courts} "
        f"slot={args.slot_minutes}min duration={args.duration_slots}"
    )

    round_index = 0
    while True:
        prev_count = len(state.assignments)
        result = driver.schedule_next_round()
        if result.empty:
            print("No more ready play units.")
            break
        if not result.scheduled:
            print(f"Round {round_index} INFEASIBLE: status={result.status.value}")
            for r in result.schedule_result.infeasible_reasons:
                print(f"  - {r}")
            return 2

        new_assignments = [
            (pu_id, a)
            for pu_id, a in state.assignments.items()
            if pu_id in result.play_unit_ids
        ]
        print(f"--- Round {round_index} (current_slot={result.started_at_current_slot}) ---")
        for pu_id, a in sorted(new_assignments, key=lambda x: x[1].slot_id):
            pu = state.play_units[pu_id]
            side_a = "/".join(pu.side_a or [])
            side_b = "/".join(pu.side_b or [])
            print(
                f"  {pu_id:14} slot={a.slot_id:3} court={a.court_id} "
                f"dur={a.duration_slots}  {side_a} vs {side_b}"
            )

        # Fake results so SE can advance. For RR we don't need to
        # advance — all matches were scheduled in the first solve.
        if args.format == "se":
            for pu_id, a in new_assignments:
                pu = state.play_units[pu_id]
                # Top-seed wins (lowest "P" number we can find on either side).
                winner = _top_seed_winner(pu)
                record_result(
                    state,
                    draw,
                    pu_id,
                    winner,
                    finished_at_slot=a.slot_id + a.duration_slots,
                )

        round_index += 1
        if len(state.assignments) == prev_count:
            break  # no progress

    print(f"\nFinal: {len(state.assignments)} matches scheduled, "
          f"{len(state.results)} results recorded.")
    return 0


def _top_seed_winner(pu) -> WinnerSide:
    """Return whichever side has the participant id with the lowest seed.

    Demo helper. Real tournaments record real results.
    """
    a = pu.side_a[0] if pu.side_a else None
    b = pu.side_b[0] if pu.side_b else None
    if a is None and b is None:
        return WinnerSide.NONE
    if a is None:
        return WinnerSide.B
    if b is None:
        return WinnerSide.A
    # P1 > P2 > P3 ... (top seed = P with smallest number).
    a_n = _player_seed_number(a)
    b_n = _player_seed_number(b)
    return WinnerSide.A if a_n <= b_n else WinnerSide.B


def _player_seed_number(pid: str) -> int:
    if pid.startswith("P"):
        try:
            return int(pid[1:])
        except ValueError:
            pass
    return 9999


def _cmd_plan(args: argparse.Namespace) -> int:
    payload = json.loads(open(args.tournament_file).read())
    participants = [
        Participant(id=p["id"], name=p["name"])
        for p in payload["participants"]
    ]
    fmt = payload.get("format", "se")
    rounds = payload.get("rounds", 1)
    duration_slots = payload.get("duration_slots", 1)
    courts = payload["courts"]
    total_slots = payload["total_slots"]
    rest_between_rounds = payload.get("rest_between_rounds", 1)

    if fmt == "se":
        draw = generate_single_elimination(
            participants, duration_slots=duration_slots
        )
    else:
        draw = generate_round_robin(
            participants, rounds=rounds, duration_slots=duration_slots
        )

    state = TournamentState()
    register_draw(state, draw)

    for r in payload.get("results", []):
        record_result(
            state,
            draw,
            r["play_unit_id"],
            WinnerSide(r["winner_side"]),
            finished_at_slot=r.get("finished_at_slot"),
            walkover=r.get("walkover", False),
        )

    config = ScheduleConfig(total_slots=total_slots, court_count=courts)
    driver = TournamentDriver(
        state=state,
        config=config,
        rest_between_rounds=rest_between_rounds,
    )
    result = driver.schedule_next_round()
    output = {
        "status": result.status.value,
        "round_play_unit_ids": result.play_unit_ids,
        "current_slot": result.started_at_current_slot,
        "assignments": [
            {
                "play_unit_id": a.play_unit_id,
                "slot_id": a.slot_id,
                "court_id": a.court_id,
                "duration_slots": a.duration_slots,
            }
            for a in state.assignments.values()
            if a.play_unit_id in result.play_unit_ids
        ],
    }
    json.dump(output, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tournament")
    sub = parser.add_subparsers(dest="cmd", required=True)

    demo = sub.add_parser("demo", help="run an end-to-end demo")
    demo.add_argument("--format", choices=("se", "rr"), default="se")
    demo.add_argument("--players", type=int, default=8)
    demo.add_argument("--courts", type=int, default=2)
    demo.add_argument("--total-slots", type=int, default=128)
    demo.add_argument("--slot-minutes", type=int, default=30)
    demo.add_argument("--duration-slots", type=int, default=1)
    demo.add_argument("--rr-rounds", type=int, default=1)
    demo.add_argument("--rest", type=int, default=1)
    demo.add_argument("--time-limit", type=float, default=5.0)
    demo.set_defaults(func=_cmd_demo)

    plan = sub.add_parser("plan", help="schedule next round from JSON")
    plan.add_argument("tournament_file")
    plan.set_defaults(func=_cmd_plan)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
