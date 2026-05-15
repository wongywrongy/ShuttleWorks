"""Request-scoped auth + role-check dependencies.

``get_current_user`` is the single seam every protected route depends on.
Behaviour depends on whether Supabase is configured:

- **Configured** (``settings.supabase_url`` non-empty): verifies the JWT
  via the Supabase client and returns the resolved user object. A bad
  or expired token surfaces as HTTP 401.
- **Unconfigured** (``settings.supabase_url == ""``): returns a fixed
  synthetic local user without touching the network. This keeps the
  pytest suite and local desktop runs working without a real Supabase
  project — Step 8 deployment sets the env vars and real verification
  kicks in.

Step 5 layers ``require_tournament_access(min_role)`` on top: it reads
the path's ``tournament_id``, looks up the caller's role for that
tournament in the ``tournament_members`` table, and rejects with 403
when missing or below the required threshold. Unlike the JWT path
this check has **no bypass** — local-dev still records member rows so
the role logic is exercised in tests.

The Supabase client is lazy-built on first call so importing this module
in tests (where ``SUPABASE_URL`` is blank) doesn't connect to anything.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings
from repositories import LocalRepository, get_repository

log = logging.getLogger("scheduler.auth")


class AuthUser(BaseModel):
    """Subset of the Supabase user record we actually consume."""
    id: str
    email: Optional[str] = None

    def as_uuid(self) -> Optional[uuid.UUID]:
        """Parse ``id`` as a UUID; ``None`` when it doesn't (shouldn't
        happen for real Supabase users; left defensive for unforeseen
        identity providers)."""
        try:
            return uuid.UUID(self.id)
        except (ValueError, TypeError):
            return None


# Stable UUID for the local-dev synthetic user. Tournaments created in
# local-dev mode stamp this as their owner so the membership table
# lookups work the same way as in configured mode.
LOCAL_DEV_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000000")
_LOCAL_DEV_USER = AuthUser(id=str(LOCAL_DEV_USER_UUID), email="local@dev")


# HTTPBearer with ``auto_error=False`` so unauthenticated requests reach
# our dependency code in local-dev mode (where the synthetic user is
# returned even when no Authorization header is present).
_bearer = HTTPBearer(auto_error=False)


_supabase_client: Any = None


def _get_supabase_client():
    """Lazily instantiate the Supabase client.

    Returns ``None`` when ``SUPABASE_URL`` is blank — caller treats that
    as the local-dev-bypass signal. Cached at module level after first
    successful build.
    """
    global _supabase_client
    if not settings.supabase_url:
        return None
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
        )
    return _supabase_client


def reset_supabase_client() -> None:
    """Drop the cached client. Tests use this between env-var changes."""
    global _supabase_client
    _supabase_client = None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> AuthUser:
    """Verify the bearer JWT and return the authenticated user.

    Behaviour:
    - ``SUPABASE_URL`` blank → synthetic local-dev user (no token required).
    - Configured + valid token → ``AuthUser`` derived from the Supabase
      user record.
    - Configured + missing/invalid token → 401.
    """
    client = _get_supabase_client()
    if client is None:
        # Auth disabled — local dev / pytest path. Skip token check
        # entirely; routes can still consume the synthetic user id for
        # logging or future per-user scoping.
        return _LOCAL_DEV_USER

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or empty Authorization header",
        )

    try:
        result = client.auth.get_user(credentials.credentials)
    except Exception as exc:  # noqa: BLE001 — Supabase raises broadly
        log.warning("auth: token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = getattr(result, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token rejected by auth provider",
        )

    # The Supabase response object exposes attribute access; tolerate
    # missing ``email`` (some sign-up flows omit it until verification).
    return AuthUser(
        id=str(getattr(user, "id", "")),
        email=getattr(user, "email", None),
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
        if user_uuid is None:
            # A Supabase user id should always parse as UUID; rejecting
            # otherwise is defensive — anything stranger is a misconfigured
            # auth provider, not a legitimate request.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User id is not a UUID",
            )
        role = repo.members.get_role(tournament_id, user_uuid)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this tournament",
            )
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
