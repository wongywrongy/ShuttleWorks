"""Node-local activation; no shared authority capability establishes a person."""
import uuid

from fastapi import APIRouter, Depends, Request, Response

from core.config import settings
from core.dependencies import AuthUser, _session_principal, get_pending_user, require_fresh_authentication
from core.error_codes import ErrorCode, http_error, resource_not_found
from core.limits import Email, Password, StrictModel, Token
from core.time_utils import _utcnow
from identity import auth, mfa, node_identity
from identity.auth import AuthError
from identity.auth_routes import (ChangePasswordRequest, UserDTO, _auth_error, _client_ip, _record_failures,
                                  _set_offline_session_cookie, _throttle_guard, _user_dto)
from identity.mfa import MfaError
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/auth/node", tags=["auth"])


class NodeActivationRequest(StrictModel):
    workspaceId: uuid.UUID
    email: Email
    activationToken: Token
    newPassword: Password


@router.post("/activate", response_model=UserDTO)
def activate(body: NodeActivationRequest, request: Request, response: Response,
             repo: LocalRepository = Depends(get_repository)):
    if settings.deployment_profile != "event_node":
        raise resource_not_found()
    keys = (f"node-activation:account:{body.email.lower()}", f"node-activation:ip:{_client_ip(request)}")
    _throttle_guard(repo, *keys)
    try:
        with repo.transaction():
            account, token, credential = node_identity.activate(repo, email=body.email,
                token=body.activationToken, password=body.newPassword, tournament_id=body.workspaceId,
                node_id=uuid.UUID(settings.node_id), now=_utcnow())
    except AuthError as exc:
        raise _auth_error(exc) from None
    except MfaError:
        repo.execute_transaction(_record_failures, *keys)
        raise http_error(401, ErrorCode.AUTH_INVALID_CREDENTIALS, "Invalid or expired activation credential") from None
    _set_offline_session_cookie(response, token, credential.expires_at)
    principal = _session_principal(repo, account, credential)
    principal.offline_tournament_id = str(body.workspaceId)
    return _user_dto(account, email=account.email, repo=repo, principal=principal)


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordRequest, request: Request,
                    user: AuthUser = Depends(get_pending_user), repo: LocalRepository = Depends(get_repository)):
    if settings.deployment_profile != "event_node" or not user.offline_tournament_id:
        raise resource_not_found()
    require_fresh_authentication(user)
    keys = (f"node-password:account:{user.id}", f"node-password:ip:{_client_ip(request)}")
    _throttle_guard(repo, *keys)
    now = _utcnow()
    try:
        with repo.transaction():
            factor = repo.mfa.reserve(user.as_uuid(), settings.operator_mfa_scope, now)
            credential = repo.mfa.credential(user.session_id, user.as_uuid(), offline=True)
            if (factor is None or credential is None or factor.generation != credential.mfa_generation
                    or not repo.mfa.record_activity(user.session_id, user.as_uuid(), offline=True, now=now)):
                raise MfaError("NODE_CREDENTIAL_INVALID")
            account = repo.get_user_identity(user.as_uuid())
            if not account.password_hash or not auth.verify_password(account.password_hash, body.currentPassword):
                raise MfaError("NODE_CREDENTIAL_INVALID")
            auth.validate_password(body.newPassword)
            account.password_hash = auth.hash_password(body.newPassword)
            repo.mfa.revoke_sessions(user.as_uuid(), now, except_session_id=user.session_id)
            mfa._audit(repo, factor, "password_change", now)
    except AuthError as exc:
        raise _auth_error(exc) from None
    except MfaError:
        repo.execute_transaction(_record_failures, *keys)
        raise http_error(401, ErrorCode.AUTH_INVALID_CREDENTIALS, "Invalid or expired credential") from None
    return Response(status_code=204)
