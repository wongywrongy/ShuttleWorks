"""Self-hosted account endpoints (SP-CLOUD-2 Phase 1).

Cookie-session auth per the OWASP Authentication / Session Management
cheat sheets: opaque server-side sessions, httpOnly cookies, uniform
invalid-credential responses, throttled credential endpoints, and
credential changes revoking other sessions.

Registration/login work identically in both modes — local mode simply
never *requires* them (requests without a session resolve to the
bootstrap operator). Password-reset issues the token here; delivery
rides the email seam without placing the token in application logs.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel

from core.brand import BRAND_SIGNATURE, PRODUCT_NAME
from core.client_ip import client_ip
from core.config import settings
from core.dependencies import AuthUser, _session_principal, get_current_user, get_pending_user, require_fresh_authentication
from core.error_codes import ErrorCode, http_error, resource_not_found
from core.limits import Email, Name, Password, StrictModel, Token
from repositories import LocalRepository, get_repository
from core import throttle
from identity import auth as auth_service
from identity.auth import AuthError
from identity.responses import AcceptedDTO
from core.time_utils import _aware, _utcnow

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
    # Whether the server's email seam can actually deliver off-host
    # (`core/email.py`'s `smtp` backend, vs. the local `console` backend
    # that only logs). Lets the console offer "send by email" invitations
    # only where they can actually be sent (v3 consolidated plan, package
    # 18, V3-OC25.1) instead of always presenting a choice the local
    # deployment never delivers on.
    emailConfigured: bool = False
    # mfaRequired is this session's obligation (deployment policy OR an
    # enrolled factor); mfaEnforced is the policy alone, so the console can
    # tell a voluntary factor (which may be turned off) from a mandatory one.
    mfaRequired: bool = False
    mfaEnforced: bool = False
    # Whether this API holds an authenticator key ring at all. Without one,
    # enrollment answers 503 AUTH_MFA_UNAVAILABLE, so offering it would mislead.
    mfaAvailable: bool = False
    mfaEnrolled: bool = False
    mfaAuthenticated: bool = False
    mfaRecoveryCodesRemaining: Optional[int] = None
    passwordConfigured: bool = True
    offlineWorkspaceId: Optional[str] = None
    authenticatedAt: Optional[datetime] = None


# ---- Helpers ---------------------------------------------------------


def _set_session_cookie(response: Response, token: str, *, expires_at=None) -> None:
    from core.time_utils import _aware
    max_age = int(settings.session_ttl_days * 86400) if expires_at is None else max(0, int((_aware(expires_at) - _utcnow()).total_seconds()))
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=max_age,
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


def _set_offline_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    response.set_cookie(settings.offline_session_cookie_name, token, httponly=True,
                        secure=settings.session_cookie_secure, samesite="lax", path="/",
                        max_age=max(0, int((_aware(expires_at) - _utcnow()).total_seconds())))
    response.headers["Cache-Control"] = "no-store"


def _require_account_origin() -> None:
    if settings.deployment_profile == "event_node":
        raise resource_not_found()


# Real client IP, honouring ``CF-Connecting-IP`` only from a configured
# trusted proxy (``core/client_ip.py``). Behind a tunnel the raw socket
# peer is the connector for every request, which would collapse every
# user on the internet into one throttle bucket.
_client_ip = client_ip


def _auth_error(exc: AuthError):
    if exc.code == "AUTH_INVALID_CREDENTIALS":
        return http_error(status.HTTP_401_UNAUTHORIZED, ErrorCode.AUTH_INVALID_CREDENTIALS, exc.message)
    code = {
        "EMAIL_TAKEN": ErrorCode.AUTH_EMAIL_TAKEN,
        "INVALID_EMAIL": ErrorCode.AUTH_INVALID_EMAIL,
    }.get(exc.code, ErrorCode.AUTH_WEAK_PASSWORD)
    return http_error(status.HTTP_400_BAD_REQUEST, code, exc.message)


#: Public alias. The owner-authenticated operator-provisioning route (D12,
#: ``POST /tournaments/{tournament_id}/operators``) applies the same password
#: policy and the same hashing as ``/auth/register``, so it must also answer
#: with the same error codes. Re-implementing the mapping there is how the two
#: drift into telling a caller two different things about one rejected
#: password.
auth_error_response = _auth_error


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


def _user_dto(user_row, *, email: str, repo: LocalRepository, principal: AuthUser | None = None) -> UserDTO:
    factor = repo.mfa.get(user_row.id, settings.operator_mfa_scope)
    enrolled = factor is not None and factor.status == "active"
    return UserDTO(
        id=str(user_row.id),
        email=email,
        displayName=user_row.display_name,
        emailVerified=user_row.email_verified,
        isBootstrap=user_row.id == auth_service.BOOTSTRAP_USER_UUID,
        authMode=settings.auth_mode,
        emailConfigured=settings.email_backend == "smtp",
        mfaRequired=settings.operator_mfa_required or enrolled,
        mfaEnforced=settings.operator_mfa_required,
        mfaAvailable=bool(settings.mfa_keyring_file),
        mfaEnrolled=enrolled,
        mfaRecoveryCodesRemaining=repo.mfa.count_recovery_codes(factor.id) if enrolled else None,
        mfaAuthenticated=bool(principal and principal.mfa_authenticated),
        passwordConfigured=bool(user_row.password_hash),
        offlineWorkspaceId=principal.offline_tournament_id if principal else None,
        authenticatedAt=principal.authenticated_at if principal else None,
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
    from repositories.mfa import MfaRepository
    user = MfaRepository(session).reserve_account(user.id)
    if user is None or not user.password_hash or not auth_service.verify_password(user.password_hash, password):
        raise AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password")
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
    current_password: str,
) -> None:
    from repositories.mfa import MfaRepository
    user = MfaRepository(session).reserve_account(user.id)
    if user is None or not user.password_hash or not auth_service.verify_password(user.password_hash, current_password):
        raise AuthError("AUTH_INVALID_CREDENTIALS", "Current password is incorrect")
    if current_token is not None and auth_service.resolve_session_record(session, current_token) is None:
        raise AuthError("AUTH_INVALID_CREDENTIALS", "Sign in again")
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
    _require_account_origin()
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
    return _user_dto(user, email=email, repo=repo)


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
    if settings.deployment_profile == "event_node":
        from identity import node_identity
        from identity.mfa import MfaError
        try:
            workspace_id = uuid.UUID(request.query_params.get("workspaceId", ""))
            with repo.transaction():
                token, credential = node_identity.login(repo, account=user,
                    password=body.password, tournament_id=workspace_id, node_id=uuid.UUID(settings.node_id))
        except (ValueError, MfaError):
            repo.execute_transaction(_record_failures, account_key, ip_key)
            raise http_error(401, ErrorCode.AUTH_INVALID_CREDENTIALS, "Invalid email, password or workspace") from None
        _set_offline_session_cookie(response, token, credential.expires_at)
        principal = _session_principal(repo, user, credential)
        principal.offline_tournament_id = str(workspace_id)
        return _user_dto(user, email=user.email, repo=repo, principal=principal)
    try:
        token = repo.execute_transaction(_complete_login, user, body.password, account_key)
    except AuthError as exc:
        repo.execute_transaction(_record_failures, account_key, ip_key)
        raise _auth_error(exc) from None
    _set_session_cookie(response, token)
    return _user_dto(user, email=user.email, repo=repo)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> Response:
    if settings.deployment_profile == "event_node":
        from identity import offline_sessions
        token = request.cookies.get(settings.offline_session_cookie_name)
        if token:
            repo.execute_transaction(offline_sessions.revoke_cookie, token)
        response.delete_cookie(settings.offline_session_cookie_name, path="/")
        response.headers["Cache-Control"] = "no-store"
        response.status_code = status.HTTP_204_NO_CONTENT
        return response
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        repo.execute_transaction(auth_service.revoke_session, token)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserDTO)
def me(
    response: Response,
    user: AuthUser = Depends(get_pending_user),
    repo: LocalRepository = Depends(get_repository),
) -> UserDTO:
    response.headers["Cache-Control"] = "no-store"
    user_uuid = user.as_uuid()
    row = repo.get_user_identity(user_uuid) if user_uuid else None
    if row is None:
        if user.id != str(auth_service.BOOTSTRAP_USER_UUID):
            raise http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Not signed in")
        # A pre-bootstrap local developer process may not have its row yet.
        return UserDTO(
            id=user.id,
            email=user.email or "",
            isBootstrap=user.id == str(auth_service.BOOTSTRAP_USER_UUID),
            authMode=settings.auth_mode,
            emailConfigured=settings.email_backend == "smtp",
        )
    return _user_dto(row, email=row.email, repo=repo, principal=user)


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
    require_fresh_authentication(user)
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
    try:
        repo.execute_transaction(_change_password, row, body.newPassword, account_key,
                                 current_token, body.currentPassword)
    except AuthError as exc:
        repo.execute_transaction(_record_failures, account_key)
        raise _auth_error(exc) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/request-password-reset", response_model=AcceptedDTO, status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    body: RequestPasswordResetRequest,
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> dict:
    """Always 202 (no account-existence oracle). The token rides the
    email seam; it is never returned in this response or logged."""
    _require_account_origin()
    ip_key = f"ip:{_client_ip(request)}"
    _throttle_guard(repo, ip_key)
    try:
        email = auth_service.normalize_email(body.email)
    except AuthError:
        return {"status": "accepted"}
    user = repo.execute_query(auth_service.get_user_by_email, email)
    if user is not None:
        token = repo.execute_transaction(auth_service.issue_reset_token, user)
        # Delivery rides the email seam: console mode skips delivery;
        # SMTP delivers the message. The raw token never
        # appears in the HTTP response or the cloud application log.
        from core.email import send_email

        # OPERATOR tier (SP-HOST-1 D-9): a password reset is operator
        # business and its link lands on the Access-fronted console host.
        origin = settings.app_origin
        try:
            send_email(
                to=email,
                subject=f"Reset your {PRODUCT_NAME} password",
                body=(
                    "A password reset was requested for this address.\n\n"
                    f"Reset link: {origin}/login?reset={token}\n\n"
                    f"The link expires in {int(settings.reset_token_ttl_minutes)} "
                    "minutes. If you didn't ask for this, ignore this message."
                    f"\n\n{BRAND_SIGNATURE}"
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
    _require_account_origin()
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
