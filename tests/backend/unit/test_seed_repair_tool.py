"""``ops.seed_repair`` — the manifest-scoped fixture repairs that cannot go
through HTTP.

Every test runs the tool TWICE against a real file-backed SQLite database: the
second run is the assertion that matters, because a maintenance tool an
operator may re-run must be safe to re-run.
"""
from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import Base, Match, Tournament
from ops.seed_repair import canonical_tournament_name, run


LOCKED_WORKSPACE = uuid.UUID("9a885612-ac98-4fe6-9c98-7f16367cb04a")
OTHER_WORKSPACE = uuid.UUID("8db07603-170f-4a30-a939-6c689fab4c8e")
UNMANAGED_WORKSPACE = uuid.UUID("82c825a4-0000-4000-8000-000000000001")
STRAY_MATCH_ID = "T029-MD-R16-da44fceb5e8161854"


def _document(title: str) -> dict:
    return {
        "config": {"tournamentName": title, "courtCount": 6},
        "setup": {
            "general": {
                "data": {
                    "name": title,
                    "publicName": title.replace("(", "").replace(")", ""),
                    "season": "2026",
                    "status": "active",
                    "timezone": "Asia/Taipei",
                },
                "updatedAt": "2026-07-01T00:00:00Z",
            }
        },
        "bracketPlayers": [
            {"id": "player-1", "name": "Aaron Chia"},
            {"id": "entry-9", "name": "Hsu Yin-hui", "personId": "P0500"},
            {"id": "player-3", "name": "Nobody From The Table"},
        ],
    }


@pytest.fixture()
def fixture_db(tmp_path):
    """A SQLite database holding two manifest workspaces and one outsider."""
    path = tmp_path / "fixture.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url, future=True)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, future=True)()
    session.add_all(
        [
            # The workspace name was already repaired over HTTP; only the
            # frozen Setup/config copies still carry the year.
            Tournament(
                id=LOCKED_WORKSPACE,
                name="Taipei Open",
                kind="bracket",
                data=_document("Taipei Open (2026)"),
            ),
            Tournament(
                id=OTHER_WORKSPACE,
                name="Korea Masters",
                kind="bracket",
                data=_document("Korea Masters"),
            ),
            # Not in the manifest: must never be read or written.
            Tournament(
                id=UNMANAGED_WORKSPACE,
                name="Yunavero Club Open (2026)",
                kind="bracket",
                data=_document("Yunavero Club Open (2026)"),
            ),
            Match(tournament_id=LOCKED_WORKSPACE, id=STRAY_MATCH_ID, court_id=6, time_slot=196),
            Match(tournament_id=UNMANAGED_WORKSPACE, id=STRAY_MATCH_ID, court_id=2),
        ]
    )
    session.commit()
    session.close()
    return url, engine


@pytest.fixture()
def manifest(tmp_path):
    path = tmp_path / "bwf-recent.json"
    path.write_text(
        json.dumps(
            {
                "seedKey": "bwf-recent",
                "tournaments": {
                    "T029": {
                        "workspaceId": str(LOCKED_WORKSPACE),
                        "source": {"name": "Taipei Open (2026)"},
                    },
                    "T030": {
                        "workspaceId": str(OTHER_WORKSPACE),
                        "source": {"name": "Korea Masters"},
                    },
                    # A reset entry carries no workspace and is skipped.
                    "T031": {"workspaceId": None, "source": {"name": "Elsewhere"}},
                },
            }
        ),
        encoding="utf-8",
    )
    return path


def _rows(engine):
    session = sessionmaker(bind=engine, future=True)()
    try:
        return {row.id: row for row in session.query(Tournament).all()}
    finally:
        session.close()


def test_the_canonical_name_rule_matches_the_seeds(tmp_path):
    # The twin of simulator/tournament_sim/seed.py::canonical_tournament_name.
    assert canonical_tournament_name("Taipei Open (2026)") == "Taipei Open"
    assert canonical_tournament_name("Korea Masters") == "Korea Masters"
    assert canonical_tournament_name("Super 300 Finals") == "Super 300 Finals"
    assert canonical_tournament_name("U.S. Open (2026) Qualifying") == "U.S. Open (2026) Qualifying"


def test_a_locked_setup_title_is_repaired_once_and_then_left_alone(fixture_db, manifest):
    url, engine = fixture_db

    first = run(manifest_path=manifest, database_url=url, include_locked=True)
    assert [row["tournamentId"] for row in first["lockedTitles"]["repaired"]] == ["T029"]
    assert first["lockedTitles"]["unchanged"] == ["T030"]

    rows = _rows(engine)
    general = rows[LOCKED_WORKSPACE].data["setup"]["general"]["data"]
    assert general["name"] == "Taipei Open"
    assert general["publicName"] == "Taipei Open"
    # config.tournamentName is the dangerous copy: upsert_data denormalises it
    # back onto tournaments.name, so a stale value would restore the suffix.
    assert rows[LOCKED_WORKSPACE].data["config"]["tournamentName"] == "Taipei Open"
    assert rows[LOCKED_WORKSPACE].name == "Taipei Open"
    # The workspace the manifest does not name is untouched.
    assert rows[UNMANAGED_WORKSPACE].name == "Yunavero Club Open (2026)"
    assert (
        rows[UNMANAGED_WORKSPACE].data["setup"]["general"]["data"]["name"]
        == "Yunavero Club Open (2026)"
    )

    version_after_first = rows[LOCKED_WORKSPACE].state_version
    second = run(manifest_path=manifest, database_url=url, include_locked=True)
    assert second["lockedTitles"]["repaired"] == []
    assert second["lockedTitles"]["unchanged"] == ["T029", "T030"]
    assert _rows(engine)[LOCKED_WORKSPACE].state_version == version_after_first


def test_a_stray_operations_row_is_dropped_inside_the_manifest_only(fixture_db, manifest):
    url, engine = fixture_db

    first = run(manifest_path=manifest, database_url=url, drop_match_ids=[STRAY_MATCH_ID])
    assert [row["workspaceId"] for row in first["droppedMatches"]["dropped"]] == [
        str(LOCKED_WORKSPACE)
    ]
    assert first["droppedMatches"]["refused"] == []

    session = sessionmaker(bind=engine, future=True)()
    try:
        remaining = session.query(Match).all()
        # The same match id in a workspace the manifest does not name survives.
        assert [(row.tournament_id, row.id) for row in remaining] == [
            (UNMANAGED_WORKSPACE, STRAY_MATCH_ID)
        ]
    finally:
        session.close()

    second = run(manifest_path=manifest, database_url=url, drop_match_ids=[STRAY_MATCH_ID])
    assert second["droppedMatches"]["dropped"] == []
    assert second["droppedMatches"]["absent"] == [STRAY_MATCH_ID]


def test_person_ids_are_backfilled_additively_and_only_once(fixture_db, manifest, tmp_path):
    url, engine = fixture_db
    person_map = tmp_path / "person-map.json"
    person_map.write_text(
        json.dumps(
            {
                "seedKey": "bwf-recent",
                "source": "bwf-recent:0123456789ab",
                "people": {"Aaron Chia": "P0001", "Hsu Yin-hui": "P0002"},
            }
        ),
        encoding="utf-8",
    )

    first = run(manifest_path=manifest, database_url=url, person_map_path=person_map)
    assert {row["tournamentId"] for row in first["personIds"]["updated"]} == {"T029", "T030"}
    assert first["personIds"]["updated"][0]["written"] == 1
    assert first["personIds"]["updated"][0]["withoutPersonId"] == 1

    roster = {row["id"]: row for row in _rows(engine)[LOCKED_WORKSPACE].data["bracketPlayers"]}
    assert roster["player-1"]["personId"] == "P0001"
    assert roster["player-1"]["personSource"] == "bwf-recent:0123456789ab"
    # An existing id is never re-keyed, and a name absent from the reviewed
    # table is left without one rather than given an invented value.
    assert roster["entry-9"]["personId"] == "P0500"
    assert "personId" not in roster["player-3"]

    second = run(manifest_path=manifest, database_url=url, person_map_path=person_map)
    assert second["personIds"]["updated"] == []
    assert second["personIds"]["unchanged"] == ["T029", "T030"]


def test_a_dry_run_writes_nothing(fixture_db, manifest):
    url, engine = fixture_db
    report = run(
        manifest_path=manifest,
        database_url=url,
        include_locked=True,
        drop_match_ids=[STRAY_MATCH_ID],
        apply=False,
    )
    assert report["lockedTitles"]["repaired"]
    assert report["droppedMatches"]["dropped"]
    rows = _rows(engine)
    assert rows[LOCKED_WORKSPACE].data["config"]["tournamentName"] == "Taipei Open (2026)"
    session = sessionmaker(bind=engine, future=True)()
    try:
        assert session.query(Match).count() == 2
    finally:
        session.close()
