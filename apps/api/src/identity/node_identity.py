"""Individual node-local credentials, provisioned by a trusted local administrator.

The node's shared authority capability cannot set another person's password.
Activation additionally requires a separately delivered, one-use credential for
that member and epoch. Passwords and MFA factors never come from a checkpoint.
All operations are composed by the caller in one repository transaction.
"""
from datetime import datetime, timedelta
import secrets
import uuid

from core.state_machine import apply
from core.state_machines import NODE_OPERATOR_ENROLLMENT, OPERATOR_MFA_FACTOR
from core.tokens import _hash_token
from identity import auth, offline_sessions
from identity.mfa import MfaError
from repositories.local import LocalRepository

ACTIVATION_LIFETIME = timedelta(minutes=10)


def _scope(repo, user_id, tournament_id, node_id):
    authority = repo.mfa.node_scope(user_id, tournament_id, node_id)
    if authority is None:
        raise MfaError("NODE_CREDENTIAL_INVALID")
    return authority


def provision(repo: LocalRepository, *, user_id: uuid.UUID, tournament_id: uuid.UUID,
              node_id: uuid.UUID, now: datetime, reset_reason: str | None = None) -> tuple[str, datetime]:
    """Local administration only. Never expose this operation as a LAN endpoint."""
    authority = _scope(repo, user_id, tournament_id, node_id)
    factor = repo.mfa.reserve(user_id, f"node:{node_id}", now, create=True)
    account = repo.get_user_identity(user_id)
    if account is None or factor is None:
        raise MfaError("NODE_CREDENTIAL_INVALID")
    if reset_reason is not None:
        if not 5 <= len(reset_reason.strip()) <= 500:
            raise MfaError("NODE_RECOVERY_REASON_REQUIRED")
        _administrator_reset(repo, account, factor, node_id, now, reset_reason.strip())
    if account.password_hash or factor.status == "active":
        raise MfaError("NODE_ALREADY_CONFIGURED")
    raw = secrets.token_urlsafe(32)
    expires = now + ACTIVATION_LIFETIME
    row = repo.mfa.save_node_enrollment(user_id, tournament_id=tournament_id, node_id=node_id,
                                      epoch=authority.epoch, digest=_hash_token(raw), now=now, expires_at=expires)
    record = apply(NODE_OPERATOR_ENROLLMENT, row, "issue", "system", guards={}, session=None,
                   actor_id=node_id, reason="Local administrator provisioned individual node enrollment")
    repo.mfa.persist_transition(record)
    return raw, expires


def _administrator_reset(repo, account, factor, node_id, now, reason):
    """OS administrator recovery, never a web action or shared-capability power."""
    account.password_hash = None
    factor.secret_ciphertext = factor.key_id = None
    factor.pending_ciphertext = factor.pending_key_id = factor.pending_expires_at = factor.pending_session_id = None
    factor.last_counter = -1
    factor.generation += 1
    factor.updated_at = now
    repo.mfa.revoke_sessions(account.id, now)
    repo.mfa.replace_recovery_codes(factor.id, [], now)
    record = apply(OPERATOR_MFA_FACTOR, factor, "administrator_reset", "system",
                   guards={}, session=None, actor_id=node_id, reason=reason)
    repo.mfa.persist_transition(record)
    enrollment = repo.mfa.node_enrollment(account.id)
    if enrollment is not None:
        record = apply(NODE_OPERATOR_ENROLLMENT, enrollment, "administrator_reset", "system",
                       guards={}, session=None, actor_id=node_id, reason=reason)
        repo.mfa.persist_transition(record)


def activate(repo: LocalRepository, *, email: str, token: str, password: str,
             tournament_id: uuid.UUID, node_id: uuid.UUID, now: datetime):
    auth.validate_password(password)
    account = repo.execute_query(auth.get_user_by_email, auth.normalize_email(email))
    if account is None:
        raise MfaError("NODE_CREDENTIAL_INVALID")
    authority = _scope(repo, account.id, tournament_id, node_id)
    factor = repo.mfa.reserve(account.id, f"node:{node_id}", now)
    row = repo.mfa.node_enrollment(account.id)
    if (account.password_hash or factor is None or factor.status == "active" or row is None
            or row.tournament_id != tournament_id or row.node_id != node_id
            or row.authority_epoch != authority.epoch):
        raise MfaError("NODE_CREDENTIAL_INVALID")
    if not repo.mfa.consume_node_enrollment(row, _hash_token(token), now):
        raise MfaError("NODE_CREDENTIAL_INVALID")
    account.password_hash = auth.hash_password(password)
    record = apply(NODE_OPERATOR_ENROLLMENT, row, "activate", "operator", guards={}, session=None, actor_id=account.id)
    repo.mfa.persist_transition(record)
    raw, credential = repo.stage(offline_sessions.issue, user_id=account.id, tournament_id=tournament_id,
                                authority_epoch=authority.epoch, device_id=node_id)
    return account, raw, credential


def login(repo: LocalRepository, *, account, password: str, tournament_id: uuid.UUID, node_id: uuid.UUID):
    """The adapter verifies and throttles the password before calling this seam."""
    account = repo.mfa.reserve_account(account.id)
    if account is None or not account.password_hash or not auth.verify_password(account.password_hash, password):
        raise MfaError("NODE_CREDENTIAL_INVALID")
    authority = _scope(repo, account.id, tournament_id, node_id)
    return repo.stage(offline_sessions.issue, user_id=account.id, tournament_id=tournament_id,
                      authority_epoch=authority.epoch, device_id=node_id)
