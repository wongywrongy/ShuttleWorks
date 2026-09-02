"""Direct Phase 3 checkout/reconnect/return rehearsal.

This deliberately uses service boundaries instead of the TestClient harness so
the proof covers durable state and signed identities without relying on HTTP
thread lifecycle behavior.
"""
from __future__ import annotations

import base64
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

class _SettingsProxy:
    def __getattr__(self, name):
        from core.config import settings as current

        return getattr(current, name)

    def __setattr__(self, name, value):
        import sys

        from core.config import settings as current

        setattr(current, name, value)
        agent_module = sys.modules.get("sync.agent")
        if agent_module is not None and agent_module.settings is not current:
            setattr(agent_module.settings, name, value)


settings = _SettingsProxy()
from db.models import (
    AuthorityTransition,
    Base,
    CloudEventProjection,
    EventOperation,
    Org,
    SyncInbox,
    SyncOutbox,
    MatchStatus,
    Tournament,
    TournamentAuthority,
)
from operations.match_state_application import MatchStateApplication
from repositories import LocalRepository
from sync import agent
from sync.schemas import SyncBatchRequest, SyncBatchResponse
from sync.service import (
    begin_checkout,
    cloud_projection_digest,
    create_ready_proof,
    enroll_device,
    import_checkpoint,
    ingest_batch,
    mark_ready,
    operation_to_envelope,
    rebuild_cloud_projection,
    return_to_cloud,
)


def _factory() -> sessionmaker:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


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


def _public_key(private: Ed25519PrivateKey) -> str:
    raw = private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def test_checkout_reconnect_drain_rebuild_and_audited_return(monkeypatch, tmp_path):
    cloud_factory = _factory()
    node_factory = _factory()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    org_id = uuid.uuid4()
    authority_signer = Ed25519PrivateKey.generate()
    node_signer = Ed25519PrivateKey.generate()
    authority_private_path = _key_file(tmp_path, "authority.pem", authority_signer)
    authority_public_path = tmp_path / "authority-public.pem"
    authority_public_path.write_bytes(
        authority_signer.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    node_private_path = _key_file(tmp_path, "node.pem", node_signer)

    with cloud_factory() as cloud:
        cloud.add(Org(id=org_id, name="Rehearsal Club"))
        cloud.add(
            Tournament(
                id=tournament_id,
                org_id=org_id,
                name="Rehearsal",
                data={"version": 2},
                schema_version=2,
            )
        )
        cloud.commit()
        enroll_device(
            cloud,
            tournament_id=tournament_id,
            node_id=node_id,
            label="Rehearsal node",
            public_key=_public_key(node_signer),
            actor_id=uuid.uuid4(),
        )
        monkeypatch.setattr(settings, "environment", "local")
        monkeypatch.setattr(settings, "deployment_profile", "cloud")
        monkeypatch.setattr(settings, "authority_signing_key_file", str(authority_private_path))
        monkeypatch.setattr(settings, "authority_signing_public_key_file", str(authority_public_path))
        authority, capability, checkpoint = begin_checkout(
            cloud, tournament_id=tournament_id, node_id=node_id
        )
        assert authority.grant and authority.grant["signature"]

    monkeypatch.setattr(settings, "node_signing_key_file", str(node_private_path))
    with node_factory() as node:
        monkeypatch.setattr(settings, "deployment_profile", "event_node")
        imported = import_checkpoint(
            node,
            checkpoint=checkpoint,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
            authority_grant=authority.grant,
        )
        assert imported.state == "active"

    ready_proof = create_ready_proof(
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        checkpoint_hash=authority.checkpoint_hash,
    )
    with cloud_factory() as cloud:
        monkeypatch.setattr(settings, "deployment_profile", "cloud")
        ready = mark_ready(
            cloud,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            checkpoint_hash=authority.checkpoint_hash,
            ready_proof=ready_proof,
        )
        assert ready.state == "active"

    with node_factory() as node:
        monkeypatch.setattr(settings, "deployment_profile", "event_node")
        monkeypatch.setattr(settings, "node_id", str(node_id))
        monkeypatch.setattr(settings, "authority_signing_key_file", str(authority_private_path))
        first = MatchStateApplication(LocalRepository(node)).update(
            tournament_id=tournament_id,
            match_id="m1",
            fields={"status": "called"},
            target_status=MatchStatus.CALLED,
            expected_version=0,
            actor_id=uuid.uuid4(),
        )
        first_version = first[1].version
        second = MatchStateApplication(LocalRepository(node)).update(
            tournament_id=tournament_id,
            match_id="m1",
            fields={"status": "started"},
            target_status=MatchStatus.PLAYING,
            expected_version=1,
            actor_id=uuid.uuid4(),
        )
        assert first_version == 1
        assert second[1].version == 2

    # Reconnect is represented by the real sync-agent selection and
    # acknowledgement paths, with the network POST replaced by the cloud
    # application boundary.
    capability_file = tmp_path / "capability"
    capability_file.write_text(capability)
    monkeypatch.setattr(agent, "SessionLocal", node_factory)
    monkeypatch.setattr(agent, "_post_batch", lambda tid, cap, operations: _post_to_cloud(
        cloud_factory,
        tid,
        cap,
        operations,
    ))
    monkeypatch.setattr(settings, "sync_cloud_url", "https://cloud.rehearsal.test")
    monkeypatch.setattr(settings, "sync_tournament_id", str(tournament_id))
    monkeypatch.setattr(settings, "node_id", str(node_id))
    monkeypatch.setattr(settings, "sync_authority_capability_file", str(capability_file))
    pending = agent.pending_batch(tournament_id, node_id)
    assert [operation.sequence for operation in pending] == [1, 2]
    assert agent.drain_once() == 2
    assert agent.drain_once() == 0
    duplicate = _post_to_cloud(cloud_factory, tournament_id, capability, pending)
    assert duplicate.accepted == 0
    assert duplicate.duplicates == 2

    with node_factory() as node:
        outbox = list(node.scalars(select(SyncOutbox)))
        assert len(outbox) == 2
        assert all(row.acknowledged_at is not None for row in outbox)
        node_operation_ids = {
            row.operation_id for row in node.scalars(select(EventOperation))
        }
        assert len(node_operation_ids) == 2

    with cloud_factory() as cloud:
        assert cloud.scalar(select(func.count()).select_from(EventOperation)) == 2
        assert cloud.scalar(select(func.count()).select_from(SyncInbox)) == 2
        assert {
            row.operation_id for row in cloud.scalars(select(EventOperation))
        } == node_operation_ids
        cloud_authority = cloud.get(TournamentAuthority, (tournament_id, authority.epoch))
        cloud.delete(cloud.get(CloudEventProjection, tournament_id))
        cloud.commit()
        rebuilt = rebuild_cloud_projection(
            cloud,
            checkpoint=checkpoint,
            checkpoint_hash=cloud_authority.checkpoint_hash,
            authority_epoch=authority.epoch,
        )
        assert rebuilt.last_sequence == 2
        assert rebuilt.data["matchStates"]["m1"]["status"] == "started"
        final_snapshot_hash = cloud_projection_digest(
            cloud, tournament_id=tournament_id, authority_epoch=authority.epoch
        )

        previous, cloud_epoch = return_to_cloud(
            cloud,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            actor_id=uuid.uuid4(),
            device_id=node_id,
            reason="Rehearsal completed",
            declared_last_sequence=2,
            snapshot_hash=final_snapshot_hash,
            confirmation=True,
        )
        assert previous.state == "closed"
        assert cloud_epoch.state == "cloud"
        assert cloud_epoch.checkpoint_hash == final_snapshot_hash
        transition = cloud.scalar(select(AuthorityTransition))
        assert transition.transition_type == "return_to_cloud"
        assert transition.declared_last_sequence == 2


def _post_to_cloud(factory, tournament_id, capability, operations):
    with factory() as cloud:
        highest, accepted, duplicates = ingest_batch(
            cloud,
            tournament_id=tournament_id,
            capability=capability,
            batch=SyncBatchRequest(
                node_id=operations[0].node_id,
                authority_epoch=operations[0].authority_epoch,
                operations=[
                    operation_to_envelope(operation)
                    for operation in operations
                ],
            ),
        )
        return SyncBatchResponse(
            highest_contiguous_sequence=highest,
            accepted=accepted,
            duplicates=duplicates,
            next_sequence=highest + 1,
        )
