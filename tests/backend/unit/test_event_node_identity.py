"""Enrolled node identity and Ed25519 authority-grant proofs."""
from __future__ import annotations

import base64
from importlib import import_module
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from db.models import Base, Org, Tournament, TournamentAuthority
from sync.service import (
    ProtocolError,
    begin_checkout,
    enroll_device,
    import_checkpoint,
    checkpoint_digest,
    revoke_device,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _settings():
    """Return the live settings singleton after Alembic module-purge tests."""
    return import_module("core.config").settings


def _fixture(session: Session) -> tuple[uuid.UUID, uuid.UUID]:
    org_id = uuid.uuid4()
    tournament_id = uuid.uuid4()
    session.add(Org(id=org_id, name="Club"))
    session.add(
        Tournament(
            id=tournament_id,
            org_id=org_id,
            name="Identity proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    return org_id, tournament_id


def _public_key() -> tuple[str, Ed25519PrivateKey]:
    private = Ed25519PrivateKey.generate()
    raw = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return base64.urlsafe_b64encode(raw).decode().rstrip("="), private


def test_cloud_checkout_requires_active_org_enrollment(monkeypatch) -> None:
    session = _session()
    _org_id, tournament_id = _fixture(session)
    monkeypatch.setattr(_settings(), "environment", "cloud")
    with pytest.raises(ProtocolError) as raised:
        begin_checkout(session, tournament_id=tournament_id, node_id=uuid.uuid4())
    assert raised.value.code == "device_not_enrolled"


def test_revoked_device_cannot_checkout_and_public_keys_are_unique(monkeypatch) -> None:
    session = _session()
    org_id, tournament_id = _fixture(session)
    node_id = uuid.uuid4()
    public_key, _ = _public_key()
    device = enroll_device(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        label="Director laptop",
        public_key=public_key,
        actor_id=uuid.uuid4(),
    )
    assert device.org_id == org_id
    with pytest.raises(ProtocolError) as raised:
        enroll_device(
            session,
            tournament_id=tournament_id,
            node_id=uuid.uuid4(),
            label="Duplicate key",
            public_key=public_key,
            actor_id=uuid.uuid4(),
        )
    assert raised.value.code == "device_public_key_in_use"
    revoke_device(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        reason="Laptop retired",
        confirmation=True,
    )
    monkeypatch.setattr(_settings(), "environment", "cloud")
    with pytest.raises(ProtocolError) as raised:
        begin_checkout(session, tournament_id=tournament_id, node_id=node_id)
    assert raised.value.code == "device_revoked"


def test_checkout_grant_is_signed_and_import_rejects_tampering(tmp_path, monkeypatch) -> None:
    private = Ed25519PrivateKey.generate()
    private_path = tmp_path / "authority-private.pem"
    public_path = tmp_path / "authority-public.pem"
    private_path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    public_path.write_bytes(
        private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    )
    settings = _settings()
    monkeypatch.setattr(settings, "environment", "cloud")
    monkeypatch.setattr(settings, "authority_signing_key_file", str(private_path))
    monkeypatch.setattr(settings, "authority_signing_public_key_file", str(public_path))
    source = _session()
    _org_id, tournament_id = _fixture(source)
    node_id = uuid.uuid4()
    public_key, _ = _public_key()
    enroll_device(
        source,
        tournament_id=tournament_id,
        node_id=node_id,
        label="Signed node",
        public_key=public_key,
        actor_id=uuid.uuid4(),
    )
    authority, capability, checkpoint = begin_checkout(
        source, tournament_id=tournament_id, node_id=node_id
    )
    assert authority.grant["signature"]
    target = _session()
    tampered = {**authority.grant, "checkpointHash": "f" * 64}
    with pytest.raises(ProtocolError) as raised:
        import_checkpoint(
            target,
            checkpoint=checkpoint,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=checkpoint_digest(checkpoint),
            authority_grant=tampered,
        )
    assert raised.value.code == "authority_grant_scope_mismatch"
    assert target.scalar(select(TournamentAuthority)) is None
