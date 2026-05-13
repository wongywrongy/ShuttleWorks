"""Domain exceptions surfaced at the FastAPI route boundary.

The exceptions here are raised from the repository / service layer
and translated to HTTP responses by handlers registered in
``app.main``. Keeping the translation in one place lets internal
callers (background workers, the proposal pipeline) raise without
caring about the HTTP layer.

Body-shape contract: every exception's ``to_dict()`` is the *flat*
response body — no ``{"detail": ...}`` wrapper. The handlers in
``app.main`` use ``JSONResponse(content=exc.to_dict())`` so the
frontend has one parser shape across 409 (conflict / stale_version)
and 412 (precondition_failed).
"""
from __future__ import annotations

from typing import Optional


class ConflictError(Exception):
    """Raised when a match write would violate the state machine or
    optimistic-concurrency invariants.

    Two flavours, distinguished by which fields are populated:

    - **Transition conflict** (``current_status`` + ``attempted_status``
      set) — the state machine rejected a status transition that isn't
      in ``VALID_TRANSITIONS``.
    - **Stale-version conflict** (``current_version`` +
      ``attempted_version`` set) — the caller's ``expected_version``
      didn't match the row's current version. The HTTP ``If-Match``
      wrapper that surfaces this externally lands in Step D.

    ``app.main`` registers a handler that translates the exception to
    HTTP 409 with a structured JSON body.
    """

    def __init__(
        self,
        *,
        match_id: str,
        message: str,
        current_status: Optional[str] = None,
        attempted_status: Optional[str] = None,
        current_version: Optional[int] = None,
        attempted_version: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.match_id = match_id
        self.message = message
        self.current_status = current_status
        self.attempted_status = attempted_status
        self.current_version = current_version
        self.attempted_version = attempted_version

    def to_dict(self) -> dict:
        is_stale_version = (
            self.current_version is not None
            or self.attempted_version is not None
        )
        body: dict = {
            # ``stale_version`` hints to the client that a fresh read +
            # retry is the cure; ``conflict`` means the transition is
            # not legal regardless of version.
            "error": "stale_version" if is_stale_version else "conflict",
            "match_id": self.match_id,
            "message": self.message,
        }
        if self.current_status is not None:
            body["current_status"] = self.current_status
        if self.attempted_status is not None:
            body["attempted_status"] = self.attempted_status
        if self.current_version is not None:
            body["current_version"] = self.current_version
        if self.attempted_version is not None:
            body["attempted_version"] = self.attempted_version
        return body


class PreconditionFailedError(Exception):
    """Raised when an ``If-Match`` header is missing or stale.

    Step D maps this to HTTP 412 with a flat body of the shape
    ``{"error": "precondition_failed", "match_id": ..., "message": ...}``.
    Distinct from :class:`ConflictError` (which is 409) so the
    frontend can branch on the status code without parsing the body.
    """

    def __init__(self, *, match_id: str, message: str) -> None:
        super().__init__(message)
        self.match_id = match_id
        self.message = message

    def to_dict(self) -> dict:
        return {
            "error": "precondition_failed",
            "match_id": self.match_id,
            "message": self.message,
        }
