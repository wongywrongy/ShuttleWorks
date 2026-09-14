"""Cookie-bound MFA ceremonies. Password-stage sessions have no workspace authority."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, StringConstraints

from core.client_ip import client_ip
from core.config import settings
from core.dependencies import AuthUser, _session_principal, get_pending_user, require_fresh_authentication
from core.error_codes import ErrorCode, http_error
from core.limits import Password, StrictModel
from core.operator_sessions import authentication_is_fresh, session_is_live
from core.secret_keys import SecretKeyringError, read_secret_keyring
from core.time_utils import _utcnow
from identity import auth, mfa
from identity.auth_routes import UserDTO, _record_failures, _set_offline_session_cookie, _set_session_cookie, _throttle_guard, _user_dto
from identity.mfa_crypto import FactorSecretError
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/auth", tags=["auth"])
FactorCode = Annotated[str, StringConstraints(min_length=6, max_length=64)]


class EnrollRequest(StrictModel):
    currentPassword: Password


class ConfirmRequest(StrictModel):
    code: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")]


class VerifyRequest(EnrollRequest):
    code: FactorCode


class EnrollmentDTO(BaseModel):
    secret: str
    expiresAt: datetime
    issuer: str = "ShuttleWorks"


class ConfirmationDTO(BaseModel):
    user: UserDTO
    recoveryCodes: list[str] = Field(min_length=8, max_length=8)


def _keys():
    try:
        return read_secret_keyring(settings.mfa_keyring_file)
    except SecretKeyringError:
        raise http_error(503, ErrorCode.AUTH_MFA_UNAVAILABLE, "Authenticator service is unavailable") from None


def _attempt_keys(user: AuthUser, request: Request, repo: LocalRepository) -> tuple[str, str]:
    if user.session_id is None:
        raise http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Sign in to manage your authenticator")
    keys = (f"mfa:account:{user.id}", f"mfa:ip:{client_ip(request)}")
    _throttle_guard(repo, *keys)
    return keys


def _failure(repo: LocalRepository, exc, attempt_keys: tuple[str, str]):
    if isinstance(exc, (SecretKeyringError, FactorSecretError)):
        return http_error(503, ErrorCode.AUTH_MFA_UNAVAILABLE, "Authenticator service is unavailable")
    repo.execute_transaction(_record_failures, *attempt_keys)
    if exc.code == "MFA_SESSION_EXPIRED":
        return http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Sign in again")
    if exc.code == "AUTH_REAUTH_REQUIRED":
        return http_error(401, ErrorCode.AUTH_REAUTH_REQUIRED, "Verify your password and authenticator to continue")
    if exc.code == "MFA_INVALID_CREDENTIALS":
        # The password, not the authenticator, was wrong; name the right factor.
        return http_error(401, ErrorCode.AUTH_INVALID_CREDENTIALS, "Current password is incorrect")
    return http_error(401, ErrorCode.AUTH_MFA_INVALID, "Invalid or expired authenticator proof")


def _credential(repo: LocalRepository, user: AuthUser, now: datetime):
    row = repo.mfa.credential(user.session_id, user.as_uuid(), offline=bool(user.offline_tournament_id))
    if not session_is_live(row, now):
        raise mfa.MfaError("MFA_SESSION_EXPIRED")
    return row


def _complete(repo: LocalRepository, user: AuthUser, row, generation: int, response: Response, now: datetime) -> UserDTO:
    rotated = repo.mfa.rotate_session(row, generation, now)
    if rotated is None:
        raise mfa.MfaError("MFA_SESSION_EXPIRED")
    token, replacement = rotated
    if user.offline_tournament_id:
        # Kept separate from the cloud cookie even during a node ceremony.
        _set_offline_session_cookie(response, token, replacement.expires_at)
    else:
        _set_session_cookie(response, token, expires_at=replacement.expires_at)
    response.headers["Cache-Control"] = "no-store"
    account = repo.get_user_identity(user.as_uuid())
    principal = _session_principal(repo, account, replacement)
    if principal is None:
        raise mfa.MfaError("MFA_SESSION_EXPIRED")
    principal.offline_tournament_id = user.offline_tournament_id
    return _user_dto(account, email=account.email, repo=repo, principal=principal)


@router.post("/mfa/enroll", response_model=EnrollmentDTO, status_code=201)
def enroll(body: EnrollRequest, request: Request, response: Response,
           user: AuthUser = Depends(get_pending_user), repo: LocalRepository = Depends(get_repository)):
    attempts = _attempt_keys(user, request, repo)
    keys, now = _keys(), _utcnow()
    try:
        with repo.transaction():
            _credential(repo, user, now)
            secret = mfa.begin_enrollment(repo, user.as_uuid(), body.currentPassword,
                scope=settings.operator_mfa_scope, keys=keys, now=now,
                fresh=authentication_is_fresh(user.authenticated_at, now), session_id=user.session_id)
    except (mfa.MfaError, SecretKeyringError, FactorSecretError) as exc:
        raise _failure(repo, exc, attempts) from None
    response.headers["Cache-Control"] = "no-store"
    return EnrollmentDTO(secret=secret, expiresAt=now + mfa.ENROLLMENT_LIFETIME)


@router.post("/mfa/confirm", response_model=ConfirmationDTO)
def confirm(body: ConfirmRequest, request: Request, response: Response,
            user: AuthUser = Depends(get_pending_user), repo: LocalRepository = Depends(get_repository)):
    attempts = _attempt_keys(user, request, repo)
    keys, now = _keys(), _utcnow()
    try:
        with repo.transaction():
            credential = _credential(repo, user, now)
            generation, codes = mfa.confirm_enrollment(repo, user.as_uuid(), body.code,
                scope=settings.operator_mfa_scope, keys=keys, now=now, session_id=user.session_id)
            dto = _complete(repo, user, credential, generation, response, now)
    except (mfa.MfaError, SecretKeyringError, FactorSecretError) as exc:
        raise _failure(repo, exc, attempts) from None
    return ConfirmationDTO(user=dto, recoveryCodes=codes)


@router.post("/mfa/verify", response_model=UserDTO)
def verify(body: VerifyRequest, request: Request, response: Response,
           user: AuthUser = Depends(get_pending_user), repo: LocalRepository = Depends(get_repository)):
    attempts = _attempt_keys(user, request, repo)
    keys, now = _keys(), _utcnow()
    try:
        with repo.transaction():
            account = repo.mfa.reserve_account(user.as_uuid())
            if account is None or not account.password_hash or not auth.verify_password(account.password_hash, body.currentPassword):
                raise mfa.MfaError("MFA_INVALID_CREDENTIALS")
            credential = _credential(repo, user, now)
            generation = mfa.verify_factor(repo, user.as_uuid(), body.code,
                scope=settings.operator_mfa_scope, keys=keys, now=now)
            return _complete(repo, user, credential, generation, response, now)
    except (mfa.MfaError, SecretKeyringError, FactorSecretError) as exc:
        raise _failure(repo, exc, attempts) from None


@router.post("/activity", status_code=204)
def activity(user: AuthUser = Depends(get_pending_user), repo: LocalRepository = Depends(get_repository)):
    if user.mfa_required and not user.mfa_authenticated:
        raise http_error(401, ErrorCode.AUTH_MFA_REQUIRED, "Complete authenticator verification")
    if user.session_id is None and not user.mfa_required:
        return Response(status_code=204)
    with repo.transaction():
        accepted = repo.mfa.record_activity(user.session_id, user.as_uuid(),
                    offline=bool(user.offline_tournament_id), now=_utcnow())
        if not accepted:
            raise http_error(401, ErrorCode.AUTH_NOT_SIGNED_IN, "Sign in again")
    return Response(status_code=204)


@router.post("/reauth-check", status_code=204)
def reauth_check(user: AuthUser = Depends(get_pending_user)):
    """Fresh proof before an operator export assembled from already-loaded data."""
    if user.mfa_required and not user.mfa_authenticated:
        raise http_error(401, ErrorCode.AUTH_MFA_REQUIRED, "Complete authenticator verification")
    require_fresh_authentication(user)
    return Response(status_code=204)
