"""Application services for authority epochs and ordered operation sync.

Every mutating function owns one commit.  Callers either receive a complete
durable outcome or a typed ProtocolError; batches are validated in full before
any operation is applied, so a gap or incompatible schema cannot partially
advance the cloud cursor.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

from core.telemetry.instruments import (
    record_authority_rejection,
    record_authority_transition,
)
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from db.models import (
    AuthorityTransition,
    BracketEvent,
    BracketMatch,
    BracketParticipant,
    BracketResult,
    CloudEventProjection,
    EventNodeDevice,
    EventOperation,
    SyncCheckpoint,
    SyncInbox,
    SyncOutbox,
    SyncQuarantine,
    Tournament,
    TournamentAuthority,
    TournamentMember,
    User,
)
from identity import offline_sessions
from repositories import LocalRepository
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sync.compatibility import (
    CURRENT_OPERATION_SCHEMA_VERSION,
    supports_checkpoint_schema,
    supports_operation_schema,
)
from sync.schemas import (
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    OperationEnvelope,
    SyncBatchRequest,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProtocolError(Exception):
    def __init__(self, status_code: int, code: str, message: str, **detail: Any):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail

    def body(self) -> dict[str, Any]:
        return {"error": self.code, "message": self.message, **self.detail}


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


ALLOWED_COMMAND_CLASSES = (
    "match.record_result.v3",
    "bracket.pin.v1",
    "record_bracket_result",
    "match_state.update.v1",
    "match_state.delete.v1",
    "match_state.replace.v1",
    "match_state.reset_all.v1",
    "match_state.bulk_upsert.v1",
    "match.command.v1",
    "bracket.match_action.v1",
    "bracket.assignment.v1",
    "meet.schedule.commit.v1",
)


def _decode_key_material(raw: bytes) -> bytes:
    value = raw.strip()
    if len(value) in (64, 128):
        try:
            return bytes.fromhex(value.decode("ascii"))
        except (ValueError, UnicodeDecodeError):
            pass
    try:
        decoded = base64.urlsafe_b64decode(value + b"=" * (-len(value) % 4))
        if len(decoded) in (32, 64):
            return decoded
    except (ValueError, TypeError):
        pass
    return value


def _local_bootstrap_private_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(
        hashlib.sha256(b"shuttleworks-local-authority-bootstrap-v1").digest()
    )


def _private_signing_key() -> Ed25519PrivateKey:
    from core.config import settings

    if not settings.authority_signing_key_file:
        if settings.environment == "cloud" or settings.deployment_profile == "event_node":
            raise ProtocolError(
                503,
                "authority_signing_key_unavailable",
                "Cloud authority signing key is not configured",
            )
        return _local_bootstrap_private_key()
    try:
        raw = Path(settings.authority_signing_key_file).read_bytes()
        try:
            key = serialization.load_pem_private_key(raw, password=None)
            if isinstance(key, Ed25519PrivateKey):
                return key
        except ValueError:
            pass
        material = _decode_key_material(raw)
        if len(material) != 32:
            raise ValueError("Ed25519 private keys must contain 32 bytes")
        return Ed25519PrivateKey.from_private_bytes(material)
    except (OSError, ValueError, TypeError) as exc:
        raise ProtocolError(
            503, "authority_signing_key_unavailable", "Authority signing key cannot be loaded"
        ) from exc


def _public_verification_key() -> Ed25519PublicKey:
    from core.config import settings

    if settings.authority_signing_public_key_file:
        try:
            raw = Path(settings.authority_signing_public_key_file).read_bytes()
            try:
                key = serialization.load_pem_public_key(raw)
                if isinstance(key, Ed25519PublicKey):
                    return key
            except ValueError:
                pass
            material = _decode_key_material(raw)
            if len(material) != 32:
                raise ValueError("Ed25519 public keys must contain 32 bytes")
            return Ed25519PublicKey.from_public_bytes(material)
        except (OSError, ValueError, TypeError) as exc:
            raise ProtocolError(
                503, "authority_signing_key_unavailable", "Authority public key cannot be loaded"
            ) from exc
    if settings.environment == "cloud":
        # Cloud can verify its own grants when running import tests, but an
        # event node must configure the public key file explicitly.
        return _private_signing_key().public_key()
    return _local_bootstrap_private_key().public_key()


def _public_key_fingerprint(public_key: str) -> str:
    material = _decode_key_material(public_key.encode("utf-8"))
    if len(material) != 32:
        raise ProtocolError(422, "invalid_device_public_key", "Ed25519 public key must contain 32 bytes")
    try:
        Ed25519PublicKey.from_public_bytes(material)
    except ValueError as exc:
        raise ProtocolError(422, "invalid_device_public_key", "Ed25519 public key is invalid") from exc
    return hashlib.sha256(material).hexdigest()


def _authority_grant(
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    epoch: int,
    checkpoint_hash: str,
    checkpoint_schema_version: int,
    node_key_fingerprint: str,
) -> dict[str, Any]:
    payload = {
        "grantSchemaVersion": 1,
        "tournamentId": str(tournament_id),
        "nodeId": str(node_id),
        "authorityEpoch": epoch,
        "checkpointHash": checkpoint_hash,
        "checkpointSchemaVersion": checkpoint_schema_version,
        "allowedCommandClasses": list(ALLOWED_COMMAND_CLASSES),
        "nodeKeyFingerprint": node_key_fingerprint,
    }
    signer = _private_signing_key()
    signature = base64.urlsafe_b64encode(signer.sign(_canonical_json(payload))).decode().rstrip("=")
    return {
        **payload,
        "keyId": hashlib.sha256(
            signer.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw
            )
        ).hexdigest()[:16],
        "signature": signature,
    }


def ready_proof_payload(
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    checkpoint_hash: str,
) -> dict[str, Any]:
    """Canonical, replay-scoped statement signed by the event node."""
    return {
        "readyProofSchemaVersion": 1,
        "tournamentId": str(tournament_id),
        "nodeId": str(node_id),
        "authorityEpoch": authority_epoch,
        "checkpointHash": checkpoint_hash,
    }


def _node_private_signing_key() -> Ed25519PrivateKey:
    from core.config import settings

    if not settings.node_signing_key_file:
        if settings.environment == "cloud" or settings.deployment_profile == "event_node":
            raise ProtocolError(
                503,
                "node_signing_key_unavailable",
                "Event-node signing key is not configured",
            )
        return _local_bootstrap_private_key()
    try:
        raw = Path(settings.node_signing_key_file).read_bytes()
        try:
            key = serialization.load_pem_private_key(raw, password=None)
            if isinstance(key, Ed25519PrivateKey):
                return key
        except ValueError:
            pass
        material = _decode_key_material(raw)
        if len(material) != 32:
            raise ValueError("Ed25519 private keys must contain 32 bytes")
        return Ed25519PrivateKey.from_private_bytes(material)
    except (OSError, ValueError, TypeError) as exc:
        raise ProtocolError(
            503, "node_signing_key_unavailable", "Event-node signing key cannot be loaded"
        ) from exc


def create_ready_proof(
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    checkpoint_hash: str,
) -> str:
    """Sign a ready proof using the node's file-backed Ed25519 key."""
    signature = _node_private_signing_key().sign(
        _canonical_json(
            ready_proof_payload(
                tournament_id=tournament_id,
                node_id=node_id,
                authority_epoch=authority_epoch,
                checkpoint_hash=checkpoint_hash,
            )
        )
    )
    return base64.urlsafe_b64encode(signature).decode().rstrip("=")


def _verify_ready_proof(
    session: Session,
    *,
    tournament: Tournament,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    checkpoint_hash: str,
    ready_proof: str | None,
) -> None:
    from core.config import settings

    requires_proof = settings.environment == "cloud" or settings.deployment_profile in {
        "cloud", "event_node"
    }
    if ready_proof is None and not requires_proof:
        return
    if ready_proof is None:
        raise ProtocolError(409, "ready_proof_required", "Event node proof-of-possession is required")
    device, _fingerprint = _enrolled_device(
        session, tournament=tournament, node_id=node_id
    )
    if device is None:
        raise ProtocolError(403, "device_not_enrolled", "Event node is not enrolled")
    try:
        signature = base64.urlsafe_b64decode(
            ready_proof.encode() + b"=" * (-len(ready_proof) % 4)
        )
        material = _decode_key_material(device.public_key.encode("utf-8"))
        Ed25519PublicKey.from_public_bytes(material).verify(
            signature,
            _canonical_json(
                ready_proof_payload(
                    tournament_id=tournament_id,
                    node_id=node_id,
                    authority_epoch=authority_epoch,
                    checkpoint_hash=checkpoint_hash,
                )
            ),
        )
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise ProtocolError(403, "invalid_ready_proof", "Event node proof-of-possession is invalid") from exc


def _verify_authority_grant(
    grant: dict[str, Any],
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    epoch: int,
    checkpoint_hash: str,
    checkpoint_schema_version: int,
) -> dict[str, Any]:
    if not isinstance(grant, dict) or not grant.get("signature"):
        raise ProtocolError(409, "authority_grant_required", "Signed authority grant is required")
    expected = {
        "grantSchemaVersion": grant.get("grantSchemaVersion"),
        "tournamentId": grant.get("tournamentId"),
        "nodeId": grant.get("nodeId"),
        "authorityEpoch": grant.get("authorityEpoch"),
        "checkpointHash": grant.get("checkpointHash"),
        "checkpointSchemaVersion": grant.get("checkpointSchemaVersion"),
        "allowedCommandClasses": grant.get("allowedCommandClasses"),
        "nodeKeyFingerprint": grant.get("nodeKeyFingerprint"),
    }
    if (
        expected["tournamentId"] != str(tournament_id)
        or expected["nodeId"] != str(node_id)
        or expected["authorityEpoch"] != epoch
        or expected["checkpointHash"] != checkpoint_hash
        or expected["checkpointSchemaVersion"] != checkpoint_schema_version
        or expected["allowedCommandClasses"] != list(ALLOWED_COMMAND_CLASSES)
    ):
        raise ProtocolError(409, "authority_grant_scope_mismatch", "Authority grant scope does not match checkpoint")
    try:
        signature = base64.urlsafe_b64decode(
            str(grant["signature"]).encode() + b"=" * (-len(str(grant["signature"])) % 4)
        )
        _public_verification_key().verify(signature, _canonical_json(expected))
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise ProtocolError(403, "invalid_authority_grant_signature", "Authority grant signature is invalid") from exc
    return grant


def _checkpoint_value(value: Any) -> Any:
    """Convert ORM scalar values to stable JSON values."""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _checkpoint_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_checkpoint_value(item) for item in value]
    return value


def _serialize_rows(rows: list[Any]) -> list[dict[str, Any]]:
    """Serialize only table columns, in table order and sorted by PK."""
    columns = [column.name for column in rows[0].__table__.columns] if rows else []
    values = [
        {name: _checkpoint_value(getattr(row, name)) for name in columns}
        for row in rows
    ]
    return sorted(values, key=lambda row: tuple(str(row.get(key, "")) for key in columns))


def _normalized_bracket(session: Session, tournament_id: uuid.UUID) -> dict[str, Any]:
    """Return the complete normalized bracket slice needed by the node."""
    def rows(model: Any) -> list[Any]:
        return list(session.scalars(select(model).where(model.tournament_id == tournament_id)))

    return {
        "bracketEvents": _serialize_rows(rows(BracketEvent)),
        "bracketParticipants": _serialize_rows(rows(BracketParticipant)),
        "bracketMatches": _serialize_rows(rows(BracketMatch)),
        "bracketResults": _serialize_rows(rows(BracketResult)),
    }


def checkpoint_package(
    tournament: Tournament,
    *,
    schema_version: int,
    session: Session | None = None,
) -> dict[str, Any]:
    """Build a deterministic checkpoint including normalized bracket rows."""
    package = {
        "checkpointSchemaVersion": schema_version,
        "tournamentId": str(tournament.id),
        "stateVersion": tournament.state_version,
        "tournamentState": tournament.data,
        "tournamentRecord": _checkpoint_value({
            "name": tournament.name,
            "status": tournament.status,
            "kind": tournament.kind,
            "tournament_date": tournament.tournament_date,
            "tournament_end_date": tournament.tournament_end_date,
            "time_zone": tournament.time_zone,
            "schema_version": tournament.schema_version,
            "state_version": tournament.state_version,
        }),
    }
    package["normalized"] = (
        _normalized_bracket(session, tournament.id)
        if session is not None
        else {
            "bracketEvents": [],
            "bracketParticipants": [],
            "bracketMatches": [],
            "bracketResults": [],
        }
    )
    # An event node must be able to establish a scoped local session after
    # import.  Export only the checked-out membership policy and the minimum
    # identity fields needed by the operator console; password/reset
    # material never crosses the cloud/node boundary.  The policy has its
    # own version so it can evolve independently of the checkpoint wire.
    package["operatorPolicy"] = (
        _operator_policy_snapshot(session, tournament.id)
        if session is not None
        else {"schemaVersion": 1, "members": []}
    )
    return package


def _operator_policy_snapshot(
    session: Session, tournament_id: uuid.UUID
) -> dict[str, Any]:
    rows = session.execute(
        select(TournamentMember, User)
        .join(User, User.id == TournamentMember.user_id)
        .where(TournamentMember.tournament_id == tournament_id)
        .order_by(TournamentMember.user_id)
    ).all()
    return {
        "schemaVersion": 1,
        "members": [
            {
                "userId": str(member.user_id),
                "email": user.email,
                "displayName": user.display_name,
                "role": member.role,
            }
            for member, user in rows
        ],
    }


def checkpoint_digest(checkpoint: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(checkpoint)).hexdigest()


_CHECKPOINT_COLLECTIONS = {
    "bracketEvents": BracketEvent,
    "bracketParticipants": BracketParticipant,
    "bracketMatches": BracketMatch,
    "bracketResults": BracketResult,
}
_CHECKPOINT_DATETIME_FIELDS = {
    "created_at",
    "updated_at",
    "finished_at",
}
_CHECKPOINT_UUID_FIELDS = {"tournament_id", "entry_player_id"}


def _import_scalar(name: str, value: Any) -> Any:
    if name in _CHECKPOINT_UUID_FIELDS and value is not None:
        try:
            return uuid.UUID(str(value))
        except (TypeError, ValueError) as exc:
            raise ProtocolError(409, "invalid_checkpoint", f"Invalid UUID in {name}") from exc
    if name in _CHECKPOINT_DATETIME_FIELDS and value is not None:
        try:
            return datetime.fromisoformat(str(value))
        except ValueError as exc:
            raise ProtocolError(409, "invalid_checkpoint", f"Invalid timestamp in {name}") from exc
    return value


def _validate_checkpoint(checkpoint: dict[str, Any], expected_hash: str | None) -> uuid.UUID:
    if not isinstance(checkpoint, dict):
        record_authority_rejection("invalid_checkpoint")
        raise ProtocolError(409, "invalid_checkpoint", "Checkpoint must be an object")
    schema_version = checkpoint.get("checkpointSchemaVersion")
    if not supports_checkpoint_schema(schema_version):
        record_authority_rejection("schema")
        raise ProtocolError(409, "unsupported_checkpoint_schema", "Checkpoint schema is incompatible")
    if expected_hash is not None and not hmac.compare_digest(checkpoint_digest(checkpoint), expected_hash):
        record_authority_rejection("hash_mismatch")
        raise ProtocolError(409, "checkpoint_hash_mismatch", "Checkpoint digest does not match")
    try:
        tournament_id = uuid.UUID(str(checkpoint["tournamentId"]))
    except (KeyError, TypeError, ValueError) as exc:
        record_authority_rejection("invalid_checkpoint")
        raise ProtocolError(409, "invalid_checkpoint", "Checkpoint tournamentId is invalid") from exc
    normalized = checkpoint.get("normalized")
    if not isinstance(normalized, dict):
        record_authority_rejection("invalid_checkpoint")
        raise ProtocolError(409, "invalid_checkpoint", "Checkpoint has no normalized bracket slice")
    for collection in _CHECKPOINT_COLLECTIONS:
        if not isinstance(normalized.get(collection), list):
            record_authority_rejection("invalid_checkpoint")
            raise ProtocolError(409, "invalid_checkpoint", f"Checkpoint collection {collection} is invalid")
    policy = checkpoint.get("operatorPolicy")
    if policy is not None:
        if not isinstance(policy, dict) or policy.get("schemaVersion") != 1:
            record_authority_rejection("schema")
            raise ProtocolError(409, "unsupported_operator_policy_schema", "Operator policy schema is incompatible")
        members = policy.get("members")
        if not isinstance(members, list):
            record_authority_rejection("invalid_checkpoint")
            raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy is invalid")
        seen_user_ids: set[uuid.UUID] = set()
        for member in members:
            if not isinstance(member, dict):
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy member is invalid")
            try:
                user_id = uuid.UUID(str(member["userId"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy userId is invalid") from exc
            if user_id in seen_user_ids:
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy contains duplicate users")
            seen_user_ids.add(user_id)
            if not isinstance(member.get("email"), str) or not member["email"]:
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy email is invalid")
            if member.get("displayName") is not None and not isinstance(member["displayName"], str):
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy displayName is invalid")
            if member.get("role") not in {"viewer", "operator", "owner"}:
                raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator policy role is invalid")
    return tournament_id


def import_checkpoint(
    session: Session,
    *,
    checkpoint: dict[str, Any],
    node_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    checkpoint_hash: str,
    authority_grant: dict[str, Any] | None = None,
    on_imported: Callable[[uuid.UUID], None] | None = None,
) -> TournamentAuthority:
    """Atomically install a checked-out tournament into an event-node DB.

    A retry of the exact same import is idempotent.  Any existing tournament
    with a different digest is rejected; this prevents a partial or stale
    checkpoint from overwriting live node state.
    """
    tournament_id = _validate_checkpoint(checkpoint, checkpoint_hash)
    if authority_grant is None:
        from core.config import settings

        if settings.environment == "cloud" or settings.deployment_profile == "event_node":
            raise ProtocolError(409, "authority_grant_required", "Signed authority grant is required")
        # Explicit local/dev compatibility: use the fixed bootstrap signer,
        # then verify it through the same path as a production grant.
        authority_grant = _authority_grant(
            tournament_id=tournament_id,
            node_id=node_id,
            epoch=authority_epoch,
            checkpoint_hash=checkpoint_hash,
            checkpoint_schema_version=checkpoint["checkpointSchemaVersion"],
            node_key_fingerprint="local-bootstrap",
        )
    authority_grant = _verify_authority_grant(
        authority_grant,
        tournament_id=tournament_id,
        node_id=node_id,
        epoch=authority_epoch,
        checkpoint_hash=checkpoint_hash,
        checkpoint_schema_version=checkpoint["checkpointSchemaVersion"],
    )
    existing = session.get(Tournament, tournament_id)
    if existing is not None:
        authority = _active_authority(session, tournament_id)
        if (
            authority is not None
            and authority.epoch == authority_epoch
            and authority.node_id == node_id
            and authority.checkpoint_hash == checkpoint_hash
            and authority.grant_signature == authority_grant.get("signature")
            and capability_matches(authority, capability)
        ):
            return authority
        record_authority_rejection("target_exists")
        raise ProtocolError(409, "checkpoint_target_exists", "Refusing to overwrite an existing tournament")

    normalized = checkpoint["normalized"]
    operator_policy = checkpoint.get("operatorPolicy")
    record = checkpoint.get("tournamentRecord") or {}
    try:
        state_version = int(checkpoint.get("stateVersion", record.get("state_version", 0)))
    except (TypeError, ValueError) as exc:
        raise ProtocolError(409, "invalid_checkpoint", "Checkpoint stateVersion is invalid") from exc
    tournament = Tournament(
        id=tournament_id,
        name=record.get("name"),
        status=record.get("status", "draft"),
        kind=record.get("kind", "bracket"),
        tournament_date=record.get("tournament_date"),
        tournament_end_date=record.get("tournament_end_date"),
        time_zone=record.get("time_zone", "UTC"),
        data=checkpoint.get("tournamentState") or {},
        schema_version=int(record.get("schema_version", 2)),
        state_version=state_version,
    )
    session.add(tournament)
    try:
        # Validate and add the authority before children, so FK enforcement
        # catches malformed identities inside the same transaction.
        authority = TournamentAuthority(
            tournament_id=tournament_id,
            epoch=authority_epoch,
            node_id=node_id,
            state="active",
            checkpoint_hash=checkpoint_hash,
            checkpoint_schema_version=checkpoint["checkpointSchemaVersion"],
            capability_digest=capability_digest(capability),
            grant=authority_grant,
            grant_signature=authority_grant["signature"],
            grant_key_id=authority_grant.get("keyId"),
            allowed_command_classes=authority_grant["allowedCommandClasses"],
            ready_at=utcnow(),
        )
        session.add(authority)
        session.flush()
        if operator_policy is not None:
            for member in operator_policy["members"]:
                user_id = uuid.UUID(str(member["userId"]))
                user = session.get(User, user_id)
                if user is None:
                    # This is a node-local identity.  Do not copy password
                    # hashes or reset credentials from cloud accounts.
                    user = User(
                        id=user_id,
                        email=member["email"],
                        password_hash=None,
                        display_name=member.get("displayName"),
                        email_verified=True,
                    )
                    session.add(user)
                elif user.email != member["email"]:
                    raise ProtocolError(409, "invalid_checkpoint", "Checkpoint operator identity conflicts with node")
                session.flush()
                session.add(
                    TournamentMember(
                        tournament_id=tournament_id,
                        user_id=user_id,
                        role=member["role"],
                    )
                )
            session.flush()
        for collection, model in _CHECKPOINT_COLLECTIONS.items():
            columns = {column.name for column in model.__table__.columns}
            for raw in normalized[collection]:
                if not isinstance(raw, dict):
                    raise ProtocolError(409, "invalid_checkpoint", f"Row in {collection} is invalid")
                values = {
                    key: _import_scalar(key, value)
                    for key, value in raw.items()
                    if key in columns
                }
                if values.get("tournament_id") != tournament_id:
                    raise ProtocolError(409, "invalid_checkpoint", f"Row in {collection} has the wrong tournament")
                session.add(model(**values))
        session.commit()
    except ProtocolError:
        session.rollback()
        raise
    except Exception as exc:
        session.rollback()
        raise ProtocolError(409, "checkpoint_import_failed", "Checkpoint import was rolled back") from exc
    if on_imported is not None:
        on_imported(tournament_id)
    record_authority_transition("checkpoint_import")
    return authority


def capability_digest(capability: str) -> str:
    return hashlib.sha256(capability.encode("utf-8")).hexdigest()


def capability_matches(authority: TournamentAuthority, capability: str) -> bool:
    return hmac.compare_digest(authority.capability_digest, capability_digest(capability))


def _enrolled_device(
    session: Session, *, tournament: Tournament, node_id: uuid.UUID
) -> tuple[EventNodeDevice | None, str]:
    """Resolve a node identity and return its public-key fingerprint.

    Cloud never falls back to a caller-supplied UUID.  Local/dev mode keeps a
    deliberately explicit bootstrap path for existing single-laptop installs.
    """
    device = session.get(EventNodeDevice, node_id)
    from core.config import settings

    if device is None:
        if settings.environment == "cloud":
            raise ProtocolError(403, "device_not_enrolled", "Event node is not enrolled")
        return None, "local-bootstrap"
    if device.revoked_at is not None:
        raise ProtocolError(403, "device_revoked", "Event node enrollment is revoked")
    if tournament.org_id is None or device.org_id != tournament.org_id:
        raise ProtocolError(404, "device_not_found", "Event node is not enrolled for this organization")
    return device, _public_key_fingerprint(device.public_key)


def enroll_device(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    label: str,
    public_key: str,
    actor_id: uuid.UUID,
) -> EventNodeDevice:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise ProtocolError(404, "tournament_not_found", "Tournament does not exist")
    if tournament.org_id is None:
        raise ProtocolError(409, "tournament_org_required", "Tournament has no organization owner")
    _public_key_fingerprint(public_key)
    existing = session.get(EventNodeDevice, node_id)
    if existing is not None:
        raise ProtocolError(409, "device_already_enrolled", "Event node is already enrolled")
    duplicate_key = session.scalar(
        select(EventNodeDevice).where(EventNodeDevice.public_key == public_key)
    )
    if duplicate_key is not None:
        raise ProtocolError(409, "device_public_key_in_use", "Public key is already enrolled")
    device = EventNodeDevice(
        device_id=node_id,
        org_id=tournament.org_id,
        label=label.strip(),
        public_key=public_key,
        enrolled_by=actor_id,
    )
    session.add(device)
    session.commit()
    return device


def revoke_device(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    reason: str,
    confirmation: bool,
) -> EventNodeDevice:
    reason = _require_transition_evidence(
        reason=reason, confirmation=confirmation, evidence_hash=None
    )
    tournament = session.get(Tournament, tournament_id)
    device = session.get(EventNodeDevice, node_id)
    if tournament is None or device is None or tournament.org_id != device.org_id:
        raise ProtocolError(404, "device_not_found", "Event node is not enrolled for this organization")
    if device.revoked_at is None:
        device.revoked_at = utcnow()
        device.revocation_reason = reason
        session.commit()
    return device


def _active_authority(session: Session, tournament_id: uuid.UUID) -> TournamentAuthority | None:
    return session.scalar(
        select(TournamentAuthority)
        .where(
            TournamentAuthority.tournament_id == tournament_id,
            TournamentAuthority.state.in_(("preparing", "active")),
        )
        .order_by(TournamentAuthority.epoch.desc())
    )


def tournament_is_checked_out(session: Session, tournament_id: uuid.UUID) -> bool:
    """Return whether checkout has frozen cloud-side tournament writes.

    ``preparing`` is included deliberately: checkout first freezes intake and
    cloud operations, then the node imports and proves readiness.  Allowing a
    write in that interval would make the checkpoint stale before activation.
    """
    return _active_authority(session, tournament_id) is not None


def begin_checkout(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    schema_version: int = CURRENT_CHECKPOINT_SCHEMA_VERSION,
) -> tuple[TournamentAuthority, str, dict[str, Any]]:
    if not supports_checkpoint_schema(schema_version):
        record_authority_rejection("schema")
        raise ProtocolError(409, "unsupported_checkpoint_schema", "Checkpoint schema is incompatible")
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        record_authority_rejection("not_found")
        raise ProtocolError(404, "tournament_not_found", "Tournament does not exist")
    _device, node_key_fingerprint = _enrolled_device(
        session, tournament=tournament, node_id=node_id
    )
    active = _active_authority(session, tournament_id)
    if active is not None:
        record_authority_rejection("already_granted")
        raise ProtocolError(
            409,
            "authority_already_granted",
            "Tournament already has an active or preparing authority",
            node_id=str(active.node_id),
            authority_epoch=active.epoch,
        )
    latest = session.scalar(
        select(func.max(TournamentAuthority.epoch)).where(
            TournamentAuthority.tournament_id == tournament_id
        )
    )
    epoch = int(latest or 0) + 1
    checkpoint = checkpoint_package(
        tournament, schema_version=schema_version, session=session
    )
    digest = checkpoint_digest(checkpoint)
    grant = _authority_grant(
        tournament_id=tournament_id,
        node_id=node_id,
        epoch=epoch,
        checkpoint_hash=digest,
        checkpoint_schema_version=schema_version,
        node_key_fingerprint=node_key_fingerprint,
    )
    capability = secrets.token_urlsafe(48)
    authority = TournamentAuthority(
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=node_id,
        state="preparing",
        checkpoint_hash=digest,
        checkpoint_schema_version=schema_version,
        capability_digest=capability_digest(capability),
        grant=grant,
        grant_signature=grant["signature"],
        grant_key_id=grant["keyId"],
        allowed_command_classes=grant["allowedCommandClasses"],
    )
    session.add(authority)
    session.commit()
    record_authority_transition("checkout")
    return authority, capability, checkpoint


def mark_ready(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    checkpoint_hash: str,
    ready_proof: str | None = None,
) -> TournamentAuthority:
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None:
        record_authority_rejection("not_found")
        raise ProtocolError(404, "authority_not_found", "Authority epoch does not exist")
    if authority.node_id != node_id or not capability_matches(authority, capability):
        record_authority_rejection("invalid_capability")
        raise ProtocolError(403, "invalid_authority_capability", "Node capability is invalid")
    if authority.checkpoint_hash != checkpoint_hash:
        record_authority_rejection("hash_mismatch")
        raise ProtocolError(409, "checkpoint_hash_mismatch", "Imported checkpoint proof does not match")
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise ProtocolError(404, "tournament_not_found", "Tournament does not exist")
    _verify_ready_proof(
        session,
        tournament=tournament,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority_epoch,
        checkpoint_hash=checkpoint_hash,
        ready_proof=ready_proof,
    )
    if authority.state == "active":
        return authority
    if authority.state != "preparing":
        record_authority_rejection("invalid_state")
        raise ProtocolError(409, "invalid_authority_state", "Authority cannot become ready")
    authority.state = "active"
    authority.ready_at = utcnow()
    session.commit()
    record_authority_transition("ready")
    return authority


# A stable sentinel keeps the cloud epoch explicit in the audit/history
# stream without pretending that the cloud is an event-node device.
CLOUD_AUTHORITY_NODE_ID = uuid.UUID(int=0)


def _require_transition_evidence(
    *, reason: str, confirmation: bool, evidence_hash: str | None
) -> str:
    reason = reason.strip()
    if not reason:
        record_authority_rejection("invalid_evidence")
        raise ProtocolError(422, "recovery_reason_required", "A reason is required")
    if not confirmation:
        record_authority_rejection("invalid_evidence")
        raise ProtocolError(
            409,
            "confirmation_required",
            "Authority transition requires explicit confirmation",
        )
    if evidence_hash is not None and (
        len(evidence_hash) not in (64, 128)
        or any(character not in "0123456789abcdefABCDEF" for character in evidence_hash)
    ):
        record_authority_rejection("invalid_evidence")
        raise ProtocolError(
            422, "invalid_evidence_hash", "Evidence hash must be a SHA-256 or SHA-512 digest"
        )
    return reason


def _require_active_capability(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    authority_epoch: int,
    node_id: uuid.UUID,
    capability: str,
) -> TournamentAuthority:
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None:
        record_authority_rejection("not_found")
        raise ProtocolError(404, "authority_not_found", "Authority epoch does not exist")
    if authority.state != "active":
        record_authority_rejection("invalid_state")
        raise ProtocolError(409, "invalid_authority_state", "Only an active authority can transition")
    if authority.node_id != node_id or not capability_matches(authority, capability):
        record_authority_rejection("invalid_capability")
        raise ProtocolError(403, "invalid_authority_capability", "Node capability is invalid")
    return authority


def _next_epoch(session: Session, tournament_id: uuid.UUID) -> int:
    latest = session.scalar(
        select(func.max(TournamentAuthority.epoch)).where(
            TournamentAuthority.tournament_id == tournament_id
        )
    )
    return int(latest or 0) + 1


def _append_transition(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    transition_type: str,
    from_epoch: int | None,
    to_epoch: int | None,
    actor_id: uuid.UUID,
    device_id: uuid.UUID,
    reason: str,
    declared_last_sequence: int | None,
    evidence_hash: str | None,
    detail: dict[str, Any] | None = None,
) -> AuthorityTransition:
    transition = AuthorityTransition(
        tournament_id=tournament_id,
        transition_type=transition_type,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        actor_id=actor_id,
        device_id=device_id,
        reason=reason,
        declared_last_sequence=declared_last_sequence,
        evidence_hash=evidence_hash,
        detail=detail,
    )
    session.add(transition)
    session.flush()
    record_authority_transition(transition_type)
    return transition


def _cloud_epoch(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    epoch: int,
    snapshot_hash: str,
) -> TournamentAuthority:
    authority = TournamentAuthority(
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=CLOUD_AUTHORITY_NODE_ID,
        state="cloud",
        checkpoint_hash=snapshot_hash,
        checkpoint_schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        capability_digest=capability_digest(secrets.token_urlsafe(48)),
        ready_at=utcnow(),
    )
    session.add(authority)
    session.flush()
    return authority


def _preparing_epoch(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    epoch: int,
    node_id: uuid.UUID,
    checkpoint_hash: str,
) -> tuple[TournamentAuthority, str]:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise ProtocolError(404, "tournament_not_found", "Tournament does not exist")
    _device, node_key_fingerprint = _enrolled_device(
        session, tournament=tournament, node_id=node_id
    )
    capability = secrets.token_urlsafe(48)
    grant = _authority_grant(
        tournament_id=tournament_id,
        node_id=node_id,
        epoch=epoch,
        checkpoint_hash=checkpoint_hash,
        checkpoint_schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        node_key_fingerprint=node_key_fingerprint,
    )
    authority = TournamentAuthority(
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=node_id,
        state="preparing",
        checkpoint_hash=checkpoint_hash,
        checkpoint_schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        capability_digest=capability_digest(capability),
        grant=grant,
        grant_signature=grant["signature"],
        grant_key_id=grant["keyId"],
        allowed_command_classes=grant["allowedCommandClasses"],
    )
    session.add(authority)
    session.flush()
    return authority, capability


def _cloud_cursor(session: Session, tournament_id: uuid.UUID, epoch: int) -> int:
    checkpoint = session.get(SyncCheckpoint, (tournament_id, epoch))
    return checkpoint.highest_contiguous_sequence if checkpoint else 0


def cloud_projection_digest(
    session: Session, *, tournament_id: uuid.UUID, authority_epoch: int
) -> str:
    """Return the deterministic digest cloud uses to confirm a final view.

    The digest binds the authority epoch, the highest contiguous accepted
    sequence, and the canonical JSON projection data.  A missing projection
    is the valid empty projection for a drained epoch with no operations;
    otherwise a stale or differently scoped projection is not eligible for
    authority return.
    """
    final_sequence = _cloud_cursor(session, tournament_id, authority_epoch)
    projection = session.get(CloudEventProjection, tournament_id)
    if projection is None:
        projection_data: dict[str, Any] = {
            "bracketResults": {},
            "matchStates": {},
        }
    else:
        if projection.authority_epoch != authority_epoch:
            raise ProtocolError(
                409,
                "projection_epoch_mismatch",
                "Cloud projection does not match the authority epoch",
                expected_authority_epoch=authority_epoch,
                actual_authority_epoch=projection.authority_epoch,
            )
        if projection.last_sequence != final_sequence:
            raise ProtocolError(
                409,
                "projection_cursor_mismatch",
                "Cloud projection does not match the final accepted sequence",
                expected_sequence=final_sequence,
                actual_sequence=projection.last_sequence,
            )
        projection_data = dict(projection.data or {})
    return hashlib.sha256(
        _canonical_json(
            {
                "authorityEpoch": authority_epoch,
                "lastSequence": final_sequence,
                "data": projection_data,
            }
        )
    ).hexdigest()


def return_to_cloud(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    actor_id: uuid.UUID,
    device_id: uuid.UUID,
    reason: str,
    declared_last_sequence: int,
    snapshot_hash: str,
    confirmation: bool,
) -> tuple[TournamentAuthority, TournamentAuthority]:
    """Close a drained node epoch and create the next cloud-controlled epoch."""
    reason = _require_transition_evidence(
        reason=reason, confirmation=confirmation, evidence_hash=snapshot_hash
    )
    authority = _require_active_capability(
        session,
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        node_id=node_id,
        capability=capability,
    )
    cloud_sequence = _cloud_cursor(session, tournament_id, authority_epoch)
    if declared_last_sequence != cloud_sequence:
        record_authority_rejection("operations_not_drained")
        raise ProtocolError(
            409,
            "operations_not_drained",
            "Cloud has not durably received the declared final sequence",
            declared_last_sequence=declared_last_sequence,
            highest_contiguous_sequence=cloud_sequence,
        )
    expected_snapshot_hash = cloud_projection_digest(
        session, tournament_id=tournament_id, authority_epoch=authority_epoch
    )
    if not hmac.compare_digest(snapshot_hash, expected_snapshot_hash):
        record_authority_rejection("snapshot_hash_mismatch")
        raise ProtocolError(
            409,
            "snapshot_hash_mismatch",
            "Cloud projection digest does not match the final snapshot",
        )
    authority.state = "closed"
    authority.closed_at = utcnow()
    epoch = _next_epoch(session, tournament_id)
    cloud = _cloud_epoch(
        session,
        tournament_id=tournament_id,
        epoch=epoch,
        snapshot_hash=snapshot_hash,
    )
    _append_transition(
        session,
        tournament_id=tournament_id,
        transition_type="return_to_cloud",
        from_epoch=authority.epoch,
        to_epoch=cloud.epoch,
        actor_id=actor_id,
        device_id=device_id,
        reason=reason,
        declared_last_sequence=declared_last_sequence,
        evidence_hash=snapshot_hash,
        detail={"cloudConfirmedSequence": cloud_sequence},
    )
    session.commit()
    return authority, cloud


def planned_transfer(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    new_node_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    actor_id: uuid.UUID,
    device_id: uuid.UUID,
    reason: str,
    declared_last_sequence: int,
    handoff_hash: str,
    confirmation: bool,
) -> tuple[TournamentAuthority, TournamentAuthority, str]:
    """Relinquish one node and prepare a replacement at a new epoch."""
    reason = _require_transition_evidence(
        reason=reason, confirmation=confirmation, evidence_hash=handoff_hash
    )
    if node_id == new_node_id:
        record_authority_rejection("same_node")
        raise ProtocolError(409, "same_authority_node", "Transfer requires a different node")
    authority = _require_active_capability(
        session,
        tournament_id=tournament_id,
        authority_epoch=authority_epoch,
        node_id=node_id,
        capability=capability,
    )
    cloud_sequence = _cloud_cursor(session, tournament_id, authority_epoch)
    if declared_last_sequence != cloud_sequence:
        record_authority_rejection("sequence_not_drained")
        raise ProtocolError(
            409,
            "operations_not_drained",
            "Cloud has not durably received the declared handoff sequence",
            declared_last_sequence=declared_last_sequence,
            highest_contiguous_sequence=cloud_sequence,
        )
    authority.state = "closed"
    authority.closed_at = utcnow()
    epoch = _next_epoch(session, tournament_id)
    replacement, replacement_capability = _preparing_epoch(
        session,
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=new_node_id,
        checkpoint_hash=handoff_hash,
    )
    _append_transition(
        session,
        tournament_id=tournament_id,
        transition_type="planned_transfer",
        from_epoch=authority.epoch,
        to_epoch=replacement.epoch,
        actor_id=actor_id,
        device_id=device_id,
        reason=reason,
        declared_last_sequence=declared_last_sequence,
        evidence_hash=handoff_hash,
        detail={"oldNodeId": str(node_id), "newNodeId": str(new_node_id)},
    )
    session.commit()
    return authority, replacement, replacement_capability


def recover_lost_node(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    new_node_id: uuid.UUID,
    actor_id: uuid.UUID,
    device_id: uuid.UUID,
    reason: str,
    declared_last_sequence: int,
    backup_hash: str,
    confirmation: bool,
) -> tuple[TournamentAuthority, TournamentAuthority, str]:
    """Revoke a lost active epoch and prepare a replacement from evidence."""
    reason = _require_transition_evidence(
        reason=reason, confirmation=confirmation, evidence_hash=backup_hash
    )
    authority = _active_authority(session, tournament_id)
    if authority is None:
        record_authority_rejection("no_active_authority")
        raise ProtocolError(409, "no_active_authority", "No active node authority can be recovered")
    if authority.node_id == new_node_id:
        record_authority_rejection("same_node")
        raise ProtocolError(409, "same_authority_node", "Recovery requires a replacement node")
    cloud_sequence = _cloud_cursor(session, tournament_id, authority.epoch)
    authority.state = "recovered"
    authority.closed_at = utcnow()
    authority.recovery_reason = reason
    epoch = _next_epoch(session, tournament_id)
    replacement, replacement_capability = _preparing_epoch(
        session,
        tournament_id=tournament_id,
        epoch=epoch,
        node_id=new_node_id,
        checkpoint_hash=backup_hash,
    )
    _append_transition(
        session,
        tournament_id=tournament_id,
        transition_type="lost_node_recovery",
        from_epoch=authority.epoch,
        to_epoch=replacement.epoch,
        actor_id=actor_id,
        device_id=device_id,
        reason=reason,
        declared_last_sequence=declared_last_sequence,
        evidence_hash=backup_hash,
        detail={
            "lostNodeId": str(authority.node_id),
            "replacementNodeId": str(new_node_id),
            "cloudHighestContiguousSequence": cloud_sequence,
            "possiblyMissingOperations": declared_last_sequence > cloud_sequence,
        },
    )
    session.commit()
    return authority, replacement, replacement_capability


def ensure_local_authority(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
) -> TournamentAuthority:
    """Create an explicit standalone epoch for backward-compatible local mode."""
    active = _active_authority(session, tournament_id)
    if active is not None:
        if active.node_id != node_id:
            record_authority_rejection("invalid_capability")
            raise ProtocolError(409, "wrong_authority_node", "Another node owns this tournament")
        return active
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        record_authority_rejection("not_found")
        raise ProtocolError(404, "tournament_not_found", "Tournament does not exist")
    _device, node_key_fingerprint = _enrolled_device(
        session, tournament=tournament, node_id=node_id
    )
    latest = session.scalar(
        select(func.max(TournamentAuthority.epoch)).where(
            TournamentAuthority.tournament_id == tournament_id
        )
    )
    checkpoint = checkpoint_package(
        tournament,
        schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        session=session,
    )
    digest = checkpoint_digest(checkpoint)
    grant = _authority_grant(
        tournament_id=tournament_id,
        node_id=node_id,
        epoch=int(latest or 0) + 1,
        checkpoint_hash=digest,
        checkpoint_schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        node_key_fingerprint=node_key_fingerprint,
    )
    authority = TournamentAuthority(
        tournament_id=tournament_id,
        epoch=int(latest or 0) + 1,
        node_id=node_id,
        state="active",
        checkpoint_hash=digest,
        checkpoint_schema_version=CURRENT_CHECKPOINT_SCHEMA_VERSION,
        capability_digest=capability_digest(secrets.token_urlsafe(48)),
        grant=grant,
        grant_signature=grant["signature"],
        grant_key_id=grant["keyId"],
        allowed_command_classes=grant["allowedCommandClasses"],
        ready_at=utcnow(),
    )
    session.add(authority)
    session.flush()
    return authority


def append_local_operation(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    node_id: uuid.UUID,
    actor_id: uuid.UUID,
    command_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any],
    expected_version: int | None,
    operation_id: uuid.UUID | None = None,
    occurred_at_local: datetime | None = None,
    traceparent: str | None = None,
) -> EventOperation:
    """Append an operation and its outbox row without committing.

    The caller owns the surrounding business transaction.  A session flush is
    enough to allocate and validate the epoch-local sequence while preserving
    atomic rollback with the result and advancement rows.
    """
    authority = ensure_local_authority(
        session, tournament_id=tournament_id, node_id=node_id
    )
    latest = session.scalar(
        select(func.max(EventOperation.sequence)).where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority.epoch,
        )
    )
    operation = EventOperation(
        operation_id=operation_id or uuid.uuid4(),
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        sequence=int(latest or 0) + 1,
        actor_id=actor_id,
        command_type=command_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        expected_version=expected_version,
        payload=payload,
        occurred_at_local=occurred_at_local or utcnow(),
        accepted_at_node=utcnow(),
        traceparent=traceparent,
        schema_version=CURRENT_OPERATION_SCHEMA_VERSION,
    )
    session.add(operation)
    session.flush()
    session.add(SyncOutbox(operation_id=operation.operation_id))
    session.flush()
    return operation


def operation_to_envelope(operation: EventOperation) -> OperationEnvelope:
    return OperationEnvelope(
        operation_id=operation.operation_id,
        event_id=operation.tournament_id,
        node_id=operation.node_id,
        authority_epoch=operation.authority_epoch,
        sequence=operation.sequence,
        actor_id=operation.actor_id,
        command_type=operation.command_type,
        aggregate_type=operation.aggregate_type,
        aggregate_id=operation.aggregate_id,
        expected_version=operation.expected_version,
        payload=operation.payload,
        occurred_at_local=operation.occurred_at_local,
        accepted_at_node=operation.accepted_at_node,
        traceparent=operation.traceparent,
        schema_version=operation.schema_version,
    )


ProjectionApplier = Callable[[Session, OperationEnvelope], None]


def _apply_cloud_projection_data(
    data: dict[str, Any], operation: OperationEnvelope
) -> None:
    """Apply one already-validated operation to projection data."""
    if operation.command_type in {"record_bracket_result", "match.record_result.v3"}:
        results = dict(data.get("bracketResults") or {})
        results[operation.aggregate_id] = {
            **operation.payload,
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
            "acceptedAtNode": operation.accepted_at_node.isoformat(),
        }
        data["bracketResults"] = results
    elif operation.command_type in {
        "match_state.update.v1",
        "match_state.delete.v1",
        "match.command.v1",
    }:
        states = dict(data.get("matchStates") or {})
        states[operation.aggregate_id] = {
            **operation.payload,
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
            "acceptedAtNode": operation.accepted_at_node.isoformat(),
        }
        data["matchStates"] = states
    elif operation.command_type == "match_state.replace.v1":
        snapshot = operation.payload.get("snapshot")
        if not isinstance(snapshot, list) or not isinstance(
            operation.payload.get("resultingVersions"), dict
        ) or "sourceSchemaVersion" not in operation.payload:
            raise ProtocolError(
                409,
                "invalid_operation_payload",
                "Match-state replacement payload is invalid",
            )
        ordered_snapshot = sorted(
            (item for item in snapshot if isinstance(item, dict)),
            key=lambda item: str(item.get("matchId", "")),
        )
        if len(ordered_snapshot) != len(snapshot):
            raise ProtocolError(
                409,
                "invalid_operation_payload",
                "Match-state replacement snapshot is invalid",
            )
        expected_digest = hashlib.sha256(_canonical_json(ordered_snapshot)).hexdigest()
        if not hmac.compare_digest(
            str(operation.payload.get("snapshotDigest", "")), expected_digest
        ):
            raise ProtocolError(
                409,
                "invalid_operation_payload",
                "Match-state replacement digest is invalid",
            )
        states = {}
        for snapshot in ordered_snapshot:
            if not isinstance(snapshot, dict) or "matchId" not in snapshot:
                raise ProtocolError(409, "invalid_operation_payload", "Match-state replacement snapshot is invalid")
            match_id = str(snapshot["matchId"])
            state = {key: value for key, value in snapshot.items() if key != "matchId"}
            state["version"] = operation.payload.get("resultingVersions", {}).get(match_id)
            state["operationId"] = str(operation.operation_id)
            state["sequence"] = operation.sequence
            state["acceptedAtNode"] = operation.accepted_at_node.isoformat()
            states[match_id] = state
        data["matchStates"] = states
    elif operation.command_type == "match_state.reset_all.v1":
        states = dict(data.get("matchStates") or {})
        for affected in operation.payload.get("affectedMatches", []):
            match_id = str(affected["matchId"])
            states[match_id] = {
                "status": "scheduled",
                "deleted": True,
                "version": affected.get("version"),
                "operationId": str(operation.operation_id),
                "sequence": operation.sequence,
                "acceptedAtNode": operation.accepted_at_node.isoformat(),
            }
        data["matchStates"] = states
    elif operation.command_type == "match_state.bulk_upsert.v1":
        states = dict(data.get("matchStates") or {})
        for match_id, payload in operation.payload.get("updates", {}).items():
            key = str(match_id)
            states[key] = {
                **payload,
                "version": operation.payload.get("resultingVersions", {}).get(key),
                "operationId": str(operation.operation_id),
                "sequence": operation.sequence,
                "acceptedAtNode": operation.accepted_at_node.isoformat(),
            }
        data["matchStates"] = states
    elif operation.command_type == "meet.schedule.commit.v1":
        # A schedule commit payload is a complete deterministic projection,
        # not a row-level patch.  Replaying the latest accepted commit is
        # therefore sufficient to rebuild the cloud's read-only schedule.
        data["schedule"] = {
            **operation.payload,
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
            "acceptedAtNode": operation.accepted_at_node.isoformat(),
        }
    elif operation.command_type == "bracket.pin.v1":
        # A pin is a planning-only mutation. The complete deterministic
        # bracket snapshot is the replayable cloud projection; it must not be
        # mistaken for an Operations match assignment.
        data["bracket"] = operation.payload.get("bracketSnapshot")
        data["bracketPin"] = {
            "playUnitId": operation.payload.get("playUnitId"),
            "slotId": operation.payload.get("slotId"),
            "courtId": operation.payload.get("courtId"),
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
        }
    elif operation.command_type == "bracket.match_action.v1":
        actions = dict(data.get("bracketMatchActions") or {})
        actions[operation.aggregate_id] = {
            **operation.payload,
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
            "acceptedAtNode": operation.accepted_at_node.isoformat(),
        }
        data["bracketMatchActions"] = actions
    elif operation.command_type == "bracket.assignment.v1":
        assignments = dict(data.get("bracketAssignments") or {})
        assignments[operation.aggregate_id] = {
            **operation.payload,
            "operationId": str(operation.operation_id),
            "sequence": operation.sequence,
            "acceptedAtNode": operation.accepted_at_node.isoformat(),
        }
        data["bracketAssignments"] = assignments


def apply_cloud_projection(session: Session, operation: OperationEnvelope) -> None:
    """Update the first rebuildable cloud projection for bracket results.

    Projection state is intentionally denormalized and disposable.  The live
    bracket tables remain node-authoritative; replaying checkpoint + accepted
    operations can reconstruct this row.
    """
    projection = session.get(CloudEventProjection, operation.event_id)
    if projection is None or projection.authority_epoch != operation.authority_epoch:
        projection = CloudEventProjection(
            tournament_id=operation.event_id,
            authority_epoch=operation.authority_epoch,
            last_sequence=0,
            data={"bracketResults": {}, "matchStates": {}},
        )
        session.add(projection)
    data = dict(projection.data or {})
    _apply_cloud_projection_data(data, operation)
    projection.data = data
    projection.last_sequence = operation.sequence
    projection.updated_at = utcnow()


def rebuild_cloud_projection(
    session: Session,
    *,
    checkpoint: dict[str, Any],
    checkpoint_hash: str,
    authority_epoch: int,
) -> CloudEventProjection:
    """Atomically rebuild a cloud projection from a checkpoint and receipts.

    The checkpoint supplies the immutable normalized baseline.  Only
    ``event_operations`` which also have a matching ``sync_inbox`` receipt are
    replayed, and the same scope, schema, signed-command-class, contiguous
    sequence, and epoch checks used by ingestion are enforced before the
    disposable projection row is replaced.  This intentionally does not
    mutate authoritative bracket tables or mint new operation receipts.
    """
    tournament_id = _validate_checkpoint(checkpoint, checkpoint_hash)
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None:
        raise ProtocolError(404, "authority_not_found", "Authority epoch does not exist")
    if authority.checkpoint_hash != checkpoint_hash:
        raise ProtocolError(
            409,
            "checkpoint_hash_mismatch",
            "Rebuild checkpoint does not match the authority epoch",
        )
    if authority.checkpoint_schema_version != checkpoint["checkpointSchemaVersion"]:
        raise ProtocolError(
            409,
            "unsupported_checkpoint_schema",
            "Rebuild checkpoint schema does not match the authority epoch",
        )
    if authority.state not in {"preparing", "active", "closed", "recovered", "cloud"}:
        raise ProtocolError(409, "invalid_authority_state", "Authority epoch cannot be rebuilt")

    operations = list(
        session.scalars(
            select(EventOperation)
            .where(
                EventOperation.tournament_id == tournament_id,
                EventOperation.authority_epoch == authority_epoch,
            )
            .order_by(EventOperation.sequence)
        )
    )
    inbox_rows = list(
        session.scalars(
            select(SyncInbox).where(
                SyncInbox.tournament_id == tournament_id,
                SyncInbox.authority_epoch == authority_epoch,
            )
        )
    )
    inbox_by_id = {row.operation_id: row for row in inbox_rows}
    allowed = set(authority.allowed_command_classes or ())
    expected_sequence = 1
    for operation in operations:
        if operation.sequence != expected_sequence:
            raise ProtocolError(
                409,
                "rebuild_sequence_gap",
                "Accepted operations are not contiguous",
                expected_sequence=expected_sequence,
                actual_sequence=operation.sequence,
            )
        if operation.node_id != authority.node_id:
            raise ProtocolError(409, "rebuild_scope_mismatch", "Operation node does not match authority")
        if not supports_operation_schema(operation.schema_version):
            raise ProtocolError(409, "unsupported_operation_schema", "Operation schema is incompatible")
        if operation.command_type not in allowed:
            raise ProtocolError(
                409,
                "command_class_not_granted",
                "Operation command class is outside the signed authority grant",
            )
        receipt = inbox_by_id.get(operation.operation_id)
        if (
            receipt is None
            or receipt.tournament_id != tournament_id
            or receipt.authority_epoch != authority_epoch
            or receipt.sequence != operation.sequence
        ):
            raise ProtocolError(
                409,
                "rebuild_receipt_missing",
                "Accepted operation has no matching cloud receipt",
            )
        expected_sequence += 1

    checkpoint_cursor = session.get(SyncCheckpoint, (tournament_id, authority_epoch))
    highest = expected_sequence - 1
    if checkpoint_cursor is None or checkpoint_cursor.highest_contiguous_sequence != highest:
        raise ProtocolError(
            409,
            "rebuild_cursor_mismatch",
            "Cloud sync cursor does not match accepted operations",
            expected_sequence=highest,
            actual_sequence=(
                checkpoint_cursor.highest_contiguous_sequence
                if checkpoint_cursor is not None
                else 0
            ),
        )

    data: dict[str, Any] = {
        "checkpoint": {
            "checkpointSchemaVersion": checkpoint["checkpointSchemaVersion"],
            "checkpointHash": checkpoint_hash,
            "stateVersion": checkpoint.get("stateVersion", 0),
            "normalized": checkpoint["normalized"],
        },
        "bracketResults": {},
        "matchStates": {},
    }
    for operation in operations:
        _apply_cloud_projection_data(data, operation_to_envelope(operation))

    projection = session.get(CloudEventProjection, tournament_id)
    if projection is None:
        projection = CloudEventProjection(tournament_id=tournament_id)
        session.add(projection)
    projection.authority_epoch = authority_epoch
    projection.last_sequence = highest
    projection.data = data
    projection.updated_at = utcnow()
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    return projection


def ingest_batch(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    capability: str,
    batch: SyncBatchRequest,
    apply_projection: ProjectionApplier | None = None,
) -> tuple[int, int, int]:
    authority = session.get(
        TournamentAuthority, (tournament_id, batch.authority_epoch)
    )
    if authority is None or authority.state != "active":
        # A path for a nonexistent tournament is not a sync dead-letter: it
        # has no durable parent row to attach evidence to. Existing event
        # records, however, retain every wrong-epoch operation for review.
        if session.get(Tournament, tournament_id) is not None:
            _quarantine_batch(
                session,
                tournament_id,
                batch,
                "wrong_authority_epoch",
                detail={"authorityEpoch": batch.authority_epoch},
            )
            session.commit()
        raise ProtocolError(409, "wrong_authority_epoch", "Authority epoch is not active")
    if authority.node_id != batch.node_id or not capability_matches(authority, capability):
        raise ProtocolError(403, "invalid_authority_capability", "Node capability is invalid")

    checkpoint = session.get(SyncCheckpoint, (tournament_id, batch.authority_epoch))
    current = checkpoint.highest_contiguous_sequence if checkpoint else 0
    expected = current + 1
    accepted = 0
    duplicates = 0
    new_operations: list[OperationEnvelope] = []

    for operation in batch.operations:
        if (
            operation.event_id != tournament_id
            or operation.node_id != batch.node_id
            or operation.authority_epoch != batch.authority_epoch
        ):
            _quarantine(session, tournament_id, batch, operation, "envelope_scope_mismatch")
            session.commit()
            raise ProtocolError(409, "envelope_scope_mismatch", "Operation scope does not match batch")
        if not supports_operation_schema(operation.schema_version):
            _quarantine(session, tournament_id, batch, operation, "unsupported_operation_schema")
            session.commit()
            raise ProtocolError(409, "unsupported_operation_schema", "Operation schema is incompatible")
        allowed_command_classes = set(authority.allowed_command_classes or ())
        if operation.command_type not in allowed_command_classes:
            _quarantine(
                session,
                tournament_id,
                batch,
                operation,
                "command_class_not_granted",
                detail={"commandType": operation.command_type},
            )
            session.commit()
            raise ProtocolError(
                409,
                "command_class_not_granted",
                "Operation command class is outside the signed authority grant",
            )
        existing = session.get(SyncInbox, operation.operation_id)
        if existing is not None:
            if existing.sequence <= current:
                duplicates += 1
                continue
            _quarantine(session, tournament_id, batch, operation, "operation_id_collision")
            session.commit()
            raise ProtocolError(409, "operation_id_collision", "Operation ID has conflicting sequence")
        if operation.sequence < expected:
            archived = session.get(EventOperation, operation.operation_id)
            if archived is not None:
                duplicates += 1
                continue
            _quarantine(session, tournament_id, batch, operation, "sequence_collision")
            session.commit()
            raise ProtocolError(409, "sequence_collision", "Sequence is already occupied")
        if operation.sequence != expected:
            _quarantine(
                session,
                tournament_id,
                batch,
                operation,
                "sequence_gap",
                detail={"expectedSequence": expected},
            )
            session.commit()
            raise ProtocolError(
                409,
                "sequence_gap",
                "Operation batch is not contiguous",
                expected_sequence=expected,
            )
        new_operations.append(operation)
        expected += 1

    try:
        for operation in new_operations:
            try:
                (apply_projection or apply_cloud_projection)(session, operation)
            except ProtocolError as exc:
                # Projection/application conflicts must remain visible after
                # rollback so an operator can issue a correction operation.
                session.rollback()
                _quarantine(
                    session,
                    tournament_id,
                    batch,
                    operation,
                    "version_conflict" if exc.code in {"version_conflict", "stale_version"} else "projection_apply_failed",
                    detail={"error": exc.code, "message": exc.message},
                )
                session.commit()
                raise
            except Exception as exc:
                session.rollback()
                _quarantine(
                    session,
                    tournament_id,
                    batch,
                    operation,
                    "projection_apply_failed",
                    detail={"error": type(exc).__name__, "message": str(exc)[:500]},
                )
                session.commit()
                raise ProtocolError(409, "projection_apply_failed", "Operation could not be applied") from exc
            session.add(
                EventOperation(
                    operation_id=operation.operation_id,
                    tournament_id=tournament_id,
                    node_id=operation.node_id,
                    authority_epoch=operation.authority_epoch,
                    sequence=operation.sequence,
                    actor_id=operation.actor_id,
                    command_type=operation.command_type,
                    aggregate_type=operation.aggregate_type,
                    aggregate_id=operation.aggregate_id,
                    expected_version=operation.expected_version,
                    payload=operation.payload,
                    occurred_at_local=operation.occurred_at_local,
                    accepted_at_node=operation.accepted_at_node,
                    traceparent=operation.traceparent,
                    schema_version=operation.schema_version,
                )
            )
            session.add(
                SyncInbox(
                    operation_id=operation.operation_id,
                    tournament_id=tournament_id,
                    authority_epoch=operation.authority_epoch,
                    sequence=operation.sequence,
                )
            )
            accepted += 1
        highest = expected - 1
        if checkpoint is None:
            checkpoint = SyncCheckpoint(
                tournament_id=tournament_id,
                authority_epoch=batch.authority_epoch,
                highest_contiguous_sequence=highest,
            )
            session.add(checkpoint)
        else:
            checkpoint.highest_contiguous_sequence = highest
            checkpoint.updated_at = utcnow()
        session.commit()
    except Exception:
        session.rollback()
        raise
    return highest, accepted, duplicates


def _quarantine(
    session: Session,
    tournament_id: uuid.UUID,
    batch: SyncBatchRequest,
    operation: OperationEnvelope,
    reason: str,
    *,
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        SyncQuarantine(
            tournament_id=tournament_id,
            node_id=batch.node_id,
            authority_epoch=batch.authority_epoch,
            operation_id=operation.operation_id,
            reason_code=reason,
            detail={
                "sequence": operation.sequence,
                "schemaVersion": operation.schema_version,
                **(detail or {}),
            },
        )
    )


def _quarantine_batch(
    session: Session,
    tournament_id: uuid.UUID,
    batch: SyncBatchRequest,
    reason: str,
    *,
    detail: dict[str, Any] | None = None,
) -> None:
    for operation in batch.operations:
        _quarantine(session, tournament_id, batch, operation, reason, detail=detail)


def list_quarantines(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    include_resolved: bool = False,
) -> list[SyncQuarantine]:
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None or not capability_matches(authority, capability):
        raise ProtocolError(403, "invalid_authority_capability", "Authority capability is invalid")
    query = select(SyncQuarantine).where(SyncQuarantine.tournament_id == tournament_id)
    if not include_resolved:
        query = query.where(SyncQuarantine.status == "open")
    return list(session.scalars(query.order_by(SyncQuarantine.created_at, SyncQuarantine.id)))


def resolve_quarantine(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    quarantine_id: uuid.UUID,
    node_id: uuid.UUID,
    authority_epoch: int,
    capability: str,
    actor_id: uuid.UUID,
    reason: str,
    correction: dict[str, Any],
) -> EventOperation:
    """Resolve evidence by appending a correction operation atomically."""
    authority = session.get(TournamentAuthority, (tournament_id, authority_epoch))
    if authority is None or authority.state != "active":
        raise ProtocolError(409, "wrong_authority_epoch", "Authority epoch is not active")
    if authority.node_id != node_id or not capability_matches(authority, capability):
        raise ProtocolError(403, "invalid_authority_capability", "Authority capability is invalid")
    quarantine = session.get(SyncQuarantine, quarantine_id)
    if quarantine is None or quarantine.tournament_id != tournament_id:
        raise ProtocolError(404, "quarantine_not_found", "Quarantine record does not exist")
    if quarantine.status == "resolved":
        operation = session.get(EventOperation, quarantine.resolution_operation_id)
        if operation is None:
            raise ProtocolError(409, "invalid_quarantine_state", "Resolved quarantine has no correction operation")
        return operation
    if not reason.strip() or not correction:
        raise ProtocolError(422, "correction_required", "A reason and correction payload are required")
    latest = session.scalar(
        select(func.max(EventOperation.sequence)).where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority_epoch,
        )
    )
    operation = EventOperation(
        operation_id=uuid.uuid4(),
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority_epoch,
        sequence=int(latest or 0) + 1,
        actor_id=actor_id,
        command_type="sync.quarantine.correction.v1",
        aggregate_type="sync_quarantine",
        aggregate_id=str(quarantine.id),
        expected_version=correction.get("expectedVersion") if isinstance(correction.get("expectedVersion"), int) else None,
        payload={
            "quarantineId": str(quarantine.id),
            "reason": reason.strip(),
            "correction": correction,
        },
        occurred_at_local=utcnow(),
        accepted_at_node=utcnow(),
        schema_version=CURRENT_OPERATION_SCHEMA_VERSION,
    )
    session.add(operation)
    session.add(SyncOutbox(operation_id=operation.operation_id))
    quarantine.status = "resolved"
    quarantine.resolved_at = utcnow()
    quarantine.resolved_by = actor_id
    quarantine.resolution_operation_id = operation.operation_id
    quarantine.resolution_note = reason.strip()
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    return operation


def _latest_authority_status(session, tournament_id: uuid.UUID):
    authority = session.scalar(
        select(TournamentAuthority)
        .where(TournamentAuthority.tournament_id == tournament_id)
        .order_by(TournamentAuthority.epoch.desc())
    )
    if authority is None:
        raise ProtocolError(404, "authority_not_found", "No authority epoch exists")
    checkpoint = session.get(SyncCheckpoint, (tournament_id, authority.epoch))
    pending, oldest = session.execute(
        select(func.count(), func.min(SyncOutbox.created_at))
        .select_from(SyncOutbox)
        .join(EventOperation, EventOperation.operation_id == SyncOutbox.operation_id)
        .where(
            EventOperation.tournament_id == tournament_id,
            EventOperation.authority_epoch == authority.epoch,
            SyncOutbox.acknowledged_at.is_(None),
        )
    ).one()
    return (
        authority,
        checkpoint.highest_contiguous_sequence if checkpoint else 0,
        int(pending or 0),
        oldest,
    )


def _projection(session, tournament_id: uuid.UUID):
    return session.get(CloudEventProjection, tournament_id)


def _sync_status(session, tournament_id, authority_epoch, capability):
    authority = session.get(
        TournamentAuthority, (tournament_id, authority_epoch)
    )
    if authority is None or not capability_matches(authority, capability):
        raise ProtocolError(
            403, "invalid_authority_capability", "Node capability is invalid"
        )
    checkpoint = session.get(SyncCheckpoint, (tournament_id, authority_epoch))
    quarantines = session.scalar(
        select(func.count()).select_from(SyncQuarantine).where(
            SyncQuarantine.tournament_id == tournament_id,
            SyncQuarantine.authority_epoch == authority_epoch,
        )
    )
    return (
        checkpoint.highest_contiguous_sequence if checkpoint else 0,
        int(quarantines or 0),
    )


def _resolve_quarantine_and_get(session, **kwargs):
    quarantine_id = kwargs["quarantine_id"]
    resolve_quarantine(session, **kwargs)
    return session.get(SyncQuarantine, quarantine_id)


class SyncApplication:
    """Route-facing boundary; HTTP adapters never own transactions."""

    def __init__(self, repo: LocalRepository):
        self._repo = repo

    def checkout(self, *, tournament_id, node_id, schema_version):  # noqa: ANN001
        return self._repo.stage(
            begin_checkout,
            tournament_id=tournament_id,
            node_id=node_id,
            schema_version=schema_version,
        )

    def enroll_device(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(enroll_device, **kwargs)

    def revoke_device(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(revoke_device, **kwargs)

    def issue_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.issue, **kwargs)

    def bootstrap_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.bootstrap, **kwargs)

    def revoke_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.revoke, **kwargs)

    def import_checkpoint(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(import_checkpoint, **kwargs)

    def ready(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(mark_ready, **kwargs)

    def return_to_cloud(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(return_to_cloud, **kwargs)

    def planned_transfer(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(planned_transfer, **kwargs)

    def recover_lost_node(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(recover_lost_node, **kwargs)

    def latest_authority(
        self, tournament_id: uuid.UUID
    ) -> tuple[TournamentAuthority, int, int, datetime | None]:
        return self._repo.execute_query(_latest_authority_status, tournament_id)

    def projection(self, tournament_id: uuid.UUID) -> CloudEventProjection:
        projection = self._repo.execute_query(_projection, tournament_id)
        if projection is None:
            raise ProtocolError(
                404, "projection_not_found", "Cloud projection is not available"
            )
        return projection

    def rebuild_projection(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(rebuild_cloud_projection, **kwargs)

    def upload(self, *, tournament_id, capability, batch):  # noqa: ANN001, ANN201
        return self._repo.stage(
            ingest_batch,
            tournament_id=tournament_id,
            capability=capability,
            batch=batch,
        )

    def status(
        self,
        *,
        tournament_id: uuid.UUID,
        authority_epoch: int,
        capability: str,
    ) -> tuple[int, int]:
        return self._repo.execute_query(
            _sync_status,
            tournament_id,
            authority_epoch,
            capability,
        )

    def list_quarantines(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_query(list_quarantines, **kwargs)

    def resolve_quarantine(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(_resolve_quarantine_and_get, **kwargs)
