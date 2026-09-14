"""Operator factor lifecycle, composed inside the caller's transaction.

HTTP adapters must resolve the pending/full session and throttle attempts before
calling these operations. Confirmation/verification and session rotation belong
in ONE transaction: a failed grant must roll back consumption of the code.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import uuid

from core.secret_keys import SecretKeyring
from core.state_machine import apply
from core.state_machines import OPERATOR_MFA_FACTOR
from core.time_utils import _aware
from core.tokens import _hash_token
from identity.auth import verify_password
from identity.mfa_crypto import (
    decrypt_factor, display_secret, encrypt_factor, matching_counter,
    new_recovery_codes, new_totp_secret, normalize_recovery_code,
)
from repositories.local import LocalRepository

ENROLLMENT_LIFETIME = timedelta(minutes=10)


class MfaError(ValueError):
    """Stable codes; messages contain no credential material."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _audit(repo: LocalRepository, factor, event: str, now: datetime) -> None:
    factor.updated_at = now
    record = apply(OPERATOR_MFA_FACTOR, factor, event, "operator", guards={},
                   session=None, actor_id=factor.user_id)
    repo.mfa.persist_transition(record)


def begin_enrollment(repo: LocalRepository, user_id: uuid.UUID, password: str, *,
                     scope: str, keys: SecretKeyring, now: datetime, fresh: bool,
                     session_id: uuid.UUID) -> str:
    user = repo.mfa.reserve_account(user_id)
    if user is None or not user.password_hash or not verify_password(user.password_hash, password):
        raise MfaError("MFA_INVALID_CREDENTIALS")
    factor = repo.mfa.reserve(user_id, scope, now, create=True)
    if factor is None:
        raise MfaError("MFA_SCOPE_MISMATCH")
    if factor.status == "active" and not fresh:
        raise MfaError("AUTH_REAUTH_REQUIRED")
    seed = new_totp_secret()
    factor.pending_ciphertext = encrypt_factor(seed, keys.active_key, user_id=user_id, scope=f"{scope}:session:{session_id}")
    factor.pending_key_id = keys.active_id
    factor.pending_expires_at = now + ENROLLMENT_LIFETIME
    factor.pending_session_id = session_id
    _audit(repo, factor, "begin", now)
    return display_secret(seed)


def confirm_enrollment(repo: LocalRepository, user_id: uuid.UUID, code: str, *,
                       scope: str, keys: SecretKeyring, now: datetime,
                       session_id: uuid.UUID) -> tuple[int, list[str]]:
    factor = repo.mfa.reserve(user_id, scope, now)
    if (factor is None or factor.pending_ciphertext is None or factor.pending_expires_at is None
            or factor.pending_session_id != session_id or _aware(factor.pending_expires_at) <= now):
        raise MfaError("MFA_ENROLLMENT_EXPIRED")
    seed = decrypt_factor(factor.pending_ciphertext, keys.key(factor.pending_key_id), user_id=user_id,
                          scope=f"{scope}:session:{session_id}")
    counter = matching_counter(seed, code, now.timestamp(), after_counter=-1)
    if counter is None:
        raise MfaError("MFA_INVALID_CODE")
    # Re-wrap with the active key even if custody rotated during enrollment.
    factor.secret_ciphertext = encrypt_factor(seed, keys.active_key, user_id=user_id, scope=scope)
    factor.key_id = keys.active_id
    factor.pending_ciphertext = factor.pending_key_id = factor.pending_expires_at = None
    factor.pending_session_id = None
    factor.generation += 1
    factor.last_counter = counter
    recovery = new_recovery_codes()
    repo.mfa.replace_recovery_codes(factor.id, [_hash_token(normalize_recovery_code(v)) for v in recovery], now)
    # The enclosing HTTP ceremony rotates its own session in this transaction.
    repo.mfa.revoke_sessions(user_id, now, except_session_id=session_id)
    _audit(repo, factor, "activate", now)
    return factor.generation, recovery


def verify_factor(repo: LocalRepository, user_id: uuid.UUID, code: str, *,
                  scope: str, keys: SecretKeyring, now: datetime) -> int:
    factor = repo.mfa.reserve(user_id, scope, now)
    if factor is None or factor.status != "active":
        raise MfaError("MFA_NOT_ENROLLED")
    recovery = normalize_recovery_code(code)
    if recovery is not None:
        if not repo.mfa.consume_recovery_code(factor.id, _hash_token(recovery)):
            raise MfaError("MFA_INVALID_CODE")
        event = "recover"
    else:
        seed = decrypt_factor(factor.secret_ciphertext, keys.key(factor.key_id), user_id=user_id, scope=scope)
        counter = matching_counter(seed, code, now.timestamp(), after_counter=factor.last_counter)
        if counter is None:
            raise MfaError("MFA_INVALID_CODE")
        factor.last_counter = counter
        # Successful proof migrates custody without changing factor generation.
        if factor.key_id != keys.active_id:
            factor.secret_ciphertext = encrypt_factor(seed, keys.active_key, user_id=user_id, scope=scope)
            factor.key_id = keys.active_id
        event = "authenticate"
    _audit(repo, factor, event, now)
    return factor.generation
