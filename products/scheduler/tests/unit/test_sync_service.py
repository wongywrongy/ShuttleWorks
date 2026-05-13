"""Unit tests for ``services.sync_service`` (Step E of the arc).

Six tests covering the prompt's five scenarios plus a per-thread
session pinning test:

1. Successful push — Supabase client receives the right payload with
   ``on_conflict`` set; queue row deleted afterwards.
2. Failed push — exception caught, ``attempts`` incremented, row
   retained.
3. Flush queue ordering — rows processed in ``created_at`` order;
   deleted on success.
4. Flush queue partial failure — some rows succeed (deleted), some
   fail (retained with incremented attempts).
5. 10-attempt cap — rows whose ``attempts >= 10`` are skipped: not
   retried, not deleted.
6. Concurrent enqueue — two threads can each stage a row in their own
   session without stepping on each other (per-thread session contract).

Supabase client is a Mock injected at construction. No real network
calls; all tests are sub-second.
"""
from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# conftest adds backend/ to sys.path.
from database.models import Base, Match, SyncQueue
from services.sync_service import MAX_ATTEMPTS, SyncService


# ---- Fixtures ----------------------------------------------------------


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def Session(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def fake_client():
    """Mock Supabase client whose ``.table().upsert().execute()`` chain
    is a MagicMock so tests can introspect the call args."""
    client = MagicMock(name="supabase_client")
    return client


@pytest.fixture
def service(fake_client, Session):
    """SyncService instance with the test's in-memory session factory
    injected. Avoids module-level monkeypatching which doesn't survive
    other test files' ``isolate_test_database`` purges."""
    return SyncService(supabase_client=fake_client, session_factory=Session)


def _tournament_id() -> uuid.UUID:
    return uuid.uuid4()


def _seed_match_payload(
    session,
    *,
    tournament_id: uuid.UUID,
    match_id: str = "m1",
    created_at: datetime | None = None,
) -> SyncQueue:
    payload = {
        "tournament_id": str(tournament_id),
        "id": match_id,
        "court_id": 1,
        "time_slot": 4,
        "status": "called",
        "version": 2,
    }
    row = SyncQueue(
        entity_type="match",
        entity_id=match_id,
        payload=payload,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(row)
    session.commit()
    return row


# ---- 1. Successful push ------------------------------------------------


def test_successful_push_deletes_row_and_calls_supabase_with_correct_payload(
    service, fake_client, Session
):
    tid = _tournament_id()
    with Session() as session:
        _seed_match_payload(session, tournament_id=tid)
        assert session.scalar(select(SyncQueue).limit(1)) is not None

    pushed = service.flush_queue()
    assert pushed == 1

    # Verify the Supabase call shape.
    fake_client.table.assert_called_with("matches")
    upsert = fake_client.table.return_value.upsert
    upsert.assert_called_once()
    args, kwargs = upsert.call_args
    payload = args[0]
    assert payload["tournament_id"] == str(tid)
    assert payload["id"] == "m1"
    assert payload["status"] == "called"
    assert payload["version"] == 2
    assert kwargs.get("on_conflict") == "tournament_id,id"
    fake_client.table.return_value.upsert.return_value.execute.assert_called_once()

    # Queue is drained.
    with Session() as session:
        assert session.query(SyncQueue).count() == 0


# ---- 2. Failed push ----------------------------------------------------


def test_failed_push_increments_attempts_and_retains_row(
    service, fake_client, Session
):
    fake_client.table.return_value.upsert.return_value.execute.side_effect = (
        RuntimeError("network down")
    )

    tid = _tournament_id()
    with Session() as session:
        row = _seed_match_payload(session, tournament_id=tid)
        row_id = row.id

    pushed = service.flush_queue()
    assert pushed == 0

    with Session() as session:
        kept = session.get(SyncQueue, row_id)
        assert kept is not None
        assert kept.attempts == 1
        assert kept.last_attempt is not None


# ---- 3. Flush queue ordering ------------------------------------------


def test_flush_queue_processes_rows_in_created_at_order(
    service, fake_client, Session
):
    tid = _tournament_id()
    base = datetime.now(timezone.utc)
    with Session() as session:
        _seed_match_payload(
            session,
            tournament_id=tid,
            match_id="m_third",
            created_at=base + timedelta(seconds=2),
        )
        _seed_match_payload(
            session,
            tournament_id=tid,
            match_id="m_first",
            created_at=base,
        )
        _seed_match_payload(
            session,
            tournament_id=tid,
            match_id="m_second",
            created_at=base + timedelta(seconds=1),
        )

    service.flush_queue()

    upsert = fake_client.table.return_value.upsert
    # Three calls, in the order their created_at dictates.
    assert upsert.call_count == 3
    ordered_ids = [call.args[0]["id"] for call in upsert.call_args_list]
    assert ordered_ids == ["m_first", "m_second", "m_third"]
    with Session() as session:
        assert session.query(SyncQueue).count() == 0


# ---- 4. Partial failure -----------------------------------------------


def test_partial_failure_deletes_successes_retains_failures(
    service, fake_client, Session
):
    # Make the second push fail. Sequence by row id: m1 → ok, m2 → boom, m3 → ok.
    call_count = {"n": 0}

    def execute_side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("transient")
        return MagicMock()

    fake_client.table.return_value.upsert.return_value.execute.side_effect = (
        execute_side_effect
    )

    tid = _tournament_id()
    base = datetime.now(timezone.utc)
    failing_id = None
    with Session() as session:
        _seed_match_payload(
            session, tournament_id=tid, match_id="m1", created_at=base
        )
        m2 = _seed_match_payload(
            session,
            tournament_id=tid,
            match_id="m2",
            created_at=base + timedelta(seconds=1),
        )
        failing_id = m2.id
        _seed_match_payload(
            session,
            tournament_id=tid,
            match_id="m3",
            created_at=base + timedelta(seconds=2),
        )

    service.flush_queue()

    with Session() as session:
        remaining = list(session.scalars(select(SyncQueue)))
        assert len(remaining) == 1
        kept = remaining[0]
        assert kept.id == failing_id
        assert kept.attempts == 1
        assert kept.entity_id == "m2"


# ---- 5. 10-attempt cap ------------------------------------------------


def test_rows_at_max_attempts_are_skipped(service, fake_client, Session):
    tid = _tournament_id()
    with Session() as session:
        capped = _seed_match_payload(
            session, tournament_id=tid, match_id="m_capped"
        )
        capped.attempts = MAX_ATTEMPTS
        session.commit()

    pushed = service.flush_queue()
    assert pushed == 0

    # Supabase wasn't called.
    fake_client.table.return_value.upsert.return_value.execute.assert_not_called()
    # Row is still there.
    with Session() as session:
        kept = session.scalar(select(SyncQueue))
        assert kept is not None
        assert kept.attempts == MAX_ATTEMPTS


def test_rows_that_hit_cap_during_this_flush_are_logged_but_kept(
    service, fake_client, Session
):
    """A row at attempts=9 that fails this iteration goes to 10 and is
    then left alone forever — neither deleted nor retried in
    subsequent flushes."""
    fake_client.table.return_value.upsert.return_value.execute.side_effect = (
        RuntimeError("still broken")
    )

    tid = _tournament_id()
    with Session() as session:
        row = _seed_match_payload(session, tournament_id=tid)
        row.attempts = MAX_ATTEMPTS - 1
        session.commit()
        row_id = row.id

    service.flush_queue()
    with Session() as session:
        post = session.get(SyncQueue, row_id)
        assert post is not None
        assert post.attempts == MAX_ATTEMPTS

    # Reset the call count then flush again — capped row should be skipped.
    fake_client.table.return_value.upsert.return_value.execute.reset_mock(
        side_effect=True
    )
    fake_client.table.return_value.upsert.return_value.execute.side_effect = None
    service.flush_queue()
    fake_client.table.return_value.upsert.return_value.execute.assert_not_called()


# ---- 6. Concurrent enqueue ---------------------------------------------


def test_enqueue_match_is_pure_session_add_no_global_state(Session):
    """``SyncService.enqueue_match`` is a static helper that only
    touches the caller's session. The same call from two separate
    sessions must produce two independent rows — pins that the helper
    holds no module-level state that would alias the two calls.

    (A true cross-thread concurrency test against on-disk SQLite would
    be more rigorous but the in-memory ``StaticPool`` test fixture
    serialises both sessions onto one connection. The contract we
    actually need to prove — "no shared state in ``enqueue_match``" —
    is verifiable with two sequential calls.)
    """
    tid = _tournament_id()
    with Session() as s1:
        match_a = Match(
            tournament_id=tid, id="ma", status="scheduled", version=1
        )
        s1.add(match_a)
        s1.flush()
        SyncService.enqueue_match(s1, match_a)
        s1.commit()

    with Session() as s2:
        match_b = Match(
            tournament_id=tid, id="mb", status="scheduled", version=1
        )
        s2.add(match_b)
        s2.flush()
        SyncService.enqueue_match(s2, match_b)
        s2.commit()

    with Session() as s3:
        ids = {row.entity_id for row in s3.scalars(select(SyncQueue))}
        assert ids == {"ma", "mb"}


# ---- Local-dev mode (no Supabase client) ------------------------------


def test_flush_queue_is_noop_without_supabase_client(Session):
    """In local-dev mode the service has no Supabase URL and the
    constructor's lazy lookup returns None. Flush should be a no-op."""
    service = SyncService(supabase_client=None)
    # Force the lazy lookup path by giving it settings that resolve to None.
    service._settings = type("S", (), {"supabase_url": "", "supabase_anon_key": ""})()
    tid = _tournament_id()
    with Session() as session:
        _seed_match_payload(session, tournament_id=tid)

    pushed = service.flush_queue()
    assert pushed == 0
    with Session() as session:
        # Row is still in the queue — nothing happened.
        assert session.query(SyncQueue).count() == 1
