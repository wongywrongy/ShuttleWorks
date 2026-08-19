"""A-vs-B court-encoding benchmark for SP-COURT-1 §3.

**Not a test.** It is deliberately outside pytest collection (`testpaths =
["tests"]` in the root pyproject, and the filename does not match
`python_files`) and is wired into no CI gate. Run it by hand when the §3
numbers need re-confirming, or when the OR-Tools pin moves.

    python packages/scheduler-core/benchmarks/bench_court_encoding.py
    python packages/scheduler-core/benchmarks/bench_court_encoding.py 150 8

**A** = today's encoding: one interval per match, plus one *optional*
interval per (match, court), plus ``AddNoOverlap`` per court.
**B** = court-agnostic: one interval per match and a single
``AddCumulative(capacity=court_count)``.

Both models get identical player-conflict constraints and the same
objective (minimise makespan), so the comparison is encoding-only.

B emits no court identity, so the run also performs the greedy left-edge
colouring Phase 2 depends on and **validates** it: at most ``courts``
colours used, and zero overlaps within any one colour. A benchmark that
reported B as faster without proving B's solution is realisable on a real
floor would be measuring the wrong thing.
"""
from __future__ import annotations

import random
import sys
import time
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

# (matches, courts) — the five sizes SP-COURT-1 §3 tabulates.
SIZES: List[Tuple[int, int]] = [(40, 4), (80, 6), (150, 8), (300, 12), (600, 16)]
TIME_LIMIT_S = 10.0
SEED = 20260819


def build_instance(matches: int, courts: int, seed: int = SEED):
    """Synthetic instance: durations of 1-2 slots, two players per match
    drawn from a pool half the size of the draw (~4 matches per player, so
    player conflicts are real but court capacity is the binding constraint —
    the shape of a real meet)."""
    rng = random.Random(seed)
    pool = max(4, matches // 2)
    durations = [rng.choice((1, 1, 1, 2)) for _ in range(matches)]
    players = [tuple(rng.sample(range(pool), 2)) for _ in range(matches)]
    horizon = sum(durations)
    return durations, players, horizon, courts


def _common(model: cp_model.CpModel, durations, players, horizon):
    """Starts, per-match intervals, player no-overlap, makespan objective —
    identical in both encodings."""
    n = len(durations)
    starts = [model.NewIntVar(0, horizon, f"s{i}") for i in range(n)]
    ends = [model.NewIntVar(0, horizon, f"e{i}") for i in range(n)]
    intervals = [
        model.NewIntervalVar(starts[i], durations[i], ends[i], f"iv{i}")
        for i in range(n)
    ]

    by_player: Dict[int, List[int]] = {}
    for i, pair in enumerate(players):
        for p in pair:
            by_player.setdefault(p, []).append(i)
    for idxs in by_player.values():
        if len(idxs) > 1:
            model.AddNoOverlap([intervals[i] for i in idxs])

    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, ends)
    model.Minimize(makespan)
    return starts, intervals, makespan


def solve_a(durations, players, horizon, courts):
    """Explicit court choice: optional interval per (match, court)."""
    model = cp_model.CpModel()
    starts, _intervals, makespan = _common(model, durations, players, horizon)
    n = len(durations)

    per_court: Dict[int, List] = {c: [] for c in range(courts)}
    for i in range(n):
        lits = []
        for c in range(courts):
            lit = model.NewBoolVar(f"on{i}_{c}")
            lits.append(lit)
            end = model.NewIntVar(0, horizon, f"e{i}_{c}")
            model.Add(end == starts[i] + durations[i]).OnlyEnforceIf(lit)
            per_court[c].append(
                model.NewOptionalIntervalVar(
                    starts[i], durations[i], end, lit, f"oiv{i}_{c}"
                )
            )
        model.AddExactlyOne(lits)
    for c in range(courts):
        model.AddNoOverlap(per_court[c])

    return _run(model, starts, makespan)


def solve_b(durations, players, horizon, courts):
    """Court-agnostic: one cumulative of capacity = court count."""
    model = cp_model.CpModel()
    starts, intervals, makespan = _common(model, durations, players, horizon)
    model.AddCumulative(intervals, [1] * len(intervals), courts)
    return _run(model, starts, makespan)


def _run(model, starts, makespan):
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = TIME_LIMIT_S
    solver.parameters.num_workers = 8
    t0 = time.perf_counter()
    status = solver.Solve(model)
    elapsed = time.perf_counter() - t0
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(f"no solution: {solver.StatusName(status)}")
    proto = model.Proto()
    return {
        "seconds": elapsed,
        "makespan": solver.Value(makespan),
        "starts": [solver.Value(s) for s in starts],
        "constraints": len(proto.constraints),
        "variables": len(proto.variables),
        "optimal": status == cp_model.OPTIMAL,
    }


def colour_left_edge(starts: List[int], durations: List[int]) -> List[int]:
    """Greedy left-edge colouring: sweep matches by start time and give each
    the lowest-numbered court whose previous match has already finished.

    On an interval graph this is optimal — the number of colours it uses
    equals the maximum overlap — which is why ``AddCumulative(capacity=C)``
    is sufficient to guarantee a C-court timetable exists."""
    order = sorted(range(len(starts)), key=lambda i: (starts[i], i))
    free_at: List[int] = []          # free_at[c] = when court c next frees
    colour = [0] * len(starts)
    for i in order:
        for c, t in enumerate(free_at):
            if t <= starts[i]:
                colour[i] = c
                free_at[c] = starts[i] + durations[i]
                break
        else:
            colour[i] = len(free_at)
            free_at.append(starts[i] + durations[i])
    return colour


def validate_colouring(colour, starts, durations, courts) -> int:
    """Assert the colouring is a legal timetable. Returns courts used."""
    used = max(colour) + 1
    assert used <= courts, f"colouring used {used} courts, only {courts} exist"
    by_court: Dict[int, List[Tuple[int, int]]] = {}
    for i, c in enumerate(colour):
        by_court.setdefault(c, []).append((starts[i], starts[i] + durations[i]))
    for c, spans in by_court.items():
        spans.sort()
        for (_, prev_end), (nxt_start, _) in zip(spans, spans[1:]):
            assert prev_end <= nxt_start, f"overlap on court {c}"
    return used


def main(sizes: List[Tuple[int, int]]) -> int:
    # Plain ASCII: this prints to a Windows console under cp1252.
    print(f"OR-Tools scheduling - A (explicit court) vs B (cumulative), seed {SEED}\n")
    print("| Matches / courts | A explicit-court | B cumulative | Speedup | Makespan | Colouring |")
    print("| --- | --- | --- | --- | --- | --- |")
    failures = 0
    for matches, courts in sizes:
        durations, players, horizon, courts = build_instance(matches, courts)
        a = solve_a(durations, players, horizon, courts)
        b = solve_b(durations, players, horizon, courts)

        t0 = time.perf_counter()
        colour = colour_left_edge(b["starts"], durations)
        colour_ms = (time.perf_counter() - t0) * 1000
        try:
            used = validate_colouring(colour, b["starts"], durations, courts)
            check = f"OK, {used}/{courts} courts, {colour_ms:.2f} ms"
        except AssertionError as exc:      # a real failure, not a slow run
            check = f"**FAILED** — {exc}"
            failures += 1

        same = "equal" if a["makespan"] == b["makespan"] else f'A={a["makespan"]} B={b["makespan"]}'
        speed = a["seconds"] / b["seconds"] if b["seconds"] else float("inf")
        print(
            f'| {matches} / {courts} | {a["seconds"]:.3f} s | {b["seconds"]:.3f} s '
            f"| {speed:.0f}x | {same} | {check} |"
        )
        print(
            f'|   model size |  {a["constraints"]} constraints, {a["variables"]} vars '
            f'| {b["constraints"]} constraints, {b["variables"]} vars | | | |'
        )
    return 1 if failures else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    chosen = [(int(args[0]), int(args[1]))] if len(args) == 2 else SIZES
    raise SystemExit(main(chosen))
