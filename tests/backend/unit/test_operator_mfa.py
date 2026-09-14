"""Encrypted factor lifecycle and atomic lookup credentials on both databases."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import secrets
import threading
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.secret_keys import SecretKeyring, SecretKeyringError, secret_key_id
from core.time_utils import _aware
from core.tokens import _hash_token
from db.models import AuthSession, OperatorMfaFactor, OperatorRecoveryCode, StateTransition, User
from identity import mfa
from identity.auth import hash_password
from identity.mfa_crypto import decrypt_factor, normalize_recovery_code, totp_code
from repositories.local import LocalRepository
from tests.backend.unit import test_baseline_schema as fixtures

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated
NOW = datetime(2026, 9, 14, 12, tzinfo=timezone.utc)
PASSWORD = "a strong private password for MFA tests"
SESSION_ID = uuid.uuid4()


@pytest.fixture
def account(migrated):
    key = secrets.token_bytes(32)
    keys = SecretKeyring(secret_key_id(key), {secret_key_id(key): key})
    with Session(migrated, autoflush=False, expire_on_commit=False) as session:
        user = User(id=uuid.uuid4(), email="operator@example.test", password_hash=hash_password(PASSWORD))
        session.add(user)
        session.commit()
        yield LocalRepository(session), user.id, dict(scope="cloud", keys=keys, now=NOW)


def enroll(account):
    repo, user_id, options = account
    with repo.transaction():
        secret = mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=False, session_id=SESSION_ID, **options)
    seed = base64.b32decode(secret)
    with repo.transaction():
        generation, recovery = mfa.confirm_enrollment(repo, user_id, totp_code(seed, NOW.timestamp()), session_id=SESSION_ID, **options)
    return seed, generation, recovery


def test_enrollment_encrypts_seed_hashes_codes_audits_actor_and_revokes_old_sessions(account):
    repo, user_id, options = account
    session = repo.session
    old = AuthSession(user_id=user_id, token_hash="c" * 64, expires_at=NOW + timedelta(days=30))
    session.add(old)
    session.commit()
    seed, generation, recovery = enroll(account)
    factor = repo.mfa.get(user_id)
    assert factor.status == "active" and generation == 1
    assert factor.pending_ciphertext is None and factor.pending_key_id is None and factor.pending_expires_at is None
    assert decrypt_factor(factor.secret_ciphertext, options["keys"].active_key, user_id=user_id, scope="cloud") == seed
    assert seed not in factor.secret_ciphertext
    session.refresh(old)  # Assert persisted revocation, not the pre-update identity-map snapshot.
    assert _aware(old.revoked_at) == NOW
    hashes = set(session.scalars(select(OperatorRecoveryCode.token_hash)))
    assert hashes == {_hash_token(normalize_recovery_code(code)) for code in recovery}
    records = session.scalars(select(StateTransition).order_by(StateTransition.occurred_at)).all()
    assert [(r.event, r.actor_type, r.actor_id) for r in records] == [
        ("begin", "operator", str(user_id)), ("activate", "operator", str(user_id)),
    ]
    assert all(r.machine == "operator_mfa_factor" and r.detail == {} for r in records)


@pytest.mark.parametrize("password", ["incorrect password", ""])
def test_enrollment_requires_the_current_password(account, password):
    repo, user_id, options = account
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CREDENTIALS"), repo.transaction():
        mfa.begin_enrollment(repo, user_id, password, fresh=False, session_id=SESSION_ID, **options)
    assert repo.mfa.get(user_id) is None


def test_replacement_requires_fresh_auth_and_preserves_old_factor_until_confirmed(account):
    repo, user_id, options = account
    seed, _, recovery = enroll(account)
    old_cipher = repo.mfa.get(user_id).secret_ciphertext
    with pytest.raises(mfa.MfaError, match="AUTH_REAUTH_REQUIRED"), repo.transaction():
        mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=False, session_id=SESSION_ID, **options)
    with repo.transaction():
        next_secret = mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=True, session_id=SESSION_ID, **options)
    assert repo.mfa.get(user_id).secret_ciphertext == old_cipher
    with repo.transaction():
        next_generation, next_codes = mfa.confirm_enrollment(
            repo, user_id, totp_code(base64.b32decode(next_secret), NOW.timestamp()), session_id=SESSION_ID, **options,
        )
    assert next_generation == 2 and not set(recovery) & set(next_codes)
    assert repo.mfa.get(user_id).secret_ciphertext != old_cipher
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.verify_factor(repo, user_id, recovery[0], **options)


@pytest.mark.parametrize("invalid", ["wrong", "expired", "missing"])
def test_confirmation_refuses_invalid_or_expired_enrollment(account, invalid):
    repo, user_id, options = account
    code = "000000"
    if invalid != "missing":
        with repo.transaction():
            secret = mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=False, session_id=SESSION_ID, **options)
        code = totp_code(base64.b32decode(secret), NOW.timestamp())
    if invalid == "expired":
        options = dict(options, now=NOW + timedelta(minutes=10))
        # A valid CURRENT OTP isolates the enrollment deadline from TOTP expiry.
        code = totp_code(base64.b32decode(secret), options["now"].timestamp())
    elif invalid == "wrong":
        code = str((int(code) + 1) % 1_000_000).zfill(6)
    with pytest.raises(mfa.MfaError), repo.transaction():
        mfa.confirm_enrollment(repo, user_id, code, session_id=SESSION_ID, **options)
    factor = repo.mfa.get(user_id)
    assert factor is None or factor.status == "unconfigured"
    assert repo.session.scalar(select(OperatorRecoveryCode.id)) is None


def test_confirmed_totp_is_consumed_and_the_next_step_is_one_use(account):
    repo, user_id, options = account
    seed, _, _ = enroll(account)
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.verify_factor(repo, user_id, totp_code(seed, NOW.timestamp()), **options)
    later = NOW + timedelta(seconds=30)
    code = totp_code(seed, later.timestamp())
    with repo.transaction():
        assert mfa.verify_factor(repo, user_id, code, **dict(options, now=later)) == 1
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.verify_factor(repo, user_id, code, **dict(options, now=later))


def test_another_session_cannot_confirm_the_accounts_pending_enrollment(account):
    repo, user_id, options = account
    with repo.transaction():
        secret = mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=False, session_id=SESSION_ID, **options)
    code = totp_code(base64.b32decode(secret), NOW.timestamp())
    with pytest.raises(mfa.MfaError, match="MFA_ENROLLMENT_EXPIRED"), repo.transaction():
        mfa.confirm_enrollment(repo, user_id, code, session_id=uuid.uuid4(), **options)
    assert repo.mfa.get(user_id).status == "unconfigured"
    with repo.transaction():
        assert mfa.confirm_enrollment(repo, user_id, code, session_id=SESSION_ID, **options)[0] == 1


def test_failed_session_grant_rolls_back_code_consumption_and_audit(account):
    repo, user_id, options = account
    _, _, recovery = enroll(account)
    with pytest.raises(RuntimeError, match="grant failed"), repo.transaction():
        mfa.verify_factor(repo, user_id, recovery[0], **options)
        raise RuntimeError("grant failed")
    assert repo.session.scalars(select(StateTransition).where(StateTransition.event == "recover")).all() == []
    with repo.transaction():
        assert mfa.verify_factor(repo, user_id, recovery[0].upper(), **options) == 1
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.verify_factor(repo, user_id, recovery[0], **options)


@pytest.mark.parametrize("kind", ["totp", "recovery"])
def test_concurrent_requests_consume_the_code_only_once(account, migrated, kind):
    repo, user_id, options = account
    seed, _, recovery = enroll(account)
    later = NOW + timedelta(seconds=30)
    code = recovery[0] if kind == "recovery" else totp_code(seed, later.timestamp())
    barrier = threading.Barrier(2)
    def attempt():
        with Session(migrated, autoflush=False, expire_on_commit=False) as session:
            local = LocalRepository(session)
            barrier.wait(timeout=10)
            try:
                with local.transaction():
                    mfa.verify_factor(local, user_id, code, **dict(options, now=later))
                return "accepted"
            except mfa.MfaError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt) for _ in range(2)]
        assert sorted(f.result(timeout=20) for f in futures) == ["MFA_INVALID_CODE", "accepted"]
    repo.session.expire_all()
    assert len(repo.session.scalars(select(StateTransition).where(
        StateTransition.event == ("recover" if kind == "recovery" else "authenticate"),
    )).all()) == 1


def test_node_scope_cannot_decrypt_or_replace_a_cloud_factor(account):
    repo, user_id, options = account
    _, _, recovery = enroll(account)
    options = dict(options, scope=f"node:{uuid.uuid4()}")
    with pytest.raises(mfa.MfaError, match="MFA_SCOPE_MISMATCH"), repo.transaction():
        mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=True, session_id=SESSION_ID, **options)
    with pytest.raises(mfa.MfaError, match="MFA_NOT_ENROLLED"), repo.transaction():
        mfa.verify_factor(repo, user_id, recovery[0], **options)


def test_composed_calls_do_not_restore_a_consumed_counter_from_the_database(account):
    repo, user_id, options = account
    seed, _, _ = enroll(account)
    later = NOW + timedelta(seconds=30)
    code = totp_code(seed, later.timestamp())
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.verify_factor(repo, user_id, code, **dict(options, now=later))
        mfa.verify_factor(repo, user_id, code, **dict(options, now=later))
    # The failed composed transaction rolls back the first consumption, too.
    with repo.transaction():
        assert mfa.verify_factor(repo, user_id, code, **dict(options, now=later)) == 1


def test_successful_totp_rewraps_old_key_without_invalidating_other_sessions(account):
    repo, user_id, options = account
    seed, generation, _ = enroll(account)
    old_cipher = repo.mfa.get(user_id).secret_ciphertext
    new_key = secrets.token_bytes(32)
    keys = options["keys"]
    rotated = SecretKeyring(secret_key_id(new_key), {keys.active_id: keys.active_key, secret_key_id(new_key): new_key})
    later = NOW + timedelta(seconds=30)
    with repo.transaction():
        assert mfa.verify_factor(repo, user_id, totp_code(seed, later.timestamp()),
                                 **dict(options, keys=rotated, now=later)) == generation
    factor = repo.mfa.get(user_id)
    assert factor.key_id == rotated.active_id and factor.secret_ciphertext != old_cipher
    assert decrypt_factor(factor.secret_ciphertext, new_key, user_id=user_id, scope="cloud") == seed


def test_schema_refuses_active_factors_without_encrypted_material(account):
    from sqlalchemy.exc import IntegrityError
    repo, user_id, _ = account
    with pytest.raises(IntegrityError), repo.transaction():
        repo.session.add(OperatorMfaFactor(user_id=user_id, scope="cloud", status="active"))


def test_rewrap_moves_active_and_pending_seeds_to_the_active_key(account):
    repo, user_id, options = account
    seed, generation, _ = enroll(account)
    old = options["keys"]
    # A replacement enrollment is pending under the old key, too.
    with repo.transaction():
        mfa.begin_enrollment(repo, user_id, PASSWORD, fresh=True, session_id=SESSION_ID, **options)
    new_key = secrets.token_bytes(32)
    rotated = SecretKeyring(secret_key_id(new_key), {old.active_id: old.active_key, secret_key_id(new_key): new_key})
    assert {row["keyId"] for row in repo.mfa.key_usage()} == {old.active_id}
    with repo.transaction():
        counts = mfa.rewrap_factors(repo, keys=rotated, now=NOW)
    assert counts == {"active": 1, "pending": 1}
    factor = repo.mfa.get(user_id)
    assert factor.key_id == factor.pending_key_id == rotated.active_id
    assert factor.generation == generation  # custody change, not a lifecycle event
    assert repo.mfa.key_usage() == [
        {"keyId": rotated.active_id, "use": "active", "factors": 1},
        {"keyId": rotated.active_id, "use": "pending", "factors": 1},
    ]
    # The old key can now be dropped: a ring without it still verifies the seed.
    only_new = SecretKeyring(rotated.active_id, {rotated.active_id: new_key})
    later = NOW + timedelta(seconds=30)
    with repo.transaction():
        assert mfa.verify_factor(repo, user_id, totp_code(seed, later.timestamp()),
                                 **dict(options, keys=only_new, now=later)) == generation
    with repo.transaction():
        assert mfa.rewrap_factors(repo, keys=only_new, now=later) == {"active": 0, "pending": 0}


def test_rewrap_without_the_old_key_refuses_and_writes_nothing(account):
    repo, user_id, options = account
    enroll(account)
    before = repo.mfa.get(user_id).secret_ciphertext
    new_key = secrets.token_bytes(32)
    missing_old = SecretKeyring(secret_key_id(new_key), {secret_key_id(new_key): new_key})
    with pytest.raises(SecretKeyringError), repo.transaction():
        mfa.rewrap_factors(repo, keys=missing_old, now=NOW)
    repo.session.expire_all()
    factor = repo.mfa.get(user_id)
    assert factor.secret_ciphertext == before and factor.key_id == options["keys"].active_id


def test_reissue_needs_a_current_code_and_replaces_every_recovery_code(account):
    repo, user_id, options = account
    seed, _, recovery = enroll(account)
    later = NOW + timedelta(seconds=30)
    with pytest.raises(mfa.MfaError, match="MFA_INVALID_CODE"), repo.transaction():
        mfa.reissue_recovery_codes(repo, user_id, recovery[0], **dict(options, now=later))
    with repo.transaction():
        codes = mfa.reissue_recovery_codes(repo, user_id, totp_code(seed, later.timestamp()), **dict(options, now=later))
    factor = repo.mfa.get(user_id)
    stored = set(repo.session.scalars(select(OperatorRecoveryCode.token_hash).where(OperatorRecoveryCode.factor_id == factor.id)))
    assert stored == {_hash_token(normalize_recovery_code(code)) for code in codes}
    assert not stored & {_hash_token(normalize_recovery_code(code)) for code in recovery}
    events = repo.session.scalars(select(StateTransition.event).where(StateTransition.subject_id == str(factor.id))).all()
    assert "reissue_recovery_codes" in events


def test_disable_clears_the_seed_and_codes_and_revokes_other_sessions(account):
    repo, user_id, options = account
    _, generation, recovery = enroll(account)
    other = AuthSession(user_id=user_id, token_hash="d" * 64, expires_at=NOW + timedelta(hours=1))
    repo.session.add(other)
    repo.session.commit()
    with repo.transaction():
        mfa.disable_factor(repo, user_id, recovery[0], session_id=SESSION_ID, **options)
    factor = repo.mfa.get(user_id)
    assert factor.status == "unconfigured" and factor.generation == generation + 1
    assert factor.secret_ciphertext is None and factor.key_id is None and factor.last_counter == -1
    assert repo.mfa.count_recovery_codes(factor.id) == 0
    repo.session.refresh(other)
    assert other.revoked_at is not None
    transition = repo.session.scalars(select(StateTransition).where(StateTransition.event == "disable")).one()
    assert (transition.from_state, transition.to_state, transition.actor_id) == ("active", "unconfigured", str(user_id))
