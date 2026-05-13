"""Unit tests for the architecture-adjustment arc's Step A:

- ``MatchStatus`` enum + transition table
- ``services.match_state.assert_valid_transition`` + ``is_locked``
- ``ConflictError`` shape (transition flavour vs. stale-version flavour)
- ``MatchRepository.upsert`` / ``set_status`` version semantics
- Optimistic-concurrency check via ``expected_version``
- ``bulk_project_from_schedule`` semantics — insert, update, delete
- ``commit_tournament_state`` orchestration projects matches rows
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys

# conftest.py adds backend/ to sys.path before this module is collected.
from database.models import Base, Match, MatchStatus
from repositories.local import LocalRepository
from services.match_state import (
    LOCKED_STATUSES,
    VALID_TRANSITIONS,
    all_valid_transitions_for,
    assert_valid_transition,
    is_locked,
    locked_status_values,
)


def _ce():
    """Return the *currently canonical* ``ConflictError`` class.

    Other test modules in this suite (``test_schedule_proposals.py``,
    ``test_suggestions_worker.py``, …) run a module-level
    ``del sys.modules[k for k in ... 'app.*']`` at import time, which
    races against pytest's collection of *this* module. The net effect
    is that a module-level ``from app.exceptions import ConflictError``
    here can bind to a *stale* class object that is no longer the one
    in ``sys.modules`` by the time tests execute. ``pytest.raises``
    then fails on class identity even though the raise is correct.

    Looking up the class through ``sys.modules`` at test runtime gives
    us the same class object the repository sees (the repository uses
    the same lookup pattern), so ``pytest.raises(_ce())`` always
    matches.
    """
    return sys.modules["app.exceptions"].ConflictError


# ---- Fixtures ----------------------------------------------------------


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


@pytest.fixture
def repo(session):
    return LocalRepository(session)


@pytest.fixture
def tid(repo) -> uuid.UUID:
    return repo.tournaments.create(name="Step A Test").id


# ---- VALID_TRANSITIONS ------------------------------------------------


def test_valid_transitions_match_prompt_specification():
    """Pinned mapping — any divergence from the prompt must be intentional."""
    assert VALID_TRANSITIONS == {
        MatchStatus.SCHEDULED: [MatchStatus.CALLED],
        MatchStatus.CALLED: [MatchStatus.PLAYING, MatchStatus.SCHEDULED],
        MatchStatus.PLAYING: [MatchStatus.FINISHED, MatchStatus.RETIRED],
        MatchStatus.FINISHED: [],
        MatchStatus.RETIRED: [],
    }


@pytest.mark.parametrize(
    "current,next_status",
    [
        (MatchStatus.SCHEDULED, MatchStatus.CALLED),
        (MatchStatus.CALLED, MatchStatus.PLAYING),
        (MatchStatus.CALLED, MatchStatus.SCHEDULED),
        (MatchStatus.PLAYING, MatchStatus.FINISHED),
        (MatchStatus.PLAYING, MatchStatus.RETIRED),
    ],
)
def test_every_valid_transition_succeeds(current, next_status):
    # No exception means success — the guard does not return a value.
    assert_valid_transition("match-1", current, next_status) is None


@pytest.mark.parametrize(
    "current,next_status",
    [
        # Skip a step.
        (MatchStatus.SCHEDULED, MatchStatus.PLAYING),
        (MatchStatus.SCHEDULED, MatchStatus.FINISHED),
        (MatchStatus.SCHEDULED, MatchStatus.RETIRED),
        # Going backwards from played-out state.
        (MatchStatus.CALLED, MatchStatus.FINISHED),
        (MatchStatus.PLAYING, MatchStatus.CALLED),
        (MatchStatus.PLAYING, MatchStatus.SCHEDULED),
        # Re-opening a terminal state.
        (MatchStatus.FINISHED, MatchStatus.SCHEDULED),
        (MatchStatus.FINISHED, MatchStatus.CALLED),
        (MatchStatus.FINISHED, MatchStatus.PLAYING),
        (MatchStatus.FINISHED, MatchStatus.RETIRED),
        (MatchStatus.RETIRED, MatchStatus.SCHEDULED),
        (MatchStatus.RETIRED, MatchStatus.PLAYING),
    ],
)
def test_every_invalid_transition_raises_conflict_error(current, next_status):
    with pytest.raises(_ce()) as excinfo:
        assert_valid_transition("match-42", current, next_status)
    err = excinfo.value
    assert err.match_id == "match-42"
    assert err.current_status == current.value
    assert err.attempted_status == next_status.value
    assert "match-42" in err.message
    body = err.to_dict()
    assert body["error"] == "conflict"
    assert body["current_status"] == current.value
    assert body["attempted_status"] == next_status.value


def test_same_state_is_rejected_by_the_strict_guard():
    """``assert_valid_transition`` follows the prompt's literal table.

    ``VALID_TRANSITIONS`` contains no ``current → current`` entries, so
    every same-state call raises. The route boundary (see
    ``api/match_state.py::update_match_state``) short-circuits before
    calling this function when the PUT re-asserts the current status,
    keeping the operator UX forgiving without weakening the guard.
    """
    for status in MatchStatus:
        with pytest.raises(_ce()):
            assert_valid_transition("match-x", status, status)


def test_assert_valid_transition_accepts_string_inputs():
    """Routes pass either the enum or a raw string; both work."""
    assert_valid_transition("m", "scheduled", "called")
    with pytest.raises(_ce()):
        assert_valid_transition("m", "scheduled", "playing")


def test_assert_valid_transition_rejects_unknown_status():
    with pytest.raises(_ce()):
        assert_valid_transition("m", "scheduled", "bogus")


# ---- is_locked / locked_status_values ---------------------------------


@pytest.mark.parametrize(
    "status,expected",
    [
        (MatchStatus.SCHEDULED, False),
        (MatchStatus.CALLED, True),
        (MatchStatus.PLAYING, True),
        (MatchStatus.FINISHED, True),
        (MatchStatus.RETIRED, True),
    ],
)
def test_is_locked_matches_specification(status, expected):
    assert is_locked(status) is expected
    assert is_locked(status.value) is expected


def test_locked_status_values_returns_strings():
    values = locked_status_values()
    assert set(values) == {"called", "playing", "finished", "retired"}


def test_all_valid_transitions_for_terminal_states_is_empty():
    assert list(all_valid_transitions_for(MatchStatus.FINISHED)) == []
    assert list(all_valid_transitions_for(MatchStatus.RETIRED)) == []


def test_locked_statuses_set_excludes_scheduled():
    """The contract is that ``scheduled`` matches are the only ones the
    solver may freely move; everything else is pinned."""
    assert MatchStatus.SCHEDULED not in LOCKED_STATUSES


# ---- MatchRepository version semantics --------------------------------


def test_match_repo_upsert_creates_row_with_version_1(repo, tid):
    row = repo.matches.upsert(tid, "m-1", {"status": MatchStatus.SCHEDULED})
    assert row.id == "m-1"
    assert row.tournament_id == tid
    assert row.status == "scheduled"
    assert row.version == 1


def test_match_repo_upsert_increments_version_on_every_write(repo, tid):
    repo.matches.upsert(tid, "m-1", {"status": MatchStatus.SCHEDULED})
    repo.matches.set_status(tid, "m-1", MatchStatus.CALLED)
    repo.matches.upsert(tid, "m-1", {"court_id": 2, "time_slot": 5})
    final = repo.matches.get(tid, "m-1")
    assert final.version == 3
    assert final.court_id == 2
    assert final.time_slot == 5
    assert final.status == "called"


def test_match_repo_upsert_with_stale_expected_version_raises(repo, tid):
    """Step A4: a write with a stale version is rejected.

    Implements the repo-level optimistic-concurrency check; Step D
    layers the HTTP If-Match header on top.
    """
    repo.matches.upsert(tid, "m-2", {"status": MatchStatus.SCHEDULED})
    repo.matches.set_status(tid, "m-2", MatchStatus.CALLED)  # version is now 2
    with pytest.raises(_ce()) as excinfo:
        repo.matches.upsert(
            tid,
            "m-2",
            {"status": MatchStatus.PLAYING},
            expected_version=1,
        )
    err = excinfo.value
    assert err.match_id == "m-2"
    assert err.current_version == 2
    assert err.attempted_version == 1
    body = err.to_dict()
    assert body["error"] == "stale_version"
    # The row was not modified by the rejected write.
    row = repo.matches.get(tid, "m-2")
    assert row.status == "called"
    assert row.version == 2


def test_match_repo_upsert_with_matching_expected_version_succeeds(repo, tid):
    repo.matches.upsert(tid, "m-3", {"status": MatchStatus.SCHEDULED})
    row = repo.matches.upsert(
        tid,
        "m-3",
        {"status": MatchStatus.CALLED},
        expected_version=1,
    )
    assert row.version == 2
    assert row.status == "called"


def test_match_repo_upsert_against_missing_row_with_expected_version_raises(repo, tid):
    """``expected_version`` against a non-existent row is also stale."""
    with pytest.raises(_ce()) as excinfo:
        repo.matches.upsert(
            tid,
            "ghost",
            {"status": MatchStatus.SCHEDULED},
            expected_version=1,
        )
    assert excinfo.value.current_version == 0


def test_get_by_statuses_filters_correctly(repo, tid):
    repo.matches.upsert(tid, "a", {"status": MatchStatus.SCHEDULED})
    repo.matches.upsert(tid, "b", {"status": MatchStatus.CALLED})
    repo.matches.upsert(tid, "c", {"status": MatchStatus.PLAYING})
    repo.matches.upsert(tid, "d", {"status": MatchStatus.FINISHED})

    locked = repo.matches.get_by_statuses(tid, LOCKED_STATUSES)
    locked_ids = {row.id for row in locked}
    assert locked_ids == {"b", "c", "d"}

    scheduled = repo.matches.get_by_statuses(tid, [MatchStatus.SCHEDULED])
    assert [row.id for row in scheduled] == ["a"]

    assert repo.matches.get_by_statuses(tid, []) == []


# ---- bulk_project_from_schedule ---------------------------------------


def test_bulk_project_inserts_rows_for_new_matches(repo, tid):
    touched = repo.matches.bulk_project_from_schedule(
        tid,
        [{"id": "m-1"}, {"id": "m-2"}, {"id": "m-3"}],
        [
            {"matchId": "m-1", "courtId": 1, "slotId": 4},
            {"matchId": "m-2", "courtId": 2, "slotId": 6},
        ],
    )
    assert touched == 3
    rows = repo.matches.list_for_tournament(tid)
    assert {r.id for r in rows} == {"m-1", "m-2", "m-3"}
    by_id = {r.id: r for r in rows}
    assert by_id["m-1"].court_id == 1 and by_id["m-1"].time_slot == 4
    assert by_id["m-2"].court_id == 2 and by_id["m-2"].time_slot == 6
    # m-3 has no assignment yet — unassigned but the row exists.
    assert by_id["m-3"].court_id is None
    assert by_id["m-3"].time_slot is None
    # All start at version 1.
    assert all(r.version == 1 for r in rows)


def test_bulk_project_preserves_status_on_existing_rows(repo, tid):
    """A schedule re-commit must not roll ``called`` / ``playing`` back."""
    repo.matches.upsert(tid, "m-1", {"status": MatchStatus.CALLED, "court_id": 1, "time_slot": 4})
    assert repo.matches.get(tid, "m-1").version == 1

    repo.matches.bulk_project_from_schedule(
        tid,
        [{"id": "m-1"}],
        [{"matchId": "m-1", "courtId": 1, "slotId": 4}],
    )
    row = repo.matches.get(tid, "m-1")
    # Court/slot unchanged → no version bump.
    assert row.status == "called"
    assert row.version == 1


def test_bulk_project_bumps_version_when_court_or_slot_changes(repo, tid):
    repo.matches.upsert(tid, "m-1", {"status": MatchStatus.CALLED, "court_id": 1, "time_slot": 4})
    repo.matches.bulk_project_from_schedule(
        tid,
        [{"id": "m-1"}],
        [{"matchId": "m-1", "courtId": 2, "slotId": 4}],
    )
    row = repo.matches.get(tid, "m-1")
    assert row.court_id == 2
    assert row.version == 2  # incremented exactly once


def test_bulk_project_deletes_rows_removed_from_payload(repo, tid):
    repo.matches.upsert(tid, "m-1", {"status": MatchStatus.SCHEDULED})
    repo.matches.upsert(tid, "m-2", {"status": MatchStatus.SCHEDULED})
    repo.matches.bulk_project_from_schedule(
        tid,
        [{"id": "m-1"}],  # m-2 removed
        [],
    )
    remaining = repo.matches.list_for_tournament(tid)
    assert [r.id for r in remaining] == ["m-1"]


def test_bulk_project_handles_garbage_inputs(repo, tid):
    """Defensive: non-dict / missing-id entries are skipped silently."""
    touched = repo.matches.bulk_project_from_schedule(
        tid,
        [{"id": "m-1"}, "not-a-dict", {"no_id": True}],  # type: ignore[list-item]
        [{"matchId": "m-1", "courtId": 1, "slotId": 1}, None],  # type: ignore[list-item]
    )
    assert touched == 1
    rows = repo.matches.list_for_tournament(tid)
    assert [r.id for r in rows] == ["m-1"]


# ---- commit_tournament_state orchestration ----------------------------


def test_commit_tournament_state_projects_matches_rows(repo, tid):
    payload = {
        "matches": [{"id": "m-1"}, {"id": "m-2"}],
        "schedule": {
            "assignments": [
                {"matchId": "m-1", "courtId": 3, "slotId": 7},
                {"matchId": "m-2", "courtId": 4, "slotId": 8},
            ]
        },
    }
    repo.commit_tournament_state(tid, payload)

    rows = {r.id: r for r in repo.matches.list_for_tournament(tid)}
    assert set(rows) == {"m-1", "m-2"}
    assert rows["m-1"].court_id == 3 and rows["m-1"].time_slot == 7
    assert rows["m-2"].court_id == 4 and rows["m-2"].time_slot == 8


def test_commit_tournament_state_does_not_clobber_operator_status(repo, tid):
    """After an operator calls a match, re-saving the tournament must
    keep the ``called`` status — schedule commits never silently
    transition a match back to ``scheduled``.
    """
    initial = {
        "matches": [{"id": "m-1"}],
        "schedule": {"assignments": [{"matchId": "m-1", "courtId": 1, "slotId": 1}]},
    }
    repo.commit_tournament_state(tid, initial)
    repo.matches.set_status(tid, "m-1", MatchStatus.CALLED)
    assert repo.matches.get(tid, "m-1").status == "called"

    repo.commit_tournament_state(tid, initial)
    assert repo.matches.get(tid, "m-1").status == "called"


def test_commit_tournament_state_drops_matches_removed_from_payload(repo, tid):
    initial = {
        "matches": [{"id": "m-1"}, {"id": "m-2"}],
        "schedule": {"assignments": []},
    }
    repo.commit_tournament_state(tid, initial)
    repo.commit_tournament_state(
        tid,
        {"matches": [{"id": "m-1"}], "schedule": {"assignments": []}},
    )
    rows = repo.matches.list_for_tournament(tid)
    assert [r.id for r in rows] == ["m-1"]


# ---- ConflictError shape ----------------------------------------------


def test_conflict_error_transition_body():
    err = _ce()(
        match_id="m-x",
        current_status="finished",
        attempted_status="called",
        message="Cannot transition match m-x from 'finished' to 'called'",
    )
    body = err.to_dict()
    assert body == {
        "error": "conflict",
        "match_id": "m-x",
        "message": "Cannot transition match m-x from 'finished' to 'called'",
        "current_status": "finished",
        "attempted_status": "called",
    }


def test_conflict_error_stale_version_body():
    err = _ce()(
        match_id="m-y",
        current_version=15,
        attempted_version=14,
        message="Match m-y was updated since you last loaded it",
    )
    body = err.to_dict()
    assert body == {
        "error": "stale_version",
        "match_id": "m-y",
        "message": "Match m-y was updated since you last loaded it",
        "current_version": 15,
        "attempted_version": 14,
    }
