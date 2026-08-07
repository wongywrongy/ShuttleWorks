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

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.client_ip import client_ip
from app.config import settings
from app.dependencies import AuthEntrant, get_current_entrant
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


class LoginRequest(StrictModel):
    email: Email
    password: Password


class EntrantDTO(BaseModel):
    """What an entrant is told about themselves. Note what is absent: no
    org, no role, no workspace, no membership — an entrant has none, and
    a DTO that carried the fields would invite a client to look for them."""

    id: str
    email: str
    displayName: Optional[str] = None
    emailVerified: bool = False


# ---- Helpers ---------------------------------------------------------


def _set_entrant_cookie(response: Response, token: str) -> None:
    """The operator cookie's twin (``api/auth.py``), under the entrant name.

    ``httponly`` so script cannot read it, ``samesite=lax`` so a
    cross-site form post never carries it, and no ``domain`` — host-only
    is what keeps the ``app.*`` and ``play.*`` cookie jars separate, which
    is the mechanism actually doing the session scoping (spec Q13 §2).
    ``secure`` follows the same setting the cloud validator forces true.

    The name comes from ``settings.entrant_session_cookie_name``, which is
    also a member of ``settings.session_cookie_names`` — the registry the
    CSRF middleware reads. ``tests/test_csrf_cookie_registry.py`` derives
    this call from the source and fails if it ever names a cookie the
    registry does not.
    """
    response.set_cookie(
        key=settings.entrant_session_cookie_name,
        value=token,
        max_age=int(settings.session_ttl_days * 86400),
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_entrant_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.entrant_session_cookie_name,
        path="/",
    )


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


@router.post("/login", response_model=EntrantDTO)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> EntrantDTO:
    """Credentials → an entrant session cookie.

    Two throttle keys, both in the entrant namespaces: the address
    (``eacct:``) so guessing at one account is bounded, and the client IP
    (``eip:``) so guessing at *many* accounts from one place is bounded
    too. Neither is the operator's bucket — a public form must not be able
    to lock a director out of the console, and that is the property
    ``tests/test_entrant_auth_routes.py`` asserts at route level.

    One failure answer for every cause (unknown address, no password set,
    wrong password), with the Argon2 cost paid on the miss as well, so
    neither the body nor the timing tells a caller which it was. The
    uniformity is ``services/entrants.authenticate``'s, not this route's —
    it returns an account or ``None`` and offers no way to ask why.
    """
    try:
        email = auth_service.normalize_email(body.email)
    except AuthError as exc:
        raise _auth_error(exc)

    account_key = auth_service.entrant_account_key(email)
    ip_key = auth_service.entrant_ip_key(client_ip(request))
    for key in (account_key, ip_key):
        remaining = auth_service.throttle_check(repo.session, key)
        if remaining is not None:
            raise _throttled(remaining, "Too many attempts — try again later")

    account = entrant_service.authenticate(
        repo.session, email=email, password=body.password
    )
    if account is None:
        auth_service.throttle_record_failure(repo.session, account_key)
        auth_service.throttle_record_failure(repo.session, ip_key)
        repo.session.commit()
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Invalid email or password",
        )

    auth_service.throttle_record_success(repo.session, account_key)
    token, _ = entrant_service.create_session(repo.session, account.id)
    repo.session.commit()
    _set_entrant_cookie(response, token)
    return EntrantDTO(
        id=str(account.id),
        email=account.email,
        displayName=account.display_name,
        emailVerified=account.email_verified,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    """Revoke the presented session and clear the cookie.

    Idempotent, following ``/auth/logout``: nothing to destroy is a no-op,
    not a 401 the caller cannot act on. **Only the presented token** is
    revoked — logging out of a library computer must not log the entrant
    out of their phone — and revocation is a timestamp, never a delete, so
    the row outlives the credential.
    """
    token = request.cookies.get(settings.entrant_session_cookie_name)
    if token:
        entrant_service.revoke_session(repo.session, token)
        repo.session.commit()
    _clear_entrant_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=EntrantDTO)
def me(entrant: AuthEntrant = Depends(get_current_entrant)) -> EntrantDTO:
    """Who the entrant cookie says you are — 401 if it says nothing.

    Declares ``get_current_entrant`` itself rather than inheriting an
    app-wide dependency, which is what keeps the two principals from being
    resolvable by one seam. There is no repository read here: everything
    the answer contains came out of the session resolution already.
    """
    return EntrantDTO(
        id=entrant.id,
        email=entrant.email,
        displayName=entrant.display_name,
        emailVerified=entrant.email_verified,
    )
