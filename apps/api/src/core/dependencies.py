"""Request-scoped auth + role-check dependencies.

``get_current_user`` is the single identity seam every protected route
depends on (SP-CLOUD-2):

- **Session cookie** — an opaque token minted by ``POST /auth/login``
  and resolved against the ``auth_sessions`` table.
- **Local bootstrap** — ``AUTH_MODE=local`` only outside the
  ``event_node`` profile: a request with no session resolves to the
  zero-UUID local operator (Rule 3's zero-friction solo flow). Event nodes
  require an imported, tournament-scoped offline credential. ``AUTH_MODE=cloud``
  → 401 instead.

``require_tournament_access(min_role)`` is the TENANCY seam: it reads
the path's ``tournament_id``, looks up the caller's role in
``tournament_members``, and answers the uniform 404 for non-members
(Rule 5) / 403 for members with an insufficient role. It has **no
bypass** — local-dev records real member rows, so the same code path
runs in both modes.

``get_current_entrant`` is the SECOND principal's resolver (SP-E1-2,
ruling D-A3) and is deliberately a **separate function reading a separate
cookie against a separate table** — not a mode of the one above. The two
never meet: an operator token is not in ``entrant_sessions`` and an
entrant token is not in ``auth_sessions``, so "sessions are scoped to
their principal" is a property of the schema rather than a check someone
has to remember to write.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Path, Request, status
from pydantic import BaseModel

from core.config import settings
from core.error_codes import ErrorCode, http_error
from repositories import LocalRepository, get_repository
from identity import auth as auth_service
from identity import entrants as entrant_service

log = logging.getLogger("scheduler.auth")


class AuthUser(BaseModel):
    """The identity fields every route consumes."""
    id: str
    email: Optional[str] = None
    offline_tournament_id: Optional[str] = None
    offline_authority_epoch: Optional[int] = None

    def as_uuid(self) -> Optional[uuid.UUID]:
        """Parse ``id`` as a UUID; ``None`` when it doesn't (shouldn't
        happen for real users; left defensive for unforeseen identity
        sources)."""
        try:
            return uuid.UUID(self.id)
        except (ValueError, TypeError):
            return None


# Stable UUID for the local-dev synthetic user. Tournaments created in
# local-dev mode stamp this as their owner so the membership table
# lookups work the same way as in configured mode.
LOCAL_DEV_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000000")
_LOCAL_DEV_USER = AuthUser(id=str(LOCAL_DEV_USER_UUID), email="local@dev")


def get_current_user(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> AuthUser:
    """Resolve the caller's identity. Order of precedence:

    1. **Session cookie**: an opaque token minted by ``POST
       /auth/login`` and backed by the ``auth_sessions`` table.
    2. **Local bootstrap identity** — ``AUTH_MODE=local`` only outside the
       ``event_node`` profile: a request with no (or a dead) session resolves
       to the zero-UUID local operator, preserving the solo zero-friction flow. A dead
       cookie deliberately falls through here — browsers keep stale
       cookies across local DB resets.
    3. Otherwise → 401.
    """
    cookie_token = request.cookies.get(settings.session_cookie_name)
    if cookie_token:
        user_row = repo.execute_transaction(
            auth_service.resolve_session, cookie_token
        )
        if user_row is not None:
            return AuthUser(id=str(user_row.id), email=user_row.email)

    offline_token = request.cookies.get(settings.offline_session_cookie_name)
    if offline_token and settings.deployment_profile == "event_node":
        from identity import offline_sessions

        raw_tid = request.path_params.get("tournament_id")
        try:
            tid = uuid.UUID(str(raw_tid)) if raw_tid else None
        except ValueError:
            tid = None
        # An event-scoped credential must never authenticate a route with no
        # tournament scope (for example account or organization settings).
        resolved = (
            repo.execute_transaction(
                offline_sessions.resolve,
                offline_token,
                tournament_id=tid,
            )
            if tid is not None
            else None
        )
        if resolved is not None:
            user_row, offline = resolved
            return AuthUser(
                id=str(user_row.id),
                email=user_row.email,
                offline_tournament_id=str(offline.tournament_id),
                offline_authority_epoch=offline.authority_epoch,
            )

    # An event node may use ``AUTH_MODE=local`` for its embedded runtime, but
    # it is still a LAN service.  Once a checkpoint is imported, anonymous
    # bootstrap would make every reachable browser an operator.  Event nodes
    # therefore require the checked-out, tournament-scoped credential.
    if settings.auth_mode == "local" and settings.deployment_profile != "event_node":
        # Zero-friction solo-operator path (Rule 3). The bootstrap
        # users row is ensured at startup; this AuthUser mirrors it.
        return _LOCAL_DEV_USER
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not signed in",
    )


def require_cloud_tournament_write_authority(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> None:
    """Fence cloud-side tournament mutations while an event node owns writes.

    Attach this dependency to an entire tournament router: safe HTTP methods
    remain available as cloud projections, and deployments other than the
    cloud composition are unaffected.  Authority lifecycle and device sync
    routers intentionally do not carry this dependency because they are the
    mechanism that transfers and returns authority.
    """
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    if settings.deployment_profile != "cloud":
        return
    raw_tournament_id = request.path_params.get("tournament_id")
    if raw_tournament_id is None:
        return
    try:
        tournament_id = uuid.UUID(str(raw_tournament_id))
    except ValueError:
        # Path validation owns malformed identifiers.  Do not replace its
        # stable 422 response with an authority-policy error.
        return

    if _tournament_checked_out(repo, tournament_id):
        raise http_error(
            409,
            ErrorCode.EVENT_CHECKED_OUT,
            (
                "This tournament is checked out to an event node. "
                "Cloud operations are read-only until authority is returned."
            ),
        )


def require_pre_checkout_configuration_write(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> None:
    """Reject preparation-only mutations once tournament checkout begins.

    Unlike the cloud authority fence, this rule applies to every deployment
    profile.  Setup and destructive import surfaces are checkpoint inputs;
    allowing the event node to rewrite them after import would silently fork
    the checkpoint instead of producing a live domain operation.
    """
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    raw_tournament_id = request.path_params.get("tournament_id")
    if raw_tournament_id is None:
        return
    try:
        tournament_id = uuid.UUID(str(raw_tournament_id))
    except ValueError:
        return

    if _tournament_checked_out(repo, tournament_id):
        raise http_error(
            409,
            ErrorCode.CONFIG_LOCKED,
            (
                "Tournament preparation is frozen after checkout. "
                "Return authority before changing setup or replacing imports."
            ),
        )


def require_pre_checkout_entry_write(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> None:
    """Freeze entrant/roster mutations while node authority is checked out."""
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    raw_tournament_id = request.path_params.get("tournament_id")
    if raw_tournament_id is None:
        return
    try:
        tournament_id = uuid.UUID(str(raw_tournament_id))
    except ValueError:
        return

    if _tournament_checked_out(repo, tournament_id):
        raise http_error(
            409,
            ErrorCode.EVENT_CHECKED_OUT,
            (
                "Entries and roster changes are frozen while this tournament "
                "is checked out to an event node."
            ),
        )


def _tournament_checked_out(
    repo: LocalRepository, tournament_id: uuid.UUID
) -> bool:
    from sync.service import tournament_is_checked_out

    return repo.execute_query(tournament_is_checked_out, tournament_id)


# ---- The entrant principal (SP-E1-2, ruling D-A3) --------------------


class AuthEntrant(BaseModel):
    """The entrant identity a route consumes.

    A separate type from ``AuthUser`` on purpose: they are not
    interchangeable, and a shared type is how a route ends up accepting
    either. Nothing here carries an org, a role or a workspace — an
    entrant has none, and a field that does not exist cannot be read by
    mistake.
    """
    id: str
    email: str
    display_name: Optional[str] = None
    email_verified: bool = False

    def as_uuid(self) -> Optional[uuid.UUID]:
        try:
            return uuid.UUID(self.id)
        except (ValueError, TypeError):
            return None


def get_current_entrant(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> AuthEntrant:
    """Resolve the caller as an ENTRANT, or 401. There is no third case.

    **No local-bootstrap fallback, in either mode.** ``get_current_user``
    has one because a solo director running an event on a laptop should
    never meet a login screen (Rule 3's zero-friction flow). There is no
    equivalent claim for a stranger on a public form: a bootstrap identity
    here would mean every anonymous caller *is* some entrant, which is the
    fail-open shape ruling D-A3 chose a separate table to prevent. The
    absence of the ``settings.auth_mode`` branch below is therefore
    load-bearing, and ``tests/test_entrant_auth_routes.py`` pins it in
    local mode specifically — the mode where an accidental fallback would
    look like it worked.

    Reads ``entrant_sessions`` and nothing else, so an operator's session
    token cannot resolve here whatever cookie name it arrives under.
    """
    token = request.cookies.get(settings.entrant_session_cookie_name)
    if token:
        account = repo.execute_transaction(
            entrant_service.resolve_session, token
        )
        if account is not None:
            return AuthEntrant(
                id=str(account.id),
                email=account.email,
                display_name=account.display_name,
                email_verified=account.email_verified,
            )
    raise http_error(
        status.HTTP_401_UNAUTHORIZED,
        ErrorCode.AUTH_NOT_SIGNED_IN,
        "Not signed in",
    )


# ---- Role-based access -----------------------------------------------

_ROLE_LEVELS = {"viewer": 0, "operator": 1, "owner": 2}


def require_tournament_access(min_role: str):
    """Factory: returns a FastAPI dependency that gates a route on
    ``tournament_members.role >= min_role`` for the current user.

    The dep resolves ``tournament_id`` from the path, the caller from
    ``get_current_user``, and the role from the ``tournament_members``
    table. 403s on missing or insufficient role. The check has no
    bypass mode — local-dev creates real member rows via ``POST
    /tournaments``, so the same code path runs in both modes.
    """
    if min_role not in _ROLE_LEVELS:
        raise ValueError(f"unknown role: {min_role}")
    required_level = _ROLE_LEVELS[min_role]

    def _check(
        tournament_id: uuid.UUID = Path(...),
        user: AuthUser = Depends(get_current_user),
        repo: LocalRepository = Depends(get_repository),
    ) -> AuthUser:
        user_uuid = user.as_uuid()
        # Rule 5 (SP-CLOUD-2): a caller without membership gets 404 —
        # never 403 — so "doesn't exist" and "exists but not yours" are
        # indistinguishable. Existence is information. Insufficient
        # *role* for an actual member stays 403 (they already know the
        # workspace exists).
        not_found = http_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.TOURNAMENT_NOT_FOUND,
            "Tournament not found",
        )
        if user_uuid is None:
            raise not_found
        role = repo.members.get_role(tournament_id, user_uuid)
        if role is None:
            raise not_found
        actual_level = _ROLE_LEVELS.get(role, -1)
        if actual_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is insufficient (requires '{min_role}')",
            )
        return user

    # Friendlier repr for FastAPI dep-graph dumps.
    _check.__name__ = f"require_tournament_access[{min_role}]"
    return _check
