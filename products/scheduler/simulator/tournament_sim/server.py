"""EphemeralServer — boot an isolated backend for one simulation run.

Launches ``uvicorn app.main:app`` as a SUBPROCESS (never an import — the
HTTP-only boundary holds even here) with a fresh SQLite file in a temp
dir. The backend's lifespan runs Alembic ``upgrade head`` on startup, so
the schema self-provisions.

The subprocess runs with ``cwd=backend/``, so it reads ``backend/.env``
like any other local backend — a machine configured for ``AUTH_MODE=cloud``
gets an ephemeral server that requires real accounts too. ``ScenarioRunner``
handles both by asking ``/auth/me`` rather than assuming the bootstrap
identity is there.

Mirrors the health-poll pattern of ``e2e/global-setup.ts``.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

#: repo-relative location of the backend package (cwd for the subprocess)
_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class EphemeralServer:
    """Context manager: ``with EphemeralServer() as base_url: ...``"""

    def __init__(self, *, startup_timeout: float = 45.0, log_to: str | None = None):
        self.startup_timeout = startup_timeout
        self.log_to = log_to
        self.port: int | None = None
        self.base_url: str | None = None
        self._proc: subprocess.Popen | None = None
        self._tmpdir: str | None = None
        self._log_handle = None

    def __enter__(self) -> str:
        if not _BACKEND_DIR.is_dir():  # sanity — layout moved?
            raise RuntimeError(f"backend dir not found at {_BACKEND_DIR}")
        self.port = _free_port()
        self._tmpdir = tempfile.mkdtemp(prefix="tournament-sim-")
        db_path = Path(self._tmpdir) / "sim.db"
        env = {
            **os.environ,
            "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
            "BACKEND_DATA_DIR": self._tmpdir,
            "ENVIRONMENT": "local",
            "LOG_LEVEL": "warning",
        }
        stdout = subprocess.DEVNULL
        if self.log_to:
            self._log_handle = open(self.log_to, "w", encoding="utf-8")
            stdout = self._log_handle
        self._proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app",
             "--host", "127.0.0.1", "--port", str(self.port), "--log-level", "warning"],
            cwd=str(_BACKEND_DIR),
            env=env,
            stdout=stdout,
            stderr=subprocess.STDOUT,
        )
        self.base_url = f"http://127.0.0.1:{self.port}"
        self._wait_healthy()
        return self.base_url

    def _wait_healthy(self) -> None:
        deadline = time.monotonic() + self.startup_timeout
        last_err: Exception | None = None
        while time.monotonic() < deadline:
            if self._proc and self._proc.poll() is not None:
                raise RuntimeError(
                    f"ephemeral backend exited early (code {self._proc.returncode}); "
                    f"pass log_to=... to capture its output"
                )
            try:
                resp = httpx.get(f"{self.base_url}/health", timeout=2.0)
                if resp.status_code == 200:
                    return
            except httpx.HTTPError as exc:
                last_err = exc
            time.sleep(0.4)
        self.__exit__(None, None, None)
        raise RuntimeError(f"ephemeral backend not healthy after {self.startup_timeout}s: {last_err}")

    def __exit__(self, *exc_info) -> None:
        if self._proc is not None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait(timeout=5)
            self._proc = None
        if self._log_handle is not None:
            self._log_handle.close()
            self._log_handle = None
        if self._tmpdir:
            # Windows: SQLite/WAL handles can linger briefly after kill.
            for attempt in range(3):
                try:
                    shutil.rmtree(self._tmpdir)
                    break
                except OSError:
                    time.sleep(0.5 * (attempt + 1))
            else:
                print(f"warning: could not remove temp dir {self._tmpdir}", file=sys.stderr)
            self._tmpdir = None
