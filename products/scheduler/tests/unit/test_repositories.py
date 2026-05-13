"""Unit tests for the repository layer against in-memory SQLite.

Covers CRUD on Tournament / MatchState / TournamentBackup plus the
``LocalRepository`` orchestration methods that mirror the legacy
PersistenceService contract (commit-with-backup, manual snapshot,
restore-from-backup).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# conftest.py adds backend/ to sys.path before this module is collected.
from database.models import Base, MatchState, Tournament, TournamentBackup
from repositories.local import LocalRepository


@pytest.fixture
def session():
    """Per-test in-memory SQLite session.

    ``StaticPool`` keeps every connection on the same in-memory DB so
    the session sees its own writes across statements.
    """
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


# ---- Tournament --------------------------------------------------------


def test_get_singleton_returns_none_on_empty_db(repo):
    assert repo.tournaments.get_singleton() is None


def test_upsert_singleton_inserts_then_updates(repo):
    first = repo.tournaments.upsert_singleton({
        "config": {"tournamentName": "First"}, "scheduleIsStale": False,
    })
    assert first.name == "First"
    assert isinstance(first.id, uuid.UUID)

    second = repo.tournaments.upsert_singleton({
        "config": {"tournamentName": "Second"}, "scheduleIsStale": False,
    })
    # Same row updated, not a new one.
    assert second.id == first.id
    assert second.name == "Second"


def test_upsert_singleton_stamps_updated_at_and_version(repo):
    row = repo.tournaments.upsert_singleton({})
    assert "updatedAt" in row.data
    assert row.data["version"] == 2
    assert row.schema_version == 2


def test_upsert_singleton_strips_legacy_integrity_field(repo):
    """``_integrity`` was the SHA stamp on JSON files; it has no analog
    in SQL and must not pollute newly persisted payloads."""
    row = repo.tournaments.upsert_singleton({"_integrity": "deadbeef"})
    assert "_integrity" not in row.data


# ---- MatchState --------------------------------------------------------


def _seed_tournament(repo: LocalRepository) -> uuid.UUID:
    return repo.tournaments.upsert_singleton({}).id


def test_match_state_upsert_and_get(repo):
    tid = _seed_tournament(repo)
    row = repo.match_states.upsert(tid, "m1", {"status": "called"})
    assert row.status == "called"

    again = repo.match_states.get(tid, "m1")
    assert again is not None
    assert again.status == "called"


def test_match_state_update_overwrites_existing(repo):
    tid = _seed_tournament(repo)
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    repo.match_states.upsert(tid, "m1", {"status": "started"})
    assert repo.match_states.get(tid, "m1").status == "started"


def test_match_state_list_returns_only_tournament_scoped_rows(repo):
    tid_a = _seed_tournament(repo)
    # Second tournament directly (bypass singleton constraint just for
    # this assertion — we want to verify the FK scoping works).
    other = Tournament(data={})
    repo.session.add(other)
    repo.session.commit()
    repo.match_states.upsert(tid_a, "m1", {"status": "called"})
    repo.match_states.upsert(other.id, "m2", {"status": "started"})

    a_rows = repo.match_states.list_for_tournament(tid_a)
    assert [r.match_id for r in a_rows] == ["m1"]


def test_match_state_delete_returns_true_then_false(repo):
    tid = _seed_tournament(repo)
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    assert repo.match_states.delete(tid, "m1") is True
    assert repo.match_states.delete(tid, "m1") is False
    assert repo.match_states.get(tid, "m1") is None


def test_match_state_reset_all_clears_only_one_tournament(repo):
    tid_a = _seed_tournament(repo)
    other = Tournament(data={})
    repo.session.add(other)
    repo.session.commit()
    repo.match_states.upsert(tid_a, "m1", {"status": "called"})
    repo.match_states.upsert(tid_a, "m2", {"status": "called"})
    repo.match_states.upsert(other.id, "m3", {"status": "called"})

    deleted = repo.match_states.reset_all(tid_a)
    assert deleted == 2
    assert repo.match_states.list_for_tournament(tid_a) == []
    # Other tournament unaffected.
    assert len(repo.match_states.list_for_tournament(other.id)) == 1


def test_match_state_bulk_upsert_inserts_and_updates(repo):
    tid = _seed_tournament(repo)
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    n = repo.match_states.bulk_upsert(tid, {
        "m1": {"status": "started"},  # existing
        "m2": {"status": "called"},   # new
    })
    assert n == 2
    listed = {r.match_id: r.status for r in repo.match_states.list_for_tournament(tid)}
    assert listed == {"m1": "started", "m2": "called"}


def test_match_state_bulk_upsert_empty_dict_is_noop(repo):
    tid = _seed_tournament(repo)
    assert repo.match_states.bulk_upsert(tid, {}) == 0


# ---- TournamentBackup --------------------------------------------------


def test_backup_create_and_list_newest_first(repo):
    tid = _seed_tournament(repo)
    b1 = repo.backups.create(tid, {"v": 1}, "tournament-a-2026-01-01.json")
    b2 = repo.backups.create(tid, {"v": 2}, "tournament-b-2026-01-02.json")
    listed = repo.backups.list_for_tournament(tid)
    # Newest first.
    assert [b.filename for b in listed] == [b2.filename, b1.filename]


def test_backup_get_by_filename(repo):
    tid = _seed_tournament(repo)
    repo.backups.create(tid, {"v": 1}, "snap-a.json")
    found = repo.backups.get_by_filename(tid, "snap-a.json")
    assert found is not None
    assert found.snapshot == {"v": 1}
    assert repo.backups.get_by_filename(tid, "missing.json") is None


def test_backup_rotate_keeps_newest_n(repo):
    tid = _seed_tournament(repo)
    for i in range(5):
        repo.backups.create(tid, {"i": i}, f"snap-{i}.json")
    deleted = repo.backups.rotate(tid, keep=3)
    assert deleted == 2
    remaining = repo.backups.list_for_tournament(tid)
    # Newest first; the two oldest (i=0, i=1) were dropped.
    assert [b.snapshot["i"] for b in remaining] == [4, 3, 2]


def test_backup_create_size_bytes_reflects_payload(repo):
    tid = _seed_tournament(repo)
    b = repo.backups.create(tid, {"key": "value"}, "snap.json")
    assert b.size_bytes > 0


# ---- LocalRepository orchestration -------------------------------------


def test_commit_tournament_state_creates_first_then_backups_prior(repo):
    # First commit — no prior, no backup created.
    row1 = repo.commit_tournament_state({"config": {"tournamentName": "A"}})
    assert repo.backups.list_for_tournament(row1.id) == []

    # Second commit — backs up the prior state.
    row2 = repo.commit_tournament_state({"config": {"tournamentName": "B"}})
    backups = repo.backups.list_for_tournament(row2.id)
    assert len(backups) == 1
    # Backup snapshots the *previous* content (name=A).
    assert backups[0].snapshot["config"]["tournamentName"] == "A"


def test_commit_tournament_state_rotates_at_keep_limit(repo):
    """Twelve commits → ten backups (1 init + 11 rotations, rotated to 10)."""
    for i in range(12):
        repo.commit_tournament_state({"config": {"tournamentName": f"T{i}"}})
    row = repo.tournaments.get_singleton()
    backups = repo.backups.list_for_tournament(row.id)
    assert len(backups) == LocalRepository.BACKUP_KEEP == 10


def test_snapshot_current_returns_none_on_empty_db(repo):
    assert repo.snapshot_current_tournament() is None


def test_snapshot_current_creates_backup_row(repo):
    repo.commit_tournament_state({"config": {"tournamentName": "X"}})
    backup = repo.snapshot_current_tournament()
    assert backup is not None
    assert backup.snapshot["config"]["tournamentName"] == "X"


def test_restore_from_backup_replaces_singleton_data(repo):
    repo.commit_tournament_state({"config": {"tournamentName": "FIRST"}})
    repo.commit_tournament_state({"config": {"tournamentName": "SECOND"}})

    backups = repo.backups.list_for_tournament(
        repo.tournaments.get_singleton().id
    )
    target = backups[-1].filename  # snapshot of FIRST
    repo.restore_tournament_from_backup(target)

    current = repo.tournaments.get_singleton()
    assert current.data["config"]["tournamentName"] == "FIRST"


def test_restore_from_backup_raises_when_filename_missing(repo):
    repo.commit_tournament_state({})
    with pytest.raises(FileNotFoundError):
        repo.restore_tournament_from_backup("no-such-file.json")


def test_restore_from_backup_raises_when_no_tournament(repo):
    with pytest.raises(FileNotFoundError):
        repo.restore_tournament_from_backup("any.json")


# ---- Cascade-delete safety ---------------------------------------------


def test_deleting_tournament_cascades_match_states_and_backups(repo):
    tid = _seed_tournament(repo)
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    repo.backups.create(tid, {"v": 1}, "snap.json")

    tournament = repo.tournaments.get_singleton()
    repo.session.delete(tournament)
    repo.session.commit()

    assert repo.session.query(MatchState).count() == 0
    assert repo.session.query(TournamentBackup).count() == 0
