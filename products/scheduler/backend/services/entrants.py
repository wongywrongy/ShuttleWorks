"""Entrant accounts and entrant sessions (SP-E1-2 Phase B, D-A2/D-A3).

The **second principal type**. An entrant is a member of the public who
signs up on the entry surface, logs in, and submits entries for the people
they are responsible for. They have no org, no role, no workspace and no
operator console — see ``EntrantAccount``'s docstring for why that is a
schema property rather than a rule someone enforces.

**What this module reuses, and what it deliberately copies.**

Reused directly from ``services/auth.py``, because they are
principal-agnostic module functions that take strings and return strings:

- ``validate_password`` — NIST 800-63B length policy + the bundled
  breached-password blocklist. An entrant's password is protected by the
  same rule as a director's, and a second policy would be a second thing
  to get wrong.
- ``hash_password`` / ``verify_password`` — Argon2id.
- ``normalize_email`` — the address grammar.
- ``_hash_token`` — SHA-256 of the session token.

**Copied, not shared: the session trio.** ``create_session`` /
``resolve_session`` / ``revoke_session`` in ``services/auth.py`` are
``User``-bound at the type level — they write a ``user_id`` FK and return a
``User`` row. Making them generic over the principal would mean a table
argument and a return type of "one of two unrelated ORM classes", which is
exactly the shape of code where a caller ends up trusting the wrong branch.
Ruling D-A3 chose the ~40 duplicated lines below over that, on the grounds
that a mistake here is a fail-*open* authentication mistake. The duplication
is held to the original's behaviour by ``tests/unit/test_entrants_service.py``,
which re-proves every property ``tests/unit/test_auth_characterization.py``
pins for the operator table.

**Transactions:** like ``services/auth`` and ``services/solve_jobs``, nothing
here commits. Callers own the transaction boundary.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from database.models import EntrantAccount, EntrantSession
from services.auth import (
    AuthError,
    _hash_token,
    hash_password,
    normalize_email,
    validate_password,
    verify_password,
)

log = logging.getLogger("scheduler.entrants")

_SESSION_TOKEN_BYTES = 32

# Static Argon2id hash of a throwaway string. Verifying against it when the
# address is unknown keeps a failed login's cost — and therefore its timing —
# the same shape whether or not the account exists. ``api/auth.py`` does the
# same for operators; an entrant login is if anything more exposed, since the
# whole surface is public by design.
_DUMMY_HASH = hash_password("sw-entrant-dummy-timing-equalizer")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; re-attach UTC before comparing."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ---- Accounts ---------------------------------------------------------


def get_account_by_email(session: Session, email: str) -> Optional[EntrantAccount]:
    """Case-insensitive lookup **inside the entrant namespace only**.

    Nothing in this module ever reads ``users``: an operator's address is
    not an entrant's address, by design (spec Q13 §3).
    """
    return session.execute(
        select(EntrantAccount).where(
            func.lower(EntrantAccount.email) == email.lower()
        )
    ).scalar_one_or_none()


def create_account(
    session: Session,
    *,
    email: str,
    password: str,
    display_name: Optional[str] = None,
    phone: Optional[str] = None,
) -> EntrantAccount:
    """Insert an entrant account row.

    Validates the address and the password policy here rather than trusting
    the route, so every caller gets the same rules. The case-insensitive
    uniqueness race is backstopped by ``uq_entrant_accounts_email_lower``.

    Raises ``AuthError`` — the same exception type the operator stack raises,
    with the same codes, so a caller that maps codes to HTTP responses does
    not need a second mapping.
    """
    normalized = normalize_email(email)
    validate_password(password)
    if get_account_by_email(session, normalized) is not None:
        raise AuthError("EMAIL_TAKEN", "An account with this email already exists")
    account = EntrantAccount(
        id=uuid.uuid4(),
        email=normalized,
        password_hash=hash_password(password),
        display_name=(display_name or "").strip() or None,
        phone=(phone or "").strip() or None,
    )
    session.add(account)
    session.flush()
    return account


def authenticate(
    session: Session, *, email: str, password: str
) -> Optional[EntrantAccount]:
    """Credentials → account, or ``None``.

    One answer for every failure — unknown address, unusable address, no
    password set, wrong password. The caller must not be able to branch on
    the difference, because the difference is exactly what an enumeration
    attack is looking for. A miss still pays the Argon2 cost, against a
    dummy hash, so timing does not become the oracle the response is not.
    """
    try:
        normalized = normalize_email(email)
    except AuthError:
        verify_password(_DUMMY_HASH, password)
        return None
    account = get_account_by_email(session, normalized)
    if account is None or not account.password_hash:
        verify_password(_DUMMY_HASH, password)
        return None
    if not verify_password(account.password_hash, password):
        return None
    return account


# ---- Sessions ---------------------------------------------------------


def create_session(
    session: Session, account_id: uuid.UUID
) -> tuple[str, EntrantSession]:
    """Mint an entrant session row; returns ``(raw_token, row)``.

    The raw token goes into the ``play.*`` cookie and is never stored — only
    its SHA-256 lands in the table, so a database dump is not a set of live
    entrant sessions.
    """
    token = secrets.token_urlsafe(_SESSION_TOKEN_BYTES)
    row = EntrantSession(
        token_hash=_hash_token(token),
        account_id=account_id,
        expires_at=_utcnow() + timedelta(days=settings.session_ttl_days),
    )
    session.add(row)
    session.flush()
    return token, row


def resolve_session(session: Session, token: str) -> Optional[EntrantAccount]:
    """Token → live entrant account, or ``None``.

    Reads ``entrant_sessions`` and nothing else. An operator's session token
    cannot resolve here — it is not in this table — and the reverse holds in
    ``services/auth.py`` for the same reason. That is the whole content of
    "sessions are scoped to their principal": not a check, a table.

    Touches ``last_seen_at`` on the same 300-second threshold the operator
    resolver uses, so an authenticated read does not become a write per
    request.
    """
    if not token:
        return None
    row = session.execute(
        select(EntrantSession).where(EntrantSession.token_hash == _hash_token(token))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    now = _utcnow()
    if _aware(row.expires_at) <= now:
        return None
    if (now - _aware(row.last_seen_at)).total_seconds() > 300:
        row.last_seen_at = now
    return session.get(EntrantAccount, row.account_id)


def revoke_session(session: Session, token: str) -> bool:
    """Log out. Revocation is a timestamp, not a delete — the row outlives
    the credential so an audit can still see it happened."""
    row = session.execute(
        select(EntrantSession).where(EntrantSession.token_hash == _hash_token(token))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = _utcnow()
    return True


def revoke_all_sessions(
    session: Session, account_id: uuid.UUID, *, except_token: Optional[str] = None
) -> int:
    """Revoke every live session for an account (OWASP: a credential change
    invalidates the others). Unused until E2 ships password reset; written
    now because the trio above is only half a session design without it, and
    the half that is missing is always the one a later slice forgets."""
    keep_hash = _hash_token(except_token) if except_token else None
    rows = session.execute(
        select(EntrantSession).where(
            EntrantSession.account_id == account_id,
            EntrantSession.revoked_at.is_(None),
        )
    ).scalars()
    now = _utcnow()
    count = 0
    for row in rows:
        if keep_hash is not None and row.token_hash == keep_hash:
            continue
        row.revoked_at = now
        count += 1
    return count
