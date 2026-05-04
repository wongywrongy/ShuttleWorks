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
