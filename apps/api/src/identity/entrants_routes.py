"""The entrant auth surface — signup, login, logout, whoami.

SP-E1-2, ruling R10. The **second front door**. ``identity/auth_routes.py`` is the
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
(``core/main.py``), and a native form post cannot send a header. A
form-shaped ``/logout`` would therefore be refused the moment it worked —
the cookie it exists to destroy is the thing that trips the guard. Making
the whole entrant auth surface header-carrying keeps one CSRF story
instead of two, and matches ``identity/auth_routes.py``, which is the code this is a
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
import uuid
from typing import Optional, Type
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import IntegrityError

from entries import lifecycle
from entries.entries_json import require_form_csrf
from core.client_ip import client_ip
from core.config import settings
from core.dependencies import AuthEntrant, get_current_entrant
from core.error_codes import ErrorCode, http_error
from core.limits import Email, Name, Password, StrictModel
from repositories import LocalRepository, get_repository
from core import throttle
from identity import auth as auth_service
from identity import entrants as entrant_service
from identity.auth import AuthError
from identity.turnstile import verify_turnstile

log = logging.getLogger("scheduler.identity.entrants_routes")

router = APIRouter(prefix="/e/account", tags=["entrants"])


# The one answer signup ever gives. Deliberately says nothing about which
# branch produced it — "can be used" covers "was created" and "already
# exists" without either being inferable.
_UNIFORM_SIGNUP_MESSAGE = (
    "If that address can be used, the account is ready. Sign in to continue."
)


def _record_failures(session, *keys: str) -> None:
    for key in keys:
        auth_service.throttle_record_failure(session, key)


def _record_signup_attempt(session, key: str) -> None:
    auth_service.throttle_record_entrant_signup(session, key)


def _create_unverified_account(
    session,
    *,
    email: str,
    password: str,
    display_name: Optional[str],
    phone: Optional[str],
):
    account = entrant_service.create_account(
        session,
        email=email,
        password=password,
        display_name=display_name,
        phone=phone,
    )
    token = entrant_service.issue_verification_token(session, account)
    return account, token


def _complete_entrant_login(session, account, account_key: str):
    auth_service.throttle_record_success(session, account_key)
    token, _ = entrant_service.create_session(session, account.id)
    return token


def _verify_and_promote(session, token: str):
    account = entrant_service.consume_verification_token(session, token)
    if account is None:
        return None, 0
    return account, lifecycle.promote_verified_entries(session, account.id)


def _consume_entrant_reset(
    session,
    token: str,
    new_password: str,
    throttle_key: str,
):
    account = entrant_service.consume_reset_token(session, token, new_password)
    if account is None:
        auth_service.throttle_record_failure(session, throttle_key)
    return account


# ---- DTOs ------------------------------------------------------------


class SignupRequest(StrictModel):
    email: Email
    # Bounded well above the 128-character policy for the reason
    # ``identity/auth_routes.py`` gives: an over-long password should be a clean
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


class VerifyRequest(StrictModel):
    """The mailed double-opt-in token, posted back.

    ``Name`` bounds it the way ``Password`` bounds a password: the value is
    a 43-character base64url string and an unbounded one must never reach a
    hash function or a LIKE-free equality scan on a public route.
    """

    token: Name


class RequestResetRequest(StrictModel):
    email: Email


class ResetRequest(StrictModel):
    token: Name
    newPassword: Password


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


# Where a form post sends the browser when it lands. **Every one of these is
# a node-owned GET** (``entrant/app/routes.ts``), and that is the whole
# property: all of ``/e/account/`` is FastAPI's by prefix and POST-only
# (ruling R8-A), so a redirect to one of these routes' own URLs is re-issued
# by the browser as a GET and answered ``405 Method Not Allowed`` as the
# whole document. Which is what all three fallbacks below used to be —
# unreachable from the shipped forms, which always post a valid ``next``, and
# a dead end for a hand-edited URL or any future caller that forgets the
# field.
#
# One page per outcome, because the outcomes differ and the page says which
# happened: the bare sign-in form after a sign-out, "the account is ready"
# after a signup (on BOTH branches — the non-enumeration property), "you are
# signed in" after a sign-in that had nowhere else to go. The last is
# ``login.tsx``'s own ``DEFAULT_NEXT``, so the two tiers agree on where a
# destinationless sign-in lands.
_LOGIN_PAGE = "/e/login"
_ACCOUNT_READY_PAGE = "/e/login/created"
_SIGNED_IN_PAGE = "/e/login/signed-in"

# E2's four outcome pages, on the same one-page-per-outcome principle as the
# three above: the page says what happened, because a native form post
# renders whatever it is handed as the whole document.
#
# ``_VERIFY_FAILED_PAGE`` is reached by an expired or already-used link, and
# it does NOT say which — an attacker holding a leaked link must not be able
# to learn that it was valid once (see ``consume_verification_token``).
_VERIFIED_PAGE = "/e/verify/done"
_VERIFY_FAILED_PAGE = "/e/verify/failed"
_VERIFY_SENT_PAGE = "/e/verify/sent"
# One target whether or not the address is registered. This is the reset
# flow's whole non-enumeration property and it is the same shape signup
# already uses: the page states that mail *would* have been sent.
_RESET_SENT_PAGE = "/e/reset/sent"
_RESET_DONE_PAGE = "/e/reset/done"
_RESET_FAILED_PAGE = "/e/reset/failed"
_RESET_PASSWORD_FAILED_PAGE = "/e/reset/password-failed"

# Where a form sign-in that did not work sends the browser back to, which is
# what makes the refusal a PAGE rather than the
# ``{"detail":{"code":"AUTH_INVALID_CREDENTIALS"}}`` a native form post
# otherwise paints across the window — found by a real-browser demo pass,
# 2026-08-10.
#
# **One target for every cause**, exactly as the 401 it replaces is one
# status and one body for every cause. Unknown address, no password set and
# wrong password all land here, so this route is no more of an enumeration
# oracle by redirecting than it was by refusing, and the copy on the far
# side states no address and no branch.
_LOGIN_FAILED_PAGE = "/e/login/failed"


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


async def verify_body(request: Request) -> VerifyRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), VerifyRequest)


async def request_reset_body(request: Request) -> RequestResetRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), RequestResetRequest)


async def reset_body(request: Request) -> ResetRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), ResetRequest)


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
    ``core.form_csrf.form_csrf_proves`` has always used, and matching it is
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
    """The operator cookie's twin (``identity/auth_routes.py``), under the entrant name.

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
      ``entries/entries_public._form_csrf``, and this docstring previously
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
    """``identity/auth_routes.py``'s 429 shape verbatim, ``retryAfterSeconds`` and all.
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


def _mail(to: str, subject: str, body: str) -> None:
    """Send, and never let the outcome reach the caller's response.

    Delivery failure must not become an oracle — neither for account
    existence (a 500 on the found branch and a 202 on the other is the same
    leak the uniform body exists to prevent) nor for infrastructure. The
    exception is logged, which is where an operator can act on it.

    Imported inside the function, matching ``identity/auth_routes.py``: the
    email seam pulls ``smtplib`` and this module is imported at app start.
    """
    from core.email import send_email

    try:
        send_email(to=to, subject=subject, body=body)
    except Exception:
        log.exception("entrant mail delivery failed (%s)", subject)


def _send_verification(account, token: str) -> None:
    # PUBLIC tier (SP-HOST-1 D-9). An entrant has no console account and no
    # Access seat; a verify link on the operator host is unopenable.
    origin = settings.play_origin
    _mail(
        account.email,
        "Confirm your email for ShuttleWorks entries",
        (
            "Welcome to ShuttleWorks.\n\n"
            "Confirm this address so tournament organisers can accept your "
            "entries:\n\n"
            f"{origin}/e/verify?token={token}\n\n"
            f"The link is good for {int(settings.verify_token_ttl_days)} days. "
            "If you did not create an account, ignore this message — nothing "
            "will happen without this confirmation."
        ),
    )


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

    remaining = repo.execute_query(throttle.throttle_check, throttle_key)
    if remaining is not None:
        raise _throttled(
            remaining, "Too many signups from this connection. Try again later."
        )

    verdict = verify_turnstile(body.turnstileToken, remote_ip=ip)
    if not verdict.success:
        # Charge the attempt. A bot that fails the challenge every time is
        # precisely what the budget exists for, and refusing for free
        # would leave it unbounded.
        repo.execute_transaction(_record_signup_attempt, throttle_key)
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
        repo.execute_transaction(_record_signup_attempt, throttle_key)
        raise _auth_error(exc)

    if repo.execute_query(entrant_service.get_account_by_email, email) is None:
        try:
            account, verify_token = repo.execute_transaction(
                _create_unverified_account,
                email=email,
                password=body.password,
                display_name=body.displayName,
                phone=body.phone,
            )
            # E2: the double-opt-in link, minted before the commit so the
            # hash and the row land together — a mailed token whose hash was
            # rolled back is a link that can never work.
            # Mailed AFTER the commit, deliberately: a link that arrives
            # before the row it names is a race an entrant can lose by being
            # fast, and re-sending is cheap while un-sending is impossible.
            _send_verification(account, verify_token)
        except (AuthError, IntegrityError):
            # The case-insensitive unique index winning a race with the
            # check above. Same answer as the found branch — the outcome
            # for the caller is identical and so is what we tell them.
            pass
    else:
        # Spend the hash anyway. An existence check that skipped Argon2id
        # would make the *timing* of this route the enumeration oracle its
        # body and status code are written to avoid.
        auth_service.hash_password(body.password)

    repo.execute_transaction(_record_signup_attempt, throttle_key)
    if is_form_post(request):
        # 303 to the login page, not into a session: signup hands out no
        # cookie on either branch, because a cookie set only on the created
        # branch would be as observable as a status code (module docstring).
        return RedirectResponse(
            url=next_target(next_raw, _ACCOUNT_READY_PAGE),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    return SignupResponse()


@router.post(
    "/login",
    response_model=None,
    responses={
        200: {"model": EntrantDTO},
        303: {
            "description": (
                "Form post: redirect to `next` carrying the session cookie, "
                "or to the sign-in page's refusal variant on a bad credential"
            )
        },
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
    uniformity is ``identity/entrants.authenticate``'s, not this route's —
    it returns an account or ``None`` and offers no way to ask why.

    **Two shapes for that one answer, by ``Accept``.** A JSON caller keeps
    the 401 verbatim; a browser navigation — which renders whatever it is
    handed as the whole document — gets a 303 to ``_LOGIN_FAILED_PAGE``.
    Same branch, same cause-blindness, same absence of anything an attacker
    can read: what changes is only whether the refusal arrives as a page or
    as ``{"detail":{"code":...}}`` in the entrant's face.
    """
    try:
        email = auth_service.normalize_email(body.email)
    except AuthError as exc:
        raise _auth_error(exc)

    account_key = auth_service.entrant_account_key(email)
    ip_key = auth_service.entrant_ip_key(client_ip(request))
    for key in (account_key, ip_key):
        remaining = repo.execute_query(throttle.throttle_check, key)
        if remaining is not None:
            raise _throttled(remaining, "Too many attempts. Try again later.")

    account = repo.execute_query(
        entrant_service.authenticate, email=email, password=body.password
    )
    if account is None:
        repo.execute_transaction(_record_failures, account_key, ip_key)
        if "text/html" in request.headers.get("accept", ""):
            # ``text/html`` in Accept means a NAVIGATION — browsers send it on
            # a form post and never on ``fetch(..., {headers: {}})`` — and a
            # navigation renders whatever it is handed as the whole document.
            # The same test ``entrant_or_back_to_form`` and ``quote_entry``
            # make (``entries/entries_json.py``), for the same reason and with the
            # same answer: 303 to a page, carrying a code and never prose,
            # because the target is addressable and shareable.
            #
            # Accept rather than ``is_form_post`` (which the SUCCESS branch
            # below uses): a browser sends both, so the shipped path is
            # unaffected either way, but a scripted urlencoded client is not
            # navigating anywhere and keeps the 401 it parses.
            #
            # The retry keeps its destination: without this, failing once
            # loses the ``next`` the entrant arrived with, and signing in on
            # the second attempt strands them away from the entry page they
            # came from. Validated by the same allowlist the success branch
            # uses, and dropped entirely if it fails — a crafted value must
            # not survive a refusal any more than it survives a success.
            retry = next_target(next_raw, "")
            return RedirectResponse(
                url=_LOGIN_FAILED_PAGE
                + (f"?{urlencode({'next': retry})}" if retry else ""),
                status_code=status.HTTP_303_SEE_OTHER,
            )
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Invalid email or password",
        )

    token = repo.execute_transaction(
        _complete_entrant_login, account, account_key
    )
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, _SIGNED_IN_PAGE),
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
        repo.execute_transaction(entrant_service.revoke_session, token)
    _clear_entrant_cookie(response)
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, _LOGIN_PAGE),
            status_code=status.HTTP_303_SEE_OTHER,
        )
        _clear_entrant_cookie(redirect)
        return redirect
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post(
    "/verify",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    responses={303: {"description": "Form post: redirect to the outcome page"}},
)
def verify(
    request: Request,
    body: VerifyRequest = Depends(verify_body),
    repo: LocalRepository = Depends(get_repository),
):
    """Consume a mailed verification token (spec §6, R10).

    **A POST, and the mailed link is a GET that renders a button.** A
    verification link that mutated on GET would be consumed by every mail
    scanner and link-preview bot between us and the entrant — the entrant
    then clicks a dead link and cannot verify at all. The node route
    ``/e/verify`` renders the token into a one-button form that posts here.

    **The promotion is the point.** Verifying does not only flip a flag: it
    moves every entry this account has parked in ``unverified`` to
    ``pending``, which is the transition that makes them reachable by the
    operator's confirm and therefore by the commit seam. R10's "one
    verification covers every entry that account ever makes", executed in
    one place.

    No throttle key of its own. The token is 256 bits of ``secrets`` entropy
    and the response is uniform, so there is nothing here to guess at
    cheaply; the per-IP body cap and the nginx zone still apply.
    """
    account, promoted = repo.execute_transaction(
        _verify_and_promote, body.token
    )
    if account is None:
        if is_form_post(request):
            return RedirectResponse(
                url=_VERIFY_FAILED_PAGE, status_code=status.HTTP_303_SEE_OTHER
            )
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_RESET_INVALID,
            "That confirmation link is not valid. Ask for a new one.",
        )

    log.info(
        "entrants: account %s verified, %d entries promoted", account.id, promoted
    )
    if is_form_post(request):
        return RedirectResponse(
            url=_VERIFIED_PAGE, status_code=status.HTTP_303_SEE_OTHER
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/resend-verification",
    status_code=status.HTTP_202_ACCEPTED,
    responses={303: {"description": "Form post: redirect to the sign-in page"}},
)
def resend_verification(
    request: Request,
    response: Response,
    csrf_checked: None = Depends(logout_form_csrf),
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
):
    """Mail a fresh confirmation link to the signed-in entrant's own address.

    **Session-gated, and that is what keeps it from being a mail cannon.**
    An address-taking resend route would let anyone send our mail to anyone
    else's inbox as often as they liked; requiring the cookie means the only
    address reachable is the caller's own, which also makes the route
    incapable of confirming that some *other* address is registered.

    An already-verified account gets 202 and no mail. Same answer either
    way — the caller learns nothing they did not already know about their
    own account, and an entrant who clicks twice is not shown an error for
    succeeding.
    """
    account = repo.get_entrant_identity(uuid.UUID(entrant.id))
    if account is not None and not account.email_verified:
        token = repo.execute_transaction(
            entrant_service.issue_verification_token, account
        )
        _send_verification(account, token)
    if is_form_post(request):
        return RedirectResponse(
            url=_VERIFY_SENT_PAGE, status_code=status.HTTP_303_SEE_OTHER
        )
    response.status_code = status.HTTP_202_ACCEPTED
    return {"status": "accepted"}


@router.post(
    "/request-password-reset",
    status_code=status.HTTP_202_ACCEPTED,
    responses={303: {"description": "Form post: redirect to the sent page"}},
)
def request_entrant_password_reset(
    request: Request,
    response: Response,
    body: RequestResetRequest = Depends(request_reset_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
    """Mail a reset link. **Always 202, always the same page** (R10, I5).

    R10 explicitly extends the non-enumeration rule to reset: this route
    must not become the account-existence oracle that signup pays an Argon2
    hash to avoid being. So an unknown address takes the same status, the
    same body and the same redirect as a known one — and charges the
    throttle, so an attacker walking an address list pays for it.

    ``eip:`` rather than the operator ``ip:`` namespace, for the reason the
    module docstring gives: a public form must not be able to lock a
    director out of their own console.
    """
    ip_key = auth_service.entrant_ip_key(client_ip(request))
    remaining = repo.execute_query(throttle.throttle_check, ip_key)
    if remaining is not None:
        raise _throttled(remaining, "Too many attempts. Try again later.")

    try:
        email = auth_service.normalize_email(body.email)
    except AuthError:
        # A malformed address is answered exactly like an unknown one. It is
        # still an address someone typed, and telling them the grammar was
        # wrong is one bit more than telling them nothing.
        email = None

    if email is not None:
        account = repo.execute_query(entrant_service.get_account_by_email, email)
        if account is not None:
            token = repo.execute_transaction(
                entrant_service.issue_reset_token, account
            )
            # PUBLIC tier (SP-HOST-1 D-9), same reason as verification.
            origin = settings.play_origin
            return_to = next_target(next_raw, "")
            reset_query = {"token": token}
            if return_to:
                reset_query["next"] = return_to
            _mail(
                account.email,
                "Reset your ShuttleWorks entry password",
                (
                    "A password reset was requested for this address.\n\n"
                    f"{origin}/e/reset?{urlencode(reset_query)}\n\n"
                    f"The link expires in "
                    f"{int(settings.reset_token_ttl_minutes)} minutes. "
                    "If you didn't ask for this, ignore this message — your "
                    "password has not changed."
                ),
            )
        else:
            repo.execute_transaction(_record_failures, ip_key)

    if is_form_post(request):
        return RedirectResponse(
            url=_RESET_SENT_PAGE, status_code=status.HTTP_303_SEE_OTHER
        )
    response.status_code = status.HTTP_202_ACCEPTED
    return {"status": "accepted"}


@router.post(
    "/reset-password",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    responses={303: {"description": "Form post: redirect to the outcome page"}},
)
def reset_entrant_password(
    request: Request,
    body: ResetRequest = Depends(reset_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
    """Consume a reset token and set a new password.

    Every live session for the account is revoked by
    ``consume_reset_token`` — OWASP's rule, and not optional here: a reset
    is what someone does when they believe another party has their
    password, and leaving that party's session alive makes the reset
    theatre.

    A weak new password is a 400 the entrant can act on
    (``AUTH_WEAK_PASSWORD``), distinct from an invalid token, because those
    are different problems with different fixes and neither reveals anything
    about an account: you cannot reach either branch without already holding
    a mailed token.
    """
    ip_key = auth_service.entrant_ip_key(client_ip(request))
    remaining = repo.execute_query(throttle.throttle_check, ip_key)
    if remaining is not None:
        raise _throttled(remaining, "Too many attempts. Try again later.")

    try:
        account = repo.execute_transaction(
            _consume_entrant_reset,
            body.token,
            body.newPassword,
            ip_key,
        )
    except AuthError as exc:
        if is_form_post(request):
            retry_query = {"token": body.token}
            return_to = next_target(next_raw, "")
            if return_to:
                retry_query["next"] = return_to
            return RedirectResponse(
                url=f"{_RESET_PASSWORD_FAILED_PAGE}?{urlencode(retry_query)}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        raise _auth_error(exc)

    if account is None:
        if is_form_post(request):
            return_to = next_target(next_raw, "")
            failed_url = (
                f"{_RESET_FAILED_PAGE}?{urlencode({'next': return_to})}"
                if return_to
                else _RESET_FAILED_PAGE
            )
            return RedirectResponse(
                url=failed_url, status_code=status.HTTP_303_SEE_OTHER
            )
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_RESET_INVALID,
            "Invalid or expired reset link",
        )

    if is_form_post(request):
        return_to = next_target(next_raw, "")
        done_url = (
            f"{_RESET_DONE_PAGE}?{urlencode({'next': return_to})}"
            if return_to
            else _RESET_DONE_PAGE
        )
        return RedirectResponse(
            url=done_url, status_code=status.HTTP_303_SEE_OTHER
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
