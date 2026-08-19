"""Health-endpoint smoke test for the canonical FastAPI app.

Functional coverage of the solve rail (the job routes) and of repair /
warm restart (the tenant-scoped proposal pipeline) lives in
test_schedule_endpoints_e2e.py and test_schedule_proposals.py; this file
just confirms the app boots and answers liveness probes.
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
    """The deep probe answers and reports its diagnostics.

    SP-CLOUD-3 changed the contract deliberately: this endpoint now
    performs a real readiness check, so it returns 503 when the database
    is unreachable or the schema is not at head. It previously always
    returned 200 — which was only true because it could not fail, the
    defect Phase 3.2 fixed. This fixture binds no migrated database, so
    503 is the correct answer here.

    Full coverage of both outcomes lives in tests/test_health_surface.py.
    """
    response = client.get("/health/deep")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["solverLoaded"] is True
    # Whatever the verdict, it is explained rather than merely asserted.
    if response.status_code == 503:
        assert data["databaseReachable"] is False or data["schemaCurrent"] is False
