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

from app.schemas import Suggestion


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
    with pytest.raises(Exception):
        Suggestion(
            kind="xyz",  # not in the Literal
            title="x",
            metric="x",
            proposalId="x",
            fingerprint="x",
            fromScheduleVersion=0,
            expiresAt="2026-05-04T10:30:00+00:00",
        )
