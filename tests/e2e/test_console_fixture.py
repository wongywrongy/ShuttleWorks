from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).with_name("check-console-fixture.py")
SPEC = importlib.util.spec_from_file_location("check_console_fixture", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture_db() -> tuple[sqlite3.Connection, dict]:
    connection = sqlite3.connect(":memory:")
    for table in (
        "tournaments",
        "bracket_events",
        "bracket_matches",
        "bracket_results",
        "entry_pages",
        "entry_events",
        "entrant_accounts",
        "display_tokens",
        "tournament_members",
    ):
        connection.execute(f"CREATE TABLE {table} (id TEXT)")
    ids = ("a" * 32, "b" * 32)
    connection.executemany("INSERT INTO tournaments VALUES (?)", [(item,) for item in ids])
    counts = {
        "bracket_events": 10,
        "bracket_matches": 310,
        "bracket_results": 103,
        "entry_pages": 2,
        "entry_events": 10,
        "entrant_accounts": 6,
        "display_tokens": 2,
        "tournament_members": 3,
    }
    for table, count in counts.items():
        connection.executemany(
            f"INSERT INTO {table} VALUES (?)", [(str(index),) for index in range(count)]
        )
    # The published-entrant layer the guard now also checks by property.
    connection.execute("DROP TABLE entry_pages")
    connection.execute("CREATE TABLE entry_pages (id TEXT, entrants_published INTEGER)")
    connection.executemany(
        "INSERT INTO entry_pages VALUES (?, 1)", [(str(index),) for index in range(2)]
    )
    connection.execute("CREATE TABLE entries (id TEXT, state TEXT)")
    connection.executemany(
        "INSERT INTO entries VALUES (?, 'confirmed')", [(str(i),) for i in range(510)]
    )
    connection.executemany(
        "INSERT INTO entries VALUES (?, 'withdrawn')", [(f"w{i}",) for i in range(2)]
    )
    connection.execute(
        "CREATE TABLE bracket_participants (id TEXT, entry_player_id TEXT, seed INTEGER)"
    )
    connection.executemany(
        "INSERT INTO bracket_participants VALUES (?, 'p', 1)",
        [(str(i),) for i in range(80)],
    )
    connection.executemany(
        "INSERT INTO bracket_participants VALUES (?, 'p', NULL)",
        [(f"l{i}",) for i in range(48)],
    )
    manifest = {
        "tournaments": {
            "T029": {"workspaceId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
            "T030": {"workspaceId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"},
        }
    }
    return connection, manifest


def test_fixture_guard_accepts_the_canonical_shape():
    connection, manifest = fixture_db()
    MODULE.assert_fixture(connection, manifest)


def test_fixture_guard_negative_control_rejects_an_extra_tournament():
    connection, manifest = fixture_db()
    connection.execute("INSERT INTO tournaments VALUES ('unexpected')")
    with pytest.raises(AssertionError, match="exactly two tournaments"):
        MODULE.assert_fixture(connection, manifest)


def test_fixture_guard_negative_control_rejects_missing_match_rows():
    connection, manifest = fixture_db()
    connection.execute("DELETE FROM bracket_matches WHERE id = '0'")
    with pytest.raises(AssertionError, match="bracket_matches: expected 310, got 309"):
        MODULE.assert_fixture(connection, manifest)


def test_fixture_guard_negative_control_rejects_unpublished_entrants():
    """The exact regression this guard exists for: a fixture whose people were
    never published has no linkable name and no profile page anywhere on the
    public tier, and every previous shape check passed anyway."""
    connection, manifest = fixture_db()
    connection.execute("UPDATE entry_pages SET entrants_published = 0 WHERE id = '0'")
    with pytest.raises(AssertionError, match="publish their entrants"):
        MODULE.assert_fixture(connection, manifest)


def test_fixture_guard_negative_control_rejects_an_unjoined_bracket():
    connection, manifest = fixture_db()
    connection.execute("UPDATE bracket_participants SET entry_player_id = NULL")
    with pytest.raises(AssertionError, match="not joined to entries"):
        MODULE.assert_fixture(connection, manifest)
