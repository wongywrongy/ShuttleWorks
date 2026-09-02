"""Event-scoped operator sessions for WAN outages.

The service is intentionally node-only and transaction-neutral.  A session
is usable only for its tournament and authority epoch, and only while the
operator remains a tournament member; cloud auth remains in ``auth.py``.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.time_utils import _aware, _utcnow
from db.models import (
    OfflineOperatorSession,
    TournamentAuthority,
    TournamentMember,
    User,
)

TOKEN_BYTES = 32
DEFAULT_TTL_HOURS = 72


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
    if not 1 <= ttl_hours <= 168:
        raise ValueError("offline session lifetime must be between 1 and 168 hours")
    if session.get(User, user_id) is None:
        raise ValueError("operator does not exist")
    membership = session.get(TournamentMember, (tournament_id, user_id))
    if membership is None or membership.role not in {"operator", "owner"}:
        raise ValueError("operator is not authorized for this tournament")
    token = secrets.token_urlsafe(TOKEN_BYTES)
    row = OfflineOperatorSession(
        token_hash=_digest(token),
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        device_id=device_id,
        expires_at=_utcnow() + timedelta(hours=ttl_hours),
    )
    session.add(row)
    session.flush()
    return token, row


def bootstrap(
    session: Session,
    *,
    user_id: uuid.UUID,
    tournament_id: uuid.UUID,
    authority_epoch: int,
    device_id: uuid.UUID,
    capability: str,
    ttl_hours: int = DEFAULT_TTL_HOURS,
) -> tuple[str, OfflineOperatorSession]:
    """Issue the first node-local credential without a cloud cookie.

    The authority capability is the node bootstrap ceremony's proof.  It is
    already scoped to this tournament, node, and epoch and is never stored
    here in raw form; only the resulting offline-session digest is persisted.
    This path is intentionally separate from ``issue`` so an event-node
    install cannot accidentally reintroduce the cloud-origin session
    requirement.
    """
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if (
        authority is None
        or authority.state != "active"
        or authority.node_id != device_id
        or not capability
        or not hmac.compare_digest(
            authority.capability_digest, hashlib.sha256(capability.encode("utf-8")).hexdigest()
        )
    ):
        raise ValueError("node capability does not match active authority")
    return issue(
        session,
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        device_id=device_id,
        ttl_hours=ttl_hours,
    )


def resolve(
    session: Session,
    token: str,
    *,
    tournament_id: uuid.UUID,
) -> tuple[User, OfflineOperatorSession] | None:
    if not token:
        return None
    row = session.execute(
        select(OfflineOperatorSession).where(
            OfflineOperatorSession.token_hash == _digest(token)
        )
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None or (_aware(row.expires_at) <= _utcnow()):
        return None
    if row.tournament_id != tournament_id:
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
    membership = session.get(TournamentMember, (row.tournament_id, row.user_id))
    if membership is None or membership.role not in {"operator", "owner"}:
        return None
    user = session.get(User, row.user_id)
    if user is None:
        return None
    row.last_seen_at = _utcnow()
    return user, row


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
