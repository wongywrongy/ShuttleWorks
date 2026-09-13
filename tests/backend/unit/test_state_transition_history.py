"""Audit writes participate in the subject transaction, including atomic claims."""
import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session


@pytest.fixture
def session():
    from _helpers import upgrade_test_database
    engine = create_engine("sqlite:///:memory:")
    upgrade_test_database(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


def test_solve_sequence_has_one_record_per_transition_and_noop_has_none(session):
    from db.models import StateTransition, Tournament
    from solve_rail import solve_jobs
    tournament = Tournament(name="History")
    session.add(tournament)
    session.flush()
    job, _ = solve_jobs.enqueue(session, tournament_id=tournament.id, type_="history",
                               params={}, input_snapshot={}, max_attempts=2)
    job = solve_jobs.claim_next(session, worker_id="worker-1")
    solve_jobs.mark_running(session, job)
    solve_jobs.fail(session, job, {"code": "lost_worker"}, retryable=True)
    job = solve_jobs.claim_next(session, worker_id="worker-2")
    solve_jobs.mark_running(session, job)
    solve_jobs.complete_success(session, job, {})
    solve_jobs.cancel(session, job)  # Terminal retry is deliberately a no-op.
    session.flush()
    records = list(session.scalars(select(StateTransition).order_by(StateTransition.occurred_at)))
    assert [r.event for r in records] == ["claim", "run", "reap", "claim", "run", "succeed"]
    assert [(r.from_state, r.to_state) for r in records] == [
        ("queued", "claimed"), ("claimed", "running"), ("running", "queued"),
        ("queued", "claimed"), ("claimed", "running"), ("running", "succeeded"),
    ]
    assert all(r.subject_id == str(job.id) and r.machine_version == 1 for r in records)
    assert records[0].actor_id == "worker-1" and records[3].actor_id == "worker-2"


def test_match_rollback_restores_subject_and_removes_history(session):
    from db.models import Match, StateTransition, Tournament
    from operations.match_state import transition_match
    tournament = Tournament(name="Atomic history")
    session.add(tournament)
    session.flush()
    match = Match(tournament_id=tournament.id, id="m1", status="scheduled")
    session.add(match)
    session.commit()
    session.info["transition_actor"] = {"type": "operator", "id": "director"}
    transition_match(match, "called", session=session)
    session.flush()
    record = session.scalar(select(StateTransition))
    assert record.actor_id == "director"
    session.rollback()
    assert match.status == "scheduled"
    assert session.scalar(select(StateTransition)) is None


def test_refused_match_and_same_state_write_never_add_history(session):
    from db.models import Match, StateTransition, Tournament
    from core.exceptions import ConflictError
    from operations.match_state import transition_match
    tournament = Tournament(name="Refused history")
    session.add(tournament)
    session.flush()
    match = Match(tournament_id=tournament.id, id="m2", status="scheduled")
    session.add(match)
    session.flush()
    assert transition_match(match, "scheduled", session=session) is None
    with pytest.raises(ConflictError):
        transition_match(match, "finished", session=session)
    session.flush()
    assert match.status == "scheduled"
    assert session.scalar(select(StateTransition)) is None


def test_entry_confirm_uses_state_column_and_audits_once(session):
    from db.models import Entry, EntryEvent, StateTransition, Tournament
    from entries.lifecycle import confirm, LifecycleError
    tournament = Tournament(name="Registration history")
    session.add(tournament)
    session.flush()
    event = EntryEvent(tournament_id=tournament.id, id=uuid.uuid4(), code="MS", discipline="Singles")
    session.add(event)
    session.flush()
    entry = Entry(tournament_id=tournament.id, entry_event_id=event.id, state="pending")
    session.add(entry)
    session.flush()
    confirm(session, entry, actor_id="director")
    with pytest.raises(LifecycleError):
        confirm(session, entry, actor_id="director")
    session.flush()
    records = list(session.scalars(select(StateTransition)))
    assert len(records) == 1
    assert (records[0].from_state, records[0].to_state) == ("pending", "confirmed")
    assert records[0].actor_id == "director"
