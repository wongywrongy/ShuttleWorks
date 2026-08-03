"""Solve subprocess entry — runs ONE CP-SAT solve and exits.

Invoked by the worker runner as::

    python -m services.solve_child <input.json> <output.json>

with ``cwd=backend/`` so package imports resolve. The input file holds
``{"params": …, "input_snapshot": …}`` straight from the job record;
the output file receives ``{"outcome": "ok", "result": <ScheduleDTO>}``
or ``{"outcome": "error", "error": {…}}``. The parent treats a missing
/ unparseable output file or a nonzero exit as an infrastructure
failure (retryable); a well-formed ``error`` outcome is a deterministic
solve error (not retryable — rerunning the same input reproduces it).

Subprocess isolation is what makes cancellation (parent kills the
process) and the memory guard possible — CP-SAT cannot be preempted
in-process. Determinism invariants enforced here:

- The parent launches this process with ``PYTHONHASHSEED=0`` so set/dict
  iteration order feeding model construction is identical on every
  host (Phase 0 measured: unpinned hash seeds change the CP-SAT model
  fingerprint AND the resulting schedule). Refuse to run otherwise.
- Solver options come exclusively from the job's persisted ``params``
  — never from live settings — so a re-run reproduces the original.
"""
from __future__ import annotations

import json
import os
import sys


def _apply_memory_limit(limit_mb: int) -> None:
    """Cap the child's address space (Linux only — the platform workers
    deploy on). On Windows dev boxes ``resource`` doesn't exist; we log
    to stderr and continue unguarded."""
    if limit_mb <= 0:
        return
    try:
        import resource
    except ImportError:
        print(
            f"solve_child: no resource module on {sys.platform}; "
            f"memory limit {limit_mb}MB not enforced",
            file=sys.stderr,
        )
        return
    limit_bytes = limit_mb * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))


def _solve(params: dict, input_snapshot: dict) -> dict:
    # Imports deferred until after the hash-seed check so a misconfigured
    # launch can't even build a model.
    from api.schedule import GenerateScheduleRequest, _merge_closed_windows
    from adapters.badminton import (
        candidate_pool_size_for,
        prepare_solver_input,
        result_to_dto,
    )
    from scheduler_core.domain.models import ScheduleRequest, SolverOptions
    from scheduler_core.schedule import schedule as solve_schedule

    request = GenerateScheduleRequest.model_validate(input_snapshot)
    schedule_config, players, matches, previous_assignments = prepare_solver_input(
        request.config, request.players, request.matches, request.previousAssignments
    )
    schedule_config = _merge_closed_windows(schedule_config, request.closedCourtWindows)

    solver_options = SolverOptions(
        time_limit_seconds=float(params["wall_clock_ceiling_seconds"]),
        num_workers=int(params.get("num_workers", 1)),
        random_seed=int(params.get("random_seed", 42)),
        deterministic=bool(params.get("deterministic", True)),
        max_deterministic_time=params.get("max_deterministic_time"),
        log_progress=bool(params.get("log_progress", False)),
    )
    solver_request = ScheduleRequest(
        config=schedule_config,
        players=players,
        matches=matches,
        previous_assignments=previous_assignments,
        solver_options=solver_options,
    )
    pool_size = params.get("candidate_pool_size")
    if pool_size is None:
        pool_size = candidate_pool_size_for(request.config)
    result = solve_schedule(
        solver_request, options=solver_options, candidate_pool_size=int(pool_size)
    )
    dto = result_to_dto(result)
    return dto.model_dump(mode="json")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: python -m services.solve_child <in.json> <out.json>", file=sys.stderr)
        return 2
    if os.environ.get("PYTHONHASHSEED") != "0":
        # Rule 5(d): unpinned hash seeds make the model build (and the
        # schedule) vary per process. This is a launch bug, not a solve
        # error — fail loudly as an infra failure.
        print("solve_child: PYTHONHASHSEED must be pinned to 0", file=sys.stderr)
        return 3

    in_path, out_path = argv[1], argv[2]
    with open(in_path, encoding="utf-8") as f:
        payload = json.load(f)
    params = payload["params"]
    input_snapshot = payload["input_snapshot"]

    _apply_memory_limit(int(params.get("memory_limit_mb", 0)))

    try:
        result = _solve(params, input_snapshot)
        outcome = {"outcome": "ok", "result": result}
    except MemoryError:
        # Let the rlimit kill path stay an infra failure: no output file.
        raise
    except Exception as exc:  # deterministic solve/build error
        import traceback

        outcome = {
            "outcome": "error",
            "error": {
                "code": "solve_error",
                "message": f"{type(exc).__name__}: {exc}",
                "detail": {"traceback": traceback.format_exc(limit=20)},
            },
        }

    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(outcome, f)
    os.replace(tmp_path, out_path)  # atomic: parent never reads a torn file
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
