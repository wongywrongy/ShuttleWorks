"""Identity, password, session, and throttle logic (SP-CLOUD-2 Phase 1).

Design decisions (grounded in OWASP Authentication / Session Management
/ Password Storage cheat sheets and NIST 800-63B):

- **Argon2id** via ``argon2-cffi`` with the library's RFC-9106
  low-memory-profile defaults (m=64MiB, t=3, p=4 as of 25.x — at or
  above the OWASP minimums). The PHC hash string embeds its own salt
  and parameters, so parameter upgrades verify old hashes transparently
  and ``needs_rehash`` flags them for opportunistic rehashing at login.
- **Password policy is length-only** (NIST 800-63B): min/max from
  settings, no composition rules, no rotation. A tiny worst-password
  blocklist rejects the most-stuffed strings.
- **Sessions are opaque server-side rows**: the cookie carries a random
  256-bit urlsafe token; only its SHA-256 is stored, so a DB leak can't
  be replayed. Revocable, rolling ``last_seen_at``, absolute expiry.
- **Throttle** is a DB row per key (``account:<email>`` / ``ip:<addr>``)
  with windowed failure counts and doubling lockouts — enough to blunt
  credential stuffing without external infrastructure.

Transactions: like ``services/solve_jobs``, no function here commits —
callers own the transaction boundary.
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from database.models import AuthSession, AuthThrottle, Org, OrgMember, User

log = logging.getLogger("scheduler.auth_service")

_hasher = PasswordHasher()

# The handful of strings that dominate real credential-stuffing lists.
# NIST 800-63B asks for a blocklist of commonly-used passwords; keeping
# it tiny and inline beats shipping a wordlist for a product whose
# accounts guard tournament schedules.
_WORST_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "1234567890", "qwertyuiop", "letmein123", "iloveyou1", "sunshine1",
    "admin123", "welcome1", "changeme", "baseball1", "football1",
}

# Local bootstrap identity — the same zero UUID the synthetic-user era
# used, so existing tournament_members / owner_id rows keep matching.
BOOTSTRAP_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000000")
BOOTSTRAP_EMAIL = "local@dev"

_SESSION_TOKEN_BYTES = 32
_LOCK_CAP_SECONDS = 900.0


class AuthError(Exception):
    """Domain auth failure with a stable machine code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; re-attach UTC before comparing."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ---- Passwords -------------------------------------------------------


def validate_password(password: str) -> None:
    """NIST 800-63B policy: length bounds + worst-password blocklist."""
    if len(password) < settings.password_min_length:
        raise AuthError(
            "PASSWORD_TOO_SHORT",
            f"Password must be at least {settings.password_min_length} characters",
        )
    if len(password) > settings.password_max_length:
        raise AuthError(
            "PASSWORD_TOO_LONG",
            f"Password must be at most {settings.password_max_length} characters",
        )
    if password.lower() in _WORST_PASSWORDS:
        raise AuthError(
            "PASSWORD_TOO_COMMON",
            "That password is on the list of most commonly breached passwords",
        )


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    email = email.strip()
    if not _EMAIL_RE.match(email) or len(email) > 320:
        raise AuthError("INVALID_EMAIL", "Not a valid email address")
    return email


# ---- Users -----------------------------------------------------------


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    return session.execute(
        select(User).where(func.lower(User.email) == email.lower())
    ).scalar_one_or_none()


def create_user(
    session: Session,
    *,
    email: str,
    password: Optional[str],
    display_name: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
) -> User:
    """Insert a user row. Caller has already normalized/validated inputs;
    the case-insensitive uniqueness race is backstopped by the DB index."""
    if get_user_by_email(session, email) is not None:
        raise AuthError("EMAIL_TAKEN", "An account with this email already exists")
    user = User(
        id=user_id or uuid.uuid4(),
        email=email,
        password_hash=hash_password(password) if password else None,
        display_name=display_name,
    )
    session.add(user)
    session.flush()
    ensure_personal_org(session, user)
    return user


def ensure_user(
    session: Session, user_id: uuid.UUID, email: Optional[str]
) -> User:
    """Idempotently materialize a users row for an externally-issued
    identity (legacy Supabase JWT subjects until Phase 3 retires the
    bearer path). Gets a personal org like every other identity."""
    user = session.get(User, user_id)
    if user is None:
        candidate = (email or "").strip()
        taken = bool(candidate) and get_user_by_email(session, candidate) is not None
        user = User(
            id=user_id,
            email=candidate if candidate and not taken
            else f"user-{user_id.hex[:12]}@unmigrated.local",
        )
        session.add(user)
        session.flush()
    ensure_personal_org(session, user)
    return user


def ensure_personal_org(session: Session, user: User) -> Org:
    """Idempotently give a user a personal org (owner membership).

    The GitHub/Stripe day-one-org pattern: workspaces belong to orgs,
    never directly to users, even while the UI ignores orgs entirely.
    """
    existing = session.execute(
        select(Org)
        .join(OrgMember, OrgMember.org_id == Org.id)
        .where(OrgMember.user_id == user.id, OrgMember.role == "owner")
    ).scalars().first()
    if existing is not None:
        return existing
    if user.id == BOOTSTRAP_USER_UUID:
        name = "Local Workspace"
    else:
        base = user.display_name or user.email.split("@")[0]
        name = f"{base}'s workspace"[:200]
    org = Org(name=name)
    session.add(org)
    session.flush()
    session.add(OrgMember(org_id=org.id, user_id=user.id, role="owner"))
    session.flush()
    return org


def personal_org_id(session: Session, user_id: uuid.UUID) -> Optional[uuid.UUID]:
    """The org this user owns (personal org), or None."""
    row = session.execute(
        select(OrgMember.org_id).where(
            OrgMember.user_id == user_id, OrgMember.role == "owner"
        )
    ).first()
    return row[0] if row else None


def ensure_bootstrap_user(session: Session) -> User:
    """Idempotently materialize the local operator identity (zero UUID).

    One code path for local startup and tests; Phase 2 extends this to
    also ensure the personal org so local and cloud identities are
    shaped identically.
    """
    user = session.get(User, BOOTSTRAP_USER_UUID)
    if user is None:
        user = User(
            id=BOOTSTRAP_USER_UUID,
            email=BOOTSTRAP_EMAIL,
            password_hash=None,
            display_name="Local Operator",
            email_verified=True,
        )
        session.add(user)
        session.flush()
    ensure_personal_org(session, user)
    return user


# ---- Sessions --------------------------------------------------------


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(session: Session, user_id: uuid.UUID) -> tuple[str, AuthSession]:
    """Mint a session row; returns ``(raw_token, row)``. The raw token
    goes into the cookie and is never stored."""
    token = secrets.token_urlsafe(_SESSION_TOKEN_BYTES)
    row = AuthSession(
        token_hash=_hash_token(token),
        user_id=user_id,
        expires_at=_utcnow() + timedelta(days=settings.session_ttl_days),
    )
    session.add(row)
    session.flush()
    return token, row


def resolve_session(session: Session, token: str) -> Optional[User]:
    """Token → live user, or None. Touches ``last_seen_at`` (rolling)."""
    if not token:
        return None
    row = session.execute(
        select(AuthSession).where(AuthSession.token_hash == _hash_token(token))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    now = _utcnow()
    if _aware(row.expires_at) <= now:
        return None
    # Rolling activity stamp, thresholded so authenticated reads don't
    # turn into a write per request.
    if (now - _aware(row.last_seen_at)).total_seconds() > 300:
        row.last_seen_at = now
    return session.get(User, row.user_id)


def revoke_session(session: Session, token: str) -> bool:
    row = session.execute(
        select(AuthSession).where(AuthSession.token_hash == _hash_token(token))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = _utcnow()
    return True


def revoke_all_sessions(
    session: Session, user_id: uuid.UUID, *, except_token: Optional[str] = None
) -> int:
    """Revoke every live session for a user (password change / reset —
    OWASP: credential change invalidates other sessions)."""
    keep_hash = _hash_token(except_token) if except_token else None
    rows = session.execute(
        select(AuthSession).where(
            AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
        )
    ).scalars()
    count = 0
    now = _utcnow()
    for row in rows:
        if keep_hash is not None and row.token_hash == keep_hash:
            continue
        row.revoked_at = now
        count += 1
    return count


# ---- Password reset (token flow; delivery rides the email seam) ------


def issue_reset_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(_SESSION_TOKEN_BYTES)
    user.reset_token_hash = _hash_token(token)
    user.reset_token_expires_at = _utcnow() + timedelta(
        minutes=settings.reset_token_ttl_minutes
    )
    return token


def consume_reset_token(
    session: Session, token: str, new_password: str
) -> Optional[User]:
    """Valid token → set the new password, clear the token, revoke all
    sessions. Returns the user, or None on any mismatch/expiry."""
    if not token:
        return None
    token_hash = _hash_token(token)
    user = session.execute(
        select(User).where(User.reset_token_hash == token_hash)
    ).scalar_one_or_none()
    if user is None or user.reset_token_expires_at is None:
        return None
    if _aware(user.reset_token_expires_at) <= _utcnow():
        return None
    validate_password(new_password)
    user.password_hash = hash_password(new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    revoke_all_sessions(session, user.id)
    return user


# ---- Throttle --------------------------------------------------------


def throttle_check(session: Session, key: str) -> Optional[float]:
    """Locked? Returns remaining lock seconds, else None."""
    row = session.get(AuthThrottle, key)
    if row is None or row.locked_until is None:
        return None
    remaining = (_aware(row.locked_until) - _utcnow()).total_seconds()
    return remaining if remaining > 0 else None


def throttle_record_failure(session: Session, key: str) -> None:
    """Count a failed attempt; lock the key with doubling backoff once
    the windowed failure budget is spent."""
    now = _utcnow()
    row = session.get(AuthThrottle, key)
    if row is None:
        row = AuthThrottle(key=key, failures=0, window_started_at=now)
        session.add(row)
        # Sessions run autoflush=False; flush so a same-transaction
        # re-read (multiple failures in one request) sees this row.
        session.flush()
    window_age = (now - _aware(row.window_started_at)).total_seconds()
    if window_age > settings.auth_throttle_window_seconds:
        row.failures = 0
        row.window_started_at = now
        row.locked_until = None
    row.failures += 1
    overflow = row.failures - settings.auth_throttle_max_failures
    if overflow >= 0:
        lock = min(
            settings.auth_throttle_lock_seconds * (2**overflow), _LOCK_CAP_SECONDS
        )
        row.locked_until = now + timedelta(seconds=lock)


def throttle_record_success(session: Session, key: str) -> None:
    row = session.get(AuthThrottle, key)
    if row is not None:
        row.failures = 0
        row.locked_until = None
        row.window_started_at = _utcnow()
