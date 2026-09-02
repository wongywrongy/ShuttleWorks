"""Self-hosted account endpoints (SP-CLOUD-2 Phase 1).

Cookie-session auth per the OWASP Authentication / Session Management
cheat sheets: opaque server-side sessions, httpOnly cookies, uniform
invalid-credential responses, throttled credential endpoints, and
credential changes revoking other sessions.

Registration/login work identically in both modes — local mode simply
never *requires* them (requests without a session resolve to the
bootstrap operator). Password-reset issues the token here; delivery
rides the Phase 3 email seam (in local mode the token is logged).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel

from core.client_ip import client_ip
from core.config import settings
from core.dependencies import AuthUser, get_current_user
from core.error_codes import ErrorCode, http_error
from core.limits import Email, Name, Password, StrictModel, Token
from repositories import LocalRepository, get_repository
from core import throttle
from identity import auth as auth_service
from identity.auth import AuthError

log = logging.getLogger("scheduler.identity.auth_routes")

router = APIRouter(prefix="/auth", tags=["auth"])


# ---- DTOs ------------------------------------------------------------


class RegisterRequest(StrictModel):
    email: Email
    # Bounded well above the 128-char policy so an over-long password is
    # a clean AUTH_WEAK_PASSWORD from ``validate_password`` rather than a
    # 422 from the schema — and so an unbounded string never reaches
    # Argon2, whose cost is a function of what it is asked to hash.
    password: Password
    displayName: Optional[Name] = None


class LoginRequest(StrictModel):
    email: Email
    password: Password


class ChangePasswordRequest(StrictModel):
    currentPassword: Password
    newPassword: Password


class RequestPasswordResetRequest(StrictModel):
    email: Email


class ResetPasswordRequest(StrictModel):
    token: Token
    newPassword: Password


class UserDTO(BaseModel):
    id: str
    email: str
    displayName: Optional[str] = None
    emailVerified: bool = False
    # Lets the frontend distinguish the bootstrap operator (no account
    # ceremony) from a signed-in account without a second endpoint.
    isBootstrap: bool = False
    authMode: str = "local"


# ---- Helpers ---------------------------------------------------------


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=int(settings.session_ttl_days * 86400),
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        domain=settings.session_cookie_domain or None,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        domain=settings.session_cookie_domain or None,
        path="/",
    )


# Real client IP, honouring ``CF-Connecting-IP`` only from a configured
# trusted proxy (``core/client_ip.py``). Behind a tunnel the raw socket
# peer is the connector for every request, which would collapse every
# user on the internet into one throttle bucket.
_client_ip = client_ip


def _auth_error(exc: AuthError):
    code = {
        "EMAIL_TAKEN": ErrorCode.AUTH_EMAIL_TAKEN,
        "INVALID_EMAIL": ErrorCode.AUTH_INVALID_EMAIL,
    }.get(exc.code, ErrorCode.AUTH_WEAK_PASSWORD)
    return http_error(status.HTTP_400_BAD_REQUEST, code, exc.message)


def _throttle_guard(repo: LocalRepository, *keys: str) -> None:
    for key in keys:
        remaining = repo.execute_query(throttle.throttle_check, key)
        if remaining is not None:
            raise http_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                ErrorCode.AUTH_THROTTLED,
                "Too many attempts. Try again later.",
                extra={"retryAfterSeconds": int(remaining) + 1},
            )


def _user_dto(user_row, *, email: str) -> UserDTO:
    return UserDTO(
        id=str(user_row.id),
        email=email,
        displayName=user_row.display_name,
        emailVerified=user_row.email_verified,
        isBootstrap=user_row.id == auth_service.BOOTSTRAP_USER_UUID,
        authMode=settings.auth_mode,
    )


def _record_failures(session, *keys: str) -> None:
    for key in keys:
        auth_service.throttle_record_failure(session, key)


def _record_registration_failures(session, ip_key: str, reg_key: str) -> None:
    auth_service.throttle_record_failure(session, ip_key)
    auth_service.throttle_record_registration(session, reg_key)


def _register_account(
    session,
    *,
    email: str,
    password: str,
    display_name: Optional[str],
    registration_key: str,
):
    user = auth_service.create_user(
        session,
        email=email,
        password=password,
        display_name=display_name,
    )
    auth_service.throttle_record_registration(session, registration_key)
    token, _ = auth_service.create_session(session, user.id)
    return user, token


def _complete_login(session, user, password: str, account_key: str):
    if auth_service.password_needs_rehash(user.password_hash):
        user.password_hash = auth_service.hash_password(password)
    auth_service.throttle_record_success(session, account_key)
    token, _ = auth_service.create_session(session, user.id)
    return token


def _change_password(
    session,
    user,
    new_password: str,
    account_key: str,
    current_token: Optional[str],
) -> None:
    user.password_hash = auth_service.hash_password(new_password)
    auth_service.revoke_all_sessions(
        session, user.id, except_token=current_token
    )
    auth_service.throttle_record_success(session, account_key)


def _consume_reset_attempt(
    session,
    token: str,
    new_password: str,
    ip_key: str,
):
    user = auth_service.consume_reset_token(session, token, new_password)
    if user is None:
        auth_service.throttle_record_failure(session, ip_key)
    return user


# ---- Endpoints -------------------------------------------------------


@router.post("/register", response_model=UserDTO, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    ip = _client_ip(request)
    ip_key = f"ip:{ip}"
    reg_key = auth_service.registration_key(ip)
    # Both buckets gate: the credential one so registration cannot be used
    # to sidestep a login lockout, the registration one so account
    # creation itself is bounded (SEC-03).
    _throttle_guard(repo, ip_key, reg_key)
    try:
        email = auth_service.normalize_email(body.email)
        auth_service.validate_password(body.password)
        user, token = repo.execute_transaction(
            _register_account,
            email=email,
            password=body.password,
            display_name=(body.displayName or "").strip() or None,
            registration_key=reg_key,
        )
    except AuthError as exc:
        # Failed registrations count against the IP so enumeration via
        # EMAIL_TAKEN probing is bounded by the same backoff as login.
        repo.execute_transaction(_record_registration_failures, ip_key, reg_key)
        raise _auth_error(exc)
    _set_session_cookie(response, token)
    return _user_dto(user, email=email)


@router.post("/login", response_model=UserDTO)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    try:
        email = auth_service.normalize_email(body.email)
    except AuthError as exc:
        raise _auth_error(exc)
    account_key = f"account:{email.lower()}"
    ip_key = f"ip:{_client_ip(request)}"
    _throttle_guard(repo, account_key, ip_key)

    user = repo.execute_query(auth_service.get_user_by_email, email)
    # Uniform failure: same code/message whether the account is missing,
    # has no password yet, or the password is wrong (OWASP: don't leak
    # which). Verify against a dummy hash when there's nothing to check
    # so timing doesn't reveal account existence either.
    ok = (
        auth_service.verify_password(user.password_hash, body.password)
        if user is not None and user.password_hash
        else auth_service.verify_password(_DUMMY_HASH, body.password) and False
    )
    if not ok:
        repo.execute_transaction(_record_failures, account_key, ip_key)
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Invalid email or password",
        )

    assert user is not None
    token = repo.execute_transaction(
        _complete_login, user, body.password, account_key
    )
    _set_session_cookie(response, token)
    return _user_dto(user, email=user.email)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        repo.execute_transaction(auth_service.revoke_session, token)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserDTO)
def me(
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    user_uuid = user.as_uuid()
    row = repo.get_user_identity(user_uuid) if user_uuid else None
    if row is None:
        # Bearer-era identities or the pre-bootstrap synthetic user may
        # have no local row yet; synthesize the DTO.
        return UserDTO(
            id=user.id,
            email=user.email or "",
            isBootstrap=user.id == str(auth_service.BOOTSTRAP_USER_UUID),
            authMode=settings.auth_mode,
        )
    return _user_dto(row, email=row.email)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    user_uuid = user.as_uuid()
    row = repo.get_user_identity(user_uuid) if user_uuid else None
    if row is None or not row.password_hash:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "This identity has no password to change",
        )
    account_key = f"account:{row.email.lower()}"
    _throttle_guard(repo, account_key)
    if not auth_service.verify_password(row.password_hash, body.currentPassword):
        repo.execute_transaction(_record_failures, account_key)
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Current password is incorrect",
        )
    try:
        auth_service.validate_password(body.newPassword)
    except AuthError as exc:
        raise _auth_error(exc)
    # OWASP: changing the credential invalidates every other session.
    current_token = request.cookies.get(settings.session_cookie_name)
    repo.execute_transaction(
        _change_password,
        row,
        body.newPassword,
        account_key,
        current_token,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/request-password-reset", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    body: RequestPasswordResetRequest,
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> dict:
    """Always 202 (no account-existence oracle). The token rides the
    email seam in Phase 3; until then it's logged server-side only."""
    ip_key = f"ip:{_client_ip(request)}"
    _throttle_guard(repo, ip_key)
    try:
        email = auth_service.normalize_email(body.email)
    except AuthError:
        return {"status": "accepted"}
    user = repo.execute_query(auth_service.get_user_by_email, email)
    if user is not None:
        token = repo.execute_transaction(auth_service.issue_reset_token, user)
        # Delivery rides the email seam: console backend logs the full
        # message locally; SMTP delivers in cloud. The raw token never
        # appears in the HTTP response or the cloud application log.
        from core.email import send_email

        # OPERATOR tier (SP-HOST-1 D-9): a password reset is operator
        # business and its link lands on the Access-fronted console host.
        origin = settings.app_origin
        try:
            send_email(
                to=email,
                subject="Reset your ShuttleWorks password",
                body=(
                    "A password reset was requested for this address.\n\n"
                    f"Reset link: {origin}/login?reset={token}\n\n"
                    f"The link expires in {int(settings.reset_token_ttl_minutes)} "
                    "minutes. If you didn't ask for this, ignore this message."
                ),
            )
        except Exception:
            # Same 202 either way — delivery failure must not become an
            # account-existence or infrastructure oracle.
            log.exception("password-reset email delivery failed")
        log.info(
            "password-reset token issued user=%s expires_at=%s",
            user.id,
            user.reset_token_expires_at,
        )
    else:
        repo.execute_transaction(_record_failures, ip_key)
    return {"status": "accepted"}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    ip_key = f"ip:{_client_ip(request)}"
    _throttle_guard(repo, ip_key)
    try:
        user = repo.execute_transaction(
            _consume_reset_attempt,
            body.token,
            body.newPassword,
            ip_key,
        )
    except AuthError as exc:
        raise _auth_error(exc)
    if user is None:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_RESET_INVALID,
            "Invalid or expired reset token",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Static Argon2id hash of a random throwaway string — used to equalize
# login timing when the account doesn't exist (never matches anything).
_DUMMY_HASH = auth_service.hash_password("sw-dummy-timing-equalizer")
