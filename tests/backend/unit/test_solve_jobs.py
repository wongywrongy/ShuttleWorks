"""Solve-job queue unit suite (SP-CLOUD-1 Phase 1).

Runs the whole suite against SQLite always, and against Postgres when
``TEST_POSTGRES_URL`` is set (e.g. the docker-compose.dev.yml service:
``postgresql://scheduler:scheduler@localhost:5433/scheduler``).
WARNING: the Postgres run creates and drops this schema's tables in
that database — point it at a disposable database only.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import Base, SolveJob, SolveJobStatus, Tournament
from solve_rail import solve_jobs
from solve_rail.solve_jobs import (
    ActiveSolveJobConflict,
    UserSolveQuotaExceeded,
    SolveJobTransitionError,
    assert_valid_transition,
)

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _make_engine(dialect: str):
    if dialect == "sqlite":
        return create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
    from db.session import normalize_database_url

    return create_engine(normalize_database_url(POSTGRES_URL), future=True)


@pytest.fixture(params=["sqlite", "postgres"])
def db(request):
    if request.param == "postgres" and not POSTGRES_URL:
        pytest.skip("TEST_POSTGRES_URL not set")
    engine = _make_engine(request.param)
    Base.metadata.create_all(engine)
    Session = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    try:
        yield engine, Session
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def session(db):
    _, Session = db
    s = Session()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


@pytest.fixture
def tournament_id(session) -> uuid.UUID:
    t = Tournament(name="queue-test")
    session.add(t)
    session.commit()
    return t.id


def _enqueue(session, tournament_id, **kwargs) -> SolveJob:
    defaults = dict(
        tournament_id=tournament_id,
        type_=solve_jobs.MEET_SCHEDULE_SOLVE,
        params={"random_seed": 42},
        input_snapshot={"matches": []},
    )
    defaults.update(kwargs)
    job, created = solve_jobs.enqueue(session, **defaults)
    assert created
    return job


# ---- state machine ------------------------------------------------------


def test_every_legal_transition_is_accepted():
    for current, targets in solve_jobs.VALID_TRANSITIONS.items():
        for target in targets:
            assert_valid_transition(current, target)


def test_illegal_transitions_raise():
    illegal = [
        ("queued", "running"),
        ("queued", "succeeded"),
        ("succeeded", "queued"),
        ("failed", "running"),
        ("infeasible", "queued"),
        ("cancelled", "claimed"),
        ("running", "claimed"),
    ]
    for current, target in illegal:
        with pytest.raises(SolveJobTransitionError):
            assert_valid_transition(current, target)


def test_terminal_statuses_have_no_exits():
    for status in solve_jobs.TERMINAL_STATUSES:
        assert solve_jobs.VALID_TRANSITIONS[status] == frozenset()


# ---- enqueue: idempotency + active-conflict + transactionality ----------


def test_enqueue_creates_queued_job(session, tournament_id):
    job = _enqueue(session, tournament_id, idempotency_key="k1")
    session.commit()
    assert job.status == "queued"
    assert job.attempts == 0
    assert job.created_at is not None


def test_idempotency_replay_returns_original_job(session, tournament_id):
    job = _enqueue(session, tournament_id, idempotency_key="k1")
    session.commit()
    replay, created = solve_jobs.enqueue(
        session,
        tournament_id=tournament_id,
        type_=solve_jobs.MEET_SCHEDULE_SOLVE,
        params={"other": True},
        input_snapshot={},
        idempotency_key="k1",
    )
    assert not created
    assert replay.id == job.id
    assert replay.params == {"random_seed": 42}  # original wins


def test_idempotency_replay_works_after_completion(session, tournament_id):
    job = _enqueue(session, tournament_id, idempotency_key="k1")
    claimed = solve_jobs.claim_next(session, worker_id="w1")
    solve_jobs.mark_running(session, claimed)
    solve_jobs.complete_success(session, claimed, {"assignments": []})
    session.commit()
    replay, created = solve_jobs.enqueue(
        session,
        tournament_id=tournament_id,
        type_=solve_jobs.MEET_SCHEDULE_SOLVE,
        params={},
        input_snapshot={},
        idempotency_key="k1",
    )
    assert not created
    assert replay.id == job.id
    assert replay.status == "succeeded"


def test_second_active_submit_conflicts_with_existing_job(session, tournament_id):
    job = _enqueue(session, tournament_id, idempotency_key="k1")
    session.commit()
    with pytest.raises(ActiveSolveJobConflict) as exc:
        solve_jobs.enqueue(
            session,
            tournament_id=tournament_id,
            type_=solve_jobs.MEET_SCHEDULE_SOLVE,
            params={},
            input_snapshot={},
            idempotency_key="k2",
        )
    assert exc.value.existing.id == job.id


def test_new_submit_allowed_after_terminal(session, tournament_id):
    job = _enqueue(session, tournament_id, idempotency_key="k1")
    claimed = solve_jobs.claim_next(session, worker_id="w1")
    solve_jobs.mark_running(session, claimed)
    solve_jobs.complete_infeasible(session, claimed, {"status": "infeasible"})
    session.commit()
    second = _enqueue(session, tournament_id, idempotency_key="k2")
    session.commit()
    assert second.id != job.id
    assert second.status == "queued"


def test_partial_unique_index_enforces_active_rule_at_the_db(session, tournament_id):
    """Bypass the service pre-check: the index itself must reject a
    second active row on BOTH dialects (this is the repo's first
    partial index — the test proves create_all/migration produced it)."""
    _enqueue(session, tournament_id)
    session.commit()
    rogue = SolveJob(
        tournament_id=tournament_id,
        type=solve_jobs.MEET_SCHEDULE_SOLVE,
        status="running",
        params={},
        input_snapshot={},
    )
    session.add(rogue)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_idempotency_key_unique_index_allows_many_nulls(session, tournament_id):
    _enqueue(session, tournament_id)  # key=None
    claimed = solve_jobs.claim_next(session, worker_id="w1")
    solve_jobs.mark_running(session, claimed)
    solve_jobs.complete_success(session, claimed, {})
    session.commit()
    second = _enqueue(session, tournament_id)  # key=None again
    session.commit()
    assert second.idempotency_key is None


def test_transactional_enqueue_rollback_leaves_no_job(session, tournament_id):
    _enqueue(session, tournament_id, idempotency_key="doomed")
    session.rollback()
    remaining = session.execute(select(SolveJob)).scalars().all()
    assert remaining == []


# ---- claiming -----------------------------------------------------------


def test_claim_orders_by_priority_then_created_at(session, tournament_id):
    # Same tournament can't hold two active jobs, so use three tournaments.
    tids = [tournament_id]
    for _ in range(2):
        t = Tournament(name="x")
        session.add(t)
        session.commit()
        tids.append(t.id)
    base = datetime.now(timezone.utc)
    jobs = []
    for i, (tid, prio) in enumerate(zip(tids, [100, 50, 50])):
        job = _enqueue(session, tid, priority=prio)
        job.created_at = base + timedelta(seconds=i)
        jobs.append(job)
    session.commit()

    first = solve_jobs.claim_next(session, worker_id="w1")
    session.commit()
    # priority 50 beats 100; among the two 50s the older wins.
    assert first.id == jobs[1].id
    second = solve_jobs.claim_next(session, worker_id="w1")
    session.commit()
    assert second.id == jobs[2].id
    third = solve_jobs.claim_next(session, worker_id="w1")
    session.commit()
    assert third.id == jobs[0].id
    assert solve_jobs.claim_next(session, worker_id="w1") is None


def test_claim_stamps_lease_fields_and_increments_attempts(session, tournament_id):
    _enqueue(session, tournament_id)
    session.commit()
    job = solve_jobs.claim_next(session, worker_id="worker-a")
    session.commit()
    assert job.status == "claimed"
    assert job.claimed_by == "worker-a"
    assert job.claimed_at is not None
    assert job.heartbeat_at is not None
    assert job.attempts == 1


def test_claim_returns_none_on_empty_queue(session):
    assert solve_jobs.claim_next(session, worker_id="w1") is None


@pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL not set")
def test_postgres_concurrent_claims_never_double_claim(db):
    """Two sessions with open transactions: SKIP LOCKED must hand each
    a different job (never the same one)."""
    engine, Session = db
    if engine.dialect.name != "postgresql":
        pytest.skip("postgres-only concurrency semantics")
    setup = Session()
    tids = []
    for _ in range(2):
        t = Tournament(name="conc")
        setup.add(t)
        setup.commit()
        tids.append(t.id)
    for tid in tids:
        solve_jobs.enqueue(
            setup,
            tournament_id=tid,
            type_=solve_jobs.MEET_SCHEDULE_SOLVE,
            params={},
            input_snapshot={},
        )
    setup.commit()
    setup.close()

    s1, s2 = Session(), Session()
    try:
        a = solve_jobs.claim_next(s1, worker_id="w1")  # transaction open
        b = solve_jobs.claim_next(s2, worker_id="w2")  # must skip a's row
        assert a is not None and b is not None
        assert a.id != b.id
        s1.commit()
        s2.commit()
    finally:
        s1.close()
        s2.close()


# ---- lifecycle: running / success / infeasible / cancel -----------------


def _claim_and_run(session, tournament_id, **kwargs) -> SolveJob:
    _enqueue(session, tournament_id, **kwargs)
    job = solve_jobs.claim_next(session, worker_id="w1")
    solve_jobs.mark_running(session, job)
    session.commit()
    return job


def test_success_stores_result_and_finished_at(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    solve_jobs.complete_success(session, job, {"assignments": [1, 2]})
    session.commit()
    assert job.status == "succeeded"
    assert job.result == {"assignments": [1, 2]}
    assert job.finished_at is not None


def test_infeasible_is_terminal_and_distinct_from_failed(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    solve_jobs.complete_infeasible(
        session, job, {"status": "infeasible", "infeasibleReasons": ["r1"]}
    )
    session.commit()
    assert job.status == "infeasible"
    assert job.error is None
    # Terminal: nothing may leave it, including a retry-shaped fail().
    with pytest.raises(SolveJobTransitionError):
        solve_jobs.fail(session, job, {"code": "x"}, retryable=True)


def test_cancel_queued_job(session, tournament_id):
    job = _enqueue(session, tournament_id)
    session.commit()
    solve_jobs.cancel(session, job)
    session.commit()
    assert job.status == "cancelled"
    assert job.finished_at is not None


def test_cancel_running_job_flags_worker_via_heartbeat(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    solve_jobs.cancel(session, job)
    session.commit()
    status_seen_by_worker = solve_jobs.heartbeat(session, job, worker_id="w1")
    assert status_seen_by_worker == "cancelled"
    # A late heartbeat must not resurrect the lease on a cancelled job.
    assert job.status == "cancelled"


def test_cancel_terminal_is_idempotent_noop(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    solve_jobs.complete_success(session, job, {})
    session.commit()
    solve_jobs.cancel(session, job)
    assert job.status == "succeeded"


def test_heartbeat_updates_lease_and_progress(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    before = job.heartbeat_at
    status = solve_jobs.heartbeat(
        session, job, worker_id="w1", progress={"phase": "search", "solutionCount": 3}
    )
    session.commit()
    assert status == "running"
    assert job.progress == {"phase": "search", "solutionCount": 3}
    assert job.heartbeat_at >= before


# ---- retry classification ----------------------------------------------


def test_retryable_failure_requeues_until_attempts_exhausted(session, tournament_id):
    job = _claim_and_run(session, tournament_id, max_attempts=2)
    solve_jobs.fail(session, job, {"code": "worker_died"}, retryable=True)
    session.commit()
    assert job.status == "queued"
    assert job.claimed_by is None
    assert job.started_at is None

    # Second attempt fails too → terminal.
    job2 = solve_jobs.claim_next(session, worker_id="w2")
    assert job2.id == job.id
    assert job2.attempts == 2
    solve_jobs.mark_running(session, job2)
    solve_jobs.fail(session, job2, {"code": "worker_died"}, retryable=True)
    session.commit()
    assert job2.status == "failed"
    assert job2.finished_at is not None


def test_non_retryable_failure_is_terminal_on_first_attempt(session, tournament_id):
    job = _claim_and_run(session, tournament_id, max_attempts=3)
    solve_jobs.fail(session, job, {"code": "bad_input"}, retryable=False)
    session.commit()
    assert job.status == "failed"
    assert job.attempts == 1


# ---- reaping ------------------------------------------------------------


def test_reap_requeues_stale_running_job(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    job.heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=120)
    session.commit()
    reaped = solve_jobs.reap_expired(session, lease_seconds=30)
    session.commit()
    assert reaped == 1
    assert job.status == "queued"
    assert job.error["code"] == "lease_expired"


def test_reap_fails_job_past_attempt_budget(session, tournament_id):
    job = _claim_and_run(session, tournament_id, max_attempts=1)
    job.heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=120)
    session.commit()
    solve_jobs.reap_expired(session, lease_seconds=30)
    session.commit()
    assert job.status == "failed"


def test_reap_leaves_fresh_jobs_alone(session, tournament_id):
    job = _claim_and_run(session, tournament_id)
    assert solve_jobs.reap_expired(session, lease_seconds=30) == 0
    assert job.status == "running"


# ---- retention ----------------------------------------------------------


def test_prune_deletes_only_old_terminal_jobs(session, tournament_id):
    old = _claim_and_run(session, tournament_id)
    solve_jobs.complete_success(session, old, {})
    old.finished_at = datetime.now(timezone.utc) - timedelta(days=45)
    session.commit()

    fresh = _claim_and_run(session, tournament_id, idempotency_key="fresh")
    session.commit()

    pruned = solve_jobs.prune_terminal(session, retention_days=30)
    session.commit()
    assert pruned == 1
    remaining = session.execute(select(SolveJob)).scalars().all()
    assert [j.id for j in remaining] == [fresh.id]


# ---- listing ------------------------------------------------------------


def test_list_recent_is_bounded_and_stably_ordered(session, tournament_id):
    ids = []
    for i in range(3):
        job = _claim_and_run(session, tournament_id, idempotency_key=f"k{i}")
        solve_jobs.complete_success(session, job, {})
        # Distinct created_at per job: three same-transaction inserts can land
        # on ONE timestamp, and within a tie the ordering contract is
        # (created_at DESC, id DESC) — deterministic but arbitrary vs insertion
        # order, since ids are random UUIDs. This test asserts newest-first, so
        # it must actually make each job newer than the last.
        job.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=i)
        session.commit()
        ids.append(job.id)
    listed = solve_jobs.list_recent(session, tournament_id, limit=2)
    assert len(listed) == 2
    assert listed[0].id == ids[-1]


def test_get_job_scopes_by_tournament(session, tournament_id):
    job = _enqueue(session, tournament_id)
    session.commit()
    assert solve_jobs.get_job(session, tournament_id, job.id).id == job.id
    assert solve_jobs.get_job(session, uuid.uuid4(), job.id) is None


# ---- Per-user concurrency cap (SP-SEC-1 Phase 3, SEC-03) --------------


def _user(session, email="quota@example.com"):
    from db.models import User

    u = User(email=email)
    session.add(u)
    session.commit()
    return u


def _member_tournament(session, user, name="quota-t"):
    """A tournament the user is a member of — membership, not ownership,
    is what the cap counts."""
    from db.models import TournamentMember

    t = Tournament(name=name)
    session.add(t)
    session.commit()
    session.add(
        TournamentMember(tournament_id=t.id, user_id=user.id, role="owner")
    )
    session.commit()
    return t.id


def test_count_active_for_user_counts_across_tournaments(session):
    user = _user(session)
    a = _member_tournament(session, user, "a")
    b = _member_tournament(session, user, "b")
    assert solve_jobs.count_active_for_user(session, user.id) == 0
    _enqueue(session, a)
    _enqueue(session, b)
    session.commit()
    assert solve_jobs.count_active_for_user(session, user.id) == 2


def test_count_active_for_user_ignores_terminal_and_other_users(session):
    user = _user(session)
    other = _user(session, "other@example.com")
    mine = _member_tournament(session, user, "mine")
    theirs = _member_tournament(session, other, "theirs")

    finished = _enqueue(session, mine)
    finished.status = SolveJobStatus.SUCCEEDED.value
    _enqueue(session, theirs)
    session.commit()

    # A terminal job frees the slot; another user's active job is theirs.
    assert solve_jobs.count_active_for_user(session, user.id) == 0
    assert solve_jobs.count_active_for_user(session, other.id) == 1


def test_enqueue_raises_when_user_is_at_the_cap(session):
    user = _user(session)
    held = _member_tournament(session, user, "held")
    fresh = _member_tournament(session, user, "fresh")
    _enqueue(session, held)
    session.commit()

    with pytest.raises(UserSolveQuotaExceeded) as exc:
        solve_jobs.enqueue(
            session,
            tournament_id=fresh,
            type_=solve_jobs.MEET_SCHEDULE_SOLVE,
            params={},
            input_snapshot={},
            user_id=user.id,
            max_active_per_user=1,
        )
    assert exc.value.held == 1
    assert exc.value.limit == 1


def test_enqueue_without_user_context_is_uncapped(session):
    """Internal callers that pass no user_id keep the old behaviour.

    The cap is an API-boundary control; a worker or migration enqueueing
    on the system's behalf has no user to charge and must not be blocked
    by a limit meant for public submissions.
    """
    user = _user(session)
    a = _member_tournament(session, user, "a")
    b = _member_tournament(session, user, "b")
    _enqueue(session, a)
    session.commit()
    job, created = solve_jobs.enqueue(
        session,
        tournament_id=b,
        type_=solve_jobs.MEET_SCHEDULE_SOLVE,
        params={},
        input_snapshot={},
        max_active_per_user=1,  # no user_id → not enforced
    )
    assert created and job is not None
