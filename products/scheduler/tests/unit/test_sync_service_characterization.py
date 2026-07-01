"""Characterization tests for ``services.sync_service`` — SP-REFACTOR safety net.

These PIN CURRENT BEHAVIOR of the outbox replicator before any refactor
touches it (SP-REFACTOR-2 "safety net first"). They are deliberately
behavior-descriptive, not aspirational: they assert what ``_process_row``,
the worker lifecycle, and the client lazy-construction path do *today*, so a
regression becomes a failing test rather than a silent data-mirror bug.

The existing ``test_sync_service.py`` covers the ``match`` push path,
failure/retry/cap, ordering, and local-dev no-op. This file covers the
previously-uncovered surface:
  - every non-``match`` entity-type dispatch branch in ``_process_row``
  - the ``bracket_event_delete`` tombstone (DELETE, not upsert)
  - the unknown-entity-type cap-and-keep branch
  - the mid-drain ``stop_event`` break
  - worker start/stop/loop lifecycle
  - ``_isoformat`` edges and lazy Supabase client construction

Supabase is a ``MagicMock``; sessions are in-memory SQLite. No network, no
sleeps beyond a bounded worker-drain poll.
"""
from __future__ import annotations

import sys
import time
import types
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# conftest adds backend/ to sys.path.
from database.models import Base, SyncQueue
from services.sync_service import MAX_ATTEMPTS, SyncService, _isoformat


# ---- Fixtures (mirror test_sync_service.py) ----------------------------


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
    return MagicMock(name="supabase_client")


@pytest.fixture
def service(fake_client, Session):
    return SyncService(supabase_client=fake_client, session_factory=Session)


def _seed_row(
    session,
    *,
    entity_type: str,
    payload: dict | None = None,
    entity_id: str = "e1",
    attempts: int = 0,
    created_at: datetime | None = None,
) -> SyncQueue:
    row = SyncQueue(
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload if payload is not None else {"tournament_id": "t1", "id": entity_id},
        attempts=attempts,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(row)
    session.commit()
    return row


# ---- _process_row dispatch: every entity type → correct table + on_conflict


@pytest.mark.parametrize(
    "entity_type,expected_table,expected_on_conflict",
    [
        ("match", "matches", "tournament_id,id"),
        ("tournament", "tournaments", "id"),
        ("bracket_event", "bracket_events", "tournament_id,id"),
        ("bracket_match", "bracket_matches", "tournament_id,bracket_event_id,id"),
        (
            "bracket_result",
            "bracket_results",
            "tournament_id,bracket_event_id,bracket_match_id",
        ),
        (
            "bracket_participant",
            "bracket_participants",
            "tournament_id,bracket_event_id,id",
        ),
    ],
)
def test_process_row_dispatches_to_correct_table_and_on_conflict(
    service, fake_client, Session, entity_type, expected_table, expected_on_conflict
):
    payload = {"tournament_id": "t1", "id": "x1", "marker": entity_type}
    with Session() as session:
        _seed_row(session, entity_type=entity_type, payload=payload)

    pushed = service.flush_queue()

    assert pushed == 1
    fake_client.table.assert_called_with(expected_table)
    upsert = fake_client.table.return_value.upsert
    args, kwargs = upsert.call_args
    assert args[0] == payload
    assert kwargs.get("on_conflict") == expected_on_conflict
    # Row drained on success.
    with Session() as session:
        assert session.query(SyncQueue).count() == 0


def test_bracket_event_delete_issues_delete_chain_and_drains(
    service, fake_client, Session
):
    payload = {"tournament_id": "t-del", "id": "ev-del"}
    with Session() as session:
        _seed_row(
            session, entity_type="bracket_event_delete", payload=payload, entity_id="ev-del"
        )

    pushed = service.flush_queue()

    assert pushed == 1
    # It is a DELETE on bracket_events filtered by tournament_id + id, NOT an upsert.
    fake_client.table.assert_called_with("bracket_events")
    delete = fake_client.table.return_value.delete
    delete.assert_called_once()
    eq = delete.return_value.eq
    # Two chained .eq(...) filters, in order.
    assert eq.call_args_list[0].args == ("tournament_id", "t-del")
    eq.return_value.eq.assert_called_with("id", "ev-del")
    fake_client.table.return_value.upsert.assert_not_called()
    with Session() as session:
        assert session.query(SyncQueue).count() == 0


def test_unknown_entity_type_is_capped_and_kept_without_pushing(
    service, fake_client, Session
):
    with Session() as session:
        row = _seed_row(session, entity_type="mystery_kind", entity_id="u1")
        row_id = row.id

    pushed = service.flush_queue()

    assert pushed == 0
    # No Supabase write attempted for an unknown type.
    fake_client.table.return_value.upsert.assert_not_called()
    with Session() as session:
        kept = session.get(SyncQueue, row_id)
        assert kept is not None
        # Capped so it is not retried forever, and stamped.
        assert kept.attempts == MAX_ATTEMPTS
        assert kept.last_attempt is not None


def test_flush_breaks_immediately_when_stop_event_already_set(
    service, fake_client, Session
):
    with Session() as session:
        _seed_row(session, entity_type="match", entity_id="a")
        _seed_row(session, entity_type="match", entity_id="b")

    service._stop_event.set()
    pushed = service.flush_queue()

    assert pushed == 0
    fake_client.table.return_value.upsert.assert_not_called()
    with Session() as session:
        assert session.query(SyncQueue).count() == 2


# ---- worker lifecycle --------------------------------------------------


def test_start_is_idempotent_and_stop_joins_and_clears(service):
    service.start()
    try:
        first = service._worker_thread
        assert first is not None and first.is_alive()
        # Second start() is a no-op — same thread, not a new one.
        service.start()
        assert service._worker_thread is first
    finally:
        service.stop(timeout=5.0)
    assert service._worker_thread is None


def test_stop_without_start_is_safe(service):
    # Never started: stop() returns without raising or blocking.
    assert service._worker_thread is None
    service.stop()
    assert service._worker_thread is None


def test_worker_loop_drains_queue_in_background(fake_client, Session):
    svc = SyncService(
        supabase_client=fake_client,
        session_factory=Session,
        worker_interval_seconds=0.01,
    )
    with Session() as session:
        _seed_row(session, entity_type="match", entity_id="bg1")

    svc.start()
    try:
        # Poll (bounded) until the worker drains the row, rather than sleeping blind.
        drained = False
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            with Session() as session:
                if session.query(SyncQueue).count() == 0:
                    drained = True
                    break
            time.sleep(0.02)
        assert drained, "worker did not drain the queue within 3s"
        fake_client.table.return_value.upsert.return_value.execute.assert_called()
    finally:
        svc.stop(timeout=5.0)


def test_worker_iteration_failure_is_swallowed_by_loop(fake_client, Session):
    """A raising ``flush_queue`` must not kill the worker thread — the loop
    logs and continues. Pinned because the outbox's whole promise is
    'completes even if the cloud is unreachable all day'."""
    svc = SyncService(
        supabase_client=fake_client,
        session_factory=Session,
        worker_interval_seconds=0.01,
    )
    calls = {"n": 0}
    original = svc.flush_queue

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom in iteration 1")
        return original()

    svc.flush_queue = flaky  # type: ignore[method-assign]
    svc.start()
    try:
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline and calls["n"] < 2:
            time.sleep(0.02)
        # Thread survived the exception and kept iterating.
        assert calls["n"] >= 2
        assert svc._worker_thread is not None and svc._worker_thread.is_alive()
    finally:
        svc.stop(timeout=5.0)


# ---- _isoformat pure function -----------------------------------------


def test_isoformat_none_returns_none():
    assert _isoformat(None) is None


def test_isoformat_naive_datetime_is_treated_as_utc():
    naive = datetime(2026, 6, 30, 12, 0, 0)
    out = _isoformat(naive)
    assert out is not None
    assert out.endswith("+00:00")
    assert out.startswith("2026-06-30T12:00:00")


def test_isoformat_aware_datetime_preserves_offset():
    aware = datetime(2026, 6, 30, 12, 0, 0, tzinfo=timezone.utc)
    assert _isoformat(aware) == "2026-06-30T12:00:00+00:00"


# ---- lazy Supabase client construction --------------------------------


def test_get_client_returns_injected_client_first(service, fake_client):
    assert service._get_client() is fake_client


def test_get_client_returns_cached_when_no_injection():
    svc = SyncService(supabase_client=None)
    sentinel = object()
    svc._client_cache = sentinel
    assert svc._get_client() is sentinel


def test_get_client_none_without_url_or_key():
    svc = SyncService(supabase_client=None)
    svc._settings = type("S", (), {"supabase_url": "", "supabase_anon_key": ""})()
    assert svc._get_client() is None


def test_get_client_builds_and_caches_when_configured(monkeypatch):
    svc = SyncService(supabase_client=None)
    svc._settings = type(
        "S", (), {"supabase_url": "https://x.supabase.co", "supabase_anon_key": "k"}
    )()
    built = object()
    fake_module = types.ModuleType("supabase")
    fake_module.create_client = lambda url, key: built
    monkeypatch.setitem(sys.modules, "supabase", fake_module)

    assert svc._get_client() is built
    # Cached — a second call does not rebuild.
    assert svc._client_cache is built
    assert svc._get_client() is built


def test_get_client_returns_none_when_construction_raises(monkeypatch):
    """Construction failure must return None, never propagate — the request
    thread must never crash because the cloud client failed to build."""
    svc = SyncService(supabase_client=None)
    svc._settings = type(
        "S", (), {"supabase_url": "https://x.supabase.co", "supabase_anon_key": "k"}
    )()

    def boom(url, key):
        raise RuntimeError("cannot construct")

    fake_module = types.ModuleType("supabase")
    fake_module.create_client = boom
    monkeypatch.setitem(sys.modules, "supabase", fake_module)

    assert svc._get_client() is None
