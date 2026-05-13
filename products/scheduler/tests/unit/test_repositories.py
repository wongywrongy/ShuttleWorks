"""Unit tests for the repository layer against in-memory SQLite.

Covers CRUD on Tournament / MatchState / TournamentBackup plus the
``LocalRepository`` orchestration methods that mirror the legacy
PersistenceService contract (commit-with-backup, manual snapshot,
restore-from-backup) under explicit tournament-id scoping.
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


def _seed_tournament(repo: LocalRepository, **kwargs) -> uuid.UUID:
    return repo.tournaments.create(**kwargs).id


# ---- Tournament CRUD ---------------------------------------------------


def test_list_all_returns_empty_on_fresh_db(repo):
    assert repo.tournaments.list_all() == []


def test_create_inserts_with_defaults(repo):
    row = repo.tournaments.create()
    assert isinstance(row.id, uuid.UUID)
    assert row.name is None
    assert row.tournament_date is None
    assert row.owner_id is None
    assert row.status == "draft"
    assert row.data == {}
    assert row.schema_version == 2


def test_create_accepts_named_fields(repo):
    owner = uuid.uuid4()
    row = repo.tournaments.create(
        name="Spring Invitational",
        tournament_date="2026-04-15",
        owner_id=owner,
    )
    assert row.name == "Spring Invitational"
    assert row.tournament_date == "2026-04-15"
    assert row.owner_id == owner


def test_get_by_id_returns_row_or_none(repo):
    tid = _seed_tournament(repo, name="A")
    assert repo.tournaments.get_by_id(tid).name == "A"
    assert repo.tournaments.get_by_id(uuid.uuid4()) is None


def test_list_all_returns_newest_first(repo):
    a = repo.tournaments.create(name="A")
    b = repo.tournaments.create(name="B")
    c = repo.tournaments.create(name="C")
    listed = [t.id for t in repo.tournaments.list_all()]
    # Newest first.
    assert listed == [c.id, b.id, a.id]


def test_update_changes_whitelisted_fields_only(repo):
    tid = _seed_tournament(repo, name="Old")
    updated = repo.tournaments.update(
        tid,
        {"name": "New", "status": "active", "tournament_date": "2026-05-01"},
    )
    assert updated.name == "New"
    assert updated.status == "active"
    assert updated.tournament_date == "2026-05-01"


def test_update_ignores_unknown_fields(repo):
    tid = _seed_tournament(repo, name="X")
    updated = repo.tournaments.update(tid, {"id": uuid.uuid4(), "data": {"hax": 1}})
    # id and data are NOT in the whitelist; row remains intact.
    assert updated.id == tid
    assert updated.data == {}


def test_update_returns_none_on_missing(repo):
    assert repo.tournaments.update(uuid.uuid4(), {"name": "X"}) is None


def test_delete_returns_true_then_false(repo):
    tid = _seed_tournament(repo, name="X")
    assert repo.tournaments.delete(tid) is True
    assert repo.tournaments.delete(tid) is False


def test_upsert_data_replaces_blob_and_keeps_denormalised(repo):
    tid = _seed_tournament(repo, name="Spring", tournament_date="2026-04-01")
    row = repo.tournaments.upsert_data(
        tid,
        {
            "config": {
                "tournamentName": "Spring v2",
                "tournamentDate": "2026-04-02",
                "intervalMinutes": 30,
            },
            "scheduleIsStale": False,
        },
    )
    # Denormalised columns refresh from payload's config.
    assert row.name == "Spring v2"
    assert row.tournament_date == "2026-04-02"
    # Server stamps updatedAt and version inside data.
    assert "updatedAt" in row.data
    assert row.data["version"] == 2


def test_upsert_data_raises_keyerror_on_missing(repo):
    with pytest.raises(KeyError):
        repo.tournaments.upsert_data(uuid.uuid4(), {})


def test_upsert_data_strips_legacy_integrity_field(repo):
    tid = _seed_tournament(repo, name="A")
    row = repo.tournaments.upsert_data(tid, {"_integrity": "deadbeef"})
    assert "_integrity" not in row.data


# ---- MatchState --------------------------------------------------------


def test_match_state_upsert_and_get(repo):
    tid = _seed_tournament(repo, name="A")
    row = repo.match_states.upsert(tid, "m1", {"status": "called"})
    assert row.status == "called"

    again = repo.match_states.get(tid, "m1")
    assert again is not None
    assert again.status == "called"


def test_match_state_update_overwrites_existing(repo):
    tid = _seed_tournament(repo, name="A")
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    repo.match_states.upsert(tid, "m1", {"status": "started"})
    assert repo.match_states.get(tid, "m1").status == "started"


def test_match_state_list_returns_only_tournament_scoped_rows(repo):
    tid_a = _seed_tournament(repo, name="A")
    tid_b = _seed_tournament(repo, name="B")
    repo.match_states.upsert(tid_a, "m1", {"status": "called"})
    repo.match_states.upsert(tid_b, "m2", {"status": "started"})

    a_rows = repo.match_states.list_for_tournament(tid_a)
    assert [r.match_id for r in a_rows] == ["m1"]


def test_match_state_delete_returns_true_then_false(repo):
    tid = _seed_tournament(repo, name="A")
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    assert repo.match_states.delete(tid, "m1") is True
    assert repo.match_states.delete(tid, "m1") is False
    assert repo.match_states.get(tid, "m1") is None


def test_match_state_reset_all_clears_only_one_tournament(repo):
    tid_a = _seed_tournament(repo, name="A")
    tid_b = _seed_tournament(repo, name="B")
    repo.match_states.upsert(tid_a, "m1", {"status": "called"})
    repo.match_states.upsert(tid_a, "m2", {"status": "called"})
    repo.match_states.upsert(tid_b, "m3", {"status": "called"})

    deleted = repo.match_states.reset_all(tid_a)
    assert deleted == 2
    assert repo.match_states.list_for_tournament(tid_a) == []
    assert len(repo.match_states.list_for_tournament(tid_b)) == 1


def test_match_state_bulk_upsert_inserts_and_updates(repo):
    tid = _seed_tournament(repo, name="A")
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    n = repo.match_states.bulk_upsert(tid, {
        "m1": {"status": "started"},  # existing
        "m2": {"status": "called"},   # new
    })
    assert n == 2
    listed = {r.match_id: r.status for r in repo.match_states.list_for_tournament(tid)}
    assert listed == {"m1": "started", "m2": "called"}


def test_match_state_bulk_upsert_empty_dict_is_noop(repo):
    tid = _seed_tournament(repo, name="A")
    assert repo.match_states.bulk_upsert(tid, {}) == 0


# ---- TournamentBackup --------------------------------------------------


def test_backup_create_and_list_newest_first(repo):
    tid = _seed_tournament(repo, name="A")
    b1 = repo.backups.create(tid, {"v": 1}, "tournament-a-2026-01-01.json")
    b2 = repo.backups.create(tid, {"v": 2}, "tournament-b-2026-01-02.json")
    listed = repo.backups.list_for_tournament(tid)
    assert [b.filename for b in listed] == [b2.filename, b1.filename]


def test_backup_get_by_filename(repo):
    tid = _seed_tournament(repo, name="A")
    repo.backups.create(tid, {"v": 1}, "snap-a.json")
    found = repo.backups.get_by_filename(tid, "snap-a.json")
    assert found is not None
    assert found.snapshot == {"v": 1}
    assert repo.backups.get_by_filename(tid, "missing.json") is None


def test_backup_rotate_keeps_newest_n(repo):
    tid = _seed_tournament(repo, name="A")
    for i in range(5):
        repo.backups.create(tid, {"i": i}, f"snap-{i}.json")
    deleted = repo.backups.rotate(tid, keep=3)
    assert deleted == 2
    remaining = repo.backups.list_for_tournament(tid)
    assert [b.snapshot["i"] for b in remaining] == [4, 3, 2]


def test_backup_create_size_bytes_reflects_payload(repo):
    tid = _seed_tournament(repo, name="A")
    b = repo.backups.create(tid, {"key": "value"}, "snap.json")
    assert b.size_bytes > 0


# ---- LocalRepository orchestration -------------------------------------


def test_commit_tournament_state_raises_on_missing(repo):
    with pytest.raises(KeyError):
        repo.commit_tournament_state(uuid.uuid4(), {"config": {"tournamentName": "X"}})


def test_commit_tournament_state_skips_backup_on_first_write(repo):
    """A freshly created tournament has ``data == {}``; the first commit
    has nothing meaningful to back up."""
    tid = _seed_tournament(repo, name="A")
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "A"}})
    assert repo.backups.list_for_tournament(tid) == []


def test_commit_tournament_state_backs_up_prior_writes(repo):
    tid = _seed_tournament(repo, name="A")
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "First"}})
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "Second"}})
    backups = repo.backups.list_for_tournament(tid)
    assert len(backups) == 1
    assert backups[0].snapshot["config"]["tournamentName"] == "First"


def test_commit_tournament_state_rotates_at_keep_limit(repo):
    """Twelve commits → ten backups (1 init no-op + 11 rotations, rotated to 10)."""
    tid = _seed_tournament(repo, name="A")
    for i in range(12):
        repo.commit_tournament_state(tid, {"config": {"tournamentName": f"T{i}"}})
    backups = repo.backups.list_for_tournament(tid)
    assert len(backups) == LocalRepository.BACKUP_KEEP == 10


def test_snapshot_returns_none_on_missing_or_empty(repo):
    assert repo.snapshot_tournament(uuid.uuid4()) is None
    # Empty data tournament — nothing useful to snapshot.
    tid = _seed_tournament(repo, name="Empty")
    assert repo.snapshot_tournament(tid) is None


def test_snapshot_creates_backup_when_data_present(repo):
    tid = _seed_tournament(repo, name="A")
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "X"}})
    backup = repo.snapshot_tournament(tid)
    assert backup is not None
    assert backup.snapshot["config"]["tournamentName"] == "X"


def test_restore_from_backup_replaces_data(repo):
    tid = _seed_tournament(repo, name="A")
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "FIRST"}})
    repo.commit_tournament_state(tid, {"config": {"tournamentName": "SECOND"}})

    backups = repo.backups.list_for_tournament(tid)
    target = backups[-1].filename  # snapshot of FIRST
    repo.restore_tournament_from_backup(tid, target)

    current = repo.tournaments.get_by_id(tid)
    assert current.data["config"]["tournamentName"] == "FIRST"


def test_restore_raises_when_filename_missing(repo):
    tid = _seed_tournament(repo, name="A")
    repo.commit_tournament_state(tid, {})
    with pytest.raises(FileNotFoundError):
        repo.restore_tournament_from_backup(tid, "no-such-file.json")


def test_restore_raises_when_tournament_missing(repo):
    with pytest.raises(FileNotFoundError):
        repo.restore_tournament_from_backup(uuid.uuid4(), "any.json")


# ---- Cascade-delete safety ---------------------------------------------


def test_delete_cascades_match_states_and_backups(repo):
    tid = _seed_tournament(repo, name="A")
    repo.match_states.upsert(tid, "m1", {"status": "called"})
    repo.backups.create(tid, {"v": 1}, "snap.json")

    assert repo.tournaments.delete(tid) is True

    assert repo.session.query(MatchState).count() == 0
    assert repo.session.query(TournamentBackup).count() == 0
