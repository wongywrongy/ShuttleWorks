"""Cloudflare Turnstile verification — server-side, stdlib only.

The design spec is blunt about why this file exists (Q4, anti-abuse):
*"Turnstile validated client-side is worth nothing — bots post directly to
the endpoint."* The widget on the entry page produces a token; this module
is the half that makes the token mean something.

**Why stdlib ``urllib.request`` and not ``httpx``/``requests``.** SP-E1-1
rule 8: no new runtime dependencies. One POST with a form body and a
timeout is precisely what ``urllib.request`` is for, and adding a
dependency to the offline-capable backend so that an *optional, cloud-only*
surface can make one HTTP call is the wrong trade.

**Fail closed.** Every failure mode — timeout, connection error, non-JSON
body, JSON that is not an object — refuses. The alternative ("Cloudflare is
unreachable, so let entries through") turns somebody else's outage into our
open door, during the window when nobody is looking at our logs.

The one nuance is ``retryable``. Cloudflare documents ``internal-error`` as
"an internal error happened while validating the response; the request can
be retried", and transport failures on our side are the same shape of
problem. Those refusals are marked retryable so the page can say "please
try again" rather than implying the entrant did something wrong.
**Retryable never means accepted** — it only changes the sentence shown.

**Blocking I/O in a sync route.** Every route in this codebase is `def`,
not `async def`, so FastAPI runs it in the threadpool; a bounded blocking
call there is fine. The timeout is what keeps it bounded — an unbounded
call would hold a threadpool slot for as long as the far end feels like it.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from app.config import settings

log = logging.getLogger("scheduler.turnstile")

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# Short on purpose. Turnstile's siteverify is a fast edge call; a long
# timeout would mean an entrant staring at a spinner while a threadpool
# slot is held, and the answer to a slow verifier is to refuse-and-retry,
# not to wait.
TIMEOUT_SECONDS = 5.0

# Cloudflare's own code for "we could not decide" (documented as
# retryable). Reused for our transport failures, which are the same class
# of problem seen from the other end of the wire.
_INTERNAL_ERROR = "internal-error"
_MISSING_TOKEN = "missing-input-response"
_BAD_RESPONSE = "bad-response"


@dataclass(frozen=True)
class TurnstileResult:
    """The verdict. ``success`` is the only field a caller may gate on.

    ``error_codes`` is for logging and for the message shown; ``retryable``
    distinguishes "the check said no" from "the check could not run", which
    are the same refusal but very different sentences to an entrant.
    """

    success: bool
    error_codes: tuple[str, ...] = ()
    retryable: bool = False


def _post(url: str, fields: dict, timeout: float) -> str:
    """The HTTP seam — the one function tests replace.

    Isolated so that no test in this repository ever reaches Cloudflare: a
    unit test that needs the internet is a test that fails on a train, and
    a security control whose tests are skipped in CI is not a control.
    """
    body = urllib.parse.urlencode(fields).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return response.read().decode("utf-8", errors="replace")


def verify_turnstile(
    token: str,
    *,
    remote_ip: Optional[str] = None,
    secret: Optional[str] = None,
) -> TurnstileResult:
    """Ask Cloudflare whether ``token`` is a genuine solved challenge.

    ``secret`` defaults to configuration (never a literal — invariant I1).
    ``remote_ip`` is optional in the siteverify contract and is omitted
    rather than sent empty when we do not have one.
    """
    if not token:
        # No token at all means the widget was never solved (or the form
        # was posted by something that never rendered it). No round trip
        # needed to know that.
        return TurnstileResult(success=False, error_codes=(_MISSING_TOKEN,))

    fields = {
        "secret": secret if secret is not None else settings.turnstile_secret_key,
        "response": token,
    }
    if remote_ip:
        fields["remoteip"] = remote_ip

    try:
        raw = _post(SITEVERIFY_URL, fields, TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 — every transport failure refuses
        # Deliberately broad: urllib raises URLError, socket.timeout, OSError
        # and (behind some proxies) ssl errors, and the correct response to
        # all of them is identical. Enumerating them is a list that goes
        # stale into a fail-open.
        log.warning("turnstile siteverify unreachable: %s", exc)
        return TurnstileResult(
            success=False, error_codes=(_INTERNAL_ERROR,), retryable=True
        )

    try:
        payload = json.loads(raw)
    except ValueError:
        log.warning("turnstile siteverify returned a non-JSON body")
        return TurnstileResult(success=False, error_codes=(_BAD_RESPONSE,))
    if not isinstance(payload, dict):
        return TurnstileResult(success=False, error_codes=(_BAD_RESPONSE,))

    # ``error-codes`` — hyphenated, so dict access is the only way in. A
    # ``payload.get("error_codes")`` returns None against every real
    # response and silently discards the diagnosis.
    codes = payload.get("error-codes") or []
    if not isinstance(codes, list):
        codes = [str(codes)]
    error_codes = tuple(str(code) for code in codes)

    # ``is True``, not truthiness: ``{"success": "false"}`` is a truthy
    # string, and a malformed-but-parseable body must not be an approval.
    if payload.get("success") is True:
        return TurnstileResult(success=True)
    return TurnstileResult(
        success=False,
        error_codes=error_codes,
        retryable=_INTERNAL_ERROR in error_codes,
    )
