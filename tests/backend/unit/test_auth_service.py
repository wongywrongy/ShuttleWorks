"""identity/auth/ — identity/session/throttle logic, both dialects.

Same dual-dialect harness as test_solve_jobs.py: sqlite always, the
postgres leg when TEST_POSTGRES_URL is set (CI provides it).
"""
import os
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import AuthSession, Base, User
from core import throttle
from identity import auth as auth_service
from identity.auth import AuthError

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


# ---- Passwords -------------------------------------------------------


def test_password_policy_is_length_based():
    auth_service.validate_password("correct horse battery")  # no composition rules
    with pytest.raises(AuthError) as e:
        auth_service.validate_password("short")
    assert e.value.code == "PASSWORD_TOO_SHORT"
    with pytest.raises(AuthError) as e:
        auth_service.validate_password("x" * 200)
    assert e.value.code == "PASSWORD_TOO_LONG"
    with pytest.raises(AuthError) as e:
        auth_service.validate_password("Password123")
    assert e.value.code == "PASSWORD_TOO_COMMON"


def test_argon2id_hash_roundtrip():
    h = auth_service.hash_password("hunter2hunter2")
    assert h.startswith("$argon2id$")
    assert auth_service.verify_password(h, "hunter2hunter2")
    assert not auth_service.verify_password(h, "wrong-password")
    assert not auth_service.password_needs_rehash(h)


# ---- Users -----------------------------------------------------------


def test_create_user_and_case_insensitive_lookup(session):
    user = auth_service.create_user(
        session, email="Dana@Example.com", password="a fine passphrase"
    )
    session.commit()
    assert auth_service.get_user_by_email(session, "dana@example.COM").id == user.id


def test_duplicate_email_rejected_app_and_db_level(session):
    auth_service.create_user(session, email="dup@example.com", password="a fine passphrase")
    session.commit()
    with pytest.raises(AuthError) as e:
        auth_service.create_user(session, email="DUP@example.com", password="a fine passphrase")
    assert e.value.code == "EMAIL_TAKEN"
    # DB-level backstop: bypass the app check entirely.
    session.rollback()
    session.add(User(email="Dup@Example.Com"))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_bootstrap_user_idempotent(session):
    a = auth_service.ensure_bootstrap_user(session)
    b = auth_service.ensure_bootstrap_user(session)
    assert a.id == b.id == auth_service.BOOTSTRAP_USER_UUID
    assert a.password_hash is None


# ---- Sessions --------------------------------------------------------


def test_session_roundtrip_and_hash_at_rest(session):
    user = auth_service.create_user(session, email="s@example.com", password="a fine passphrase")
    token, row = auth_service.create_session(session, user.id)
    session.commit()
    assert token not in (row.token_hash or "")  # raw token never stored
    resolved = auth_service.resolve_session(session, token)
    assert resolved is not None and resolved.id == user.id
    assert auth_service.resolve_session(session, "not-a-real-token") is None


def test_session_expiry_and_revocation(session):
    user = auth_service.create_user(session, email="e@example.com", password="a fine passphrase")
    token, row = auth_service.create_session(session, user.id)
    row.expires_at = auth_service._utcnow() - timedelta(seconds=1)
    session.commit()
    assert auth_service.resolve_session(session, token) is None

    token2, _ = auth_service.create_session(session, user.id)
    assert auth_service.revoke_session(session, token2) is True
    assert auth_service.revoke_session(session, token2) is False  # already revoked
    assert auth_service.resolve_session(session, token2) is None


def test_revoke_all_sessions_keeps_current(session):
    user = auth_service.create_user(session, email="r@example.com", password="a fine passphrase")
    keep, _ = auth_service.create_session(session, user.id)
    auth_service.create_session(session, user.id)
    auth_service.create_session(session, user.id)
    revoked = auth_service.revoke_all_sessions(session, user.id, except_token=keep)
    session.commit()
    assert revoked == 2
    assert auth_service.resolve_session(session, keep) is not None
    live = [
        r
        for r in session.query(AuthSession).filter_by(user_id=user.id)
        if r.revoked_at is None
    ]
    assert len(live) == 1


# ---- Password reset --------------------------------------------------


def test_reset_token_flow_revokes_sessions(session):
    user = auth_service.create_user(session, email="p@example.com", password="a fine passphrase")
    old_session_token, _ = auth_service.create_session(session, user.id)
    reset = auth_service.issue_reset_token(session, user)
    session.commit()

    assert auth_service.consume_reset_token(session, "bogus", "new passphrase!") is None
    updated = auth_service.consume_reset_token(session, reset, "new passphrase!")
    session.commit()
    assert updated is not None
    assert auth_service.verify_password(updated.password_hash, "new passphrase!")
    assert updated.reset_token_hash is None
    # single-use
    assert auth_service.consume_reset_token(session, reset, "another pass!") is None
    # credential change killed the old session
    assert auth_service.resolve_session(session, old_session_token) is None


def test_reset_token_expiry(session):
    user = auth_service.create_user(session, email="x@example.com", password="a fine passphrase")
    reset = auth_service.issue_reset_token(session, user)
    user.reset_token_expires_at = auth_service._utcnow() - timedelta(seconds=1)
    session.commit()
    assert auth_service.consume_reset_token(session, reset, "new passphrase!") is None


# ---- Throttle --------------------------------------------------------


def test_throttle_locks_after_budget_and_backs_off(session, monkeypatch):
    # Patch through the service's own settings binding — module purges
    # in the full suite can leave tests holding a different core.config
    # instance than the one identity.auth imported.
    monkeypatch.setattr(
        auth_service.settings, "auth_throttle_max_failures", 3
    )
    key = f"account:throttle-{uuid.uuid4()}@example.com"
    for _ in range(2):
        auth_service.throttle_record_failure(session, key)
    assert throttle.throttle_check(session, key) is None  # under budget
    auth_service.throttle_record_failure(session, key)  # 3rd → locked
    first_lock = throttle.throttle_check(session, key)
    assert first_lock is not None and first_lock > 0
    auth_service.throttle_record_failure(session, key)  # 4th → doubled
    second_lock = throttle.throttle_check(session, key)
    assert second_lock > first_lock


def test_throttle_success_resets(session, monkeypatch):
    monkeypatch.setattr(
        auth_service.settings, "auth_throttle_max_failures", 2
    )
    key = "ip:203.0.113.9"
    auth_service.throttle_record_failure(session, key)
    auth_service.throttle_record_failure(session, key)
    assert throttle.throttle_check(session, key) is not None
    auth_service.throttle_record_success(session, key)
    assert throttle.throttle_check(session, key) is None


# ---- Breached-password blocklist (SP-SEC-1 Phase 3, SEC-07) ----------


def test_blocklist_meets_the_asvs_l1_floor():
    """v5.0.0-6.2.4 L1: at least the top 3000 matching the policy.

    Asserted as a number because the requirement IS a number — a test that
    only checked "some passwords are rejected" would have passed against the
    15-entry list this replaced.
    """
    from identity.auth import _WORST_PASSWORDS

    assert len(_WORST_PASSWORDS) >= 3000


def test_blocklist_holds_only_policy_eligible_entries():
    """Entries below the length minimum would be dead weight — already
    refused by the length rule before the blocklist is consulted."""
    from core.config import settings
    from identity.auth import _WORST_PASSWORDS

    too_short = [w for w in _WORST_PASSWORDS if len(w) < settings.password_min_length]
    assert too_short == []


@pytest.mark.parametrize(
    "password",
    [
        "password1",   # was in the old 15-entry list
        "trustno1",    # was NOT — only the expanded list catches it
        "qwerty123",
        "michael1",
    ],
)
def test_common_passwords_are_refused(password):
    from identity.auth import AuthError, validate_password

    with pytest.raises(AuthError) as exc:
        validate_password(password)
    assert exc.value.code == "PASSWORD_TOO_COMMON"


def test_a_long_passphrase_is_still_accepted():
    """The blocklist must not become a de-facto composition rule."""
    from identity.auth import validate_password

    validate_password("correct horse battery staple")
