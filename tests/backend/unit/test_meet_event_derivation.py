"""The ``meet_events`` derivation, hung on the blob write's one funnel.

SP-DM-3 P7b Task 1. ``_LocalTournamentRepo.upsert_data`` assigns ``row.data``
in the only place in ``apps/api/src`` that does, and all nine blob writers
reach it — so re-deriving there catches every writer regardless of who
supplied the config. It is deliberately NOT hung on
``commit_tournament_state``: that method's own comment records that an earlier
author assumed *it* was the funnel and shipped three bugs from the assumption.

**P7b-NC3** is the control that matters most: the funnel runs on every blob
write, so writing the same blob twice must not change, duplicate, or
**recreate** rows. Recreation is proved against, not just row count —
``entry_events.meet_event_id`` points at these rows by code, so a
delete-and-recreate would look identical by count while resetting
``created_at`` and clobbering ``label``. A freed SQLite rowid is reused by the
next insert, so rowid is no evidence either; the proof is an out-of-band
sentinel written into ``label``, which only a recreate could erase.

**P7b-NC4** (derivation half): absent ``rankCounts`` and ``{}`` both mean zero
divisions.

Schema here is ``Base.metadata.create_all`` on purpose — F-DM-11 binds the
*migration* control to a migration-built schema, and that control lives in
``test_meet_events_migration.py``. This module is about the runtime sync.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import Base, MeetEvent
from repositories.local import LocalRepository


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture
def session(engine):
    s = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def repo(session):
    return LocalRepository(session)


def _blob(rank_counts=None, *, with_config=True):
    config = {
        "tournamentName": "Spring Invitational",
        "intervalMinutes": 15,
        "dayStart": "08:00",
        "dayEnd": "18:00",
        "courtCount": 4,
        "defaultRestMinutes": 20,
        "freezeHorizonSlots": 0,
    }
    if rank_counts is not None:
        config["rankCounts"] = rank_counts
    payload = {"groups": [], "players": [], "matches": []}
    if with_config:
        payload["config"] = config
    return payload


def _events(session, tournament_id):
    return list(
        session.execute(
            select(MeetEvent)
            .where(MeetEvent.tournament_id == tournament_id)
            .order_by(MeetEvent.id)
        ).scalars()
    )


def _workspace(repo):
    return repo.tournaments.create(name="Spring Invitational", kind="meet").id


def test_a_blob_write_derives_one_row_per_division_carrying_its_slot_count(repo, session):
    """R-DM-5's grain, at runtime: ``MS``, never ``MS1``."""
    tid = _workspace(repo)
    repo.tournaments.upsert_data(tid, _blob({"BS": 20, "GS": 20, "XD": 11}))

    rows = _events(session, tid)
    assert [r.id for r in rows] == ["BS", "GS", "XD"]
    assert [r.slot_count for r in rows] == [20, 20, 11]
    assert [r.label for r in rows] == ["BS", "GS", "XD"]


def test_writing_the_same_blob_twice_does_not_recreate_the_rows(repo, session):
    """P7b-NC3.

    A stale ``label`` sentinel survives the second write. Only a
    delete-and-recreate would reset it to the code — and that is exactly the
    failure ``entry_events.meet_event_id`` could not see, since the row count
    and the codes would look identical either way.
    """
    tid = _workspace(repo)
    blob = _blob({"MS": 3, "XD": 2})
    repo.tournaments.upsert_data(tid, blob)

    for row in _events(session, tid):
        row.label = f"SENTINEL-{row.id}"
    session.commit()

    # Read the baseline back from the database, not the identity map: the
    # sentinel write above is itself an UPDATE and moved ``updated_at``.
    session.expire_all()
    before = _events(session, tid)
    created_at = {r.id: r.created_at for r in before}
    updated_at = {r.id: r.updated_at for r in before}

    repo.tournaments.upsert_data(tid, blob)

    session.expire_all()
    again = _events(session, tid)
    assert [r.id for r in again] == ["MS", "XD"]
    assert [r.label for r in again] == ["SENTINEL-MS", "SENTINEL-XD"], (
        "the rows were recreated (or the label was re-derived)"
    )
    assert {r.id: r.created_at for r in again} == created_at
    assert {r.id: r.updated_at for r in again} == updated_at, (
        "an unchanged row must not be re-UPDATEd either"
    )


def test_a_changed_count_updates_the_row_rather_than_replacing_it(repo, session):
    tid = _workspace(repo)
    repo.tournaments.upsert_data(tid, _blob({"MS": 3}))
    row = _events(session, tid)[0]
    row.label = "Men's Singles"
    session.commit()
    created_at = row.created_at

    repo.tournaments.upsert_data(tid, _blob({"MS": 5}))

    rows = _events(session, tid)
    assert len(rows) == 1
    assert rows[0].slot_count == 5
    assert rows[0].label == "Men's Singles"
    assert rows[0].created_at == created_at


def test_a_code_that_leaves_the_config_leaves_the_table(repo, session):
    tid = _workspace(repo)
    repo.tournaments.upsert_data(tid, _blob({"MS": 3, "XD": 2}))
    repo.tournaments.upsert_data(tid, _blob({"MS": 3}))

    assert [r.id for r in _events(session, tid)] == ["MS"]


@pytest.mark.parametrize(
    "payload_kwargs",
    [
        pytest.param({"rank_counts": None}, id="no rankCounts key"),
        pytest.param({"rank_counts": {}}, id="empty rankCounts"),
        pytest.param({"rank_counts": None, "with_config": False}, id="no config at all"),
    ],
)
def test_absent_and_empty_rank_counts_both_mean_zero_divisions(
    repo, session, payload_kwargs
):
    """P7b-NC4 (derivation half).

    ``POST /tournaments`` seeds a config with no ``rankCounts`` key, so
    "missing" is a state real workspaces are in — not a signal to skip the
    sync and leave stale rows behind.
    """
    tid = _workspace(repo)
    repo.tournaments.upsert_data(tid, _blob({"MS": 3}))
    assert len(_events(session, tid)) == 1

    repo.tournaments.upsert_data(tid, _blob(**payload_kwargs))
    assert _events(session, tid) == []


def test_the_derivation_survives_junk_rather_than_failing_the_blob_write(repo, session):
    """A restored backup must not be able to make the write itself 500."""
    tid = _workspace(repo)
    repo.tournaments.upsert_data(
        tid,
        _blob({"MS": 3, "WS": "not a number", "": 2, "X" * 41: 1, "XD": "4"}),
    )

    rows = _events(session, tid)
    assert {r.id: r.slot_count for r in rows} == {"MS": 3, "XD": 4}


def test_every_direct_funnel_caller_re_derives_not_just_the_state_put(repo, session):
    """The funnel is ``upsert_data``, not ``commit_tournament_state``.

    Backup restore, the two bracket paths and plan-finalized call it directly.
    Restoring a snapshot taken before a division existed must take the row
    with it — which is the property that would be missing had the derivation
    been hung one level up.
    """
    tid = _workspace(repo)
    repo.tournaments.upsert_data(tid, _blob({"MS": 3}))
    repo.backups.create(tid, _blob({"MS": 3}))
    filename = repo.backups.list_for_tournament(tid)[0].filename

    repo.tournaments.upsert_data(tid, _blob({"MS": 3, "XD": 2}))
    assert [r.id for r in _events(session, tid)] == ["MS", "XD"]

    repo.restore_tournament_from_backup(tid, filename)
    assert [r.id for r in _events(session, tid)] == ["MS"]


def test_a_count_outside_int4_is_skipped_and_the_blob_write_still_succeeds(
    repo, session
):
    """The bound that keeps a junk count from 500ing the write on Postgres.

    ``slot_count`` is an ``Integer`` (int4) column, so ``{"MS": 10**12}``
    validates through ``rankCounts: Dict[Code, int]`` (whose ``max_length``
    bounds the key COUNT and key LENGTH, never the value), reaches the blob
    and raises ``DataError`` on INSERT — *inside* the write, turning a
    config save that used to succeed into a 500. That contradicts
    ``_rank_counts``' own promise that a malformed count must not fail the
    write.

    **This test cannot reproduce the Postgres failure**: SQLite stores
    arbitrary-width integers, so the unbounded version inserts happily here.
    What it asserts instead is the two halves of the intended behaviour — the
    entry is NOT refused (the blob round-trips with the out-of-range keys
    intact) and the out-of-range division is simply ABSENT from
    ``meet_events``. Without the bound the absence assertion reds, because
    SQLite writes the row.

    **The in-range negative is kept on purpose.** ``slot_count`` deliberately
    carries no CHECK — a CHECK would 500 the blob write and contradict this
    seam's junk tolerance — so the bound narrows the RANGE and never the
    vocabulary. A future "fix" that drops negatives reds this line.
    """
    tid = _workspace(repo)
    counts = {
        "MS": 3,
        "NEG": -4,
        "MAXI": 2**31 - 1,
        "MINI": -(2**31),
        "OVER": 2**31,
        "UNDER": -(2**31) - 1,
        "HUGE": 10**12,
        "INF": float("inf"),
    }

    row = repo.tournaments.upsert_data(tid, _blob(counts))

    assert row.data["config"]["rankCounts"] == counts, (
        "the entry must not be refused - the blob is written unchanged"
    )
    assert {r.id: r.slot_count for r in _events(session, tid)} == {
        "MS": 3,
        "NEG": -4,
        "MAXI": 2**31 - 1,
        "MINI": -(2**31),
    }
