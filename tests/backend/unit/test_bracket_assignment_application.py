from __future__ import annotations

from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from bracket.application import BracketAssignmentService
from core.config import settings
from db.models import Base, EventOperation, Match, SyncOutbox, Tournament
from repositories import LocalRepository


def _fixture(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine, expire_on_commit=False)
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Bracket assignment proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    state = SimpleNamespace(
        state=SimpleNamespace(
            play_units={"m1": SimpleNamespace(expected_duration_slots=2)},
            assignments={},
        )
    )

    import bracket.brackets as routes

    monkeypatch.setattr(routes, "_ensure_tournament_exists", lambda *_args: None)
    monkeypatch.setattr(routes, "_hydrate_session", lambda *_args: state)
    monkeypatch.setattr(routes, "_require_resolved_play_unit", lambda *_args, **_kwargs: None)

    def persist(repo, tid, *, session, commit):  # noqa: ANN001
        assert commit is False
        assignment = session.state.assignments.get("m1")
        repo.session.get(Tournament, tid).data = {
            "version": 2,
            "assignment": (
                {
                    "courtId": assignment.court_id,
                    "slotId": assignment.slot_id,
                }
                if assignment is not None
                else None
            ),
        }

    def materialize(repo, tid, match_id, *, court_id, slot_id, commit):  # noqa: ANN001
        repo.matches.upsert(
            tid,
            match_id,
            {"court_id": court_id, "time_slot": slot_id},
            commit=commit,
        )

    monkeypatch.setattr(routes, "_persist_session_metadata", persist)
    monkeypatch.setattr(routes, "_materialize_operations_assignment", materialize)
    monkeypatch.setattr(settings, "deployment_profile", "local")
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", "")
    return session, tournament_id, state


def _apply(
    session: Session,
    tournament_id: uuid.UUID,
    *,
    action: str,
    command_id: uuid.UUID,
    court_id: int | None = None,
    slot_id: int | None = None,
):
    return BracketAssignmentService().apply(
        LocalRepository(session),
        tournament_id,
        play_unit_id="m1",
        action=action,
        court_id=court_id,
        slot_id=slot_id,
        actor_id=uuid.uuid4(),
        command_id=command_id,
    )


def test_assignment_commits_both_projections_operation_and_outbox(monkeypatch) -> None:
    session, tournament_id, _state = _fixture(monkeypatch)
    command_id = uuid.uuid4()

    _apply(
        session,
        tournament_id,
        action="assign",
        court_id=3,
        slot_id=9,
        command_id=command_id,
    )

    match = session.get(Match, (tournament_id, "m1"))
    operation = session.get(EventOperation, command_id)
    assert session.get(Tournament, tournament_id).data["assignment"] == {
        "courtId": 3,
        "slotId": 9,
    }
    assert (match.court_id, match.time_slot) == (3, 9)
    assert operation.command_type == "bracket.assignment.v1"
    assert operation.payload == {"action": "assign", "courtId": 3, "slotId": 9}
    assert session.get(SyncOutbox, command_id) is not None


def test_assignment_rolls_every_database_surface_back_on_append_failure(
    monkeypatch,
) -> None:
    session, tournament_id, _state = _fixture(monkeypatch)

    def fail(*_args, **_kwargs):
        raise RuntimeError("outbox unavailable")

    monkeypatch.setattr("sync.service.append_local_operation", fail)
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        _apply(
            session,
            tournament_id,
            action="assign",
            court_id=3,
            slot_id=9,
            command_id=uuid.uuid4(),
        )

    session.expire_all()
    assert session.get(Tournament, tournament_id).data == {"version": 2}
    assert session.scalar(select(Match)) is None
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None


def test_retry_is_idempotent_but_assign_unassign_assign_is_preserved(monkeypatch) -> None:
    session, tournament_id, state = _fixture(monkeypatch)
    first = uuid.uuid4()
    assert not _apply(
        session,
        tournament_id,
        action="assign",
        court_id=1,
        slot_id=4,
        command_id=first,
    ).replay
    assert _apply(
        session,
        tournament_id,
        action="assign",
        court_id=1,
        slot_id=4,
        command_id=first,
    ).replay
    _apply(
        session,
        tournament_id,
        action="unassign",
        command_id=uuid.uuid4(),
    )
    _apply(
        session,
        tournament_id,
        action="assign",
        court_id=2,
        slot_id=8,
        command_id=uuid.uuid4(),
    )

    assert state.state.assignments["m1"].court_id == 2
    assert session.query(EventOperation).count() == 3
    match = session.get(Match, (tournament_id, "m1"))
    assert (match.court_id, match.time_slot) == (2, 8)
