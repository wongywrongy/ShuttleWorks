"""Real simultaneous-session proofs for sync allocation and ingestion.

SQLite uses a file-backed WAL database so each worker owns a real connection;
PostgreSQL runs when CI supplies its disposable ``TEST_POSTGRES_URL``.
"""
from __future__ import annotations

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from db.models import (
    Base,
    CloudEventProjection,
    EventOperation,
    EventOperationSequence,
    SyncCheckpoint,
    Tournament,
    TournamentAuthority,
    TournamentMember,
    User,
)
from core.dependencies import AuthUser, require_tournament_access
from fastapi import HTTPException
from repositories import LocalRepository
from sync.schemas import OperationEnvelope, SyncBatchRequest
from sync.service import (
    ProtocolError,
    append_local_operation,
    begin_checkout,
    checkpoint_digest,
    checkpoint_package,
    ingest_batch,
    mark_ready,
    operation_to_envelope,
    rebuild_cloud_projection,
    recover_lost_node,
)


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")


@pytest.fixture(params=["sqlite", "postgres"])
def concurrent_db(request, tmp_path):
    if request.param == "postgres":
        if not POSTGRES_URL:
            pytest.skip("TEST_POSTGRES_URL not set")
        from db.session import normalize_database_url

        engine = create_engine(normalize_database_url(POSTGRES_URL), future=True)
    else:
        engine = create_engine(
            f"sqlite:///{tmp_path / 'sync-concurrency.db'}",
            connect_args={"check_same_thread": False, "timeout": 20},
            future=True,
        )
        with engine.begin() as connection:
            connection.execute(text("PRAGMA journal_mode=WAL"))
            connection.execute(text("PRAGMA busy_timeout=20000"))
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield engine, Session
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_concurrent_operation_requests_allocate_unique_contiguous_sequences(
    concurrent_db,
) -> None:
    _engine, Session = concurrent_db
    tournament_id, node_id = uuid.uuid4(), uuid.uuid4()
    setup = Session()
    setup.add(Tournament(id=tournament_id, name="Concurrent allocation", data={}))
    setup.commit()
    authority, _capability, _checkpoint = begin_checkout(
        setup, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        setup,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=_capability,
        checkpoint_hash=authority.checkpoint_hash,
    )
    setup.close()

    count = 12
    barrier = threading.Barrier(count, timeout=20)

    def write_one(index: int) -> int:
        session = Session()
        try:
            barrier.wait()
            operation = append_local_operation(
                session,
                tournament_id=tournament_id,
                node_id=node_id,
                actor_id=uuid.uuid4(),
                command_type="match.command.v1",
                aggregate_type="match",
                aggregate_id=f"m{index}",
                payload={"index": index},
                expected_version=None,
            )
            session.commit()
            return operation.sequence
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=count) as pool:
        sequences = list(pool.map(write_one, range(count)))

    assert sorted(sequences) == list(range(1, count + 1))
    verify = Session()
    try:
        assert list(
            verify.scalars(
                select(EventOperation.sequence)
                .where(EventOperation.tournament_id == tournament_id)
                .order_by(EventOperation.sequence)
            )
        ) == list(range(1, count + 1))
        allocator = verify.get(EventOperationSequence, (tournament_id, authority.epoch))
        assert allocator is not None and allocator.next_sequence == count + 1
    finally:
        verify.close()


def test_concurrent_checkout_creates_exactly_one_live_authority(concurrent_db) -> None:
    _engine, Session = concurrent_db
    tournament_id = uuid.uuid4()
    with Session() as setup:
        setup.add(Tournament(id=tournament_id, name="Concurrent checkout", data={}))
        setup.commit()

    barrier = threading.Barrier(2, timeout=20)

    def checkout_one(_index: int) -> str:
        with Session() as session:
            barrier.wait()
            try:
                begin_checkout(
                    session,
                    tournament_id=tournament_id,
                    node_id=uuid.uuid4(),
                )
                return "created"
            except ProtocolError as exc:
                assert exc.code == "authority_already_granted"
                return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(checkout_one, range(2)))

    assert outcomes.count("created") == 1
    assert outcomes.count("authority_already_granted") == 1
    with Session() as verify:
        live = list(
            verify.scalars(
                select(TournamentAuthority).where(
                    TournamentAuthority.tournament_id == tournament_id,
                    TournamentAuthority.state.in_(("preparing", "active")),
                )
            )
        )
        assert len(live) == 1
        checkpoint = verify.get(SyncCheckpoint, (tournament_id, live[0].epoch))
        assert checkpoint is not None
        assert checkpoint.highest_contiguous_sequence == 0


def test_concurrent_identical_ingestion_is_idempotent(concurrent_db) -> None:
    _engine, Session = concurrent_db
    tournament_id, node_id = uuid.uuid4(), uuid.uuid4()
    setup = Session()
    setup.add(Tournament(id=tournament_id, name="Concurrent ingestion", data={}))
    setup.commit()
    authority, capability, checkpoint = begin_checkout(
        setup, tournament_id=tournament_id, node_id=node_id
    )
    authority_epoch = authority.epoch
    mark_ready(
        setup,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority_epoch,
        capability=capability,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    local = append_local_operation(
        setup,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=uuid.uuid4(),
        command_type="match.command.v1",
        aggregate_type="match",
        aggregate_id="m1",
        payload={"action": "start"},
        expected_version=None,
    )
    envelope = operation_to_envelope(local)
    setup.rollback()  # cloud receives the envelope; it has not stored it yet
    setup.close()
    batch = SyncBatchRequest(
        node_id=node_id, authority_epoch=authority_epoch, operations=[envelope]
    )
    barrier = threading.Barrier(2, timeout=20)

    def ingest_one() -> tuple[int, int, int] | str:
        session = Session()
        try:
            barrier.wait()
            return ingest_batch(
                session,
                tournament_id=tournament_id,
                capability=capability,
                batch=batch,
            )
        except ProtocolError as exc:
            # SQLite may explicitly ask one simultaneous writer to retry;
            # this is a stable retryable response, never a raw database 500.
            assert exc.code == "ingestion_retry_required"
            return exc.code
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _index: ingest_one(), range(2)))

    assert any(outcome == (1, 1, 0) for outcome in outcomes)
    verify = Session()
    try:
        assert len(
            list(
                verify.scalars(
                    select(EventOperation).where(
                        EventOperation.operation_id == envelope.operation_id
                    )
                )
            )
        ) == 1
        checkpoint = verify.get(SyncCheckpoint, (tournament_id, authority_epoch))
        assert checkpoint is not None
        assert checkpoint.highest_contiguous_sequence == 1
    finally:
        verify.close()


def test_concurrent_overlapping_batches_advance_cursor_contiguously(
    concurrent_db,
) -> None:
    _engine, Session = concurrent_db
    tournament_id, node_id = uuid.uuid4(), uuid.uuid4()
    with Session() as setup:
        setup.add(Tournament(id=tournament_id, name="Overlapping ingestion", data={}))
        setup.commit()
        authority, capability, checkpoint = begin_checkout(
            setup, tournament_id=tournament_id, node_id=node_id
        )
        mark_ready(
            setup,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=checkpoint_digest(checkpoint),
        )
        authority_epoch = authority.epoch

    now = datetime.now(timezone.utc)
    operations = [
        OperationEnvelope(
            operation_id=uuid.uuid4(),
            event_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority_epoch,
            sequence=sequence,
            actor_id=uuid.uuid4(),
            command_type="match.command.v1",
            aggregate_type="match",
            aggregate_id=f"m{sequence}",
            payload={"sequence": sequence},
            expected_version=None,
            occurred_at_local=now,
            accepted_at_node=now,
            schema_version=3,
        )
        for sequence in (1, 2)
    ]
    batches = [
        SyncBatchRequest(
            node_id=node_id,
            authority_epoch=authority_epoch,
            operations=[operations[0]],
        ),
        SyncBatchRequest(
            node_id=node_id,
            authority_epoch=authority_epoch,
            operations=operations,
        ),
    ]
    barrier = threading.Barrier(2, timeout=20)

    def ingest_one(batch: SyncBatchRequest) -> tuple[int, int, int]:
        with Session() as session:
            barrier.wait()
            try:
                return ingest_batch(
                    session,
                    tournament_id=tournament_id,
                    capability=capability,
                    batch=batch,
                )
            except ProtocolError as exc:
                assert exc.code == "ingestion_retry_required"
                # The event-node contract retains this batch and retries it.
                return ingest_batch(
                    session,
                    tournament_id=tournament_id,
                    capability=capability,
                    batch=batch,
                )

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(ingest_one, batches))

    assert all(outcome[0] in (1, 2) for outcome in outcomes)
    with Session() as verify:
        assert list(
            verify.scalars(
                select(EventOperation.sequence)
                .where(
                    EventOperation.tournament_id == tournament_id,
                    EventOperation.authority_epoch == authority_epoch,
                )
                .order_by(EventOperation.sequence)
            )
        ) == [1, 2]
        checkpoint = verify.get(SyncCheckpoint, (tournament_id, authority_epoch))
        assert checkpoint is not None
        assert checkpoint.highest_contiguous_sequence == 2


def test_authority_projection_recovery_and_tenant_isolation_share_dialect_contract(
    concurrent_db,
) -> None:
    """Exercise the production lifecycle on both supported database engines."""
    _engine, Session = concurrent_db
    session = Session()
    owner_id = uuid.uuid4()
    foreign_id = uuid.uuid4()
    tournament_id = uuid.uuid4()
    other_tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    session.add_all(
        [
            User(id=owner_id, email=f"{owner_id}@example.test"),
            User(id=foreign_id, email=f"{foreign_id}@example.test"),
            Tournament(id=tournament_id, name="Dialect lifecycle", data={"version": 2}),
            Tournament(id=other_tournament_id, name="Other tenant", data={"version": 2}),
            TournamentMember(
                tournament_id=tournament_id,
                user_id=owner_id,
                role="owner",
            ),
            TournamentMember(
                tournament_id=other_tournament_id,
                user_id=foreign_id,
                role="owner",
            ),
        ]
    )
    session.commit()

    authority, capability, checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    projection = rebuild_cloud_projection(
        session,
        checkpoint=checkpoint,
        checkpoint_hash=checkpoint_digest(checkpoint),
        authority_epoch=authority.epoch,
    )
    assert session.get(CloudEventProjection, tournament_id) is projection
    assert projection.last_sequence == 0

    membership_check = require_tournament_access("viewer")
    with pytest.raises(HTTPException) as denied:
        membership_check(
            tournament_id=tournament_id,
            user=AuthUser(id=str(foreign_id), email=f"{foreign_id}@example.test"),
            repo=LocalRepository(session),
        )
    assert denied.value.status_code == 404

    backup_hash = "d" * 64
    recovery_checkpoint = checkpoint_package(
        session.get(Tournament, tournament_id),
        schema_version=3,
        session=session,
    )
    recovery_checkpoint["recovery"] = {
        "sourceAuthorityEpoch": authority.epoch,
        "backupSequence": 0,
        "backupHash": backup_hash,
        "cloudSequence": 0,
        "replayedOperationIds": [],
    }
    previous, replacement, _replacement_capability = recover_lost_node(
        session,
        tournament_id=tournament_id,
        new_node_id=uuid.uuid4(),
        authority_epoch=authority.epoch,
        actor_id=owner_id,
        device_id=node_id,
        reason="Dialect recovery proof",
        backup_sequence=0,
        declared_last_sequence=0,
        backup_hash=backup_hash,
        recovery_checkpoint=recovery_checkpoint,
        confirmation=True,
    )
    assert previous.state == "recovered"
    assert replacement.state == "preparing"
    session.close()
