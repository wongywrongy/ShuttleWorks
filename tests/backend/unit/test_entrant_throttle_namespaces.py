"""The entrant throttle namespaces, and the isolation that is their point.

SP-E1-2 Phase B, task B3. The entrant surface gets three buckets of its
own — ``esignup:<ip>``, ``eacct:<lower-email>``, ``eip:<ip>`` — counted by
the same principal-agnostic engine (``throttle_record_attempt``) that
already serves ``ip:``, ``account:``, ``reg:`` and ``entry:``.

**The property under test is not "the throttle works".** That is pinned by
``test_auth_characterization.py``. It is that the new buckets are
*separate budgets*, in both directions:

- a flood of entrant signups from a venue's shared address must not lock
  that venue's **director out of signing in** — ``identity/auth_routes.py:157`` guards
  operator login with ``ip:<ip>``, and if an entrant surface charged that
  key, anyone on the internet could lock an operator out of their own
  event from the public form;
- and the reverse: a run of failed operator logins must not stop entrants
  entering.

Every isolation assertion here is "bucket X is NOT locked", which passes
trivially against a bucket that can never lock at all — so each is paired
with a control proving that same bucket does lock when charged its own
way. That pairing is the whole reason this file is longer than the four
functions it tests.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.config import settings
from db.models import Base
from core import throttle
from identity import auth as auth_service

IP = "203.0.113.9"
EMAIL = "Parent.Chen@Example.COM"


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


def _operator_keys() -> tuple[str, ...]:
    """Every key namespace that existed before the entrant principal."""
    return (
        f"ip:{IP}",
        f"account:{EMAIL.lower()}",
        auth_service.registration_key(IP),
        throttle.entries_key(IP),
    )


def _flood(session, record, key: str, times: int) -> None:
    for _ in range(times):
        record(session, key)


# ---- The keys themselves ---------------------------------------------


def test_the_entrant_helpers_produce_their_own_prefixes():
    assert auth_service.entrant_signup_key(IP) == f"esignup:{IP}"
    assert auth_service.entrant_ip_key(IP) == f"eip:{IP}"
    assert auth_service.entrant_account_key(EMAIL) == "eacct:parent.chen@example.com"


def test_the_account_key_is_case_folded_so_one_address_is_one_budget():
    """``Parent@x`` and ``parent@x`` are the same account (the email index
    is ``lower(email)``), so they must be the same bucket — otherwise the
    budget is multiplied by the attacker's choice of capitalisation."""
    assert auth_service.entrant_account_key("PARENT@EXAMPLE.COM") == (
        auth_service.entrant_account_key("parent@example.com")
    )


def test_no_entrant_key_can_collide_with_an_operator_key():
    """The isolation is a string property before it is a behaviour: two
    namespaces that can produce the same key are one bucket."""
    entrant = {
        auth_service.entrant_signup_key(IP),
        auth_service.entrant_ip_key(IP),
        auth_service.entrant_account_key(EMAIL),
    }
    assert entrant.isdisjoint(set(_operator_keys()))
    assert len(entrant) == 3


# ---- Signup volume ----------------------------------------------------


def test_a_signup_flood_locks_the_signup_bucket(session):
    key = auth_service.entrant_signup_key(IP)
    _flood(
        session,
        auth_service.throttle_record_entrant_signup,
        key,
        settings.entrant_signup_max_per_ip,
    )

    assert throttle.throttle_check(session, key) is not None


def test_a_signup_flood_leaves_every_operator_bucket_open(session):
    """**The director-lockout control.** An entrant flood from the venue's
    address, ten times over the signup budget, and the operator login
    guard (``ip:``), the registration bucket (``reg:``) and the public
    entry bucket (``entry:``) are all still open."""
    _flood(
        session,
        auth_service.throttle_record_entrant_signup,
        auth_service.entrant_signup_key(IP),
        settings.entrant_signup_max_per_ip * 10,
    )

    for key in _operator_keys():
        assert throttle.throttle_check(session, key) is None, key


def test_those_operator_buckets_do_lock_when_charged_their_own_way(session):
    """Negative control for the test above. "Not locked" is worthless
    unless the bucket is lockable — this charges each operator namespace
    through its own recorder and shows every one of them locking."""
    for key, record in (
        (f"ip:{IP}", auth_service.throttle_record_failure),
        (f"account:{EMAIL.lower()}", auth_service.throttle_record_failure),
        (auth_service.registration_key(IP), auth_service.throttle_record_registration),
        (throttle.entries_key(IP), throttle.throttle_record_entry),
    ):
        _flood(session, record, key, 60)
        assert throttle.throttle_check(session, key) is not None, key


def test_an_operator_login_flood_leaves_the_entrant_buckets_open(session):
    """The other direction: a run of failed director logins from the venue
    address must not stop entrants signing up or logging in."""
    _flood(session, auth_service.throttle_record_failure, f"ip:{IP}", 60)
    _flood(
        session,
        auth_service.throttle_record_failure,
        f"account:{EMAIL.lower()}",
        60,
    )

    for key in (
        auth_service.entrant_signup_key(IP),
        auth_service.entrant_ip_key(IP),
        auth_service.entrant_account_key(EMAIL),
    ):
        assert throttle.throttle_check(session, key) is None, key


# ---- Entrant credentials ---------------------------------------------


def test_an_entrant_credential_flood_locks_only_the_entrant_credential_buckets(
    session,
):
    for key in (
        auth_service.entrant_account_key(EMAIL),
        auth_service.entrant_ip_key(IP),
    ):
        _flood(session, auth_service.throttle_record_failure, key, 60)
        assert throttle.throttle_check(session, key) is not None, key

    for key in _operator_keys():
        assert throttle.throttle_check(session, key) is None, key


def test_one_entrant_account_lockout_does_not_lock_another(session):
    """Per-address budgets, so guessing at one account cannot deny service
    to every other entrant on the page."""
    victim = auth_service.entrant_account_key("victim@example.com")
    bystander = auth_service.entrant_account_key("bystander@example.com")
    _flood(session, auth_service.throttle_record_failure, victim, 60)

    assert throttle.throttle_check(session, victim) is not None
    assert throttle.throttle_check(session, bystander) is None


# ---- The settings triple ---------------------------------------------


def test_the_signup_budget_reads_its_own_settings_triple(session, monkeypatch):
    """A fourth triple, not a borrowed one. Set it to 2 and the third
    signup is locked out, whatever the registration budget says."""
    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 2)
    monkeypatch.setattr(settings, "entrant_signup_lock_seconds", 120.0)
    monkeypatch.setattr(settings, "registration_max_per_ip", 500)
    key = auth_service.entrant_signup_key(IP)

    auth_service.throttle_record_entrant_signup(session, key)
    assert throttle.throttle_check(session, key) is None
    auth_service.throttle_record_entrant_signup(session, key)

    remaining = throttle.throttle_check(session, key)
    assert remaining is not None
    assert 60.0 < remaining <= 120.0


def test_the_registration_budget_does_not_govern_entrant_signups(
    session, monkeypatch
):
    """Negative control for the triple: shrinking the *operator*
    registration budget to 1 must not shorten an entrant's."""
    monkeypatch.setattr(settings, "registration_max_per_ip", 1)
    monkeypatch.setattr(settings, "entrant_signup_max_per_ip", 20)
    key = auth_service.entrant_signup_key(IP)

    _flood(session, auth_service.throttle_record_entrant_signup, key, 5)

    assert throttle.throttle_check(session, key) is None


def test_the_triple_has_defaults_and_they_are_a_public_form_shape():
    """A signup budget sized like the credential one would refuse a family
    signing up on venue wifi; sized like nothing at all would not bound
    account creation from a script. Pin the shape, not the numbers'
    provenance."""
    assert settings.entrant_signup_max_per_ip >= 3
    assert settings.entrant_signup_window_seconds >= 600.0
    assert settings.entrant_signup_lock_seconds > 0
