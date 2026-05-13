"""Request-scoped auth dependency.

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

The Supabase client is lazy-built on first call so importing this module
in tests (where ``SUPABASE_URL`` is blank) doesn't connect to anything.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings

log = logging.getLogger("scheduler.auth")


class AuthUser(BaseModel):
    """Subset of the Supabase user record we actually consume."""
    id: str
    email: Optional[str] = None


_LOCAL_DEV_USER = AuthUser(id="local-dev", email="local@dev")


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
