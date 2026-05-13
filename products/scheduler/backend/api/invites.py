"""Invite-link endpoints (Step 7 of the cloud-prep migration).

Three routes live in this module under the ``/invites/{token}`` prefix:

- ``GET    /invites/{token}``           — public lookup; no auth.
- ``POST   /invites/{token}/accept``    — requires authentication; any
  logged-in user can claim the invite.
- ``DELETE /invites/{token}``           — requires the tournament owner.

A fourth endpoint, ``POST /tournaments/{tournament_id}/invites``, lives
on the existing tournaments router (it's owner-gated and tournament-
scoped, so the existing ``require_tournament_access("owner")`` dep is
the right primitive there).

Auth wiring: ``main.py`` registers this router **without** a
router-level ``get_current_user`` dep — each handler declares its own
auth needs because they differ across the three routes.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel

from app.dependencies import AuthUser, get_current_user
from database.models import InviteLink
from repositories import LocalRepository, get_repository
from repositories.local import is_invite_valid

router = APIRouter(prefix="/invites", tags=["invites"])
log = logging.getLogger("scheduler.invites")


InviteRole = Literal["operator", "viewer"]


# ---- DTOs --------------------------------------------------------------


class InviteCreateDTO(BaseModel):
    """Body for ``POST /tournaments/{id}/invites``."""
    role: InviteRole


class InviteSummaryDTO(BaseModel):
    """Wire shape for active-invite listings on Settings → Share."""
    token: str
    tournamentId: str
    role: InviteRole
    createdAt: str
    expiresAt: Optional[str] = None
    revokedAt: Optional[str] = None
    valid: bool


class InviteCreatedDTO(BaseModel):
    """Wire shape returned by ``POST /tournaments/{id}/invites``.

    ``url`` is a relative path (``/invite/{token}``) — the frontend
    prepends ``window.location.origin`` to produce a copy-able link.
    Keeping the join client-side avoids hard-coding the deployment
    origin in backend config.
    """
    token: str
    url: str
    tournamentId: str
    role: InviteRole
    createdAt: str


class InviteResolveDTO(BaseModel):
    """Wire shape returned by the public ``GET /invites/{token}``."""
    token: str
    tournamentId: str
    tournamentName: Optional[str] = None
    role: InviteRole
    valid: bool
    expiresAt: Optional[str] = None
    revokedAt: Optional[str] = None


class InviteAcceptedDTO(BaseModel):
    tournamentId: str
    role: str  # 'owner' is possible if the caller was already owner
    alreadyMember: bool


# ---- Helpers -----------------------------------------------------------


_ROLE_LEVELS = {"viewer": 0, "operator": 1, "owner": 2}


def _to_summary(invite: InviteLink) -> InviteSummaryDTO:
    return InviteSummaryDTO(
        token=str(invite.id),
        tournamentId=str(invite.tournament_id),
        role=invite.role,  # type: ignore[arg-type]
        createdAt=invite.created_at.isoformat() if invite.created_at else "",
        expiresAt=invite.expires_at.isoformat() if invite.expires_at else None,
        revokedAt=invite.revoked_at.isoformat() if invite.revoked_at else None,
        valid=is_invite_valid(invite),
    )


def _require_invite_owner(
    token: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> InviteLink:
    """Resolve the invite + check that the caller owns its tournament.

    Combines two checks the spec splits: invite must exist (404 / 410)
    AND caller must be the tournament owner (403). Used by
    ``DELETE /invites/{token}``.
    """
    invite = repo.invite_links.get(token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="invite not found",
        )
    user_uuid = user.as_uuid()
    if user_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user id is not a UUID",
        )
    role = repo.members.get_role(invite.tournament_id, user_uuid)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="owner role required",
        )
    return invite


# ---- Endpoints ---------------------------------------------------------


@router.get("/{token}", response_model=InviteResolveDTO)
def resolve_invite(
    token: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Public lookup. Returns the tournament's display name + the role
    the invite grants + a ``valid`` flag.

    Intentionally does not 404 on missing tokens — an attacker probing
    random UUIDs gets the same shape (with ``valid: false``) as a
    revoked or expired invite. We only fast-path 404 when the invite
    truly doesn't exist; the recipient page treats both as "invalid
    link" without exposing the distinction in the UI.
    """
    invite = repo.invite_links.get(token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="invite not found",
        )
    tournament = repo.tournaments.get_by_id(invite.tournament_id)
    return InviteResolveDTO(
        token=str(invite.id),
        tournamentId=str(invite.tournament_id),
        tournamentName=tournament.name if tournament else None,
        role=invite.role,  # type: ignore[arg-type]
        valid=is_invite_valid(invite),
        expiresAt=invite.expires_at.isoformat() if invite.expires_at else None,
        revokedAt=invite.revoked_at.isoformat() if invite.revoked_at else None,
    )


@router.post(
    "/{token}/accept",
    response_model=InviteAcceptedDTO,
    dependencies=[Depends(get_current_user)],
)
def accept_invite(
    token: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Add the current user to the tournament with the invite's role.

    Idempotent: if the caller is already a member, the existing role
    is preserved when it's >= the invite's role (no downgrade), and
    upgraded when the invite grants a higher role. Owner is never
    overwritten. Returns ``alreadyMember`` so the UI can branch on
    "joined" vs "promoted" vs "no-op".
    """
    invite = repo.invite_links.get(token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="invite not found",
        )
    if not is_invite_valid(invite):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="invite is revoked or expired",
        )

    user_uuid = user.as_uuid()
    if user_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user id is not a UUID",
        )

    target_role = invite.role
    existing_role = repo.members.get_role(invite.tournament_id, user_uuid)

    if existing_role is None:
        repo.members.add_member(invite.tournament_id, user_uuid, target_role)
        final_role = target_role
        already_member = False
    else:
        already_member = True
        target_level = _ROLE_LEVELS[target_role]
        existing_level = _ROLE_LEVELS.get(existing_role, -1)
        if existing_level < target_level:
            repo.members.set_role(invite.tournament_id, user_uuid, target_role)
            final_role = target_role
        else:
            final_role = existing_role

    return InviteAcceptedDTO(
        tournamentId=str(invite.tournament_id),
        role=final_role,
        alreadyMember=already_member,
    )


@router.delete(
    "/{token}",
    status_code=204,
)
def revoke_invite(
    invite: InviteLink = Depends(_require_invite_owner),
    repo: LocalRepository = Depends(get_repository),
):
    """Stamp ``revoked_at`` on the invite. Idempotent: revoking an
    already-revoked invite preserves the original timestamp and still
    returns 204."""
    repo.invite_links.revoke(invite.id)
    return Response(status_code=204)
