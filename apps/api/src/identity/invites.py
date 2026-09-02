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
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel

from core.dependencies import AuthUser, get_current_user
from core.error_codes import ErrorCode, http_error
from core.limits import Email, StrictModel
from db.models import InviteLink, Tournament
from repositories import LocalRepository, get_repository
from repositories.local import is_invite_valid

router = APIRouter(prefix="/invites", tags=["invites"])
log = logging.getLogger("scheduler.invites")


InviteRole = Literal["operator", "viewer"]


# ---- DTOs --------------------------------------------------------------


class InviteCreateDTO(StrictModel):
    """Body for ``POST /tournaments/{id}/invites``.

    ``email`` (SP-CLOUD-2) turns this into an email invite: the link is
    delivered via the email seam and the invite expires. Omitted =
    local link-style invite (copy the URL yourself).

    The address is bounded here and validated for shape by
    ``normalize_email`` at the handler — that regex rejects all
    whitespace, which is what keeps a newline out of the ``To:`` header.
    """
    role: InviteRole
    email: Optional[Email] = None


class InviteSummaryDTO(BaseModel):
    """Wire shape for active-invite listings on Settings → Share."""
    token: str
    tournamentId: str
    role: InviteRole
    createdAt: str
    expiresAt: Optional[str] = None
    revokedAt: Optional[str] = None
    valid: bool
    email: Optional[str] = None


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
    """Wire shape returned by the public ``GET /invites/{token}``.

    Deliberately minimal (SP-CLOUD-3). A 200 from this endpoint now
    *means* the invite is acceptable, so ``valid`` / ``expiresAt`` /
    ``revokedAt`` would be both redundant and the exact fields that
    carried the existence oracle. ``email`` stays withheld: this route
    is unauthenticated and the invitee's address must not be probeable.
    """
    token: str
    tournamentId: str
    tournamentName: Optional[str] = None
    role: InviteRole


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
        email=invite.email,
        valid=is_invite_valid(invite),
    )


# A token that cannot exist, used to keep the "no such invite" branch
# doing the same database work as the "invite found" branch. Mirrors the
# dummy-hash trick in ``identity/auth_routes.py`` — there the cost being equalized is
# Argon2 verification, here it is an indexed primary-key lookup.
_DUMMY_TOURNAMENT_ID = uuid.UUID("00000000-0000-0000-0000-0000000000ff")


def _invite_not_found() -> HTTPException:
    """The single answer for every non-acceptable invite state.

    Nonexistent, revoked, expired, and "exists but its workspace is
    gone" are indistinguishable by status, body, and query count.
    """
    return http_error(
        status.HTTP_404_NOT_FOUND,
        ErrorCode.INVITE_NOT_FOUND,
        "Invite not found or no longer valid",
    )


def _resolve_acceptable_invite(
    repo: LocalRepository, token: uuid.UUID
) -> tuple[InviteLink, Optional[Tournament]]:
    """Return ``(invite, tournament)`` only when the invite can be acted
    on; otherwise raise the uniform 404.

    Both branches issue exactly two queries — the invite lookup and a
    tournament lookup (against a sentinel id when there is no invite) —
    so the failure modes are not separable by response time. Without
    that second lookup the missing-token path returns measurably sooner,
    which is a timing oracle even when the bodies match. Pinned by
    ``tests/test_invite_oracle.py``.
    """
    invite = repo.invite_links.get(token)
    lookup_id = invite.tournament_id if invite is not None else _DUMMY_TOURNAMENT_ID
    tournament = repo.tournaments.get_by_id(lookup_id)

    if invite is None or not is_invite_valid(invite) or tournament is None:
        raise _invite_not_found()
    return invite, tournament


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
    """Public lookup. Returns the workspace's display name + the role
    the invite grants, and *only* for an invite that can still be
    accepted.

    Every other state — never existed, revoked, expired, workspace
    deleted — answers one uniform 404 (SP-CLOUD-3). Previously this
    404'd only for unknown tokens and returned 200 with ``valid: false``
    for revoked/expired ones, which told a leaked link's holder whether
    their access had been deliberately taken away. The old docstring
    claimed this endpoint already behaved uniformly; it did not.

    Returning ``tournamentName`` to an unauthenticated caller is
    deliberate — the join page has to say what you're joining — but it
    is why the 404 has to be airtight: a valid token is a workspace-name
    disclosure, so the set of valid tokens must not be probeable.
    """
    invite, tournament = _resolve_acceptable_invite(repo, token)
    return InviteResolveDTO(
        token=str(invite.id),
        tournamentId=str(invite.tournament_id),
        tournamentName=tournament.name if tournament else None,
        role=invite.role,  # type: ignore[arg-type]
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

    Shares the uniform 404 with the resolve route (SP-CLOUD-3). This
    used to answer 404 for an unknown token and 410 for a revoked or
    expired one, which re-leaked on a second axis exactly what the
    resolve route leaked on the first.
    """
    invite, _tournament = _resolve_acceptable_invite(repo, token)

    user_uuid = user.as_uuid()
    if user_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user id is not a UUID",
        )

    target_role = invite.role
    existing_role = repo.members.get_role(invite.tournament_id, user_uuid)

    if existing_role is None:
        # tournament_members.user_id now FKs users (SP-CLOUD-2) —
        # materialize a users row for bearer-era identities first.
        from identity.auth import ensure_user

        repo.execute_transaction(ensure_user, user_uuid, user.email)
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
