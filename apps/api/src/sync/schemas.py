"""Versioned transport schemas for checkout and ordered operation sync."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from sync.compatibility import (
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    MIN_SUPPORTED_SCHEMA_VERSION,
)

MAX_SYNC_BATCH_OPERATIONS = 250


class CheckoutRequest(BaseModel):
    node_id: uuid.UUID
    checkpoint_schema_version: int = Field(
        default=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        ge=MIN_SUPPORTED_SCHEMA_VERSION,
        le=CURRENT_CHECKPOINT_SCHEMA_VERSION,
    )


class CheckoutResponse(BaseModel):
    tournament_id: uuid.UUID
    node_id: uuid.UUID
    authority_epoch: int
    capability: str
    checkpoint_hash: str
    checkpoint_schema_version: int
    checkpoint: dict[str, Any]
    authority_grant: dict[str, Any]


class CheckpointImportRequest(BaseModel):
    """Capability-bound checkpoint sent to an event-node database.

    The checkpoint is deliberately carried as a JSON document rather than a
    second, subtly different DTO.  Its SHA-256 digest is the value signed by
    the authority epoch and is checked before any row is written.
    """

    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    capability: str = Field(min_length=32, max_length=512)
    checkpoint_hash: str = Field(min_length=64, max_length=64)
    checkpoint: dict[str, Any]
    authority_grant: dict[str, Any] | None = None


class DeviceEnrollmentRequest(BaseModel):
    node_id: uuid.UUID
    label: str = Field(min_length=1, max_length=120)
    # Base64url/hex encoded Ed25519 public key.  The service validates the
    # decoded material is exactly 32 bytes before persisting it.
    public_key: str = Field(min_length=32, max_length=128)


class DeviceRevocationRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    confirmation: bool = False


class DeviceResponse(BaseModel):
    node_id: uuid.UUID
    org_id: uuid.UUID
    label: str
    public_key: str
    enrolled_at: datetime
    revoked_at: datetime | None = None
    revocation_reason: str | None = None


class OfflineSessionRequest(BaseModel):
    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    ttl_hours: int = Field(default=72, ge=1, le=168)


class OfflineSessionBootstrapRequest(OfflineSessionRequest):
    """Node-local bootstrap proof used before any offline cookie exists."""

    capability: str = Field(min_length=32, max_length=512)
    operator_id: uuid.UUID


class OfflineSessionResponse(BaseModel):
    tournament_id: uuid.UUID
    node_id: uuid.UUID
    authority_epoch: int
    expires_at: datetime


class ReadyRequest(BaseModel):
    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    capability: str = Field(min_length=32, max_length=512)
    checkpoint_hash: str = Field(min_length=64, max_length=64)
    # Detached Ed25519 signature over the canonical ready proof. Optional in
    # local/dev compatibility mode; mandatory for cloud/event-node profiles.
    ready_proof: str | None = Field(default=None, min_length=40, max_length=128)


class AuthorityReturnRequest(BaseModel):
    """Evidence supplied when the director node returns control to cloud."""

    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    capability: str = Field(min_length=32, max_length=512)
    actor_id: uuid.UUID
    device_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=500)
    declared_last_sequence: int = Field(ge=0)
    snapshot_hash: str = Field(min_length=64, max_length=128)
    confirmation: bool = False


class PlannedTransferRequest(BaseModel):
    """Handoff evidence for an intentional move to another event node."""

    node_id: uuid.UUID
    new_node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    capability: str = Field(min_length=32, max_length=512)
    actor_id: uuid.UUID
    device_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=500)
    declared_last_sequence: int = Field(ge=0)
    handoff_hash: str = Field(min_length=64, max_length=128)
    confirmation: bool = False


class LostNodeRecoveryRequest(BaseModel):
    """Elevated, explicitly confirmed recovery of a missing live node."""

    new_node_id: uuid.UUID
    actor_id: uuid.UUID
    device_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=500)
    declared_last_sequence: int = Field(ge=0)
    backup_hash: str = Field(min_length=64, max_length=128)
    confirmation: bool = False


class AuthorityLifecycleResponse(BaseModel):
    action: str
    tournament_id: uuid.UUID
    previous_epoch: int
    authority_epoch: int
    node_id: uuid.UUID
    state: str
    capability: str | None = None
    checkpoint_hash: str
    highest_contiguous_sequence: int = 0


class AuthorityStatus(BaseModel):
    tournament_id: uuid.UUID
    node_id: uuid.UUID
    authority_epoch: int
    state: str
    checkpoint_hash: str
    highest_contiguous_sequence: int = 0
    pending_operations: int = 0
    oldest_pending_at: datetime | None = None


class OperationEnvelope(BaseModel):
    operation_id: uuid.UUID
    event_id: uuid.UUID
    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    sequence: int = Field(ge=1)
    actor_id: uuid.UUID
    command_type: str = Field(min_length=1, max_length=100)
    aggregate_type: str = Field(min_length=1, max_length=50)
    aggregate_id: str = Field(min_length=1, max_length=200)
    expected_version: int | None = Field(default=None, ge=0)
    payload: dict[str, Any]
    occurred_at_local: datetime
    accepted_at_node: datetime
    traceparent: str | None = Field(default=None, max_length=128)
    schema_version: int = Field(ge=MIN_SUPPORTED_SCHEMA_VERSION)


class SyncBatchRequest(BaseModel):
    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    operations: list[OperationEnvelope] = Field(
        min_length=1, max_length=MAX_SYNC_BATCH_OPERATIONS
    )


class SyncBatchResponse(BaseModel):
    highest_contiguous_sequence: int
    accepted: int
    duplicates: int
    next_sequence: int


class SyncStatusResponse(BaseModel):
    tournament_id: uuid.UUID
    authority_epoch: int
    highest_contiguous_sequence: int
    quarantine_count: int


class SyncQuarantineRecord(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    node_id: uuid.UUID | None = None
    authority_epoch: int | None = None
    operation_id: uuid.UUID | None = None
    reason_code: str
    detail: dict[str, Any] | None = None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: uuid.UUID | None = None
    resolution_operation_id: uuid.UUID | None = None
    resolution_note: str | None = None


class SyncQuarantineListResponse(BaseModel):
    items: list[SyncQuarantineRecord]


class SyncQuarantineResolutionRequest(BaseModel):
    node_id: uuid.UUID
    authority_epoch: int = Field(ge=1)
    actor_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=500)
    correction: dict[str, Any]


class CloudProjectionResponse(BaseModel):
    tournament_id: uuid.UUID
    authority_epoch: int
    last_sequence: int
    data: dict[str, Any]
    updated_at: datetime
