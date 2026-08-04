"""Hash-seed determinism guard (SP-CLOUD-2 Phase 0.C).

PYTHONHASHSEED=0 masks the engine's hash-ordered model build; outside
the pinned worker env a "deterministic" solve silently isn't. The
guard makes that reversion loud: one error-level line per site per
interpreter whenever deterministic SolverOptions are built unpinned.
"""
import logging

import pytest

from adapters.badminton import solver_options_for
from api.brackets import _bracket_solver_options
from app.schemas import TournamentConfig
from services import determinism


@pytest.fixture(autouse=True)
def _reset_warned_sites():
    determinism._warned_sites.clear()
    yield
    determinism._warned_sites.clear()


def _cfg(**over) -> TournamentConfig:
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="18:00",
        breaks=[],
        courtCount=4,
        defaultRestMinutes=60,
        freezeHorizonSlots=3,
    )
    base.update(over)
    return TournamentConfig(**base)


def test_pinned_interpreter_stays_silent(monkeypatch, caplog):
    monkeypatch.setattr(determinism, "hash_seed_pinned", lambda: True)
    with caplog.at_level(logging.ERROR, logger="scheduler.determinism"):
        assert determinism.warn_if_unpinned("test.site") is False
    assert caplog.records == []


def test_unpinned_warns_loudly_once_per_site(monkeypatch, caplog):
    monkeypatch.setattr(determinism, "hash_seed_pinned", lambda: False)
    with caplog.at_level(logging.ERROR, logger="scheduler.determinism"):
        assert determinism.warn_if_unpinned("site.a") is True
        assert determinism.warn_if_unpinned("site.a") is True  # still unpinned…
        assert determinism.warn_if_unpinned("site.b") is True
    messages = [r.getMessage() for r in caplog.records]
    assert len(messages) == 2  # …but only one log line per site
    assert "DETERMINISM NOT GUARANTEED" in messages[0]
    assert "site.a" in messages[0]
    assert "site.b" in messages[1]


def test_meet_solver_options_trigger_guard(monkeypatch, caplog):
    monkeypatch.setattr(determinism, "hash_seed_pinned", lambda: False)
    with caplog.at_level(logging.ERROR, logger="scheduler.determinism"):
        opts = solver_options_for(_cfg(deterministic=True, randomSeed=7))
    assert opts.deterministic is True
    assert any("meet.solver_options_for" in r.getMessage() for r in caplog.records)


def test_meet_non_deterministic_does_not_trigger(monkeypatch, caplog):
    monkeypatch.setattr(determinism, "hash_seed_pinned", lambda: False)
    with caplog.at_level(logging.ERROR, logger="scheduler.determinism"):
        opts = solver_options_for(_cfg(deterministic=False))
    assert opts.deterministic is False
    assert caplog.records == []


def test_bracket_solver_options_trigger_guard(monkeypatch, caplog):
    monkeypatch.setattr(determinism, "hash_seed_pinned", lambda: False)
    with caplog.at_level(logging.ERROR, logger="scheduler.determinism"):
        opts = _bracket_solver_options(5.0, {"deterministic": True, "randomSeed": 3})
    assert opts.deterministic is True
    assert any("bracket.solver_options" in r.getMessage() for r in caplog.records)


def test_hash_seed_pinned_reflects_interpreter_state():
    import sys

    assert determinism.hash_seed_pinned() == (sys.flags.hash_randomization == 0)
