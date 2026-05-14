"""
Tournament prototype — smoke tests.

The pyproject ships pytest + httpx in the [dev] extra; `make test`
invokes `pytest tests` against the backend container. These tests
exist so:
  • `make test-tournament` actually runs something (was previously
    failing because no tests/ directory existed in the image),
  • the FastAPI app at backend.main:app still imports cleanly after
    every refactor (catches missing top-level dependency errors),
  • the /healthz endpoint stays alive without contract drift.

Add a feature test alongside any new endpoint or domain rule.
"""
from fastapi.testclient import TestClient

from backend.main import app


def test_app_imports():
    """Sanity: the FastAPI app instance is constructed at import time."""
    assert app is not None
    assert app.title  # FastAPI sets a default title; presence is enough.


def test_healthz_returns_200():
    """The liveness endpoint stays as a quick-fail check for Docker."""
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200


def test_unknown_route_404():
    """Negative path: the API doesn't accidentally turn into a catch-all."""
    client = TestClient(app)
    response = client.get("/does-not-exist")
    assert response.status_code == 404
