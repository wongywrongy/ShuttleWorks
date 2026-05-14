"""Unit tests for ``_LocalBracketRepo`` (T-A of the backend-merge arc).

Covers CRUD against an in-memory SQLite session for the four bracket
tables: BracketEvent, BracketParticipant, BracketMatch, BracketResult.
Mirrors the shape of ``test_repositories.py`` — same per-test fixture
that creates the full schema via ``Base.metadata.create_all`` so the
tests don't depend on Alembic.

PR 1 ships persistence only; routes wiring lands in PR 2. These tests
prove the schema round-trips the tournament product's domain objects
(PlayUnit slot trees, Participant dicts, Result records) so PR 2 can
swap the in-memory ``container`` for ``_LocalBracketRepo`` calls
without rewriting the data model.
"""
from __future__ import annotations

import sys
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# conftest.py adds backend/ to sys.path before this module is collected.
from database.models import Base
from repositories.local import LocalRepository


def _ce():
    """Resolve ``ConflictError`` against the live ``sys.modules``.

    Mirrors the helper in ``test_match_state.py`` — other test modules
    in this suite ``del sys.modules['app.*']`` at import time, so a
    module-level ``from app.exceptions import ConflictError`` here can
    bind to a stale class. The repository uses the same lookup pattern
    when raising, so ``pytest.raises(_ce())`` always matches.
    """
    mod = sys.modules.get("app.exceptions")
    if mod is None:
        from app import exceptions as mod  # noqa: F811
    return mod.ConflictError


@pytest.fixture
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
        engine.dispose()


@pytest.fixture
def repo(session):
    return LocalRepository(session)


@pytest.fixture
def tournament_id(repo: LocalRepository) -> uuid.UUID:
    return repo.tournaments.create(name="Spring Invitational").id


# ---- Events ------------------------------------------------------------


def test_list_events_empty_on_fresh_tournament(repo, tournament_id):
    assert repo.brackets.list_events(tournament_id) == []


def test_create_event_inserts_with_defaults(repo, tournament_id):
    row = repo.brackets.create_event(
        tournament_id,
        "MS",
        discipline="Men's Singles",
        format="se",
        duration_slots=2,
    )
    assert row.tournament_id == tournament_id
    assert row.id == "MS"
    assert row.discipline == "Men's Singles"
    assert row.format == "se"
    assert row.duration_slots == 2
    assert row.bracket_size is None
    assert row.seeded_count == 0
    assert row.rr_rounds is None
    assert row.config == {}
    assert row.version == 1


def test_create_event_accepts_optional_fields(repo, tournament_id):
    row = repo.brackets.create_event(
        tournament_id,
        "WD",
        discipline="Women's Doubles",
        format="rr",
        duration_slots=3,
        bracket_size=8,
        seeded_count=2,
        rr_rounds=2,
        config={"randomize": True},
    )
    assert row.bracket_size == 8
    assert row.seeded_count == 2
    assert row.rr_rounds == 2
    assert row.config == {"randomize": True}


def test_get_event_returns_existing_row(repo, tournament_id):
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    fetched = repo.brackets.get_event(tournament_id, "MS")
    assert fetched is not None
    assert fetched.id == "MS"


def test_get_event_returns_none_for_unknown(repo, tournament_id):
    assert repo.brackets.get_event(tournament_id, "XX") is None


def test_list_events_returns_events_in_id_order(repo, tournament_id):
    repo.brackets.create_event(
        tournament_id, "WS", discipline="Women's Singles", format="se", duration_slots=2
    )
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    events = repo.brackets.list_events(tournament_id)
    assert [e.id for e in events] == ["MS", "WS"]


def test_list_events_isolates_by_tournament(repo):
    t1 = repo.tournaments.create(name="One").id
    t2 = repo.tournaments.create(name="Two").id
    repo.brackets.create_event(
        t1, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    repo.brackets.create_event(
        t2, "WS", discipline="Women's Singles", format="se", duration_slots=2
    )
    assert [e.id for e in repo.brackets.list_events(t1)] == ["MS"]
    assert [e.id for e in repo.brackets.list_events(t2)] == ["WS"]


def test_delete_event_cascades_children(repo, tournament_id, session):
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    repo.brackets.bulk_create_participants(
        tournament_id,
        "MS",
        [
            {"id": "P1", "name": "Alice", "type": "PLAYER"},
            {"id": "P2", "name": "Bob", "type": "PLAYER"},
        ],
    )
    repo.brackets.bulk_create_matches(
        tournament_id,
        "MS",
        [
            {
                "id": "M1",
                "round_index": 0,
                "match_index": 0,
                "slot_a": {"participant_id": "P1"},
                "slot_b": {"participant_id": "P2"},
                "expected_duration_slots": 2,
            }
        ],
    )
    repo.brackets.record_result(
        tournament_id, "MS", "M1", winner_side="A"
    )

    deleted = repo.brackets.delete_event(tournament_id, "MS")
    assert deleted is True

    # Children removed via CASCADE.
    assert repo.brackets.list_participants(tournament_id, "MS") == []
    assert repo.brackets.list_matches(tournament_id, "MS") == []
    assert repo.brackets.list_results(tournament_id, "MS") == []


def test_delete_event_returns_false_for_unknown(repo, tournament_id):
    assert repo.brackets.delete_event(tournament_id, "XX") is False


# ---- Participants ------------------------------------------------------


def test_bulk_create_participants_round_trips(repo, tournament_id):
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    inserted = repo.brackets.bulk_create_participants(
        tournament_id,
        "MS",
        [
            {
                "id": "P1",
                "name": "Alice",
                "type": "PLAYER",
                "seed": 1,
            },
            {
                "id": "P2",
                "name": "Bob",
                "type": "PLAYER",
                "member_ids": [],
                "meta": {"club": "Riverside"},
            },
        ],
    )
    assert inserted == 2

    participants = repo.brackets.list_participants(tournament_id, "MS")
    assert [p.id for p in participants] == ["P1", "P2"]
    assert participants[0].name == "Alice"
    assert participants[0].seed == 1
    assert participants[1].meta == {"club": "Riverside"}


def test_bulk_create_participants_handles_team_type(repo, tournament_id):
    repo.brackets.create_event(
        tournament_id,
        "MD",
        discipline="Men's Doubles",
        format="se",
        duration_slots=3,
    )
    repo.brackets.bulk_create_participants(
        tournament_id,
        "MD",
        [
            {
                "id": "T1",
                "name": "Alice & Bob",
                "type": "TEAM",
                "member_ids": ["P1", "P2"],
            }
        ],
    )
    team = repo.brackets.list_participants(tournament_id, "MD")[0]
    assert team.type == "TEAM"
    assert team.member_ids == ["P1", "P2"]


def test_bulk_create_participants_empty_returns_zero(repo, tournament_id):
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    assert repo.brackets.bulk_create_participants(tournament_id, "MS", []) == 0


# ---- Matches -----------------------------------------------------------


def _seed_event_with_match_tree(repo, tournament_id):
    """4-entrant single-elimination event: 2 semis feeding 1 final."""
    repo.brackets.create_event(
        tournament_id,
        "MS",
        discipline="Men's Singles",
        format="se",
        duration_slots=2,
        bracket_size=4,
    )
    repo.brackets.bulk_create_participants(
        tournament_id,
        "MS",
        [
            {"id": f"P{i}", "name": f"Player {i}", "type": "PLAYER"}
            for i in range(1, 5)
        ],
    )
    repo.brackets.bulk_create_matches(
        tournament_id,
        "MS",
        [
            {
                "id": "SF1",
                "round_index": 0,
                "match_index": 0,
                "slot_a": {"participant_id": "P1"},
                "slot_b": {"participant_id": "P4"},
                "side_a": ["P1"],
                "side_b": ["P4"],
                "expected_duration_slots": 2,
            },
            {
                "id": "SF2",
                "round_index": 0,
                "match_index": 1,
                "slot_a": {"participant_id": "P2"},
                "slot_b": {"participant_id": "P3"},
                "side_a": ["P2"],
                "side_b": ["P3"],
                "expected_duration_slots": 2,
            },
            {
                "id": "F",
                "round_index": 1,
                "match_index": 0,
                "slot_a": {"feeder_play_unit_id": "SF1"},
                "slot_b": {"feeder_play_unit_id": "SF2"},
                "dependencies": ["SF1", "SF2"],
                "expected_duration_slots": 2,
            },
        ],
    )


def test_bulk_create_matches_round_trips_slot_tree(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    matches = repo.brackets.list_matches(tournament_id, "MS")
    assert [m.id for m in matches] == ["SF1", "SF2", "F"]
    assert matches[0].slot_a == {"participant_id": "P1"}
    assert matches[2].slot_a == {"feeder_play_unit_id": "SF1"}
    assert matches[2].dependencies == ["SF1", "SF2"]


def test_list_matches_orders_by_round_then_match_index(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    matches = repo.brackets.list_matches(tournament_id, "MS")
    rounds_and_indices = [(m.round_index, m.match_index) for m in matches]
    assert rounds_and_indices == [(0, 0), (0, 1), (1, 0)]


def test_get_match_returns_row(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    match = repo.brackets.get_match(tournament_id, "MS", "F")
    assert match is not None
    assert match.kind == "MATCH"
    assert match.version == 1


def test_get_match_returns_none_for_unknown(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    assert repo.brackets.get_match(tournament_id, "MS", "MISSING") is None


def test_update_match_resolves_downstream_slot(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    updated = repo.brackets.update_match(
        tournament_id,
        "MS",
        "F",
        {
            "slot_a": {"participant_id": "P1"},
            "side_a": ["P1"],
        },
    )
    assert updated.slot_a == {"participant_id": "P1"}
    assert updated.side_a == ["P1"]
    # version increments on every write
    assert updated.version == 2


def test_update_match_with_correct_expected_version_succeeds(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    updated = repo.brackets.update_match(
        tournament_id,
        "MS",
        "F",
        {"slot_a": {"participant_id": "P1"}},
        expected_version=1,
    )
    assert updated.version == 2


def test_update_match_with_stale_version_raises_conflict(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    repo.brackets.update_match(
        tournament_id,
        "MS",
        "F",
        {"slot_a": {"participant_id": "P1"}},
    )
    with pytest.raises(_ce()):
        repo.brackets.update_match(
            tournament_id,
            "MS",
            "F",
            {"slot_a": {"participant_id": "P2"}},
            expected_version=1,
        )


def test_update_match_unknown_id_raises_keyerror(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    with pytest.raises(KeyError):
        repo.brackets.update_match(
            tournament_id, "MS", "GHOST", {"slot_a": {"participant_id": "P1"}}
        )


def test_update_match_ignores_unknown_fields(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    updated = repo.brackets.update_match(
        tournament_id,
        "MS",
        "F",
        {"version": 99, "tournament_id": uuid.uuid4(), "slot_a": {"participant_id": "P1"}},
    )
    # version still increments by 1 (not jumped to 99); tournament_id unchanged.
    assert updated.version == 2
    assert updated.tournament_id == tournament_id


# ---- Results -----------------------------------------------------------


def test_record_result_inserts_row(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    result = repo.brackets.record_result(
        tournament_id,
        "MS",
        "SF1",
        winner_side="A",
        score={"sets": [[21, 18], [21, 19]]},
        finished_at_slot=4,
    )
    assert result.winner_side == "A"
    assert result.score == {"sets": [[21, 18], [21, 19]]}
    assert result.finished_at_slot == 4
    assert result.walkover is False


def test_record_result_handles_walkover(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    result = repo.brackets.record_result(
        tournament_id, "MS", "SF1", winner_side="A", walkover=True
    )
    assert result.walkover is True
    assert result.score is None


def test_record_result_replaces_existing(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    repo.brackets.record_result(
        tournament_id, "MS", "SF1", winner_side="A", score={"old": True}
    )
    overwritten = repo.brackets.record_result(
        tournament_id, "MS", "SF1", winner_side="B", score={"corrected": True}
    )
    assert overwritten.winner_side == "B"
    assert overwritten.score == {"corrected": True}
    # Still exactly one row for this match.
    assert len(repo.brackets.list_results(tournament_id, "MS")) == 1


def test_get_result_returns_none_when_unrecorded(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    assert repo.brackets.get_result(tournament_id, "MS", "SF1") is None


def test_list_results_orders_by_match_id(repo, tournament_id):
    _seed_event_with_match_tree(repo, tournament_id)
    repo.brackets.record_result(tournament_id, "MS", "SF2", winner_side="A")
    repo.brackets.record_result(tournament_id, "MS", "SF1", winner_side="B")
    results = repo.brackets.list_results(tournament_id, "MS")
    assert [r.bracket_match_id for r in results] == ["SF1", "SF2"]


# ---- Tenant isolation --------------------------------------------------


def test_brackets_isolated_across_tournaments(repo):
    t1 = repo.tournaments.create(name="One").id
    t2 = repo.tournaments.create(name="Two").id

    repo.brackets.create_event(
        t1, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    repo.brackets.create_event(
        t2, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    repo.brackets.bulk_create_matches(
        t1,
        "MS",
        [
            {
                "id": "M1",
                "round_index": 0,
                "match_index": 0,
                "slot_a": {"participant_id": "P1"},
                "slot_b": {"participant_id": "P2"},
                "expected_duration_slots": 2,
            }
        ],
    )

    assert repo.brackets.get_match(t1, "MS", "M1") is not None
    assert repo.brackets.get_match(t2, "MS", "M1") is None


def test_deleting_tournament_cascades_brackets(repo, tournament_id):
    """Verify ON DELETE CASCADE from tournaments → bracket_* tables."""
    repo.brackets.create_event(
        tournament_id, "MS", discipline="Men's Singles", format="se", duration_slots=2
    )
    repo.brackets.bulk_create_matches(
        tournament_id,
        "MS",
        [
            {
                "id": "M1",
                "round_index": 0,
                "match_index": 0,
                "slot_a": {"participant_id": "P1"},
                "slot_b": {"participant_id": "P2"},
                "expected_duration_slots": 2,
            }
        ],
    )
    repo.brackets.record_result(tournament_id, "MS", "M1", winner_side="A")

    # SQLite needs PRAGMA foreign_keys=ON for cascading deletes to fire.
    # Tests rely on Base.metadata.create_all + the StaticPool fixture
    # which doesn't enable the pragma — verify the ORM cascade path
    # instead (mapped relationship cascade="all, delete-orphan").
    repo.tournaments.delete(tournament_id)

    assert repo.brackets.list_events(tournament_id) == []
    assert repo.brackets.list_matches(tournament_id, "MS") == []
    assert repo.brackets.list_results(tournament_id, "MS") == []
