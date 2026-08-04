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

from app.config import settings
from app.dependencies import AuthUser, get_current_user
from app.error_codes import ErrorCode, http_error
from database.models import User
from repositories import LocalRepository, get_repository
from services import auth as auth_service
from services.auth import AuthError

log = logging.getLogger("scheduler.api.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


# ---- DTOs ------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: str
    password: str
    displayName: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


class RequestPasswordResetRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str


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


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _auth_error(exc: AuthError):
    code = {
        "EMAIL_TAKEN": ErrorCode.AUTH_EMAIL_TAKEN,
        "INVALID_EMAIL": ErrorCode.AUTH_INVALID_EMAIL,
    }.get(exc.code, ErrorCode.AUTH_WEAK_PASSWORD)
    return http_error(status.HTTP_400_BAD_REQUEST, code, exc.message)


def _throttle_guard(repo: LocalRepository, *keys: str) -> None:
    for key in keys:
        remaining = auth_service.throttle_check(repo.session, key)
        if remaining is not None:
            raise http_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                ErrorCode.AUTH_THROTTLED,
                "Too many attempts — try again later",
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


# ---- Endpoints -------------------------------------------------------


@router.post("/register", response_model=UserDTO, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    ip_key = f"ip:{_client_ip(request)}"
    _throttle_guard(repo, ip_key)
    try:
        email = auth_service.normalize_email(body.email)
        auth_service.validate_password(body.password)
        user = auth_service.create_user(
            repo.session,
            email=email,
            password=body.password,
            display_name=(body.displayName or "").strip() or None,
        )
    except AuthError as exc:
        # Failed registrations count against the IP so enumeration via
        # EMAIL_TAKEN probing is bounded by the same backoff as login.
        auth_service.throttle_record_failure(repo.session, ip_key)
        repo.session.commit()
        raise _auth_error(exc)
    token, _ = auth_service.create_session(repo.session, user.id)
    repo.session.commit()
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

    user = auth_service.get_user_by_email(repo.session, email)
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
        auth_service.throttle_record_failure(repo.session, account_key)
        auth_service.throttle_record_failure(repo.session, ip_key)
        repo.session.commit()
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Invalid email or password",
        )

    assert user is not None
    if auth_service.password_needs_rehash(user.password_hash):
        user.password_hash = auth_service.hash_password(body.password)
    auth_service.throttle_record_success(repo.session, account_key)
    token, _ = auth_service.create_session(repo.session, user.id)
    repo.session.commit()
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
        auth_service.revoke_session(repo.session, token)
        repo.session.commit()
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserDTO)
def me(
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    user_uuid = user.as_uuid()
    row = repo.session.get(User, user_uuid) if user_uuid else None
    if row is None:
        # Bearer-era identities (Supabase JWT) or the pre-bootstrap
        # synthetic user may have no local row yet; synthesize the DTO.
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
    row = repo.session.get(User, user_uuid) if user_uuid else None
    if row is None or not row.password_hash:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "This identity has no password to change",
        )
    account_key = f"account:{row.email.lower()}"
    _throttle_guard(repo, account_key)
    if not auth_service.verify_password(row.password_hash, body.currentPassword):
        auth_service.throttle_record_failure(repo.session, account_key)
        repo.session.commit()
        raise http_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            "Current password is incorrect",
        )
    try:
        auth_service.validate_password(body.newPassword)
    except AuthError as exc:
        raise _auth_error(exc)
    row.password_hash = auth_service.hash_password(body.newPassword)
    # OWASP: changing the credential invalidates every other session.
    current_token = request.cookies.get(settings.session_cookie_name)
    auth_service.revoke_all_sessions(
        repo.session, row.id, except_token=current_token
    )
    auth_service.throttle_record_success(repo.session, account_key)
    repo.session.commit()
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
    user = auth_service.get_user_by_email(repo.session, email)
    if user is not None:
        token = auth_service.issue_reset_token(repo.session, user)
        repo.session.commit()
        # Delivery rides the email seam: console backend logs the full
        # message locally; SMTP delivers in cloud. The raw token never
        # appears in the HTTP response or the cloud application log.
        from services.email import send_email

        origin = settings.public_app_origin.rstrip("/")
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
        auth_service.throttle_record_failure(repo.session, ip_key)
        repo.session.commit()
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
        user = auth_service.consume_reset_token(
            repo.session, body.token, body.newPassword
        )
    except AuthError as exc:
        raise _auth_error(exc)
    if user is None:
        auth_service.throttle_record_failure(repo.session, ip_key)
        repo.session.commit()
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.AUTH_RESET_INVALID,
            "Invalid or expired reset token",
        )
    repo.session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Static Argon2id hash of a random throwaway string — used to equalize
# login timing when the account doesn't exist (never matches anything).
_DUMMY_HASH = auth_service.hash_password("sw-dummy-timing-equalizer")
