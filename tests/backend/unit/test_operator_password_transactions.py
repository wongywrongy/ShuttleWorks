"""Password mutation and MFA grants must serialize on the same account."""
from concurrent.futures import ThreadPoolExecutor, TimeoutError
import threading

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.time_utils import _utcnow
from db.models import AuthSession, User
from identity import auth
from identity.auth_routes import _change_password, _complete_login
from repositories.local import LocalRepository
from tests.backend.unit import test_operator_session_transactions as fixtures

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated
credential = fixtures.credential
PASSWORD = "original operator password for transaction tests"
REPLACEMENT = "replacement operator password for transaction tests"


@pytest.mark.parametrize("operation", ["reset", "change"])
def test_password_mutation_serializes_with_inflight_mfa_rotation(credential, migrated, monkeypatch, operation):
    repo, row = credential
    user = repo.session.get(User, row.user_id)
    user.password_hash = auth.hash_password(PASSWORD)
    reset_token = auth.issue_reset_token(repo.session, user)
    repo.session.commit()
    user_id, session_id = user.id, row.id
    revoked, finish, proof_started = threading.Event(), threading.Event(), threading.Event()
    original = auth.revoke_all_sessions

    def paused_revoke(*args, **kwargs):
        result = original(*args, **kwargs)
        revoked.set()
        assert finish.wait(10)
        return result

    monkeypatch.setattr(auth, "revoke_all_sessions", paused_revoke)

    def mutate():
        with Session(migrated, autoflush=False) as session:
            if operation == "reset":
                assert auth.consume_reset_token(session, reset_token, REPLACEMENT) is not None
            else:
                _change_password(session, session.get(User, user_id), REPLACEMENT, "fixture", None, PASSWORD)
            session.commit()

    def prove():
        with Session(migrated, autoflush=False) as session:
            local = LocalRepository(session)
            stale = local.mfa.credential(session_id, user_id, offline=False)
            proof_started.set()
            with local.transaction():
                local.mfa.reserve(user_id, "cloud", _utcnow(), create=True)
                return local.mfa.rotate_session(stale, 1, fixtures.NOW)

    with ThreadPoolExecutor(max_workers=2) as pool:
        mutation = pool.submit(mutate)
        try:
            assert revoked.wait(10)
            proof = pool.submit(prove)
            assert proof_started.wait(10)
            # Give the contender time to reach the held reservation. Without
            # it, the old implementation commits a replacement before reset.
            try:
                proof.result(timeout=0.5)
            except TimeoutError:
                pass
        finally:
            finish.set()
        mutation.result(timeout=20)
        assert proof.result(timeout=20) is None
    repo.session.expire_all()
    assert not repo.session.scalars(select(AuthSession).where(AuthSession.revoked_at.is_(None))).all()


def test_login_rechecks_password_after_a_concurrent_reset(credential, migrated):
    repo, row = credential
    user = repo.session.get(User, row.user_id)
    user.password_hash = auth.hash_password(PASSWORD)
    token = auth.issue_reset_token(repo.session, user)
    repo.session.commit()
    with Session(migrated, autoflush=False) as reset:
        assert auth.consume_reset_token(reset, token, REPLACEMENT)
        reset.commit()
    assert auth.verify_password(user.password_hash, PASSWORD)  # stale identity map
    with pytest.raises(auth.AuthError):
        with repo.transaction():
            _complete_login(repo.session, user, PASSWORD, "fixture")
