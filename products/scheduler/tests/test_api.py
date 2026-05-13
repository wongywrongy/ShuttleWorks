"""Health-endpoint smoke test for the canonical FastAPI app.

Functional coverage of /schedule, /schedule/repair, /schedule/warm-restart
lives in test_schedule_endpoints_e2e.py; this file just confirms the app
boots and answers liveness probes.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


def _import_fastapi_app():
    backend_root = str(Path(__file__).resolve().parents[1] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for k in [m for m in list(sys.modules)
              if m in ("app", "adapters")
              or m.startswith("app.") or m.startswith("adapters.")
              or m.startswith("api.")]:
        del sys.modules[k]
    from app.main import app
    return app


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    return TestClient(_import_fastapi_app())


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


def test_health_deep(client):
    response = client.get("/health/deep")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["solverLoaded"] is True
