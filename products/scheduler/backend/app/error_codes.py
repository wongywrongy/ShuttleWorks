"""Typed error-code helpers.

Every backend ``HTTPException`` should carry both a stable code (for
clients to branch on) and a human-readable message (for toasts). The
helper :func:`http_error` centralises the construction so we don't
end up with bare strings sprinkled across the routes.

The ``ErrorCode`` enum is the authoritative list — adding a new error
means adding it here first so the frontend can predict the set.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from fastapi import HTTPException


class ErrorCode(str, Enum):
    # State persistence
    STATE_TOO_NEW = "STATE_TOO_NEW"
    STATE_CORRUPT = "STATE_CORRUPT"
    STATE_MISSING = "STATE_MISSING"
    STATE_WRITE_FAILED = "STATE_WRITE_FAILED"
    STATE_SCHEMA_MISMATCH = "STATE_SCHEMA_MISMATCH"

    # Match-state operations
    MATCH_STATE_UNREADABLE = "MATCH_STATE_UNREADABLE"
    MATCH_STATE_WRITE_FAILED = "MATCH_STATE_WRITE_FAILED"

    # Imports
    UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE"
    UPLOAD_INVALID_JSON = "UPLOAD_INVALID_JSON"
    UPLOAD_SCHEMA_MISMATCH = "UPLOAD_SCHEMA_MISMATCH"
    UPLOAD_WRONG_TYPE = "UPLOAD_WRONG_TYPE"

    # Backups
    BACKUP_NOT_FOUND = "BACKUP_NOT_FOUND"
    BACKUP_RESTORE_FAILED = "BACKUP_RESTORE_FAILED"

    # Locked settings (Phase 0a — backend mirrors of the frontend locks;
    # a frontend-only lock is a suggestion, not a lock)
    CONFIG_LOCKED = "CONFIG_LOCKED"
    ROSTER_LOCKED = "ROSTER_LOCKED"
    DRAW_STARTED = "DRAW_STARTED"

    # Generic input validation (deeper than schema — raised when a
    # converter sees a malformed value that slipped past Pydantic).
    INVALID_INPUT = "INVALID_INPUT"

    # Solver
    SOLVE_FAILED = "SOLVE_FAILED"
    SOLVE_INFEASIBLE = "SOLVE_INFEASIBLE"
    SOLVE_TIMEOUT = "SOLVE_TIMEOUT"

    # Solve jobs (SP-CLOUD-1 async solve rail)
    SOLVE_JOB_NOT_FOUND = "SOLVE_JOB_NOT_FOUND"
    SOLVE_JOB_ACTIVE = "SOLVE_JOB_ACTIVE"
    SOLVE_ENDPOINT_GONE = "SOLVE_ENDPOINT_GONE"

    # Schedule operations
    WARM_RESTART_FAILED = "WARM_RESTART_FAILED"
    REPAIR_FAILED = "REPAIR_FAILED"
    DISRUPTION_INVALID = "DISRUPTION_INVALID"

    # Proposal pipeline (two-phase commit)
    PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"
    SCHEDULE_VERSION_CONFLICT = "SCHEDULE_VERSION_CONFLICT"
    NO_COMMITTED_SCHEDULE = "NO_COMMITTED_SCHEDULE"

    # Workspace modules (per-workspace module control plane)
    MODULE_NOT_FOUND = "MODULE_NOT_FOUND"
    MODULE_INVALID_STATUS = "MODULE_INVALID_STATUS"
    MODULE_IMMUTABLE = "MODULE_IMMUTABLE"
    MODULE_DEPENDENCY_UNMET = "MODULE_DEPENDENCY_UNMET"
    MODULE_LAST_OPERATIONAL = "MODULE_LAST_OPERATIONAL"
    MODULE_HAS_DATA = "MODULE_HAS_DATA"

    # Tenancy (SP-CLOUD-2) — the uniform cross-tenant answer. A caller
    # without membership can never learn whether the workspace exists.
    TOURNAMENT_NOT_FOUND = "TOURNAMENT_NOT_FOUND"
    # The same idea for invite links (SP-CLOUD-3): one answer for
    # nonexistent, revoked, and expired, so a leaked link's holder can't
    # tell which of those it is.
    INVITE_NOT_FOUND = "INVITE_NOT_FOUND"

    # Member management (SP-CLOUD-3 Phase 1). MEMBER_LAST_OWNER is the
    # single answer for every path that would strand a workspace —
    # remove, demote, transfer, or leave — so the UI can explain the
    # refusal the same way however the caller got there.
    MEMBER_NOT_FOUND = "MEMBER_NOT_FOUND"
    MEMBER_LAST_OWNER = "MEMBER_LAST_OWNER"
    MEMBER_INVALID_ROLE = "MEMBER_INVALID_ROLE"

    # Auth & sessions (SP-CLOUD-2)
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
    AUTH_THROTTLED = "AUTH_THROTTLED"
    AUTH_EMAIL_TAKEN = "AUTH_EMAIL_TAKEN"
    AUTH_WEAK_PASSWORD = "AUTH_WEAK_PASSWORD"
    AUTH_INVALID_EMAIL = "AUTH_INVALID_EMAIL"
    AUTH_NOT_SIGNED_IN = "AUTH_NOT_SIGNED_IN"
    AUTH_RESET_INVALID = "AUTH_RESET_INVALID"
    AUTH_CSRF_REQUIRED = "AUTH_CSRF_REQUIRED"

    # Generic fallback
    INTERNAL = "INTERNAL"


def http_error(
    status: int,
    code: ErrorCode,
    message: str,
    extra: Optional[Dict[str, Any]] = None,
) -> HTTPException:
    """Build an ``HTTPException`` whose detail is a structured payload.

    The frontend axios interceptor reads ``detail.code`` for the toast
    title and ``detail.message`` for the body. Older callers that
    raise ``HTTPException(detail="…")`` still work — the interceptor
    falls back to treating ``detail`` as the message. ``extra`` keys are
    merged into the payload for machine-readable context (e.g.
    CONFIG_LOCKED's offending ``fields`` and the ``schedules`` a clear
    would remove).
    """
    return HTTPException(
        status_code=status,
        detail=_payload(code, message, extra),
    )


def _payload(
    code: ErrorCode, message: str, extra: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    out: Dict[str, Any] = {"code": code.value, "message": message}
    if extra:
        out.update(extra)
    return out
