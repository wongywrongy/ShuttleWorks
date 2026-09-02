"""Audited authority return, transfer, and lost-node recovery invariants."""
from __future__ import annotations

import uuid

import pytest
from db.models import AuthorityTransition, Base, Tournament, TournamentAuthority
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sync.service import (
    ProtocolError,
    begin_checkout,
    cloud_projection_digest,
    mark_ready,
    planned_transfer,
    recover_lost_node,
    return_to_cloud,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _ready(session: Session, tournament_id: uuid.UUID, node_id: uuid.UUID):
    authority, capability, _ = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    mark_ready(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        checkpoint_hash=authority.checkpoint_hash,
    )
    return authority, capability


def _tournament(session: Session) -> uuid.UUID:
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Lifecycle proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    return tournament_id


def _evidence() -> dict[str, object]:
    return {
        "actor_id": uuid.uuid4(),
        "device_id": uuid.uuid4(),
        "reason": "End of event",
        "declared_last_sequence": 0,
        "snapshot_hash": "a" * 64,
        "confirmation": True,
    }


def test_return_closes_node_and_creates_audited_cloud_epoch() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)
    evidence = _evidence()
    evidence["snapshot_hash"] = cloud_projection_digest(
        session, tournament_id=tournament_id, authority_epoch=authority.epoch
    )

    previous, cloud = return_to_cloud(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        authority_epoch=authority.epoch,
        capability=capability,
        **evidence,
    )

    assert previous.state == "closed"
    assert cloud.state == "cloud"
    assert cloud.epoch == authority.epoch + 1
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "return_to_cloud"
    assert transition.from_epoch == authority.epoch
    assert transition.to_epoch == cloud.epoch
    assert transition.reason == "End of event"


def test_return_rejects_projection_hash_mismatch_without_closing_authority() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)

    with pytest.raises(ProtocolError) as raised:
        return_to_cloud(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            **_evidence(),
        )

    assert raised.value.code == "snapshot_hash_mismatch"
    assert session.get(TournamentAuthority, (tournament_id, authority.epoch)).state == "active"
    assert session.scalar(select(AuthorityTransition)) is None


def test_planned_transfer_relinquishes_old_node_and_prepares_new_epoch() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    new_node = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, old_node)

    previous, replacement, replacement_capability = planned_transfer(
        session,
        tournament_id=tournament_id,
        node_id=old_node,
        new_node_id=new_node,
        authority_epoch=authority.epoch,
        capability=capability,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Move to the backup laptop",
        declared_last_sequence=0,
        handoff_hash="b" * 64,
        confirmation=True,
    )

    assert previous.state == "closed"
    assert replacement.state == "preparing"
    assert replacement.node_id == new_node
    assert replacement_capability
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "planned_transfer"
    assert session.scalar(
        select(TournamentAuthority).where(
            TournamentAuthority.state == "active",
            TournamentAuthority.epoch == replacement.epoch,
        )
    ) is None


def test_lost_node_recovery_marks_old_epoch_recovered_and_records_gap_evidence() -> None:
    session = _session()
    tournament_id = _tournament(session)
    old_node = uuid.uuid4()
    authority, _capability = _ready(session, tournament_id, old_node)
    replacement_node = uuid.uuid4()

    previous, replacement, _ = recover_lost_node(
        session,
        tournament_id=tournament_id,
        new_node_id=replacement_node,
        actor_id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        reason="Director laptop destroyed",
        declared_last_sequence=7,
        backup_hash="c" * 64,
        confirmation=True,
    )

    assert previous.state == "recovered"
    assert replacement.state == "preparing"
    transition = session.scalar(select(AuthorityTransition))
    assert transition.transition_type == "lost_node_recovery"
    assert transition.declared_last_sequence == 7
    assert transition.detail["possiblyMissingOperations"] is True


def test_privileged_transitions_require_confirmation_and_active_capability() -> None:
    session = _session()
    tournament_id = _tournament(session)
    node_id = uuid.uuid4()
    authority, capability = _ready(session, tournament_id, node_id)
    evidence = _evidence()
    evidence["confirmation"] = False

    with pytest.raises(Exception) as raised:
        return_to_cloud(
            session,
            tournament_id=tournament_id,
            node_id=node_id,
            authority_epoch=authority.epoch,
            capability=capability,
            **evidence,
        )
    assert raised.value.code == "confirmation_required"

    # No transition was persisted by the rejected request.
    assert session.scalar(select(AuthorityTransition)) is None
