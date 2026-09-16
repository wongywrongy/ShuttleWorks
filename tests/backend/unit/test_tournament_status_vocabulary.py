"""``tournaments.status`` has one vocabulary, and every write path names it."""
from __future__ import annotations

from typing import get_args
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from db.models import DEFAULT_TOURNAMENT_STATUS, TOURNAMENT_STATUSES, Tournament
from repositories import LocalRepository


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    from _helpers import upgrade_test_database

    upgrade_test_database(engine)
    return Session(engine, expire_on_commit=False)


def test_the_wire_type_and_the_column_authority_are_the_same_three_words():
    from workspaces.tournaments import TournamentStatus

    assert get_args(TournamentStatus) == TOURNAMENT_STATUSES
    assert DEFAULT_TOURNAMENT_STATUS in TOURNAMENT_STATUSES


def test_workspace_update_refuses_a_status_outside_the_vocabulary():
    session = _session()
    workspace_id = uuid.uuid4()
    session.add(Tournament(id=workspace_id, name="Status proof", data={}, schema_version=1))
    session.commit()
    repo = LocalRepository(session)

    assert session.get(Tournament, workspace_id).status == DEFAULT_TOURNAMENT_STATUS
    assert repo.tournaments.update(workspace_id, {"status": "archived"}).status == "archived"
    with pytest.raises(ValueError, match="invalid workspace status"):
        repo.tournaments.update(workspace_id, {"status": "cancelled"})
    session.expire_all()
    assert session.get(Tournament, workspace_id).status == "archived"


def test_the_blob_writer_ignores_a_status_outside_the_vocabulary():
    """Unchanged behaviour, now reading the vocabulary from one place."""
    session = _session()
    workspace_id = uuid.uuid4()
    session.add(Tournament(id=workspace_id, name="Blob proof", data={}, schema_version=1))
    session.commit()
    repo = LocalRepository(session)

    def save(status: str) -> None:
        repo.tournaments.upsert_data(
            workspace_id,
            {"setup": {"general": {"data": {"status": status}}}},
        )

    save("active")
    assert session.get(Tournament, workspace_id).status == "active"
    save("cancelled")
    assert session.get(Tournament, workspace_id).status == "active"


def test_a_checkout_checkpoint_may_not_project_an_unknown_status():
    from sync.errors import ProtocolError
    from sync.service import _checkpoint_status

    assert _checkpoint_status({}) == DEFAULT_TOURNAMENT_STATUS
    assert _checkpoint_status({"status": "archived"}) == "archived"
    with pytest.raises(ProtocolError):
        _checkpoint_status({"status": "cancelled"})
