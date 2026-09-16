"""A command id is spent inside one workspace, not across all of them.

``event_operations`` was keyed on ``operation_id`` alone, so the replay guard in
``bracket/application.py`` answered a second workspace's command as a replay the
moment the id matched one another workspace had already used — the command never
ran, and the caller was told it had. The key is now
``(tournament_id, operation_id)``.
"""
from __future__ import annotations

from types import SimpleNamespace
import uuid

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from bracket.application import BracketMatchActionService
from core.config import settings
from db.models import EventOperation, SyncOutbox, Tournament
from repositories import LocalRepository


def _fixture(monkeypatch, workspaces: int = 2):
    engine = create_engine("sqlite:///:memory:")
    from _helpers import upgrade_test_database

    upgrade_test_database(engine)
    session = Session(engine, expire_on_commit=False)
    tournament_ids = [uuid.uuid4() for _ in range(workspaces)]
    for index, tournament_id in enumerate(tournament_ids):
        session.add(
            Tournament(
                id=tournament_id,
                name=f"Tenant {index}",
                data={"version": 1},
                schema_version=1,
            )
        )
    session.commit()

    assignment = SimpleNamespace(
        slot_id=4,
        court_id=None,
        duration_slots=2,
        actual_start_slot=None,
        actual_end_slot=None,
    )
    bracket_state = SimpleNamespace(
        state=SimpleNamespace(assignments={"m1": assignment}, results={})
    )

    import bracket.brackets as routes

    monkeypatch.setattr(routes, "_ensure_tournament_exists", lambda *_a: None)
    monkeypatch.setattr(routes, "_hydrate_session", lambda *_a: bracket_state)
    monkeypatch.setattr(routes, "_require_resolved_play_unit", lambda *_a, **_k: None)

    def persist(repo, tid, *, session, commit):  # noqa: ANN001
        repo.session.get(Tournament, tid).data = {"version": 2}

    monkeypatch.setattr(routes, "_persist_session_metadata", persist)
    monkeypatch.setattr(settings, "deployment_profile", "local")
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "node_id", str(uuid.uuid4()))
    monkeypatch.setattr(settings, "authority_signing_key_file", "")
    return session, tournament_ids, assignment


def _apply(session, tournament_id, operation_id, action="start"):
    return BracketMatchActionService().apply(
        LocalRepository(session),
        tournament_id,
        play_unit_id="m1",
        action=action,
        slot=None,
        actor_id=uuid.uuid4(),
        operation_id=operation_id,
    )


def test_a_second_workspace_reusing_a_burned_command_id_still_executes(monkeypatch):
    session, (first, second), assignment = _fixture(monkeypatch)
    operation_id = uuid.uuid4()

    assert _apply(session, first, operation_id).replay is False
    assignment.actual_start_slot = None
    assert _apply(session, second, operation_id).replay is False

    rows = session.scalars(
        select(EventOperation).order_by(EventOperation.tournament_id)
    ).all()
    assert {row.tournament_id for row in rows} == {first, second}
    assert {row.operation_id for row in rows} == {operation_id}
    assert session.scalar(select(func.count()).select_from(SyncOutbox)) == 2
    assert session.get(SyncOutbox, (second, operation_id)) is not None


def test_replay_inside_one_workspace_is_still_a_replay(monkeypatch):
    session, (first, _second), _assignment = _fixture(monkeypatch)
    operation_id = uuid.uuid4()

    assert _apply(session, first, operation_id).replay is False
    assert _apply(session, first, operation_id).replay is True
    assert session.scalar(select(func.count()).select_from(EventOperation)) == 1
