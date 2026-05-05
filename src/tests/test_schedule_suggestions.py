"""Suggestion model + endpoint tests.

The worker's behavior is tested separately in
test_suggestions_worker.py — these tests exercise the
persistence shape and the GET / apply / dismiss endpoints in
isolation.

Phase 1 covers the model + store helper tests; Phase 3 will
extend with endpoint tests once the routes exist.
"""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.schemas import Suggestion
from api.schedule_proposals import (
    _get_suggestion_store,
    _evict_expired_suggestions,
)


def test_suggestion_round_trips():
    s = Suggestion(
        kind="optimize",
        title="Re-optimize from now",
        metric="-12 min finish, 7 moves",
        proposalId="prop-abc",
        fingerprint="opt:v1:7-moves",
        fromScheduleVersion=4,
        expiresAt="2026-05-04T10:30:00+00:00",
    )
    data = s.model_dump()
    rebuilt = Suggestion(**data)
    assert rebuilt.id == s.id
    assert rebuilt.kind == "optimize"
    assert rebuilt.fromScheduleVersion == 4


def test_suggestion_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        Suggestion(
            kind="xyz",  # not in the Literal
            title="x",
            metric="x",
            proposalId="x",
            fingerprint="x",
            fromScheduleVersion=0,
            expiresAt="2026-05-04T10:30:00+00:00",
        )


def _make_app():
    return FastAPI()


def test_suggestion_store_is_per_app():
    app1, app2 = _make_app(), _make_app()
    s1 = _get_suggestion_store(app1)
    s2 = _get_suggestion_store(app2)
    assert s1 is not s2


def test_evict_expired_suggestions_drops_past_ttl():
    app = _make_app()
    store = _get_suggestion_store(app)
    sug = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2000-01-01T00:00:00+00:00",  # long expired
    )
    store[sug.id] = sug
    _evict_expired_suggestions(store)
    assert sug.id not in store


def test_evict_expired_suggestions_keeps_fresh():
    app = _make_app()
    store = _get_suggestion_store(app)
    sug = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2099-01-01T00:00:00+00:00",
    )
    store[sug.id] = sug
    _evict_expired_suggestions(store)
    assert sug.id in store


def test_evict_expired_suggestions_at_exact_cutoff_survives():
    """Boundary semantics must mirror `_evict_expired` for proposals
    (strict-less-than). A suggestion whose expiresAt equals the cutoff
    survives one more eviction cycle."""
    from datetime import datetime, timezone

    app = _make_app()
    store = _get_suggestion_store(app)
    cutoff = datetime(2026, 5, 4, 10, 0, 0, tzinfo=timezone.utc)
    sug = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2026-05-04T10:00:00+00:00",
    )
    store[sug.id] = sug
    _evict_expired_suggestions(store, now=cutoff)
    assert sug.id in store


# ---------- Endpoint tests (Phase 3.1 / 3.2 / 3.3) -------------------------

from fastapi.testclient import TestClient
from api.schedule_suggestions import router as suggestions_router


def _app_with_suggestions_router():
    app = FastAPI()
    app.include_router(suggestions_router)
    return app


def _seed_suggestion(app, **overrides):
    """Drop a Suggestion directly into the store. Endpoint tests seed
    pre-built suggestions because the actual stamping path runs the
    real solver (covered by test_proposal_pipeline_integration)."""
    defaults = dict(
        kind="optimize", title="Re-optimize from now",
        metric="−12 min finish, 7 moves",
        proposalId="prop-stub",
        fingerprint="fp-stub",
        fromScheduleVersion=0,
        expiresAt="2099-01-01T00:00:00+00:00",
    )
    defaults.update(overrides)
    sug = Suggestion(**defaults)
    _get_suggestion_store(app)[sug.id] = sug
    return sug


def test_get_suggestions_returns_empty_list():
    app = _app_with_suggestions_router()
    with TestClient(app) as c:
        r = c.get("/schedule/suggestions")
    assert r.status_code == 200
    assert r.json() == []


def test_get_suggestions_returns_active_sorted_by_severity():
    app = _app_with_suggestions_router()
    _seed_suggestion(app, kind="optimize", proposalId="p1", fingerprint="f1")
    _seed_suggestion(app, kind="repair", proposalId="p2", fingerprint="f2")
    _seed_suggestion(app, kind="director", proposalId="p3", fingerprint="f3")
    with TestClient(app) as c:
        r = c.get("/schedule/suggestions")
    body = r.json()
    assert r.status_code == 200
    assert len(body) == 3
    # Severity tier: repair (0) > director (1) > optimize (2)
    assert [b["kind"] for b in body] == ["repair", "director", "optimize"]


def test_get_suggestions_evicts_expired():
    app = _app_with_suggestions_router()
    _seed_suggestion(app, expiresAt="2000-01-01T00:00:00+00:00")
    with TestClient(app) as c:
        r = c.get("/schedule/suggestions")
    assert r.status_code == 200
    assert r.json() == []


def test_apply_returns_410_for_unknown_suggestion():
    app = _app_with_suggestions_router()
    with TestClient(app) as c:
        r = c.post("/schedule/suggestions/nonexistent/apply")
    assert r.status_code == 410


def test_dismiss_drops_suggestion_and_returns_dismissed():
    app = _app_with_suggestions_router()
    sug = _seed_suggestion(app)
    store = _get_suggestion_store(app)
    assert sug.id in store
    with TestClient(app) as c:
        r = c.post(f"/schedule/suggestions/{sug.id}/dismiss")
    assert r.status_code == 200
    assert r.json() == {"dismissed": True}
    assert sug.id not in store


def test_dismiss_returns_410_for_unknown():
    app = _app_with_suggestions_router()
    with TestClient(app) as c:
        r = c.post("/schedule/suggestions/nonexistent/dismiss")
    assert r.status_code == 410


def test_dismiss_also_drops_underlying_proposal():
    """Dismiss is destructive — the proposal it referenced is also
    removed so an orphaned proposal can't be applied later."""
    from api.schedule_proposals import _get_store
    app = _app_with_suggestions_router()
    sug = _seed_suggestion(app, proposalId="prop-to-drop")
    proposal_store = _get_store(app)
    # Seed a fake proposal-shaped value (a real Proposal isn't needed
    # for this test — the dismiss handler only does pop()).
    proposal_store["prop-to-drop"] = "stub"
    with TestClient(app) as c:
        r = c.post(f"/schedule/suggestions/{sug.id}/dismiss")
    assert r.status_code == 200
    assert "prop-to-drop" not in proposal_store
