"""The entrant auth surface — signup, login, logout, whoami.

SP-E1-2, ruling R10. The **second front door**. ``api/auth.py`` is the
operator's; this is its twin for the public entrant principal, and the
twinning is deliberate down to the cookie helpers: an entrant's password
is hashed by the same Argon2id, held to the same NIST 800-63B policy,
carried by the same opaque-token-and-SHA-256 session shape, and counted by
the same throttle engine. What differs is the *table* (``entrant_accounts``
/ ``entrant_sessions``, ruling D-A2/D-A3), the *cookie name*
(``sw_play_session``) and the *throttle namespaces* (``esignup:`` /
``eacct:`` / ``eip:``). Nothing about the cryptography differs, because a
second authentication stack is how you end up with a second set of bugs.

**Why this router is registered without the app-wide auth dependency.**
Signup and login cannot require a session; they are how a session is
obtained. ``/logout`` follows ``/auth/logout``'s precedent — idempotent,
nothing to destroy is a no-op — and ``/me`` declares its own dependency
(``get_current_entrant``) rather than inheriting the operator one, which
would be exactly the cross-principal confusion this slice exists to make
impossible.

**JSON in, JSON out — not a form post.** The rest of the ``/e/`` surface is
hand-rendered HTML (ruling D3) and posts native forms, so this is a
deliberate divergence with a concrete reason: the CSRF middleware refuses
any cookie-carrying write without ``X-ShuttleWorks-CSRF: 1``
(``app/main.py``), and a native form post cannot send a header. A
form-shaped ``/logout`` would therefore be refused the moment it worked —
the cookie it exists to destroy is the thing that trips the guard. Making
the whole entrant auth surface header-carrying keeps one CSRF story
instead of two, and matches ``api/auth.py``, which is the code this is a
twin of.

**Non-enumeration is the invariant on this file.** The public entry
surface's Seam B rule ("never reveal whether an address is registered")
lands hardest here: signup is where email enumeration is the classic leak.
Signup answers ``202`` with one fixed body whether it created an account
or found one, spends an Argon2id hash either way so timing does not become
the oracle the body is not, and hands out **no session** — a cookie set
only on the created branch would be as observable as a status code.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.client_ip import client_ip
from app.error_codes import ErrorCode, http_error
from app.limits import Email, Name, Password, StrictModel
from repositories import LocalRepository, get_repository
from services import auth as auth_service
from services import entrants as entrant_service
from services.auth import AuthError
from services.turnstile import verify_turnstile

log = logging.getLogger("scheduler.api.entrants")

router = APIRouter(prefix="/e/account", tags=["entrants"])


# The one answer signup ever gives. Deliberately says nothing about which
# branch produced it — "can be used" covers "was created" and "already
# exists" without either being inferable.
_UNIFORM_SIGNUP_MESSAGE = (
    "If that address can be used, the account is ready. Sign in to continue."
)


# ---- DTOs ------------------------------------------------------------


class SignupRequest(StrictModel):
    email: Email
    # Bounded well above the 128-character policy for the reason
    # ``api/auth.py`` gives: an over-long password should be a clean
    # AUTH_WEAK_PASSWORD from ``validate_password``, not a 422 blob — and
    # an unbounded string must never reach Argon2, whose cost is a
    # function of what it is asked to hash.
    password: Password
    displayName: Optional[Name] = None
    # R12's single optional contact field. Collected here rather than per
    # entry because it is *submitter* contact data (spec Q13 §6).
    phone: Optional[Name] = None
    # Cloudflare posts the widget's solution under ``cf-turnstile-response``
    # in a form; this surface is JSON, so it arrives named.
    turnstileToken: str = ""


class SignupResponse(BaseModel):
    status: str = "accepted"
    message: str = _UNIFORM_SIGNUP_MESSAGE


# ---- Helpers ---------------------------------------------------------


def _throttled(remaining: float, message: str):
    """``api/auth.py``'s 429 shape verbatim, ``retryAfterSeconds`` and all.
    A rate-limit answer is for a machine; keeping one shape means one
    client-side handler."""
    return http_error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        ErrorCode.AUTH_THROTTLED,
        message,
        extra={"retryAfterSeconds": int(remaining) + 1},
    )


def _auth_error(exc: AuthError):
    code = {
        "INVALID_EMAIL": ErrorCode.AUTH_INVALID_EMAIL,
    }.get(exc.code, ErrorCode.AUTH_WEAK_PASSWORD)
    return http_error(status.HTTP_400_BAD_REQUEST, code, exc.message)


# ---- Endpoints -------------------------------------------------------


@router.post(
    "/signup", response_model=SignupResponse, status_code=status.HTTP_202_ACCEPTED
)
def signup(
    body: SignupRequest,
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> SignupResponse:
    """Create an entrant account. **The order of the guards is the contract.**

    1. **Per-IP throttle**, read first because it is one local query and
       the challenge is an outbound request with a 5-second timeout.
       Verifying the challenge first would let an already-refused address
       spend one of our outbound requests on every post.
    2. **Turnstile, server-side.** Signup is now the cheapest bot target in
       the product and the one act with no session behind it (spec Q4, R3
       restack). A widget nobody verifies is worth nothing — bots post
       straight here without ever rendering it.
    3. **The password policy**, after the challenge so its response cannot
       be used as a free oracle by something that never solved one.
    4. **Create, or pretend to.** See the module docstring.

    ``202``, not ``201``: on the already-registered branch nothing was
    created, and a ``201`` there would be a lie told by the status line
    while the body was busy telling the truth.
    """
    ip = client_ip(request)
    throttle_key = auth_service.entrant_signup_key(ip)

    remaining = auth_service.throttle_check(repo.session, throttle_key)
    if remaining is not None:
        raise _throttled(
            remaining, "Too many signups from this connection — try again later"
        )

    verdict = verify_turnstile(body.turnstileToken, remote_ip=ip)
    if not verdict.success:
        # Charge the attempt. A bot that fails the challenge every time is
        # precisely what the budget exists for, and refusing for free
        # would leave it unbounded.
        auth_service.throttle_record_entrant_signup(repo.session, throttle_key)
        repo.session.commit()
        log.info("entrants: turnstile refusal (%s)", ",".join(verdict.error_codes))
        raise http_error(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.AUTH_CHALLENGE_FAILED,
            "We could not check that you are human just now. Please try again."
            if verdict.retryable
            else "The human check did not pass. Please try again.",
        )

    try:
        email = auth_service.normalize_email(body.email)
        auth_service.validate_password(body.password)
    except AuthError as exc:
        auth_service.throttle_record_entrant_signup(repo.session, throttle_key)
        repo.session.commit()
        raise _auth_error(exc)

    if entrant_service.get_account_by_email(repo.session, email) is None:
        try:
            entrant_service.create_account(
                repo.session,
                email=email,
                password=body.password,
                display_name=body.displayName,
                phone=body.phone,
            )
        except (AuthError, IntegrityError):
            # The case-insensitive unique index winning a race with the
            # check above. Same answer as the found branch — the outcome
            # for the caller is identical and so is what we tell them.
            repo.session.rollback()
    else:
        # Spend the hash anyway. An existence check that skipped Argon2id
        # would make the *timing* of this route the enumeration oracle its
        # body and status code are written to avoid.
        auth_service.hash_password(body.password)

    auth_service.throttle_record_entrant_signup(repo.session, throttle_key)
    repo.session.commit()
    return SignupResponse()
