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
(Rule 5), including members with an insufficient role. It has **no
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

from core.state_machine import set_transition_actor

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import Depends, Path, Request, status
from pydantic import BaseModel

from core.config import settings
from core.error_codes import ErrorCode, http_error, resource_not_found
from core.roles import ROLE_LEVELS as _ROLE_LEVELS, Role
from core.operator_sessions import PENDING_LIFETIME, authentication_is_fresh
from core.time_utils import _aware, _utcnow
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
    session_id: Optional[uuid.UUID] = None
    mfa_required: bool = False
    mfa_enrolled: bool = False
    mfa_authenticated: bool = False
    authenticated_at: Optional[datetime] = None

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


def _session_principal(repo: LocalRepository, user_row, row) -> AuthUser | None:
    factor = repo.mfa.get(user_row.id)
    enrolled = factor is not None and factor.status == "active"
    required = settings.operator_mfa_required or enrolled
    authenticated = bool(
        enrolled and factor.scope == settings.operator_mfa_scope
        and row.mfa_generation == factor.generation and row.authenticated_at is not None
        and _aware(row.created_at) <= _aware(row.authenticated_at) <= _utcnow()
    )
    if required and not authenticated and _aware(row.created_at) + PENDING_LIFETIME <= _utcnow():
        return None
    return AuthUser(id=str(user_row.id), email=user_row.email, session_id=row.id,
                    mfa_required=required, mfa_enrolled=enrolled, mfa_authenticated=authenticated,
                    authenticated_at=_aware(row.authenticated_at) if authenticated else None)


def _resolve_identity(request: Request, repo: LocalRepository, *, allow_scope_selector: bool) -> AuthUser:
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
    if cookie_token and settings.deployment_profile != "event_node":
        row = repo.execute_query(auth_service.resolve_session_record, cookie_token)
        user_row = repo.get_user_identity(row.user_id) if row is not None else None
        principal = _session_principal(repo, user_row, row) if user_row is not None else None
        if principal is not None:
            return principal

    offline_token = request.cookies.get(settings.offline_session_cookie_name)
    if offline_token and settings.deployment_profile == "event_node":
        from identity import offline_sessions

        raw_tid = request.path_params.get("tournament_id")
        if raw_tid is None and allow_scope_selector:
            # Auth-only ceremonies may select a workspace. The cookie still
            # has to prove membership, node identity and the active epoch.
            raw_tid = request.query_params.get("workspaceId")
        try:
            tid = uuid.UUID(str(raw_tid)) if raw_tid else None
        except ValueError:
            tid = None
        # An event-scoped credential must never authenticate a route with no
        # tournament scope (for example account or organization settings).
        resolved = (
            repo.execute_query(
                offline_sessions.resolve_identity,
                offline_token,
            )
            if tid is not None
            else None
        )
        if resolved is not None:
            user_row, offline = resolved
            if offline.device_id != uuid.UUID(settings.node_id):
                raise http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Not signed in")
            if allow_scope_selector and (
                offline.tournament_id != tid
                or repo.members.get_role(tid, user_row.id) not in {"owner", "operator"}
            ):
                raise resource_not_found()
            principal = _session_principal(repo, user_row, offline)
            if principal is not None:
                principal.offline_tournament_id = str(offline.tournament_id)
                principal.offline_authority_epoch = offline.authority_epoch
                return principal

    # An event node may use ``AUTH_MODE=local`` for its embedded runtime, but
    # it is still a LAN service.  Once a checkpoint is imported, anonymous
    # bootstrap would make every reachable browser an operator.  Event nodes
    # therefore require the checked-out, tournament-scoped credential.
    if not settings.operator_mfa_required:
        # Zero-friction solo-operator path (Rule 3). The bootstrap
        # users row is ensured at startup; this AuthUser mirrors it.
        return _LOCAL_DEV_USER
    raise http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Not signed in")


def get_pending_user(request: Request, repo: LocalRepository = Depends(get_repository)) -> AuthUser:
    """Auth ceremony only: a live password-stage credential may finish MFA."""
    return _resolve_identity(request, repo, allow_scope_selector=True)


def get_current_user(request: Request, repo: LocalRepository = Depends(get_repository)) -> AuthUser:
    user = _resolve_identity(request, repo, allow_scope_selector=False)
    if user.mfa_required and not user.mfa_authenticated:
        raise http_error(401, ErrorCode.AUTH_MFA_REQUIRED, "Complete authenticator verification")
    return user


def require_fresh_authentication(user: AuthUser) -> None:
    """Call after tenant/role denial so freshness does not reveal resources."""
    if user.mfa_required and not authentication_is_fresh(user.authenticated_at, _utcnow()):
        raise http_error(401, ErrorCode.AUTH_REAUTH_REQUIRED, "Verify your password and authenticator to continue")


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
            repo.stage(set_transition_actor, "entrant", account.id)
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



def require_tournament_access(min_role: Role, *, fresh: bool = False):
    """Factory: returns a FastAPI dependency that gates a route on
    ``tournament_members.role >= min_role`` for the current user.

    The dep resolves ``tournament_id`` from the path, the caller from
    ``get_current_user``, and the role from the ``tournament_members``
    table. 404s on missing or insufficient role. The check has no
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
        # Missing, foreign and insufficient-role resources share one response.
        not_found = resource_not_found()
        if user_uuid is None:
            raise not_found
        if user.offline_tournament_id and user.offline_tournament_id != str(tournament_id):
            raise not_found
        role = repo.members.get_role(tournament_id, user_uuid)
        if role is None:
            raise not_found
        actual_level = _ROLE_LEVELS.get(role, -1)
        if user.offline_tournament_id and actual_level < _ROLE_LEVELS["operator"]:
            raise not_found
        if actual_level < required_level:
            raise not_found
        if fresh:
            require_fresh_authentication(user)
        repo.stage(set_transition_actor, "operator", user_uuid)
        return user

    # Friendlier repr for FastAPI dep-graph dumps.
    _check.__name__ = f"require_tournament_access[{min_role}]"
    return _check
