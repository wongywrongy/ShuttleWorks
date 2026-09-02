"""Event-node proof-of-possession for the ready handshake."""
from __future__ import annotations

import base64
from importlib import import_module
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from db.models import Base, Org, Tournament
from sync.service import (
    ProtocolError,
    begin_checkout,
    create_ready_proof,
    enroll_device,
    mark_ready,
    revoke_device,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _settings():
    """Return the live singleton after Alembic module-purge tests."""
    return import_module("core.config").settings


def _fixture(session: Session):
    org_id = uuid.uuid4()
    tournament_id = uuid.uuid4()
    session.add(Org(id=org_id, name="Ready proof club"))
    session.add(
        Tournament(
            id=tournament_id,
            org_id=org_id,
            name="Ready proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    return tournament_id


def _key_file(tmp_path, name: str, private: Ed25519PrivateKey):
    path = tmp_path / name
    path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return path


def _enroll(session: Session, tournament_id: uuid.UUID, node_id: uuid.UUID, private):
    raw = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return enroll_device(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        label="Ready node",
        public_key=base64.urlsafe_b64encode(raw).decode().rstrip("="),
        actor_id=uuid.uuid4(),
    )


def test_cloud_ready_requires_a_valid_node_signature(monkeypatch, tmp_path) -> None:
    session = _session()
    tournament_id = _fixture(session)
    node_id = uuid.uuid4()
    private = Ed25519PrivateKey.generate()
    _enroll(session, tournament_id, node_id, private)
    authority, capability, _ = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    settings = _settings()
    monkeypatch.setattr(settings, "deployment_profile", "cloud")
    monkeypatch.setattr(settings, "node_signing_key_file", str(_key_file(tmp_path, "node.pem", private)))

    with pytest.raises(ProtocolError) as raised:
        mark_ready(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
        )
    assert raised.value.code == "ready_proof_required"

    wrong = Ed25519PrivateKey.generate()
    wrong_path = _key_file(tmp_path, "wrong.pem", wrong)
    monkeypatch.setattr(settings, "node_signing_key_file", str(wrong_path))
    with pytest.raises(ProtocolError) as raised:
        mark_ready(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
            ready_proof=create_ready_proof(
                tournament_id=tournament_id,
                node_id=node_id,
                authority_epoch=authority.epoch,
                checkpoint_hash=authority.checkpoint_hash,
            ),
        )
    assert raised.value.code == "invalid_ready_proof"

    monkeypatch.setattr(settings, "node_signing_key_file", str(_key_file(tmp_path, "node.pem", private)))
    proof = create_ready_proof(
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        checkpoint_hash=authority.checkpoint_hash,
    )
    ready = mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
        ready_proof=proof,
    )
    assert ready.state == "active"


def test_revocation_is_checked_before_ready_proof_activation(monkeypatch, tmp_path) -> None:
    session = _session()
    tournament_id = _fixture(session)
    node_id = uuid.uuid4()
    private = Ed25519PrivateKey.generate()
    _enroll(session, tournament_id, node_id, private)
    authority, capability, _ = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    revoke_device(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        reason="Node lost",
        confirmation=True,
    )
    settings = _settings()
    monkeypatch.setattr(settings, "deployment_profile", "cloud")
    monkeypatch.setattr(settings, "node_signing_key_file", str(_key_file(tmp_path, "node.pem", private)))
    with pytest.raises(ProtocolError) as raised:
        mark_ready(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
            ready_proof=create_ready_proof(
                tournament_id=tournament_id,
                node_id=node_id,
                authority_epoch=authority.epoch,
                checkpoint_hash=authority.checkpoint_hash,
            ),
        )
    assert raised.value.code == "device_revoked"
