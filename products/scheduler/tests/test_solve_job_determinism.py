"""End-to-end determinism through the FULL job path (SP-CLOUD-1 Rule 5).

A small real tournament input, solved twice via enqueue → worker →
subprocess (real CP-SAT, real ``PYTHONHASHSEED=0`` child env), must
produce byte-identical serialized schedules and identical CP-SAT model
fingerprints in the solver logs. This is the gate on decisions C1/C2:
deterministic-time budget + pinned hash seed + single search worker.

Spawns two real interpreter subprocesses (~10 s total).
"""
from __future__ import annotations

import hashlib
import json
import re
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, SolveJob, Tournament
from services import solve_jobs
from services.solve_runner import run_solve_subprocess
from services.solve_worker import SolveWorker

SETTINGS = SimpleNamespace(
    job_poll_interval_seconds=0.01,
    job_lease_seconds=60.0,
    job_retention_days=30,
    solve_memory_limit_mb=0,  # unenforceable on Windows dev; 0 = off
)

PARAMS = {
    "random_seed": 42,
    "num_workers": 1,
    "deterministic": True,
    "max_deterministic_time": 5.0,
    "wall_clock_ceiling_seconds": 30.0,
    "candidate_pool_size": 0,
    "log_progress": True,  # fingerprints only appear in the solver log
}

INPUT_SNAPSHOT = {
    "config": {
        "intervalMinutes": 30,
        "dayStart": "09:00",
        "dayEnd": "13:00",
        "breaks": [],
        "courtCount": 2,
        "defaultRestMinutes": 30,
        "freezeHorizonSlots": 0,
    },
    "players": [
        {
            "id": f"p{i}",
            "name": f"P{i}",
            "groupId": "g1",
            "availability": [],
            "ranks": [],
            "minRestMinutes": None,
            "notes": None,
        }
        for i in range(6)
    ],
    "matches": [
        {
            "id": f"m{i}",
            "eventRank": "MS",
            "sideA": [f"p{i % 6}"],
            "sideB": [f"p{(i + 1) % 6}"],
            "durationSlots": 1,
            "matchType": "dual",
            "matchNumber": i + 1,
            "sideC": None,
        }
        for i in range(6)
    ],
}

_FINGERPRINT_RE = re.compile(r"model_fingerprint: (0x[0-9a-f]+)")


def _run_one_job_through_the_full_path(captured: list):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )

    def capturing_runner(params, input_snapshot, **kwargs):
        outcome = run_solve_subprocess(params, input_snapshot, **kwargs)
        captured.append(outcome)
        return outcome

    s = Session()
    t = Tournament(name="determinism-e2e")
    s.add(t)
    s.commit()
    job, _ = solve_jobs.enqueue(
        s,
        tournament_id=t.id,
        type_=solve_jobs.MEET_SCHEDULE_SOLVE,
        params=PARAMS,
        input_snapshot=INPUT_SNAPSHOT,
    )
    s.commit()
    job_id = job.id
    s.close()

    worker = SolveWorker(
        settings=SETTINGS, session_factory=Session, runner=capturing_runner
    )
    assert worker.run_once() is True

    s = Session()
    job = s.get(SolveJob, job_id)
    assert job.status == "succeeded", (job.status, job.error)
    result = job.result
    s.close()
    engine.dispose()
    return result


def test_double_solve_is_byte_identical_with_matching_fingerprints():
    captured: list = []
    result_a = _run_one_job_through_the_full_path(captured)
    result_b = _run_one_job_through_the_full_path(captured)

    canon_a = json.dumps(result_a, sort_keys=True).encode()
    canon_b = json.dumps(result_b, sort_keys=True).encode()
    assert hashlib.sha256(canon_a).hexdigest() == hashlib.sha256(canon_b).hexdigest()
    assert result_a["status"] in ("optimal", "feasible")
    assert len(result_a["assignments"]) == 6

    prints_a = _FINGERPRINT_RE.findall(captured[0].log_tail)
    prints_b = _FINGERPRINT_RE.findall(captured[1].log_tail)
    assert prints_a, "solver log carried no model fingerprint — is log_progress on?"
    assert prints_a == prints_b


def test_result_reports_solver_seed():
    """The stored result must carry the seed so an operator can
    reproduce a schedule from the job record alone."""
    captured: list = []
    result = _run_one_job_through_the_full_path(captured)
    assert result["solverSeed"] == 42
