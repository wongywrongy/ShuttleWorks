"""Global request-body size limit (SP-SEC-1 Phase 1, finding SEC-01).

Until this existed the origin had no body ceiling of its own. nginx's
1 MB default applied only to requests that happened to traverse the SPA
container, uvicorn imposes none at all, and Cloudflare's is 100 MB — so
the effective limit depended on which path a request took to reach the
API, which is not a limit.

Written as a **pure ASGI middleware**, not a ``BaseHTTPMiddleware``, for
two reasons:

- It must be able to answer before the handler reads the body.
- It must survive a missing ``Content-Length``. A chunked request
  declares no length, so a declared-length check on its own is bypassed
  by omitting the header. This reads the body itself, stopping the
  moment the cap is passed, and forwards it to the app only if it fits.

Buffering the body here is not the memory cost it looks like: the buffer
is bounded by the cap itself, and Starlette's ``Request.body()`` would
have buffered the same bytes one layer down anyway. The difference is
that an oversized body is now discarded after ``max_bytes`` instead of
after all of it.

It is registered **outermost** so it runs before anything else touches
the request.

Non-goals: a byte ceiling, not a rate limit, and deliberately incurious
about what the bytes are. Per-field semantic bounds live in
``app/limits.py`` — the two are complementary. Field bounds stop a
plausible-looking payload from being absurd; this stops the transport
from being used as a hose.
"""
from __future__ import annotations

import json
import logging

from app.error_codes import ErrorCode

log = logging.getLogger("scheduler.body_limit")

# GET/HEAD/OPTIONS bodies are not a thing this API accepts, so only the
# methods that carry one are inspected. DELETE is included: it is
# permitted a body and the router uses it.
_METHODS_WITH_BODIES = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class BodyLimitMiddleware:
    """Reject request bodies over ``max_bytes`` with a 413."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in _METHODS_WITH_BODIES:
            await self.app(scope, receive, send)
            return

        # Fast path: an honest Content-Length lets us refuse without
        # reading a byte.
        declared = _declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            await self._refuse(scope, send, reason="declared")
            return

        # Slow path: count while reading. Covers chunked bodies and a
        # Content-Length that undersells the real one.
        body, exceeded = await _read_bounded(receive, self.max_bytes)
        if exceeded:
            await self._refuse(scope, send, reason="observed")
            return

        await self.app(scope, _replay(body), send)

    async def _refuse(self, scope, send, *, reason: str) -> None:
        log.info(
            "request body over limit (%s) method=%s path=%s limit=%d",
            reason,
            scope.get("method"),
            scope.get("path"),
            self.max_bytes,
        )
        payload = json.dumps(
            {
                "detail": {
                    "code": ErrorCode.REQUEST_TOO_LARGE.value,
                    "message": (
                        "Request body exceeds the "
                        f"{self.max_bytes // (1024 * 1024)} MB limit"
                    ),
                    "limitBytes": self.max_bytes,
                }
            }
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode("ascii")),
                    # The rest of the body is never read, so the
                    # connection cannot be reused for a further request.
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})


def _declared_length(scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                # A malformed header is not a size claim. Fall through to
                # the counting path rather than trusting or guessing.
                return None
    return None


async def _read_bounded(receive, max_bytes: int) -> tuple[bytes, bool]:
    """Read the whole body, stopping as soon as the cap is passed.

    Returns ``(body, exceeded)``. When ``exceeded`` the body is returned
    empty and must not be forwarded — it is incomplete by construction.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            return b"".join(chunks), False
        total += len(message.get("body", b""))
        if total > max_bytes:
            return b"", True
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            return b"".join(chunks), False


def _replay(body: bytes):
    """A ``receive`` callable that hands the buffered body over once."""
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    return receive
