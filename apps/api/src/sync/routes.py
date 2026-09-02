"""HTTP adapters for checkout authority and ordered operation ingestion."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Path, Request, Response
from fastapi.responses import JSONResponse
from core.dependencies import AuthUser, get_current_user, require_tournament_access
from repositories import LocalRepository, get_repository
from sync.schemas import (
    AuthorityLifecycleResponse,
    AuthorityReturnRequest,
    AuthorityStatus,
    CheckpointImportRequest,
    CheckoutRequest,
    CheckoutResponse,
    CloudProjectionResponse,
    DeviceEnrollmentRequest,
    DeviceResponse,
    DeviceRevocationRequest,
    OfflineSessionRequest, OfflineSessionBootstrapRequest, OfflineSessionResponse,
    LostNodeRecoveryRequest,
    PlannedTransferRequest,
    ReadyRequest,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncCorrectionCandidate,
    SyncCorrectionCandidateListResponse,
    SyncQuarantineListResponse,
    SyncQuarantineRecord,
    SyncQuarantineResolutionRequest,
    SyncStatusResponse,
)
from sync.service import (
    ProtocolError,
    SyncApplication,
)
authority_router = APIRouter(
    prefix="/tournaments/{tournament_id}/authority", tags=["authority"]
)
# The first-run ceremony cannot inherit the authority router's operator-cookie
# dependency: no event-scoped cookie exists yet.  This router exposes only the
# capability-authenticated bootstrap endpoint and is mounted separately.
authority_bootstrap_router = APIRouter(
    prefix="/tournaments/{tournament_id}/authority", tags=["authority"]
)
sync_router = APIRouter(prefix="/sync/v1/tournaments/{tournament_id}", tags=["sync"])


def _raise_protocol(exc: ProtocolError) -> None:
    # JSONResponse cannot be raised; FastAPI's HTTPException would wrap this
    # stable problem shape in `detail`, so use a tiny route-local exception.
    raise SyncHTTPError(exc)


class SyncHTTPError(Exception):
    def __init__(self, protocol_error: ProtocolError):
        self.protocol_error = protocol_error


def sync_error_response(_request, exc: SyncHTTPError) -> JSONResponse:  # noqa: ANN001
    error = exc.protocol_error
    return JSONResponse(status_code=error.status_code, content=error.body())


def _bearer_capability(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> str:
    if authorization is None:
        _raise_protocol(
            ProtocolError(401, "authority_capability_required", "Bearer node capability is required")
        )
    scheme, _, capability = authorization.partition(" ")
    if scheme.lower() != "bearer" or not capability:
        _raise_protocol(
            ProtocolError(401, "authority_capability_required", "Bearer node capability is required")
        )
    return capability


@authority_router.post(
    "/checkout",
    response_model=CheckoutResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def checkout(
    body: CheckoutRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> CheckoutResponse:
    try:
        authority, capability, checkpoint = SyncApplication(repo).checkout(
            tournament_id=tournament_id,
            node_id=body.node_id,
            schema_version=body.checkpoint_schema_version,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return CheckoutResponse(
        tournament_id=tournament_id,
        node_id=body.node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
        checkpoint_schema_version=authority.checkpoint_schema_version,
        checkpoint=checkpoint,
        authority_grant=authority.grant or {},
    )


@authority_router.post(
    "/devices",
    response_model=DeviceResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def enroll_event_node(
    body: DeviceEnrollmentRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    user: AuthUser = Depends(get_current_user),
) -> DeviceResponse:
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        device = SyncApplication(repo).enroll_device(
            tournament_id=tournament_id,
            node_id=body.node_id,
            label=body.label,
            public_key=body.public_key,
            actor_id=actor_id,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return DeviceResponse(
        node_id=device.device_id,
        org_id=device.org_id,
        label=device.label,
        public_key=device.public_key,
        enrolled_at=device.enrolled_at,
        revoked_at=device.revoked_at,
        revocation_reason=device.revocation_reason,
    )


@authority_router.post(
    "/devices/{node_id}/revoke",
    response_model=DeviceResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def revoke_event_node(
    body: DeviceRevocationRequest,
    tournament_id: uuid.UUID = Path(...),
    node_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> DeviceResponse:
    try:
        device = SyncApplication(repo).revoke_device(
            tournament_id=tournament_id,
            node_id=node_id,
            reason=body.reason,
            confirmation=body.confirmation,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return DeviceResponse(
        node_id=device.device_id,
        org_id=device.org_id,
        label=device.label,
        public_key=device.public_key,
        enrolled_at=device.enrolled_at,
        revoked_at=device.revoked_at,
        revocation_reason=device.revocation_reason,
    )


@authority_router.post(
    "/offline-session",
    response_model=OfflineSessionResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def create_offline_session(
    body: OfflineSessionRequest,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> OfflineSessionResponse:
    """Mint an event-node-only session for the already authenticated operator.

    This endpoint is intentionally unavailable outside the event-node profile;
    it cannot create a cloud login or broaden tournament membership.
    """
    from core.config import settings
    if settings.deployment_profile != "event_node":
        _raise_protocol(ProtocolError(409, "offline_session_node_only", "Offline sessions are node-only"))
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        token, row = SyncApplication(repo).issue_offline_session(
            user_id=actor_id, tournament_id=tournament_id,
            authority_epoch=body.authority_epoch, device_id=body.node_id,
            ttl_hours=body.ttl_hours,
        )
    except ValueError as exc:
        _raise_protocol(ProtocolError(403, "offline_session_scope_invalid", str(exc)))
    response.set_cookie(
        key=settings.offline_session_cookie_name, value=token,
        max_age=body.ttl_hours * 3600, httponly=True,
        secure=settings.session_cookie_secure, samesite="lax", path="/",
    )
    return OfflineSessionResponse(
        tournament_id=tournament_id, node_id=body.node_id,
        authority_epoch=body.authority_epoch, expires_at=row.expires_at,
    )


@authority_bootstrap_router.post(
    "/offline-session/bootstrap",
    response_model=OfflineSessionResponse,
)
def bootstrap_offline_session(
    body: OfflineSessionBootstrapRequest,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    capability: str = Depends(_bearer_capability),
    repo: LocalRepository = Depends(get_repository),
) -> OfflineSessionResponse:
    """Complete first-run node authentication without a cloud-origin cookie.

    The signed checkout capability is the ceremony proof.  It is scoped to
    this node/epoch by the authority row and is never persisted; only the
    digest of the newly-issued event credential is stored.
    """
    from core.config import settings

    if settings.deployment_profile != "event_node":
        _raise_protocol(
            ProtocolError(409, "offline_session_node_only", "Offline sessions are node-only")
        )
    try:
        token, row = SyncApplication(repo).bootstrap_offline_session(
            user_id=body.operator_id,
            tournament_id=tournament_id,
            authority_epoch=body.authority_epoch,
            device_id=body.node_id,
            capability=capability,
            ttl_hours=body.ttl_hours,
        )
    except ValueError as exc:
        _raise_protocol(ProtocolError(403, "offline_session_scope_invalid", str(exc)))
    response.set_cookie(
        key=settings.offline_session_cookie_name,
        value=token,
        max_age=body.ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return OfflineSessionResponse(
        tournament_id=tournament_id,
        node_id=body.node_id,
        authority_epoch=body.authority_epoch,
        expires_at=row.expires_at,
    )


@authority_router.delete(
    "/offline-session",
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def revoke_offline_session(
    request: Request,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> dict[str, bool]:
    """Revoke the presented node-local credential and clear its cookie.

    This endpoint deliberately does not require the credential to still
    resolve: an expired session or a session from a just-closed epoch must
    remain possible to clear and audit. CSRF middleware still applies because
    the offline cookie is part of the central credential-cookie registry.
    """
    from core.config import settings

    if settings.deployment_profile != "event_node":
        _raise_protocol(
            ProtocolError(
                409, "offline_session_node_only", "Offline sessions are node-only"
            )
        )
    token = request.cookies.get(settings.offline_session_cookie_name, "")
    revoked = False
    if token:
        revoked = SyncApplication(repo).revoke_offline_session(
            token,
            tournament_id=tournament_id,
            reason="operator logout",
        )
    response.delete_cookie(
        key=settings.offline_session_cookie_name,
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"revoked": revoked}


@authority_router.post(
    "/ready",
    response_model=AuthorityStatus,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def ready(
    body: ReadyRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityStatus:
    try:
        authority = SyncApplication(repo).ready(
            tournament_id=tournament_id,
            node_id=body.node_id,
            authority_epoch=body.authority_epoch,
            capability=body.capability,
            checkpoint_hash=body.checkpoint_hash,
            ready_proof=body.ready_proof,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return AuthorityStatus(
        tournament_id=tournament_id,
        node_id=authority.node_id,
        authority_epoch=authority.epoch,
        state=authority.state,
        checkpoint_hash=authority.checkpoint_hash,
    )


def _lifecycle_response(action: str, previous, current, capability=None, highest=0):  # noqa: ANN001
    return AuthorityLifecycleResponse(
        action=action,
        tournament_id=current.tournament_id,
        previous_epoch=previous.epoch,
        authority_epoch=current.epoch,
        node_id=current.node_id,
        state=current.state,
        capability=capability,
        checkpoint_hash=current.checkpoint_hash,
        highest_contiguous_sequence=highest,
    )


@authority_router.post(
    "/return",
    response_model=AuthorityLifecycleResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def return_authority(
    body: AuthorityReturnRequest,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityLifecycleResponse:
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        previous, cloud = SyncApplication(repo).return_to_cloud(
            tournament_id=tournament_id,
            actor_id=actor_id,
            device_id=body.node_id,
            **body.model_dump(),
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return _lifecycle_response(
        "return_to_cloud", previous, cloud, highest=body.declared_last_sequence
    )


@authority_router.post(
    "/transfer",
    response_model=AuthorityLifecycleResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def transfer_authority(
    body: PlannedTransferRequest,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityLifecycleResponse:
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        previous, replacement, capability = SyncApplication(repo).planned_transfer(
            tournament_id=tournament_id,
            actor_id=actor_id,
            device_id=body.node_id,
            **body.model_dump(),
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return _lifecycle_response(
        "planned_transfer", previous, replacement, capability=capability,
        highest=body.declared_last_sequence,
    )


@authority_router.post(
    "/recover",
    response_model=AuthorityLifecycleResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def recover_authority(
    body: LostNodeRecoveryRequest,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityLifecycleResponse:
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        previous, replacement, capability = SyncApplication(repo).recover_lost_node(
            tournament_id=tournament_id,
            actor_id=actor_id,
            device_id=body.new_node_id,
            **body.model_dump(),
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return _lifecycle_response(
        "lost_node_recovery", previous, replacement, capability=capability,
        highest=body.declared_last_sequence,
    )


@authority_router.post("/checkpoint/import", response_model=AuthorityStatus)
def import_checkpoint_route(
    body: CheckpointImportRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityStatus:
    """Install a cloud checkpoint into an event-node database.

    The path tournament id is checked against the signed document; the
    service owns the transaction and makes retries safe.
    """
    if body.checkpoint.get("tournamentId") != str(tournament_id):
        _raise_protocol(
            ProtocolError(409, "checkpoint_scope_mismatch", "Checkpoint tournament does not match path")
        )
    try:
        authority = SyncApplication(repo).import_checkpoint(
            checkpoint=body.checkpoint,
            node_id=body.node_id,
            authority_epoch=body.authority_epoch,
            capability=body.capability,
            checkpoint_hash=body.checkpoint_hash,
            authority_grant=body.authority_grant,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return AuthorityStatus(
        tournament_id=tournament_id,
        node_id=authority.node_id,
        authority_epoch=authority.epoch,
        state=authority.state,
        checkpoint_hash=authority.checkpoint_hash,
    )


@authority_router.get(
    "/status",
    response_model=AuthorityStatus,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def authority_status(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> AuthorityStatus:
    try:
        authority, highest, pending, oldest, blocked, blocked_error = (
            SyncApplication(repo).latest_authority(tournament_id)
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return AuthorityStatus(
        tournament_id=tournament_id,
        node_id=authority.node_id,
        authority_epoch=authority.epoch,
        state=authority.state,
        checkpoint_hash=authority.checkpoint_hash,
        highest_contiguous_sequence=highest,
        pending_operations=pending,
        oldest_pending_at=oldest,
        blocked_operations=blocked,
        last_blocked_error_code=blocked_error,
    )


@authority_router.get(
    "/projection",
    response_model=CloudProjectionResponse,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def cloud_projection(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> CloudProjectionResponse:
    try:
        projection = SyncApplication(repo).projection(tournament_id)
    except ProtocolError as exc:
        _raise_protocol(exc)
    return CloudProjectionResponse(
        tournament_id=tournament_id,
        authority_epoch=projection.authority_epoch,
        last_sequence=projection.last_sequence,
        data=projection.data,
        updated_at=projection.updated_at,
    )


@sync_router.post("/operations", response_model=SyncBatchResponse)
def upload_operations(
    body: SyncBatchRequest,
    tournament_id: uuid.UUID = Path(...),
    capability: str = Depends(_bearer_capability),
    repo: LocalRepository = Depends(get_repository),
) -> SyncBatchResponse:
    try:
        highest, accepted, duplicates = SyncApplication(repo).upload(
            tournament_id=tournament_id,
            capability=capability,
            batch=body,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return SyncBatchResponse(
        highest_contiguous_sequence=highest,
        accepted=accepted,
        duplicates=duplicates,
        next_sequence=highest + 1,
    )


@sync_router.get("/status", response_model=SyncStatusResponse)
def sync_status(
    tournament_id: uuid.UUID = Path(...),
    authority_epoch: int = Header(..., alias="X-ShuttleWorks-Authority-Epoch"),
    capability: str = Depends(_bearer_capability),
    repo: LocalRepository = Depends(get_repository),
) -> SyncStatusResponse:
    try:
        highest, quarantines = SyncApplication(repo).status(
            tournament_id=tournament_id,
            authority_epoch=authority_epoch,
            capability=capability,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return SyncStatusResponse(
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        highest_contiguous_sequence=highest,
        quarantine_count=quarantines,
    )


@sync_router.get(
    "/quarantine",
    response_model=SyncQuarantineListResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def quarantine_list(
    tournament_id: uuid.UUID = Path(...),
    include_resolved: bool = False,
    repo: LocalRepository = Depends(get_repository),
) -> SyncQuarantineListResponse:
    try:
        rows = SyncApplication(repo).list_quarantines(
            tournament_id=tournament_id,
            include_resolved=include_resolved,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return SyncQuarantineListResponse(
        items=[SyncQuarantineRecord.model_validate(row, from_attributes=True) for row in rows]
    )


@sync_router.get(
    "/quarantine/{quarantine_id}/corrections",
    response_model=SyncCorrectionCandidateListResponse,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def quarantine_correction_candidates(
    tournament_id: uuid.UUID = Path(...),
    quarantine_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> SyncCorrectionCandidateListResponse:
    try:
        rows = SyncApplication(repo).list_correction_candidates(
            tournament_id=tournament_id,
            quarantine_id=quarantine_id,
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return SyncCorrectionCandidateListResponse(
        items=[
            SyncCorrectionCandidate.model_validate(row, from_attributes=True)
            for row in rows
        ]
    )


@sync_router.post(
    "/quarantine/{quarantine_id}/resolve",
    response_model=SyncQuarantineRecord,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def quarantine_resolve(
    body: SyncQuarantineResolutionRequest,
    tournament_id: uuid.UUID = Path(...),
    quarantine_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
) -> SyncQuarantineRecord:
    actor_id = user.as_uuid()
    if actor_id is None:
        _raise_protocol(ProtocolError(422, "invalid_actor", "Current user id is not a UUID"))
    try:
        row = SyncApplication(repo).resolve_quarantine(
            tournament_id=tournament_id,
            quarantine_id=quarantine_id,
            actor_id=actor_id,
            **body.model_dump(),
        )
    except ProtocolError as exc:
        _raise_protocol(exc)
    return SyncQuarantineRecord.model_validate(row, from_attributes=True)
