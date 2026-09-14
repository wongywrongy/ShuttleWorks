"""Credential-bearing text is removed from actual text-log output."""
import logging
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

from core.log_redaction import RedactingFormatter, redact_credentials


@pytest.mark.parametrize("text", [
    "GET /api/display/sentinel-secret/state HTTP/1.1",
    "GET /invites/sentinel-secret/accept HTTP/1.1",
    "GET /e/partner/sentinel-secret HTTP/1.1",
    "GET /partners/sentinel-secret HTTP/1.1",
    "GET /api%2Finvites%2Fsentinel-secret HTTP/1.1",
    "GET /health?%74oken=sentinel-secret&sort=asc HTTP/1.1",
    "Authorization: Bearer sentinel-secret",
    "postgresql://account:sentinel-secret@db/database",
    "Cookie: sw_session=other; sw_entrant_session=sentinel-secret",
    '{"reset_token": "sentinel-secret"}',
    "password='sentinel-secret'",
])
def test_known_credential_surfaces_are_redacted(text):
    safe = redact_credentials(text)
    assert "sentinel-secret" not in safe
    assert "[redacted]" in safe


def test_traceback_is_redacted_without_mutating_the_record():
    url = "/display/sentinel-secret/summary"
    try:
        raise ValueError(url)
    except ValueError:
        record = logging.LogRecord("scheduler.test", logging.ERROR, __file__, 1, "request failed", (), sys.exc_info())
    result = RedactingFormatter(logging.Formatter("%(levelname)s %(message)s")).format(record)
    assert "ValueError" in result and "ERROR request failed" in result
    assert "sentinel-secret" not in result
    assert record.exc_text is None and record.exc_info is not None


def test_direct_uvicorn_access_logs_redact_capabilities_and_keep_status(tmp_path):
    root = Path(__file__).resolve().parents[3]
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    env = {
        **os.environ, "ENVIRONMENT": "local", "AUTH_MODE": "local",
        "DATABASE_URL": f"sqlite:///{tmp_path / 'api.db'}",
        "BACKEND_DATA_DIR": str(tmp_path / "data"), "OTEL_EXPORTER_OTLP_ENDPOINT": "",
    }
    output = tmp_path / "api.log"
    with output.open("w+") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "core.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=root / "apps/api/src", env=env, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=2) as client:
                for _ in range(100):
                    if process.poll() is not None:
                        pytest.fail("isolated API exited before readiness")
                    try:
                        if client.get("/health").status_code == 200:
                            break
                    except httpx.ConnectError:
                        pass
                    time.sleep(0.1)
                else:
                    pytest.fail("isolated API never became ready")
                for path in (
                    "/display/sentinel-secret/summary", "/e/partner/sentinel-secret",
                    "/invites/29ee1300-08ff-4928-a1e9-de601a996874",
                    "/health?token=sentinel-secret",
                ):
                    assert client.get(path).status_code in (200, 404)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    text = output.read_text()
    assert "sentinel-secret" not in text
    assert "29ee1300-08ff-4928-a1e9-de601a996874" not in text
    assert '/display/[redacted] HTTP/1.1" 404' in text
    assert '/health HTTP/1.1" 200' in text
