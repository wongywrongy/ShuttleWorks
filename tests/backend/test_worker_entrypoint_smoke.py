"""The standalone worker entry point actually boots under the cloud profile.

Everything else about the worker is unit-tested in-process: the claim
loop, the lease guards, the config validator's worker branch. None of
that exercises ``python -m worker`` as a *process*, which is the only
form the cloud and self-host topologies ever run it in
(``EMBEDDED_WORKER=false`` + a worker container).

The gap that leaves is specific and has bitten before. ``worker.py``
must set ``PROCESS_ROLE`` before anything imports ``app.config``,
because that module runs the cloud validator at import time. A unit test
pins the *source order* by reading the file; only starting the real
process proves the ordering holds once Python's import machinery, the
package layout, and the container's working directory are all involved.
Get it wrong and a worker-only host dies at startup demanding SMTP
credentials it will never read.

Requires ``TEST_POSTGRES_URL`` — the worker refuses SQLite in cloud mode
by design (SQLite is per-process; a worker on it would poll an empty
queue forever while jobs pile up elsewhere), so there is nothing to
smoke without a real Postgres. CI's backend job already provides one.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="TEST_POSTGRES_URL not set (the worker refuses SQLite in cloud mode)",
)

BACKEND_DIR = Path(__file__).resolve().parents[2] / "apps" / "api"
BOOT_DEADLINE_SECONDS = 60.0
STARTUP_MARKER = "solve worker up"


@pytest.fixture
def schema():
    """Create the schema the worker waits for.

    Workers never migrate — the API owns the schema exactly once — so
    ``python -m worker`` blocks until ``solve_jobs`` exists. Standing in
    for the API here is what lets this test reach the startup path.
    """
    sys.path.insert(0, str(BACKEND_DIR))
    from sqlalchemy import create_engine

    from database.models import Base
    from database.session import normalize_database_url

    engine = create_engine(normalize_database_url(POSTGRES_URL), future=True)
    Base.metadata.create_all(engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_standalone_worker_boots_under_the_cloud_profile(schema, tmp_path):
    """Start the real entry point, as a real process, and watch it come up."""
    log_path = tmp_path / "worker.log"
    env = {
        **os.environ,
        "ENVIRONMENT": "cloud",
        "DATABASE_URL": POSTGRES_URL,
        "LOG_LEVEL": "info",
        "JOB_POLL_INTERVAL_SECONDS": "0.1",
        "WORKER_ID": "smoke-worker",
        # Deliberately NOT set: AUTH_MODE, SESSION_COOKIE_SECURE,
        # EMAIL_BACKEND, SMTP_HOST, OPS_TOKEN. A worker reads none of
        # them, and the whole point of the role-aware validator is that
        # it must boot without them. If this test ever starts needing
        # one, the validator has regressed into demanding API config
        # from a process that serves no HTTP.
        "PYTHONUNBUFFERED": "1",
    }
    env.pop("PROCESS_ROLE", None)  # worker.py must set it itself

    with log_path.open("w", encoding="utf-8") as sink:
        proc = subprocess.Popen(
            [sys.executable, "-m", "worker"],
            cwd=str(BACKEND_DIR),
            env=env,
            stdout=sink,
            stderr=subprocess.STDOUT,
        )

    try:
        deadline = time.monotonic() + BOOT_DEADLINE_SECONDS
        booted = False
        while time.monotonic() < deadline:
            output = log_path.read_text(encoding="utf-8", errors="replace")
            if STARTUP_MARKER in output:
                booted = True
                break
            if proc.poll() is not None:
                pytest.fail(
                    f"worker exited early with code {proc.returncode}:\n{output}"
                )
            time.sleep(0.25)

        output = log_path.read_text(encoding="utf-8", errors="replace")
        assert booted, (
            f"worker never logged {STARTUP_MARKER!r} within "
            f"{BOOT_DEADLINE_SECONDS}s:\n{output}"
        )
        assert "Traceback" not in output, f"worker logged a traceback:\n{output}"
        # The credential-scrubbing in the startup line: the log prints
        # only the part after '@', so a password in DATABASE_URL never
        # reaches the log stream.
        assert "smoke-worker" in output
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:  # pragma: no cover - defensive
            proc.kill()
            proc.wait(timeout=15)
