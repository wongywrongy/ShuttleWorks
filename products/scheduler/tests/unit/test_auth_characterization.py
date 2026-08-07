"""Golden master for the auth machinery SP-E1-2 is about to extend.

**Why this file exists (SP-E1-2 rule 5).** The E1-2 slice adds a *second
principal type* — an entrant account with its own session table, its own
cookie and its own throttle namespaces — by **reusing** the primitives in
``services/auth.py`` rather than forking them (Phase A ruling D-A2). That
makes every one of those primitives load-bearing for two callers instead
of one, and this file pins what they do **today**, before the first edit.

It is a characterization test, not a specification: if a behaviour below
changes, the change is either a bug or a decision that needs to be named.
Two halves, matching the two seams the entrant work touches:

1. **The session create/resolve path** (``services/auth.py`` — ``_hash_token``,
   ``create_session``, ``resolve_session``, ``revoke_session``). The entrant
   session plumbing is written *alongside* this, deliberately not shared:
   ``create_session``/``resolve_session`` are ``User``-bound (they return a
   ``User`` row and write a ``user_id`` FK), so the property this file pins
   — a token that is never stored raw, and a resolver that refuses revoked
   and expired rows — has to be re-proved for the entrant table rather than
   inherited. Pinning it here is what makes "the entrant table matches the
   operator table's behaviour" a checkable claim.
2. **The throttle engine** (``throttle_check`` / ``throttle_record_attempt`` /
   ``throttle_record_success``). This one genuinely *is* shared: it is
   principal-agnostic — a key string and three numbers — and the entrant
   namespaces (``esignup:`` / ``eacct:`` / ``eip:``) pass their own budgets
   into the same counting mechanism. Its arithmetic (windowing, doubling
   backoff, the 15-minute cap) is therefore about to govern surfaces it was
   not written for, which is exactly when it wants a golden master.

Dialect coverage for these functions lives in ``test_auth_service.py``;
this file runs on SQLite only and is about *behaviour under change*, not
portability.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import AuthSession, AuthThrottle, Base, User
from services import auth as auth_service


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    s = Session()
    try:
        yield s
    finally:
        s.rollback()
        s.close()
        engine.dispose()


@pytest.fixture
def user(session):
    row = User(id=uuid.uuid4(), email="director@example.com", password_hash=None)
    session.add(row)
    session.flush()
    return row


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- 1. The session create/resolve path -------------------------------


def test_the_raw_session_token_is_never_stored(session, user):
    """The property the whole design rests on: a DB dump is not a set of
    live sessions. Only the SHA-256 of the cookie value lands in the row."""
    token, row = auth_service.create_session(session, user.id)

    assert row.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert token not in row.token_hash
    stored = session.execute(AuthSession.__table__.select()).mappings().all()
    assert len(stored) == 1
    assert token not in str(dict(stored[0]))


def test_a_fresh_session_resolves_to_its_user(session, user):
    token, _ = auth_service.create_session(session, user.id)
    resolved = auth_service.resolve_session(session, token)

    assert resolved is not None
    assert resolved.id == user.id


def test_an_unknown_or_empty_token_resolves_to_nothing(session, user):
    auth_service.create_session(session, user.id)

    assert auth_service.resolve_session(session, "") is None
    assert auth_service.resolve_session(session, "not-a-real-token") is None


def test_a_revoked_session_stops_resolving_and_the_row_survives(session, user):
    """Revocation is a timestamp, not a delete — the audit trail outlives
    the credential."""
    token, row = auth_service.create_session(session, user.id)

    assert auth_service.revoke_session(session, token) is True
    assert auth_service.resolve_session(session, token) is None
    assert session.get(AuthSession, row.id) is not None
    assert row.revoked_at is not None
    # Revoking twice is a no-op, not an error.
    assert auth_service.revoke_session(session, token) is False


def test_an_expired_session_stops_resolving(session, user):
    token, row = auth_service.create_session(session, user.id)
    row.expires_at = _utcnow() - timedelta(seconds=1)
    session.flush()

    assert auth_service.resolve_session(session, token) is None


def test_expiry_is_the_configured_ttl(session, user):
    from app.config import settings

    before = _utcnow()
    _, row = auth_service.create_session(session, user.id)
    expected = before + timedelta(days=settings.session_ttl_days)

    assert abs((row.expires_at - expected).total_seconds()) < 5


def test_last_seen_is_thresholded_not_written_on_every_read(session, user):
    """The rolling activity stamp is deliberately lazy: an authenticated
    read must not become a write per request. 300 seconds is the threshold."""
    token, row = auth_service.create_session(session, user.id)

    first = row.last_seen_at
    auth_service.resolve_session(session, token)
    assert row.last_seen_at == first  # inside the threshold: untouched

    row.last_seen_at = _utcnow() - timedelta(seconds=301)
    stale = row.last_seen_at
    auth_service.resolve_session(session, token)
    assert row.last_seen_at > stale


def test_revoke_all_can_keep_the_current_session(session, user):
    """Credential changes invalidate every *other* session (OWASP)."""
    keep, _ = auth_service.create_session(session, user.id)
    drop_a, _ = auth_service.create_session(session, user.id)
    drop_b, _ = auth_service.create_session(session, user.id)

    count = auth_service.revoke_all_sessions(session, user.id, except_token=keep)

    assert count == 2
    assert auth_service.resolve_session(session, keep) is not None
    assert auth_service.resolve_session(session, drop_a) is None
    assert auth_service.resolve_session(session, drop_b) is None


# ---- 2. The throttle engine -------------------------------------------


def test_an_unknown_key_is_not_locked(session):
    assert auth_service.throttle_check(session, "ip:198.51.100.7") is None


def _charge(session, key, times, *, max_attempts=3, window=900.0, lock=60.0):
    for _ in range(times):
        auth_service.throttle_record_attempt(
            session,
            key,
            max_attempts=max_attempts,
            window_seconds=window,
            lock_seconds=lock,
        )


def test_the_budget_locks_exactly_at_max_attempts(session):
    key = "ip:198.51.100.8"

    _charge(session, key, 2)
    assert auth_service.throttle_check(session, key) is None

    _charge(session, key, 1)  # the third attempt spends the budget
    remaining = auth_service.throttle_check(session, key)
    assert remaining is not None
    assert 0 < remaining <= 60.0


def test_the_backoff_doubles_per_further_attempt(session):
    key = "ip:198.51.100.9"
    _charge(session, key, 3)
    first = auth_service.throttle_check(session, key)

    _charge(session, key, 1)
    second = auth_service.throttle_check(session, key)

    assert second > first
    assert second == pytest.approx(first * 2, rel=0.05)


def test_the_lock_is_capped_at_fifteen_minutes(session):
    """Doubling without a ceiling would turn a burst into a permanent ban."""
    key = "ip:198.51.100.10"
    _charge(session, key, 30)

    remaining = auth_service.throttle_check(session, key)
    assert remaining is not None
    assert remaining <= 900.0


def test_a_stale_window_resets_the_count(session):
    key = "ip:198.51.100.11"
    _charge(session, key, 3, window=900.0)
    assert auth_service.throttle_check(session, key) is not None

    row = session.get(AuthThrottle, key)
    row.window_started_at = _utcnow() - timedelta(seconds=901)
    session.flush()

    _charge(session, key, 1, window=900.0)
    assert auth_service.throttle_check(session, key) is None
    assert session.get(AuthThrottle, key).failures == 1


def test_success_clears_the_counter(session):
    key = "account:director@example.com"
    _charge(session, key, 3)
    assert auth_service.throttle_check(session, key) is not None

    auth_service.throttle_record_success(session, key)

    assert auth_service.throttle_check(session, key) is None
    assert session.get(AuthThrottle, key).failures == 0


def test_keys_are_independent_budgets(session):
    """The property every namespace decision in this codebase rests on:
    one key's lockout says nothing about another's. ``reg:`` exists because
    of it, ``entry:`` exists because of it, and the entrant namespaces
    SP-E1-2 adds exist because of it."""
    _charge(session, "ip:203.0.113.1", 5)

    assert auth_service.throttle_check(session, "ip:203.0.113.1") is not None
    assert auth_service.throttle_check(session, "ip:203.0.113.2") is None
    assert auth_service.throttle_check(session, "reg:203.0.113.1") is None
    assert auth_service.throttle_check(session, "entry:203.0.113.1") is None


def test_the_shipped_namespace_helpers_are_distinct_strings(session):
    """``registration_key`` and ``entries_key`` are the prior art the
    entrant namespaces follow. Pinned as strings because the *format* is
    what keeps the buckets apart."""
    assert auth_service.registration_key("198.51.100.1") == "reg:198.51.100.1"
    assert auth_service.entries_key("198.51.100.1") == "entry:198.51.100.1"
