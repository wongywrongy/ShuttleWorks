"""The P4 person key and the ``match_states`` FK, through the MIGRATION.

Sibling of ``test_entries_migration.py`` and for the same reason: the rest of
the backend suite builds its schema with ``Base.metadata.create_all``, so a
constraint that exists only in the models — or only in the migration — is
invisible to it. F-DM-11 is the rule these tests exist to enforce, so they run
Alembic for real against a throwaway SQLite file and assert against what a
production upgrade actually produces.

Two traps this module is written around, both recorded in the SP-DM-3 ledger:

- **UUIDs bind as undashed 32-char hex.** SQLAlchemy's ``Uuid`` stores that
  shape on SQLite; a dashed literal in raw SQL silently matches nothing, which
  turns a negative control into a test that passes for the wrong reason.
- **``PRAGMA foreign_keys`` is per connection and defaults OFF.** Every test
  here asserts it is 1 before asserting anything else.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"

NOW = "2026-08-25 00:00:00"

TOURNAMENT = "1" * 32
ACCOUNT = "2" * 32
PLAYER = "3" * 32
GHOST_PLAYER = "9" * 32
EVENT = "MS"
PARTICIPANT = "p1"
MATCH = "m1"


@pytest.fixture
def alembic_cfg(tmp_path, monkeypatch):
    """An Alembic config bound to a fresh, empty SQLite file.

    ``alembic/env.py`` reads ``core.config.settings.database_url``, so the env
    var must be set *and* the backend modules purged before the first import
    — otherwise a settings object cached by an earlier test points the
    migration at that test's database.
    """
    db_path = tmp_path / "migration.db"
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if str(_BACKEND / "src") in sys.path:
        sys.path.remove(str(_BACKEND / "src"))
    sys.path.insert(0, str(_BACKEND / "src"))
    purge_backend_modules()

    from alembic.config import Config

    # Built without an .ini file on purpose: ``env.py`` skips ``fileConfig``
    # when ``config_file_name`` is None, so running migrations in-process
    # does not reconfigure pytest's logging.
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND / "src" / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    try:
        yield cfg, url
    finally:
        purge_backend_modules()


def _upgraded(alembic_cfg):
    """Run the migrations and hand back an engine with FK enforcement ON."""
    import db.session  # noqa: F401 - registers the Engine-CLASS PRAGMA listener (db/session.py:39-49); without it, whether FKs are enforced depends on import order and purge_backend_modules moves that around
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    return sa.create_engine(url)


def _assert_enforcement_on(conn) -> None:
    assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def _seed_tournament(conn) -> None:
    conn.exec_driver_sql(
        "INSERT INTO tournaments (id, name, status, schema_version, data,"
        " created_at, updated_at)"
        " VALUES (?, 'Person Key', 'draft', 1, '{}', ?, ?)",
        (TOURNAMENT, NOW, NOW),
    )


def _seed_bracket_event(conn) -> None:
    conn.exec_driver_sql(
        "INSERT INTO bracket_events (tournament_id, id, discipline, format,"
        " duration_slots, status, created_at, updated_at)"
        " VALUES (?, ?, 'Mens Singles', 'se', 1, 'draft', ?, ?)",
        (TOURNAMENT, EVENT, NOW, NOW),
    )


def _seed_entry_player(conn, player_id: str = PLAYER) -> None:
    conn.exec_driver_sql(
        "INSERT OR IGNORE INTO entrant_accounts (id, email, email_verified,"
        " created_at, updated_at) VALUES (?, 'parent@x.test', 0, ?, ?)",
        (ACCOUNT, NOW, NOW),
    )
    conn.exec_driver_sql(
        "INSERT INTO entry_players (tournament_id, id, account_id, full_name,"
        " gender, created_at, updated_at)"
        " VALUES (?, ?, ?, 'A Player', 'female', ?, ?)",
        (TOURNAMENT, player_id, ACCOUNT, NOW, NOW),
    )


def _insert_participant(conn, entry_player_id: str | None) -> None:
    conn.exec_driver_sql(
        "INSERT INTO bracket_participants (tournament_id, bracket_event_id, id,"
        " name, type, member_ids, meta, entry_player_id, created_at, updated_at)"
        " VALUES (?, ?, ?, 'A Player', 'PLAYER', '[]', '{}', ?, ?, ?)",
        (TOURNAMENT, EVENT, PARTICIPANT, entry_player_id, NOW, NOW),
    )


def test_a_dangling_entry_player_id_is_refused(alembic_cfg):
    """NC 1 (P4 card). MIGRATION-built schema, not ``create_all`` — that is
    the whole point of F-DM-11: the suites' schema is the weaker one, so a
    constraint asserted there proves nothing about production.

    The PRAGMA assertion is not decoration. SQLite defaults
    ``foreign_keys`` OFF per connection; ``db/session.py`` registers a
    listener on the Engine CLASS, so whether it is on here depends on
    whether that module has been imported — and ``purge_backend_modules``
    moves that around. Without the assertion this test can pass VACUOUSLY by
    never enforcing anything."""
    engine = _upgraded(alembic_cfg)

    with engine.begin() as conn:
        _assert_enforcement_on(conn)
        _seed_tournament(conn)
        _seed_bracket_event(conn)

    # The pointer names a person who does not exist.
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            _insert_participant(conn, GHOST_PLAYER)

    # Negative control: the same insert, with the person present, is accepted.
    # Without this half, a test that raised for any reason at all would pass.
    with engine.begin() as conn:
        _seed_entry_player(conn)
        _insert_participant(conn, PLAYER)
        assert conn.exec_driver_sql(
            "SELECT COUNT(*) FROM bracket_participants"
        ).scalar() == 1


def test_a_match_state_whose_match_is_deleted_goes_with_it(alembic_cfg):
    """NC 3 (P4 card), the FK half. The Meet projection deletes a ``matches``
    row whose id left the blob; with this FK that delete must still SUCCEED
    (RESTRICT would break the write path — see the plan's judgment call 1)
    and must take the ``match_states`` row with it."""
    engine = _upgraded(alembic_cfg)

    # The FK must EXIST — an IntegrityError test alone cannot distinguish
    # "FK present" from "test set up wrong".
    fks = sa.inspect(engine).get_foreign_keys("match_states")
    assert any(
        sorted(fk["constrained_columns"]) == ["match_id", "tournament_id"]
        and fk["referred_table"] == "matches"
        for fk in fks
    ), f"no composite FK from match_states to matches: {fks}"

    with engine.begin() as conn:
        _assert_enforcement_on(conn)
        _seed_tournament(conn)
        conn.exec_driver_sql(
            "INSERT INTO matches (tournament_id, id, status, version,"
            " created_at, updated_at) VALUES (?, ?, 'scheduled', 1, ?, ?)",
            (TOURNAMENT, MATCH, NOW, NOW),
        )
        conn.exec_driver_sql(
            "INSERT INTO match_states (tournament_id, match_id, status,"
            " updated_at) VALUES (?, ?, 'called', ?)",
            (TOURNAMENT, MATCH, NOW),
        )

    # A state row with no parent match is now refused outright.
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO match_states (tournament_id, match_id, status,"
                " updated_at) VALUES (?, 'nobody', 'called', ?)",
                (TOURNAMENT, NOW),
            )

    with engine.begin() as conn:
        conn.exec_driver_sql(
            "DELETE FROM matches WHERE tournament_id = ? AND id = ?",
            (TOURNAMENT, MATCH),
        )
        assert conn.exec_driver_sql(
            "SELECT COUNT(*) FROM match_states"
        ).scalar() == 0


def test_deleting_a_tournament_with_a_person_keyed_participant_still_succeeds(
    alembic_cfg,
):
    """NC 4 (added by the plan's self-review): the cascade-ORDER control.

    Two composite cascades now converge on one row — ``bracket_events`` →
    ``bracket_participants`` and ``entry_players`` →
    ``bracket_participants`` — and ``tournaments`` cascades into all of
    them. This is the test that catches an unworkable ``ondelete``
    empirically rather than by reading a dialect manual: ``SET NULL`` on
    the participant FK would try to null ``tournament_id``, a NOT NULL
    primary-key column, and could take tournament deletion down with it.
    Migration-built schema, enforcement ON, or it proves nothing."""
    engine = _upgraded(alembic_cfg)

    with engine.begin() as conn:
        _assert_enforcement_on(conn)
        _seed_tournament(conn)
        _seed_bracket_event(conn)
        _seed_entry_player(conn)
        _insert_participant(conn, PLAYER)

    # Mirror case first, on its own workspace-scoped row: deleting the PERSON
    # succeeds and takes the participant with it. Judgment call 7 accepts that
    # destructive edge, so it is asserted rather than assumed.
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "DELETE FROM entry_players WHERE tournament_id = ? AND id = ?",
            (TOURNAMENT, PLAYER),
        )
        assert conn.exec_driver_sql(
            "SELECT COUNT(*) FROM bracket_participants"
        ).scalar() == 0

    # Re-seed and delete the workspace instead: the converging cascades must
    # not deadlock or raise.
    with engine.begin() as conn:
        _seed_entry_player(conn)
        _insert_participant(conn, PLAYER)

    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM tournaments WHERE id = ?", (TOURNAMENT,))
        assert conn.exec_driver_sql(
            "SELECT COUNT(*) FROM bracket_participants"
        ).scalar() == 0
        assert conn.exec_driver_sql(
            "SELECT COUNT(*) FROM entry_players"
        ).scalar() == 0
