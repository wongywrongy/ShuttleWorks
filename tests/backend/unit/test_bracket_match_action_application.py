from __future__ import annotations

from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from bracket.application import BracketMatchActionService
from core.config import settings
from db.models import Base, EventOperation, SyncOutbox, Tournament
from repositories import LocalRepository


def _fixture(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine, expire_on_commit=False)
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Bracket action proof",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.commit()
    assignment = SimpleNamespace(
        slot_id=4,
        duration_slots=2,
        actual_start_slot=None,
        actual_end_slot=None,
    )
    bracket_state = SimpleNamespace(
        state=SimpleNamespace(
            assignments={"m1": assignment},
            results={},
        )
    )

    import bracket.brackets as routes

    monkeypatch.setattr(routes, "_ensure_tournament_exists", lambda *_args: None)
    monkeypatch.setattr(routes, "_hydrate_session", lambda *_args: bracket_state)
    monkeypatch.setattr(routes, "_require_resolved_play_unit", lambda *_args, **_kwargs: None)

    def persist(repo, tid, *, session, commit):  # noqa: ANN001
        assert commit is False
        row = repo.session.get(Tournament, tid)
        row.data = {
            "version": 2,
            "actualStartSlot": assignment.actual_start_slot,
            "actualEndSlot": assignment.actual_end_slot,
        }

    monkeypatch.setattr(routes, "_persist_session_metadata", persist)
    monkeypatch.setattr(settings, "deployment_profile", "local")
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", "")
    return session, tournament_id, assignment


def _apply(
    session: Session,
    tournament_id: uuid.UUID,
    *,
    action: str,
    operation_id: uuid.UUID,
):
    return BracketMatchActionService().apply(
        LocalRepository(session),
        tournament_id,
        play_unit_id="m1",
        action=action,
        slot=None,
        actor_id=uuid.uuid4(),
        operation_id=operation_id,
    )


def test_match_action_commits_projection_operation_and_outbox(monkeypatch) -> None:
    session, tournament_id, assignment = _fixture(monkeypatch)
    operation_id = uuid.uuid4()

    outcome = _apply(
        session,
        tournament_id,
        action="start",
        operation_id=operation_id,
    )

    operation = session.get(EventOperation, operation_id)
    assert outcome.replay is False
    assert assignment.actual_start_slot == 4
    assert session.get(Tournament, tournament_id).data["actualStartSlot"] == 4
    assert operation.command_type == "bracket.match_action.v1"
    assert operation.payload["action"] == "start"
    assert session.get(SyncOutbox, operation_id) is not None


def test_match_action_rolls_projection_back_when_operation_append_fails(
    monkeypatch,
) -> None:
    session, tournament_id, _assignment = _fixture(monkeypatch)

    def fail(*_args, **_kwargs):
        raise RuntimeError("outbox unavailable")

    monkeypatch.setattr("sync.service.append_local_operation", fail)
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        _apply(
            session,
            tournament_id,
            action="start",
            operation_id=uuid.uuid4(),
        )

    session.expire_all()
    assert session.get(Tournament, tournament_id).data == {"version": 2}
    assert session.scalar(select(EventOperation)) is None
    assert session.scalar(select(SyncOutbox)) is None


def test_command_id_replay_is_safe_but_a_new_start_after_reset_is_not_lost(
    monkeypatch,
) -> None:
    session, tournament_id, assignment = _fixture(monkeypatch)
    first_start = uuid.uuid4()
    assert not _apply(
        session,
        tournament_id,
        action="start",
        operation_id=first_start,
    ).replay
    assert _apply(
        session,
        tournament_id,
        action="start",
        operation_id=first_start,
    ).replay

    _apply(
        session,
        tournament_id,
        action="reset",
        operation_id=uuid.uuid4(),
    )
    _apply(
        session,
        tournament_id,
        action="start",
        operation_id=uuid.uuid4(),
    )

    assert assignment.actual_start_slot == 4
    assert session.query(EventOperation).count() == 3
