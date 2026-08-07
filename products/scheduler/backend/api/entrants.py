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
import re
from typing import Optional, Type

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import IntegrityError

from api.entries_json import require_form_csrf
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


# ---- the unhydrated HTML path (Phase 6) ------------------------------
#
# **Zero new routes.** F-E1-2-E1 is a missing-UI finding: this file already
# had signup, login and logout, and the logged-out entry page already NAMED
# them — it just shipped no form, so no human could self-serve an account.
# What these three gain is a body a browser can post without JavaScript,
# and the proof-of-intent that a body needs.

_FORM_CONTENT_TYPES = frozenset(
    {"application/x-www-form-urlencoded", "multipart/form-data"}
)

# Fields the HTML forms carry that are transport, not domain. ``StrictModel``
# forbids extras, so they are stripped before the model is built rather than
# added to it: ``_csrf`` is how a form proves itself and ``next`` is where it
# goes back to, and neither is a property of an account.
_TRANSPORT_FIELDS = frozenset({"_csrf", "next"})

# Optional text inputs post ``""`` when left blank; a JSON caller simply
# omits the key. Both validate — ``Name`` has a max_length and no minimum —
# so this is not a validation guard, it is TRANSPORT PARITY: dropped, a
# blank box stores ``None`` exactly as an omitted key does, and one account
# does not read differently for having been created through a form. Without
# it ``display_name`` is ``""``, which is a value everything downstream has
# to remember is really an absence. Dropped for these two only — never for
# ``password``, where an empty string must reach ``validate_password`` and
# come back as a readable AUTH_WEAK_PASSWORD rather than a 422 about a
# missing field.
_OPTIONAL_TEXT = frozenset({"displayName", "phone"})

# The one prefix the entrant tier owns. Anchored, so ``//host`` and
# ``https://host`` both fail; ``..`` is excluded separately because a
# browser normalises ``/e/../../api`` to ``/api`` before the request is
# ever made.
_SAFE_NEXT = re.compile(r"^/e/[A-Za-z0-9/_.~-]*$")


def is_form_post(request: Request) -> bool:
    return (
        (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        in _FORM_CONTENT_TYPES
    )


def next_target(raw: Optional[str], fallback: str) -> str:
    """Where a form post sends the browser, and nowhere else.

    An open redirect on a login route is a phishing primitive: the victim
    types real credentials on a real origin and is then handed to an
    attacker's page carrying whatever the link said. So the target is not
    *sanitised* — it is matched against the one prefix this tier owns, and
    anything else is discarded for the fallback. Matching beats stripping
    because a stripper has to anticipate every encoding and a matcher does
    not.
    """
    value = str(raw or "")
    if ".." in value or not _SAFE_NEXT.match(value):
        return fallback
    return value


async def _payload(request: Request) -> dict:
    """The request body as a plain dict, JSON or urlencoded.

    A dependency rather than a route change so the routes stay ``def`` and
    keep running in the threadpool — Argon2id on the event loop would stall
    every other request in the process for the duration of a hash.
    """
    if not is_form_post(request):
        try:
            body = await request.json()
        except ValueError as exc:
            # FastAPI parses the body itself when a route DECLARES a model,
            # and answers 422 ``json_invalid`` for one it cannot read. Doing
            # the parse here moved that failure into a dependency, where an
            # unhandled JSONDecodeError is a 500 — on a pre-session route
            # anyone can post to. Same status, same code, same shape.
            raise RequestValidationError(
                [
                    {
                        "type": "json_invalid",
                        "loc": ("body", 0),
                        "msg": "JSON decode error",
                        "input": {},
                        "ctx": {"error": str(exc)},
                    }
                ]
            ) from exc
        return body if isinstance(body, dict) else {}

    form = await request.form()
    data = {
        key: str(value)
        for key, value in form.multi_items()
        if key not in _TRANSPORT_FIELDS
    }
    # Cloudflare posts the widget's solution under ``cf-turnstile-response``
    # in a form; the JSON surface names it ``turnstileToken`` (see
    # ``SignupRequest``). Mapping it HERE rather than on the node tier keeps
    # one spelling of one field in one codebase.
    solution = data.pop("cf-turnstile-response", None)
    if solution is not None:
        data.setdefault("turnstileToken", solution)
    return {
        key: value
        for key, value in data.items()
        if value != "" or key not in _OPTIONAL_TEXT
    }


def _build(data: dict, model: Type[BaseModel]) -> BaseModel:
    """Construct the DTO, preserving FastAPI's own 422 for a bad body.

    Re-raised as ``RequestValidationError`` deliberately: a bare pydantic
    ``ValidationError`` has no handler and would 500. The JSON callers'
    status codes and error bodies are unchanged by this whole change, and
    ``test_the_json_contract_is_untouched`` is what says so.

    ``loc`` is re-prefixed with ``"body"`` because that prefix is FastAPI's,
    not pydantic's — it is added by the route's own body parser, which this
    dependency replaced. Without it a caller that reads ``loc[-1]`` still
    works and one that reads ``loc[1]`` silently stops finding the field.
    """
    try:
        return model(**data)
    except ValidationError as exc:
        raise RequestValidationError(
            [{**error, "loc": ("body", *error["loc"])} for error in exc.errors()]
        ) from exc


async def signup_body(request: Request) -> SignupRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), SignupRequest)


async def login_body(request: Request) -> LoginRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), LoginRequest)


async def form_next(request: Request) -> str:
    """The raw ``next`` field, unvalidated. ``next_target`` validates it at
    the point of use, so this stays a dumb reader and there is exactly one
    validator."""
    if not is_form_post(request):
        return ""
    return str((await request.form()).get("next") or "")


async def logout_form_csrf(request: Request) -> None:
    """A logout carries the very cookie it exists to destroy, which is why
    the JSON surface was made header-carrying in the first place. The form
    path proves itself with the session-derived digest instead.

    ``require_form_csrf`` accepts *either* candidate secret, not the
    session in preference to the nonce — the same "any of" that
    ``app.form_csrf.form_csrf_proves`` has always used, and matching it is
    the point: one CSRF story, not a route-level rule that diverges from
    the middleware's. That is not a downgrade. Both cookies are
    ``httponly``, so a cross-site page can make the browser send either and
    read neither, which is the whole double-submit claim; an attacker able
    to *plant* ``sw_play_csrf`` on this origin already has the origin.
    """
    if is_form_post(request):
        require_form_csrf(request, await request.form())


# ---- Helpers ---------------------------------------------------------


def _set_entrant_cookie(response: Response, token: str) -> None:
    """The operator cookie's twin (``api/auth.py``), under the entrant name.

    ``httponly`` so script cannot read it, and no ``domain`` — host-only is
    what keeps the ``app.*`` and ``play.*`` cookie jars separate, which is
    the mechanism actually doing the session scoping (spec Q13 §2).
    ``secure`` follows the same setting the cloud validator forces true.

    **What ``samesite=lax`` buys, and what it does not.** It suppresses the
    cookie on cross-site *subresource* traffic and on cross-site POSTs — a
    useful default, and defense in depth. It is **not** a CSRF defense on
    its own, and this file must not be read as claiming it is:

    - Chrome's **Lax+POST intervention** deliberately allows a cross-site
      top-level POST to carry a cookie less than two minutes old. That
      window is precisely the one after a login, which is when an entrant
      submits — the reasoning is spelled out at
      ``api/entries_public._form_csrf``, and this docstring previously
      contradicted it.
    - "Lax" is a browser's promise, not ours. It is unenforced in older
      clients and in anything that is not a browser.

    The defense that actually holds is carried per write, and there are two
    of them because the two surfaces post differently. JSON writes need the
    ``X-ShuttleWorks-CSRF`` header, which the middleware requires of every
    request carrying a cookie named in ``settings.session_cookie_names`` —
    this one included, by way of the registry test. The public entry form
    cannot send a header at all, so it carries a **double-submit token
    derived from this cookie** (``_form_csrf``): an attacker's page can
    make the browser send the cookie, it can never read it. ``samesite``
    narrows the attack surface those two guard; it does not replace them.

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


# ``responses`` on both of these declares the *form* answer, which FastAPI
# cannot infer: a handler that returns a ``Response`` short-circuits
# ``response_model``, so runtime is right either way — but the OpenAPI
# document is what ``make generate-api`` reads, and one that never mentions
# a 303 (or, on login, drops ``EntrantDTO`` for an untyped 200) generates a
# client for a surface that does not exist.
@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={303: {"description": "Form post: redirect to the login page"}},
)
def signup(
    request: Request,
    body: SignupRequest = Depends(signup_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
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
    if is_form_post(request):
        # 303 to the login page, not into a session: signup hands out no
        # cookie on either branch, because a cookie set only on the created
        # branch would be as observable as a status code (module docstring).
        return RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    return SignupResponse()


@router.post(
    "/login",
    response_model=None,
    responses={
        200: {"model": EntrantDTO},
        303: {"description": "Form post: redirect carrying the session cookie"},
    },
)
def login(
    request: Request,
    response: Response,
    body: LoginRequest = Depends(login_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
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
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
        _set_entrant_cookie(redirect, token)
        return redirect
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
    next_raw: str = Depends(form_next),
    csrf_checked: None = Depends(logout_form_csrf),
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
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
        _clear_entrant_cookie(redirect)
        return redirect
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
