"""Unit tests for the architecture-adjustment arc's Step B:

- The new ``LockedAssignment`` dataclass and ``ScheduleRequest.locked_assignments`` field
- ``CPSATScheduler._add_locked_constraints`` pinning court + time
- ``CPSATBackend.solve`` plumbing the locked list through
- ``solve_repair`` / ``solve_warm_start`` honouring locked_assignments
- ``services.match_state.build_locked_assignments`` returning the right shape
- Coexistence with the legacy ``PreviousAssignment.locked`` mechanism

Run at the scheduler_core layer (no HTTP). Builds tiny fixtures
(2-3 matches, 2 courts, ~10 slots) so each solve is sub-second.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# conftest adds backend/ + scheduler_core/ to sys.path.
from database.models import Base, MatchStatus
from repositories.local import LocalRepository
from scheduler_core.domain.models import (
    Assignment,
    LockedAssignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverOptions,
    SolverStatus,
)
from scheduler_core.engine import CPSATBackend
from scheduler_core.engine.repair import RepairSpec, solve_repair
from scheduler_core.engine.warm_start import solve_warm_start
from services.match_state import LOCKED_STATUSES, build_locked_assignments


# ---- Fixtures ----------------------------------------------------------


def _config(**overrides) -> ScheduleConfig:
    defaults = dict(
        total_slots=10,
        court_count=2,
        interval_minutes=30,
        default_rest_slots=1,
    )
    defaults.update(overrides)
    return ScheduleConfig(**defaults)


def _players(n: int = 4) -> list[Player]:
    return [Player(id=f"p{i}", name=f"Player {i}") for i in range(1, n + 1)]


def _two_matches() -> list[Match]:
    return [
        Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS2", side_a=["p3"], side_b=["p4"]),
    ]


def _request(*, matches=None, locked=None, previous=None) -> ScheduleRequest:
    return ScheduleRequest(
        config=_config(),
        players=_players(),
        matches=matches or _two_matches(),
        previous_assignments=previous or [],
        locked_assignments=locked or [],
        solver_options=SolverOptions(time_limit_seconds=5),
    )


# ---- Engine-level locked_assignments ---------------------------------


def test_locked_match_stays_at_court_and_slot():
    """A locked match's court+time are unchanged after the solve."""
    locked = [LockedAssignment(match_id="m1", court_id=2, time_slot=4)]
    result = CPSATBackend().solve(_request(locked=locked))
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)

    by_match = {a.match_id: a for a in result.assignments}
    assert by_match["m1"].court_id == 2
    assert by_match["m1"].slot_id == 4


def test_unlocked_neighbour_is_still_optimised():
    """Locking m1 doesn't freeze m2 — m2 is free to take any feasible slot."""
    locked = [LockedAssignment(match_id="m1", court_id=1, time_slot=0)]
    result = CPSATBackend().solve(_request(locked=locked))
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)

    by_match = {a.match_id: a for a in result.assignments}
    # m1 sits where we locked it.
    assert by_match["m1"].court_id == 1 and by_match["m1"].slot_id == 0
    # m2 is free — the solver picked some valid (court, slot). The
    # interesting assertion is that it was *not* forced into a clash
    # with m1, which would only be a clash if both ended up at the
    # same (court, slot). All players are disjoint so there's no
    # player conflict.
    assert (
        by_match["m2"].court_id != by_match["m1"].court_id
        or by_match["m2"].slot_id != by_match["m1"].slot_id
    )


def test_locked_match_not_in_solve_scope_is_skipped_silently():
    """``LockedAssignment`` for a match the solver doesn't know about
    is a no-op — the prompt's contract."""
    locked = [
        LockedAssignment(match_id="m1", court_id=1, time_slot=0),
        LockedAssignment(match_id="ghost", court_id=2, time_slot=9),
    ]
    result = CPSATBackend().solve(_request(locked=locked))
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert {a.match_id for a in result.assignments} == {"m1", "m2"}


def test_default_locked_assignments_field_is_empty_and_passes_through():
    """``ScheduleRequest`` constructed without ``locked_assignments``
    defaults to ``[]`` (regression-safe for every existing caller).
    A solve with that default completes successfully and the field
    is observable as empty on the request — proves the new field is
    truly additive."""
    request = ScheduleRequest(
        config=_config(),
        players=_players(),
        matches=_two_matches(),
        solver_options=SolverOptions(
            time_limit_seconds=5,
            num_workers=1,
            random_seed=42,
            deterministic=True,
        ),
    )
    assert request.locked_assignments == []
    result = CPSATBackend().solve(request)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.assignments) == 2


def test_legacy_locked_and_new_locked_can_coexist_when_consistent():
    """Defensive consistency guard for the dual-mechanism period.

    A match locked by *both* mechanisms at the *same* (court, time_slot)
    solves successfully — the two ``model.Add`` calls are tautologies
    on top of each other, not contradictions.

    The inverse (mechanism A says court=1, mechanism B says court=2 for
    the same match) is INFEASIBLE by construction — both add hard
    constraints and they conflict. There's no test for that case
    because the contract is "callers must never build inconsistent
    requests"; the state machine + solver projection ensure they
    don't in production.
    """
    pa = PreviousAssignment(
        match_id="m1", slot_id=3, court_id=2, locked=True
    )
    locked = [LockedAssignment(match_id="m1", court_id=2, time_slot=3)]
    request = _request(locked=locked, previous=[pa])
    result = CPSATBackend().solve(request)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    by_match = {a.match_id: a for a in result.assignments}
    assert by_match["m1"].slot_id == 3
    assert by_match["m1"].court_id == 2


# ---- solve_repair / solve_warm_start kwarg ----------------------------


def test_solve_repair_honours_locked_assignments():
    """A locked match is pinned even when the slice rule would free it."""
    config = _config()
    players = _players()
    matches = _two_matches()
    # The slice rule says m1 is free to move (would normally be allowed).
    # The locked_assignment overrides — m1 must stay at (court=1, slot=2).
    spec = RepairSpec(
        free_match_ids=frozenset({"m1", "m2"}),
        hint_assignments={
            "m1": Assignment(match_id="m1", slot_id=0, court_id=1, duration_slots=1),
            "m2": Assignment(match_id="m2", slot_id=1, court_id=2, duration_slots=1),
        },
    )
    locked = [LockedAssignment(match_id="m1", court_id=1, time_slot=2)]

    result = solve_repair(
        config, players, matches, spec,
        solver_options=SolverOptions(time_limit_seconds=5),
        locked_assignments=locked,
    )
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    by_match = {a.match_id: a for a in result.assignments}
    assert by_match["m1"].slot_id == 2
    assert by_match["m1"].court_id == 1


def test_solve_warm_start_honours_locked_assignments():
    """A locked match stays pinned regardless of stay-close weight."""
    config = _config()
    players = _players()
    matches = _two_matches()
    reference = {
        "m1": Assignment(match_id="m1", slot_id=0, court_id=1, duration_slots=1),
        "m2": Assignment(match_id="m2", slot_id=1, court_id=2, duration_slots=1),
    }
    locked = [LockedAssignment(match_id="m1", court_id=2, time_slot=5)]

    result = solve_warm_start(
        config, players, matches, reference,
        stay_close_weight=10,
        solver_options=SolverOptions(time_limit_seconds=5),
        locked_assignments=locked,
    )
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    by_match = {a.match_id: a for a in result.assignments}
    # The locked pin overrides both the reference (slot=0, court=1)
    # and the stay-close bias — m1 sits at (slot=5, court=2).
    assert by_match["m1"].slot_id == 5
    assert by_match["m1"].court_id == 2


# ---- build_locked_assignments helper ----------------------------------


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
    return repo.tournaments.create(name="Step B Test").id


def test_build_locked_assignments_returns_called_playing_finished_retired(repo, tid):
    """Every match in LOCKED_STATUSES with a non-null assignment is returned."""
    repo.matches.upsert(tid, "scheduled", {"status": MatchStatus.SCHEDULED, "court_id": 1, "time_slot": 0})
    repo.matches.upsert(tid, "called",    {"status": MatchStatus.CALLED,    "court_id": 1, "time_slot": 1})
    repo.matches.upsert(tid, "playing",   {"status": MatchStatus.PLAYING,   "court_id": 2, "time_slot": 1})
    repo.matches.upsert(tid, "finished",  {"status": MatchStatus.FINISHED,  "court_id": 2, "time_slot": 0})
    repo.matches.upsert(tid, "retired",   {"status": MatchStatus.RETIRED,   "court_id": 1, "time_slot": 2})

    locked = build_locked_assignments(repo, tid)
    ids = {a.match_id for a in locked}
    assert ids == {"called", "playing", "finished", "retired"}
    # Each entry has the correct shape.
    by_id = {a.match_id: a for a in locked}
    assert by_id["called"].court_id == 1 and by_id["called"].time_slot == 1
    assert by_id["playing"].court_id == 2 and by_id["playing"].time_slot == 1
    assert by_id["finished"].court_id == 2 and by_id["finished"].time_slot == 0
    assert by_id["retired"].court_id == 1 and by_id["retired"].time_slot == 2


def test_build_locked_assignments_skips_unassigned_rows(repo, tid):
    """A locked row without court_id or time_slot is skipped (can't pin)."""
    repo.matches.upsert(tid, "no_court", {"status": MatchStatus.CALLED, "time_slot": 1})
    repo.matches.upsert(tid, "no_slot",  {"status": MatchStatus.CALLED, "court_id": 1})
    repo.matches.upsert(tid, "complete", {"status": MatchStatus.CALLED, "court_id": 2, "time_slot": 3})

    locked = build_locked_assignments(repo, tid)
    assert {a.match_id for a in locked} == {"complete"}


def test_build_locked_assignments_empty_when_no_rows(repo, tid):
    """No rows → empty list, no exceptions."""
    assert build_locked_assignments(repo, tid) == []


def test_build_locked_assignments_filters_by_tournament(repo):
    """Cross-tournament isolation — locked matches in tournament A don't
    leak into tournament B's locked list."""
    tid_a = repo.tournaments.create(name="A").id
    tid_b = repo.tournaments.create(name="B").id
    repo.matches.upsert(tid_a, "a-locked", {"status": MatchStatus.CALLED, "court_id": 1, "time_slot": 0})
    repo.matches.upsert(tid_b, "b-locked", {"status": MatchStatus.CALLED, "court_id": 2, "time_slot": 5})

    a_locked = build_locked_assignments(repo, tid_a)
    b_locked = build_locked_assignments(repo, tid_b)
    assert {a.match_id for a in a_locked} == {"a-locked"}
    assert {a.match_id for a in b_locked} == {"b-locked"}


# ---- LOCKED_STATUSES set membership invariant -------------------------


def test_locked_statuses_includes_all_terminal_and_in_progress_states():
    """Sanity guard — defends against accidentally dropping a status
    from LOCKED_STATUSES, which would silently let the solver move
    finished or in-progress matches."""
    assert MatchStatus.CALLED in LOCKED_STATUSES
    assert MatchStatus.PLAYING in LOCKED_STATUSES
    assert MatchStatus.FINISHED in LOCKED_STATUSES
    assert MatchStatus.RETIRED in LOCKED_STATUSES
    assert MatchStatus.SCHEDULED not in LOCKED_STATUSES
