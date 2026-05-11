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
from typing import Any, Dict

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

    # Solver
    SOLVE_FAILED = "SOLVE_FAILED"
    SOLVE_INFEASIBLE = "SOLVE_INFEASIBLE"
    SOLVE_TIMEOUT = "SOLVE_TIMEOUT"

    # Schedule operations
    WARM_RESTART_FAILED = "WARM_RESTART_FAILED"
    REPAIR_FAILED = "REPAIR_FAILED"
    DISRUPTION_INVALID = "DISRUPTION_INVALID"

    # Proposal pipeline (two-phase commit)
    PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"
    SCHEDULE_VERSION_CONFLICT = "SCHEDULE_VERSION_CONFLICT"
    NO_COMMITTED_SCHEDULE = "NO_COMMITTED_SCHEDULE"

    # Generic fallback
    INTERNAL = "INTERNAL"


def http_error(status: int, code: ErrorCode, message: str) -> HTTPException:
    """Build an ``HTTPException`` whose detail is a structured payload.

    The frontend axios interceptor reads ``detail.code`` for the toast
    title and ``detail.message`` for the body. Older callers that
    raise ``HTTPException(detail="…")`` still work — the interceptor
    falls back to treating ``detail`` as the message.
    """
    return HTTPException(
        status_code=status,
        detail=_payload(code, message),
    )


def _payload(code: ErrorCode, message: str) -> Dict[str, Any]:
    return {"code": code.value, "message": message}
