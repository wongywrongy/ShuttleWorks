"""Unit tests for the ``resolve_court`` command (contract §4.2, ruling C1).

The dispute is derived, on demand, from current match rows
(``shared.court_occupancy.derive_disputes``). The resolution is persisted
through the ordinary idempotent command path
(``LocalRepository.process_resolve_court_command``). These tests cover:

- Resolving a dispute is idempotent under a repeated idempotency key.
- The dispute stops being derived once the resolution has been applied.
- Each of the three resolution actions produces the row state the contract
  names.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import Match, MatchStatus
from repositories.local import LocalRepository
from shared.court_occupancy import derive_disputes


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    from _helpers import upgrade_test_database
    upgrade_test_database(engine)
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
def tid(repo) -> uuid.UUID:
    return repo.tournaments.create(name="Resolve Court Test").id


def _seed_dispute(repo, tid):
    """Two matches PLAYING on court 1 — inserted directly, bypassing the
    write guard, exactly as a pre-existing double assignment (a desk error,
    a restored backup, a manual DB fix) would produce it. This is the
    scenario the write guard *cannot* prevent retroactively and the
    resolution flow exists to recover from."""
    repo.session.add(
        Match(tournament_id=tid, id="chosen", court_id=1, status=MatchStatus.PLAYING.value, version=1)
    )
    repo.session.add(
        Match(tournament_id=tid, id="displaced", court_id=1, status=MatchStatus.PLAYING.value, version=1)
    )
    repo.session.commit()


def _matches(repo, tid):
    return repo.matches.list_for_tournament(tid)


def test_dispute_is_derived_before_resolution(repo, tid):
    _seed_dispute(repo, tid)
    disputes = derive_disputes(_matches(repo, tid))
    assert len(disputes) == 1
    assert disputes[0].court_id == 1
    assert {c.match_key for c in disputes[0].claims} == {"chosen", "displaced"}


def test_resolving_clears_the_dispute_keep_and_move(repo, tid):
    _seed_dispute(repo, tid)
    submitted_by = uuid.uuid4()
    command_id = uuid.uuid4()

    result = repo.process_resolve_court_command(
        tournament_id=tid,
        command_id=command_id,
        chosen_match_id="chosen",
        payload={
            "action": "keep_and_move",
            "displacedMatchKeys": ["displaced"],
            "note": "moved off court 1",
        },
        seen_version=1,
        submitted_by=submitted_by,
    )
    assert result.is_replay is False
    assert result.match.id == "chosen"
    assert result.match.status == MatchStatus.PLAYING.value  # chosen untouched

    disputes = derive_disputes(_matches(repo, tid))
    assert disputes == []

    displaced = repo.session.get(Match, (tid, "displaced"))
    assert displaced.court_id is None
    assert displaced.status == MatchStatus.CALLED.value  # no longer occupying a court
    assert displaced.version == 2


def test_resolving_is_idempotent_under_a_repeated_command_id(repo, tid):
    _seed_dispute(repo, tid)
    submitted_by = uuid.uuid4()
    command_id = uuid.uuid4()
    payload = {
        "action": "keep_and_unassign",
        "displacedMatchKeys": ["displaced"],
        "note": None,
    }

    first = repo.process_resolve_court_command(
        tournament_id=tid, command_id=command_id, chosen_match_id="chosen",
        payload=payload, seen_version=1, submitted_by=submitted_by,
    )
    assert first.is_replay is False
    displaced_after_first = repo.session.get(Match, (tid, "displaced"))
    assert displaced_after_first.version == 2

    # Replay: same command_id must not reapply the mutation a second time.
    second = repo.process_resolve_court_command(
        tournament_id=tid, command_id=command_id, chosen_match_id="chosen",
        payload=payload, seen_version=1, submitted_by=submitted_by,
    )
    assert second.is_replay is True
    displaced_after_replay = repo.session.get(Match, (tid, "displaced"))
    assert displaced_after_replay.version == 2  # unchanged — not reapplied

    assert derive_disputes(_matches(repo, tid)) == []


def test_keep_and_unassign_clears_court_time_and_status(repo, tid):
    _seed_dispute(repo, tid)
    repo.process_resolve_court_command(
        tournament_id=tid, command_id=uuid.uuid4(), chosen_match_id="chosen",
        payload={"action": "keep_and_unassign", "displacedMatchKeys": ["displaced"], "note": None},
        seen_version=1, submitted_by=uuid.uuid4(),
    )
    displaced = repo.session.get(Match, (tid, "displaced"))
    assert displaced.court_id is None
    assert displaced.time_slot is None
    assert displaced.status == MatchStatus.SCHEDULED.value


def test_keep_and_finish_marks_the_displaced_match_finished(repo, tid):
    _seed_dispute(repo, tid)
    repo.process_resolve_court_command(
        tournament_id=tid, command_id=uuid.uuid4(), chosen_match_id="chosen",
        payload={"action": "keep_and_finish", "displacedMatchKeys": ["displaced"], "note": None},
        seen_version=1, submitted_by=uuid.uuid4(),
    )
    displaced = repo.session.get(Match, (tid, "displaced"))
    assert displaced.status == MatchStatus.FINISHED.value
    assert derive_disputes(_matches(repo, tid)) == []


def test_malformed_payload_is_rejected(repo, tid):
    _seed_dispute(repo, tid)
    from core.exceptions import ConflictError

    with pytest.raises(ConflictError):
        repo.process_resolve_court_command(
            tournament_id=tid, command_id=uuid.uuid4(), chosen_match_id="chosen",
            payload={"action": "not_a_real_action", "displacedMatchKeys": ["displaced"]},
            seen_version=1, submitted_by=uuid.uuid4(),
        )
