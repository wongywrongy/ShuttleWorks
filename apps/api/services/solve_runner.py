"""Spawn + supervise one solve subprocess (SP-CLOUD-1 Phase 2).

The runner is the only place a solve process is created. It owns the
three guarantees the in-process solve path never had:

- **Cancellation**: the supervisor polls ``cancel_check()`` and kills
  the child. (CP-SAT's cooperative CancelToken is only polled on
  solution callbacks, so a solve with no feasible solution can't be
  cancelled in-process — a kill always works.)
- **Outer safety kill**: the ONLY permitted use of wall-clock time
  (Rule 5c) — a hard deadline well above the solver's own budget, as a
  backstop against a hung child. On a healthy run it never binds.
- **Determinism**: comes from the engine itself (stable sorted iteration
  in the model build) plus the job's persisted solver params — not from
  the child's environment. The old ``PYTHONHASHSEED=0`` pin was removed
  in SP-CLOUD-3 once the underlying ordering bug was fixed.

Portable Popen only (no preexec_fn / start_new_session / creationflags)
— the same shape the simulator's EphemeralServer already uses on
Windows dev boxes and Linux workers.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

log = logging.getLogger("scheduler.solve_runner")

_BACKEND_DIR = Path(__file__).resolve().parent.parent

# How often the supervisor wakes to heartbeat + poll for cancellation.
_SUPERVISE_INTERVAL_SECONDS = 2.0
# Grace added to the solver's own wall-clock ceiling before the outer
# kill fires (covers interpreter startup, model build, result write).
_OUTER_KILL_GRACE_SECONDS = 60.0


@dataclass
class RunnerOutcome:
    """What happened to one solve subprocess.

    ``kind``:
    - ``ok``         — child wrote a result payload (may still be an
                       infeasible ScheduleDTO — the worker maps that).
    - ``error``      — child reported a deterministic solve error
                       (not retryable: same input reproduces it).
    - ``infra``      — child died without a well-formed output
                       (crash, OOM kill, hung → outer kill). Retryable.
    - ``cancelled``  — we killed it because ``cancel_check`` said so.
    """

    kind: str
    result: Optional[dict] = None
    error: Optional[dict] = None
    # Tail of the child's combined stdout/stderr (solver log when
    # ``params.log_progress`` is on — carries the model fingerprint the
    # determinism e2e asserts on).
    log_tail: str = ""


def _kill(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log.error("solve child pid=%s refused to die", proc.pid)


def run_solve_subprocess(
    params: dict,
    input_snapshot: dict,
    *,
    heartbeat: Optional[Callable[[], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
    backend_dir: Optional[Path] = None,
) -> RunnerOutcome:
    """Execute one solve in a child process; block until it resolves."""
    backend_dir = backend_dir or _BACKEND_DIR
    ceiling = float(params.get("wall_clock_ceiling_seconds", 300.0))
    deadline = time.monotonic() + ceiling + _OUTER_KILL_GRACE_SECONDS

    workdir = tempfile.mkdtemp(prefix="solve-job-")
    try:
        return _run_in_workdir(
            workdir,
            params,
            input_snapshot,
            backend_dir=backend_dir,
            ceiling=ceiling,
            deadline=deadline,
            heartbeat=heartbeat,
            cancel_check=cancel_check,
        )
    finally:
        # Windows can hold the child's log handle briefly after the kill
        # (same quirk the simulator documents); best-effort cleanup only.
        shutil.rmtree(workdir, ignore_errors=True)


def _run_in_workdir(
    workdir: str,
    params: dict,
    input_snapshot: dict,
    *,
    backend_dir: Path,
    ceiling: float,
    deadline: float,
    heartbeat: Optional[Callable[[], None]],
    cancel_check: Optional[Callable[[], bool]],
) -> RunnerOutcome:
    in_path = os.path.join(workdir, "input.json")
    out_path = os.path.join(workdir, "output.json")
    log_path = os.path.join(workdir, "child.log")
    with open(in_path, "w", encoding="utf-8") as f:
        json.dump({"params": params, "input_snapshot": input_snapshot}, f)

    env = dict(os.environ)
    # NOTE: no PYTHONHASHSEED pin. It used to be set here to mask
    # hash-ordered iteration in the engine's model build; SP-CLOUD-3
    # fixed that at source (``get_player_ids`` now sorts), so the build
    # is hash-seed independent and the pin would only hide a future
    # regression. Verified: six different hash seeds produce one
    # identical model fingerprint.
    # numpy (imported by ortools) initialises an OpenBLAS thread pool
    # sized to the host's cores; CP-SAT gains nothing from BLAS threads
    # and under the child's RLIMIT_AS cap the pool's per-thread stacks
    # can't even allocate (observed: pthread_create EAGAIN at import).
    env["OPENBLAS_NUM_THREADS"] = "1"

    with open(log_path, "w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [sys.executable, "-m", "services.solve_child", in_path, out_path],
            cwd=str(backend_dir),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
        try:
            while True:
                try:
                    proc.wait(timeout=_SUPERVISE_INTERVAL_SECONDS)
                    break  # child exited
                except subprocess.TimeoutExpired:
                    pass
                if heartbeat is not None:
                    heartbeat()
                if cancel_check is not None and cancel_check():
                    log.info("cancelling solve child pid=%s", proc.pid)
                    _kill(proc)
                    return RunnerOutcome(kind="cancelled", log_tail=_read_tail(log_path))
                if time.monotonic() > deadline:
                    log.error(
                        "solve child pid=%s exceeded outer wall-clock kill "
                        "(%.0fs ceiling + %.0fs grace)",
                        proc.pid,
                        ceiling,
                        _OUTER_KILL_GRACE_SECONDS,
                    )
                    _kill(proc)
                    return RunnerOutcome(
                        kind="infra",
                        error={
                            "code": "outer_kill",
                            "message": "solve exceeded the outer wall-clock ceiling",
                            "detail": {"ceiling_seconds": ceiling},
                        },
                        log_tail=_read_tail(log_path),
                    )
        except BaseException:
            # Worker shutdown / unexpected supervisor error: never leave
            # an orphaned CP-SAT process chewing a core.
            _kill(proc)
            raise

    tail = _read_tail(log_path)
    if not os.path.exists(out_path):
        return RunnerOutcome(
            kind="infra",
            error={
                "code": "child_died",
                "message": f"solve child exited {proc.returncode} without output",
                "detail": {"returncode": proc.returncode, "log_tail": tail[-4000:]},
            },
            log_tail=tail,
        )

    try:
        with open(out_path, encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return RunnerOutcome(
            kind="infra",
            error={
                "code": "bad_child_output",
                "message": f"unreadable child output: {exc}",
                "detail": {"returncode": proc.returncode},
            },
            log_tail=tail,
        )

    if payload.get("outcome") == "ok":
        return RunnerOutcome(kind="ok", result=payload["result"], log_tail=tail)
    return RunnerOutcome(
        kind="error",
        error=payload.get("error") or {"code": "unknown"},
        log_tail=tail,
    )


def _read_tail(path: str, max_chars: int = 65536) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()[-max_chars:]
    except OSError:
        return ""
