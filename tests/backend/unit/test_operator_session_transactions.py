"""Session writes recheck deadlines and revocation under a database reservation."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import threading
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.time_utils import _aware
from core.tokens import _hash_token
from db.models import AuthSession, User
from repositories.local import LocalRepository
from tests.backend.unit import test_baseline_schema as fixtures
from tests.backend.unit.test_operator_mfa import NOW

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated


@pytest.fixture
def credential(migrated):
    with Session(migrated, autoflush=False, expire_on_commit=False) as session:
        user_id = uuid.uuid4()
        session.add(User(id=user_id, email=f"{user_id}@example.test"))
        session.flush()
        row = AuthSession(user_id=user_id, token_hash=_hash_token("old-fixture-cookie"),
            created_at=NOW, last_seen_at=NOW, expires_at=NOW + timedelta(hours=12))
        session.add(row)
        session.commit()
        yield LocalRepository(session), row


def test_reauthentication_rotates_once_without_extending_the_original_deadline(credential):
    repo, row = credential
    with repo.transaction():
        raw, replacement = repo.mfa.rotate_session(row, 7, NOW + timedelta(minutes=5))
    assert replacement.token_hash == _hash_token(raw) and replacement.token_hash != row.token_hash
    assert replacement.mfa_generation == 7
    assert _aware(replacement.authenticated_at) == NOW + timedelta(minutes=5)
    assert _aware(replacement.created_at) == NOW
    assert _aware(replacement.expires_at) == NOW + timedelta(hours=12)
    with repo.transaction():
        assert repo.mfa.rotate_session(row, 7, NOW + timedelta(minutes=5)) is None


@pytest.mark.parametrize("condition", ["revoked", "idle", "absolute", "expired"])
def test_delayed_activity_and_proof_cannot_revive_a_dead_credential(credential, condition):
    repo, row = credential
    if condition == "revoked":
        row.revoked_at = NOW
    elif condition == "expired":
        row.expires_at = NOW
    elif condition == "absolute":
        row.created_at = NOW - timedelta(hours=12)
    elif condition == "idle":
        row.created_at = row.last_seen_at = NOW - timedelta(hours=1)
    repo.session.commit()
    original_activity = row.last_seen_at
    with repo.transaction():
        assert not repo.mfa.record_activity(row.id, row.user_id, offline=False, now=NOW)
        assert repo.mfa.rotate_session(row, 7, NOW) is None
    repo.session.refresh(row)
    assert _aware(row.last_seen_at) == _aware(original_activity)
    assert len(repo.session.scalars(select(AuthSession)).all()) == 1


def test_concurrent_proofs_cannot_rotate_the_same_cookie_twice(credential, migrated):
    repo, row = credential
    session_id, user_id = row.id, row.user_id
    rendezvous = threading.Barrier(2)

    def attempt():
        with Session(migrated, autoflush=False, expire_on_commit=False) as session:
            local = LocalRepository(session)
            stale = local.mfa.credential(session_id, user_id, offline=False)
            assert stale.revoked_at is None
            rendezvous.wait(timeout=10)
            with local.transaction():
                return local.mfa.rotate_session(stale, 1, NOW) is not None

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt) for _ in range(2)]
        assert sorted(future.result(timeout=20) for future in futures) == [False, True]
    repo.session.expire_all()
    rows = repo.session.scalars(select(AuthSession)).all()
    assert len(rows) == 2
    assert sum(row.revoked_at is None for row in rows) == 1
