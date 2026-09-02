"""Normalized checkout checkpoint export/import proof."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from db.models import (
    Base,
    BracketEvent,
    BracketMatch,
    BracketParticipant,
    BracketResult,
    Tournament,
    TournamentAuthority,
    TournamentMember,
    User,
)
from sync.service import (
    ProtocolError,
    begin_checkout,
    checkpoint_digest,
    checkpoint_package,
    import_checkpoint,
)


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _source() -> tuple[Session, uuid.UUID, uuid.UUID]:
    session = _session()
    tournament_id = uuid.uuid4()
    node_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Checkpoint proof",
            kind="bracket",
            data={"version": 2, "config": {"tournamentName": "Checkpoint proof"}},
            schema_version=2,
            state_version=4,
            tournament_date="2026-09-10",
            tournament_end_date="2026-09-12",
        )
    )
    session.add(
        BracketEvent(
            tournament_id=tournament_id,
            id="MS",
            discipline="Men's Singles",
            format="se",
            duration_slots=2,
            bracket_size=2,
            seeded_count=2,
            config={"randomize": False},
        )
    )
    session.add(
        BracketParticipant(
            tournament_id=tournament_id,
            bracket_event_id="MS",
            id="p1",
            name="A Player",
            type="PLAYER",
            member_ids=[],
            seed=1,
            meta={},
        )
    )
    session.add(
        BracketMatch(
            tournament_id=tournament_id,
            bracket_event_id="MS",
            id="m1",
            round_index=0,
            match_index=0,
            kind="MATCH",
            slot_a={"participant_id": "p1"},
            slot_b={"participant_id": "p2"},
            side_a=["p1"],
            side_b=["p2"],
            dependencies=[],
            expected_duration_slots=2,
            duration_variance_slots=0,
            child_unit_ids=[],
            meta={},
        )
    )
    session.add(
        BracketResult(
            tournament_id=tournament_id,
            bracket_event_id="MS",
            bracket_match_id="m1",
            winner_side="A",
            score={"sets": [[21, 18]]},
            finished_at_slot=3,
            walkover=False,
        )
    )
    session.commit()
    return session, tournament_id, node_id


def test_checkout_contains_deterministic_normalized_bracket_slice() -> None:
    session, tournament_id, node_id = _source()
    first = checkpoint_package(session.get(Tournament, tournament_id), schema_version=3, session=session)
    second = checkpoint_package(session.get(Tournament, tournament_id), schema_version=3, session=session)
    assert first == second
    assert [row["id"] for row in first["normalized"]["bracketEvents"]] == ["MS"]
    assert [row["id"] for row in first["normalized"]["bracketMatches"]] == ["m1"]
    authority, _capability, checkpoint = begin_checkout(
        session, tournament_id=tournament_id, node_id=node_id
    )
    assert authority.checkpoint_hash == checkpoint_digest(checkpoint)
    assert checkpoint["normalized"]["bracketResults"][0]["winner_side"] == "A"


def test_checkout_carries_minimal_versioned_operator_policy_without_secrets() -> None:
    session, tournament_id, _node = _source()
    user_id = uuid.uuid4()
    session.add(User(
        id=user_id,
        email="director@example.test",
        display_name="Director",
        password_hash="$argon2id$v=19$secret-must-not-travel",
    ))
    session.flush()
    session.add(TournamentMember(
        tournament_id=tournament_id, user_id=user_id, role="operator"
    ))
    session.commit()
    checkpoint = checkpoint_package(
        session.get(Tournament, tournament_id), schema_version=3, session=session
    )
    assert checkpoint["operatorPolicy"] == {
        "schemaVersion": 1,
        "members": [{
            "userId": str(user_id),
            "email": "director@example.test",
            "displayName": "Director",
            "role": "operator",
        }],
    }
    assert "password_hash" not in str(checkpoint)


def test_import_is_atomic_and_retry_is_idempotent() -> None:
    source, tournament_id, _node = _source()
    checkpoint = checkpoint_package(source.get(Tournament, tournament_id), schema_version=3, session=source)
    target = _session()
    node_id = uuid.uuid4()
    capability = "capability-" + "x" * 40
    authority = import_checkpoint(
        target,
        checkpoint=checkpoint,
        node_id=node_id,
        authority_epoch=1,
        capability=capability,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    assert authority.state == "active"
    assert target.scalar(select(BracketMatch).where(BracketMatch.tournament_id == tournament_id)).id == "m1"
    assert target.get(Tournament, tournament_id).tournament_date == "2026-09-10"
    assert import_checkpoint(
        target,
        checkpoint=checkpoint,
        node_id=node_id,
        authority_epoch=1,
        capability=capability,
        checkpoint_hash=checkpoint_digest(checkpoint),
    ).epoch == 1
    assert target.scalar(select(TournamentAuthority).where(TournamentAuthority.tournament_id == tournament_id)).epoch == 1


def test_import_provisions_operator_policy_identities() -> None:
    source, tournament_id, _node = _source()
    user_id = uuid.uuid4()
    source.add(User(id=user_id, email="node-operator@example.test", display_name="Node Operator"))
    source.flush()
    source.add(TournamentMember(tournament_id=tournament_id, user_id=user_id, role="owner"))
    source.commit()
    checkpoint = checkpoint_package(source.get(Tournament, tournament_id), schema_version=3, session=source)
    target = _session()
    import_checkpoint(
        target,
        checkpoint=checkpoint,
        node_id=uuid.uuid4(),
        authority_epoch=1,
        capability="capability-" + "x" * 40,
        checkpoint_hash=checkpoint_digest(checkpoint),
    )
    imported = target.get(User, user_id)
    assert imported is not None
    assert imported.email == "node-operator@example.test"
    assert imported.password_hash is None
    assert target.get(TournamentMember, (tournament_id, user_id)).role == "owner"


def test_corrupt_checkpoint_rejected_before_writes_and_existing_target_is_never_overwritten() -> None:
    source, tournament_id, _node = _source()
    checkpoint = checkpoint_package(source.get(Tournament, tournament_id), schema_version=3, session=source)
    target = _session()
    corrupt = {**checkpoint, "normalized": {**checkpoint["normalized"], "bracketMatches": []}}
    with pytest.raises(ProtocolError, match="digest"):
        import_checkpoint(
            target,
            checkpoint=corrupt,
            node_id=uuid.uuid4(),
            authority_epoch=1,
            capability="capability-" + "x" * 40,
            checkpoint_hash=checkpoint_digest(checkpoint),
        )
    assert target.get(Tournament, tournament_id) is None

    target.add(Tournament(id=tournament_id, name="existing", data={}, kind="bracket"))
    target.commit()
    with pytest.raises(ProtocolError, match="overwrite"):
        import_checkpoint(
            target,
            checkpoint=checkpoint,
            node_id=uuid.uuid4(),
            authority_epoch=1,
            capability="capability-" + "x" * 40,
            checkpoint_hash=checkpoint_digest(checkpoint),
        )
    assert target.get(Tournament, tournament_id).name == "existing"
