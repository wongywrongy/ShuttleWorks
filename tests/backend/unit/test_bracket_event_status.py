"""Status column + is_event_started predicate."""
from __future__ import annotations
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, BracketEvent, BracketMatch, BracketResult, Tournament
from services.bracket.state import is_event_started


@pytest.fixture()
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _seed_tournament(session) -> uuid.UUID:
    tid = uuid.uuid4()
    session.add(Tournament(id=tid, name="t", status="active", data={}))
    session.commit()
    return tid


def test_bracket_event_status_defaults_to_draft(session):
    tid = _seed_tournament(session)
    ev = BracketEvent(
        tournament_id=tid, id="MS", discipline="Men's Singles",
        format="se", duration_slots=1,
    )
    session.add(ev)
    session.commit()
    session.refresh(ev)
    assert ev.status == "draft"


def test_is_event_started_false_with_no_results(session):
    tid = _seed_tournament(session)
    assert is_event_started(session, tid, "MS") is False


def test_is_event_started_true_when_results_exist(session):
    tid = _seed_tournament(session)
    session.add(BracketEvent(
        tournament_id=tid, id="MS", discipline="MS",
        format="se", duration_slots=1, status="generated",
    ))
    session.add(BracketMatch(
        tournament_id=tid, bracket_event_id="MS", id="MS-R0-0",
        round_index=0, match_index=0, kind="MATCH",
        slot_a={}, slot_b={}, side_a=[], side_b=[],
        dependencies=[], expected_duration_slots=1,
        duration_variance_slots=0, child_unit_ids=[], meta={},
    ))
    session.add(BracketResult(
        tournament_id=tid, bracket_event_id="MS",
        bracket_match_id="MS-R0-0", winner_side="A",
    ))
    session.commit()
    assert is_event_started(session, tid, "MS") is True
