"""Event-scoped operator sessions for WAN outages.

The service is intentionally node-only and transaction-neutral. A session is
usable only for its tournament and authority epoch. ``issue`` is reached only
through individual activation and sign-in (``identity/node_identity.py``);
workspace role is then enforced by ``require_tournament_access``, the uniform
404 seam, not here. Cloud auth remains in ``auth.py``.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.time_utils import _utcnow
from core.operator_sessions import session_is_live
from core.tokens import _hash_token as _digest
from db.models import (
    OfflineOperatorSession,
    TournamentAuthority,
    TournamentMember,
    User,
)

TOKEN_BYTES = 32
DEFAULT_TTL_HOURS = 12


def issue(
    session: Session,
    *,
    user_id: uuid.UUID,
    tournament_id: uuid.UUID,
    authority_epoch: int,
    device_id: uuid.UUID,
    ttl_hours: int = DEFAULT_TTL_HOURS,
) -> tuple[str, OfflineOperatorSession]:
    """Issue a scoped credential for an operator already authorized locally."""
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None or authority.state != "active" or authority.node_id != device_id:
        raise ValueError("active authority does not match session scope")
    if not 1 <= ttl_hours <= 12:
        raise ValueError("offline session lifetime must be between 1 and 12 hours")
    if session.get(User, user_id) is None:
        raise ValueError("operator does not exist")
    membership = session.get(TournamentMember, (tournament_id, user_id))
    if membership is None or membership.role not in {"operator", "owner"}:
        raise ValueError("operator is not authorized for this tournament")
    token = secrets.token_urlsafe(TOKEN_BYTES)
    now = _utcnow()
    row = OfflineOperatorSession(
        token_hash=_digest(token),
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        device_id=device_id,
        created_at=now, last_seen_at=now,
        expires_at=now + timedelta(hours=ttl_hours),
    )
    session.add(row)
    session.flush()
    return token, row


def resolve_identity(session: Session, token: str) -> tuple[User, OfflineOperatorSession] | None:
    """Validate the credential; HTTP tenant/role denial remains the 404 seam."""
    if not token:
        return None
    row = session.execute(
        select(OfflineOperatorSession).where(
            OfflineOperatorSession.token_hash == _digest(token)
        )
    ).scalar_one_or_none()
    if not session_is_live(row, _utcnow()):
        return None
    authority = session.get(
        TournamentAuthority, (row.tournament_id, row.authority_epoch)
    )
    if (
        authority is None
        or authority.state != "active"
        or authority.node_id != row.device_id
    ):
        return None
    user = session.get(User, row.user_id)
    if user is None:
        return None
    return user, row


def revoke_cookie(session: Session, token: str) -> bool:
    """Logout revokes the supplied node cookie even outside a workspace route."""
    row = session.scalar(select(OfflineOperatorSession).where(OfflineOperatorSession.token_hash == _digest(token)))
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = _utcnow()
    row.revocation_reason = "operator logout"
    return True


def revoke(
    session: Session,
    token: str,
    *,
    tournament_id: uuid.UUID,
    reason: str,
) -> bool:
    row = session.execute(
        select(OfflineOperatorSession).where(
            OfflineOperatorSession.token_hash == _digest(token)
        )
    ).scalar_one_or_none()
    if (
        row is None
        or row.tournament_id != tournament_id
        or row.revoked_at is not None
    ):
        return False
    row.revoked_at = _utcnow()
    row.revocation_reason = reason
    return True
