"""The entrant principal at the service level (SP-E1-2 Phase B, D-A2/D-A3).

An entrant account is a **sibling** of ``users``, not a row in it. The audit
that decided that (Phase A, ruling D-A2) turned on one fact: 27 session-gated
routes carry no ``{tournament_id}`` and therefore sit outside the
OpenAPI-derived tenancy test — ``POST /tournaments`` among them. Reuse would
have meant a discriminator check on each of those, and a forgotten check is a
fail-*open*. A separate table makes entrant membership **unrepresentable**:
there is no column that could hold it and no FK that could point at it.

The same argument decided sessions (D-A3): ``entrant_sessions`` is its own
table with its own cookie, so an operator token and an entrant token cannot
be confused by a resolver that forgot to look at a ``kind`` column — there is
no such column to forget.

What is *reused* is everything cryptographic: ``hash_password`` /
``verify_password`` / ``validate_password`` / ``_hash_token`` are
principal-agnostic module functions in ``identity/auth.py`` and are called
directly. What is **not** reused is the ~40 lines of session plumbing, which
is ``User``-bound at the type level (``create_session`` writes a ``user_id``
FK; ``resolve_session`` returns a ``User``). That duplication is deliberate
and is the price of the unconfusable-by-construction property; these tests
are what hold the copy to the original's behaviour.
"""
from __future__ import annotations

import hashlib
import uuid

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import (
    Base,
    EntrantAccount,
    EntrantSession,
    OrgMember,
    TournamentMember,
    User,
)
from identity import auth as auth_service
from identity import entrants as entrant_service
from identity.auth import AuthError


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


GOOD_PW = "a perfectly fine passphrase"


# ---- Accounts ---------------------------------------------------------


def test_create_account_stores_an_argon2id_hash_not_the_password(session):
    account = entrant_service.create_account(
        session, email="Parent@Example.com", password=GOOD_PW
    )

    assert account.password_hash.startswith("$argon2id$")
    assert GOOD_PW not in account.password_hash
    # Casing is preserved as typed; matching is case-insensitive (below).
    assert account.email == "Parent@Example.com"
    assert account.email_verified is False


def test_the_email_namespace_is_case_insensitive_within_entrants(session):
    entrant_service.create_account(session, email="parent@example.com", password=GOOD_PW)
    session.flush()

    with pytest.raises(AuthError) as exc:
        entrant_service.create_account(
            session, email="PARENT@example.com", password=GOOD_PW
        )
    assert exc.value.code == "EMAIL_TAKEN"


def test_an_entrant_and_an_operator_may_share_an_address(session):
    """Two namespaces, deliberately (spec Q13 §3). A director who also
    enters a tournament as a player is one human with two accounts, which
    is mildly confusing and vastly better than a global namespace where an
    entrant signup could collide with — or probe for — an operator's."""
    session.add(User(id=uuid.uuid4(), email="both@example.com"))
    session.flush()

    account = entrant_service.create_account(
        session, email="both@example.com", password=GOOD_PW
    )
    session.flush()

    assert account.id is not None
    assert session.execute(select(func.count()).select_from(User)).scalar_one() == 1


def test_an_entrant_account_cannot_hold_a_membership(session):
    """Ruling D-A2's whole point, asserted structurally rather than by
    behaviour: there is no org, no role and no membership *column* on an
    entrant account, and the membership tables' FKs point at ``users``. An
    entrant cannot become a member by a code path anyone forgot to guard,
    because there is no row shape that would express it."""
    entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()

    columns = set(EntrantAccount.__table__.columns.keys())
    assert not columns & {"org_id", "role", "tournament_id"}

    assert (
        OrgMember.__table__.c.user_id.foreign_keys.pop().column.table.name == "users"
    )
    assert (
        TournamentMember.__table__.c.user_id.foreign_keys.pop().column.table.name
        == "users"
    )
    assert session.execute(select(func.count()).select_from(OrgMember)).scalar_one() == 0
    assert (
        session.execute(select(func.count()).select_from(TournamentMember)).scalar_one()
        == 0
    )


def test_the_password_policy_is_the_shipped_one(session):
    """Reused, not re-implemented: the NIST-800-63B length rule and the
    breached-password blocklist are ``validate_password``, called here."""
    with pytest.raises(AuthError) as short:
        entrant_service.create_account(session, email="a@example.com", password="short")
    assert short.value.code == "PASSWORD_TOO_SHORT"

    with pytest.raises(AuthError) as common:
        entrant_service.create_account(
            session, email="a@example.com", password="password1234"
        )
    assert common.value.code == "PASSWORD_TOO_COMMON"


def test_an_unusable_address_is_refused(session):
    with pytest.raises(AuthError) as exc:
        entrant_service.create_account(session, email="not-an-email", password=GOOD_PW)
    assert exc.value.code == "INVALID_EMAIL"


# ---- Authentication ---------------------------------------------------


def test_authenticate_accepts_the_right_password_case_insensitively(session):
    entrant_service.create_account(session, email="Parent@example.com", password=GOOD_PW)
    session.flush()

    found = entrant_service.authenticate(
        session, email="parent@EXAMPLE.com", password=GOOD_PW
    )

    assert found is not None
    assert found.email == "Parent@example.com"


def test_authenticate_refuses_a_wrong_password_and_an_unknown_address(session):
    entrant_service.create_account(session, email="parent@example.com", password=GOOD_PW)
    session.flush()

    assert (
        entrant_service.authenticate(
            session, email="parent@example.com", password="the wrong passphrase"
        )
        is None
    )
    assert (
        entrant_service.authenticate(
            session, email="nobody@example.com", password=GOOD_PW
        )
        is None
    )
    # A malformed address is a miss, not an exception: the caller answers
    # uniformly either way and must not branch on the difference.
    assert entrant_service.authenticate(session, email="@@", password=GOOD_PW) is None


# ---- Sessions ---------------------------------------------------------


def test_the_raw_entrant_token_is_never_stored(session):
    """The same property the operator table has, re-proved for the copy
    (tests/unit/test_auth_characterization.py pins the original)."""
    account = entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()
    token, row = entrant_service.create_session(session, account.id)

    assert row.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
    stored = session.execute(EntrantSession.__table__.select()).mappings().all()
    assert len(stored) == 1
    assert token not in str(dict(stored[0]))


def test_a_fresh_entrant_session_resolves_to_its_account(session):
    account = entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()
    token, _ = entrant_service.create_session(session, account.id)

    resolved = entrant_service.resolve_session(session, token)

    assert resolved is not None
    assert resolved.id == account.id


def test_an_unknown_or_empty_entrant_token_resolves_to_nothing(session):
    assert entrant_service.resolve_session(session, "") is None
    assert entrant_service.resolve_session(session, "not-a-real-token") is None


def test_a_revoked_entrant_session_stops_resolving_and_the_row_survives(session):
    account = entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()
    token, row = entrant_service.create_session(session, account.id)

    assert entrant_service.revoke_session(session, token) is True
    assert entrant_service.resolve_session(session, token) is None
    assert session.get(EntrantSession, row.id) is not None
    assert row.revoked_at is not None
    assert entrant_service.revoke_session(session, token) is False


def test_an_expired_entrant_session_stops_resolving(session):
    from datetime import datetime, timedelta, timezone

    account = entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()
    token, row = entrant_service.create_session(session, account.id)
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    session.flush()

    assert entrant_service.resolve_session(session, token) is None


# ---- The seam that must not exist ------------------------------------


def test_neither_resolver_accepts_the_other_principals_token(session):
    """D-A3, proved from both sides. This is the assertion a discriminator
    column would have had to earn with a code review; a separate table earns
    it with a schema."""
    user = User(id=uuid.uuid4(), email="director@example.com")
    session.add(user)
    account = entrant_service.create_account(
        session, email="parent@example.com", password=GOOD_PW
    )
    session.flush()

    operator_token, _ = auth_service.create_session(session, user.id)
    entrant_token, _ = entrant_service.create_session(session, account.id)

    # Each token works in its own table…
    assert auth_service.resolve_session(session, operator_token) is not None
    assert entrant_service.resolve_session(session, entrant_token) is not None
    # …and nowhere else.
    assert auth_service.resolve_session(session, entrant_token) is None
    assert entrant_service.resolve_session(session, operator_token) is None


def test_an_entrant_session_row_cannot_point_at_a_user(session):
    """Structural half of the same claim: the FK's target is
    ``entrant_accounts``, so a ``users`` id in that column is a database
    error, not a privilege escalation."""
    target = EntrantSession.__table__.c.account_id.foreign_keys.pop().column
    assert target.table.name == "entrant_accounts"
