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
        "display_tokens",
        "tournament_members",
    ):
        connection.execute(f"CREATE TABLE {table} (id TEXT)")
    ids = ("a" * 32, "b" * 32)
    connection.executemany("INSERT INTO tournaments VALUES (?)", [(item,) for item in ids])
    counts = {
        "bracket_events": 10,
        "bracket_matches": 310,
        "bracket_results": 50,
        "entry_pages": 2,
        "display_tokens": 2,
        "tournament_members": 3,
    }
    for table, count in counts.items():
        connection.executemany(
            f"INSERT INTO {table} VALUES (?)", [(str(index),) for index in range(count)]
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
