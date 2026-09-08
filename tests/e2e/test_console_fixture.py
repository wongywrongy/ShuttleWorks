from __future__ import annotations

import importlib.util
import sqlite3
import sys
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
# ---- the live floor, checked where a reader meets it ----------------------
#
# `prepare-console-fixture.py` asserts against the PUBLIC schedule projection,
# not a table: the public tier shows a court only for a currently-live claim,
# so "two live matches on one court" and "a live match with no court" are
# exactly the disputed-court state that belongs to `FIXTURE_MODE=failure`
# alone. These pin the guard itself, the same way the shape checks above do.

# The helper script imports the simulator client at module scope; the
# simulator is a sys.path root, not an installed package (same idiom as
# `tests/backend/conftest.py` for `apps/api/src`).
SIMULATOR_ROOT = Path(__file__).resolve().parents[2] / "simulator"
if str(SIMULATOR_ROOT) not in sys.path:
    sys.path.insert(0, str(SIMULATOR_ROOT))

PREPARE_PATH = Path(__file__).with_name("prepare-console-fixture.py")
PREPARE_SPEC = importlib.util.spec_from_file_location("prepare_console_fixture", PREPARE_PATH)
assert PREPARE_SPEC and PREPARE_SPEC.loader
PREPARE = importlib.util.module_from_spec(PREPARE_SPEC)
PREPARE_SPEC.loader.exec_module(PREPARE)


class _StubProbe:
    """A `SimClient`-shaped stand-in returning one page of schedule items."""

    def __init__(self, items: list[dict]):
        self._items = items

    def request(self, method, path, expect=(200,)):  # noqa: ARG002
        items = self._items

        class _Response:
            @staticmethod
            def json():
                return {
                    "items": items,
                    "page": 1,
                    "pageSize": max(len(items), 1),
                    "total": len(items),
                }

        return _Response()


def _live_floor(courts: list[int | None]) -> _StubProbe:
    return _StubProbe(
        [{"status": "live", "court": court} for court in courts]
        + [{"status": "completed", "court": None}]
    )


def test_live_floor_guard_accepts_one_match_per_court():
    PREPARE._assert_one_live_match_per_court(_live_floor([1, 2, 3, 4, 5, 6]), "slug")


def test_live_floor_guard_rejects_a_disputed_court():
    with pytest.raises(SystemExit, match="share a court"):
        PREPARE._assert_one_live_match_per_court(_live_floor([1, 1, 3, 4, 5, 6]), "slug")


def test_live_floor_guard_rejects_a_live_match_with_no_court():
    with pytest.raises(SystemExit, match="published no court"):
        PREPARE._assert_one_live_match_per_court(_live_floor([1, 2, 3, 4, 5, None]), "slug")


def test_live_floor_guard_rejects_an_over_full_floor():
    with pytest.raises(SystemExit, match="one per court"):
        PREPARE._assert_one_live_match_per_court(_live_floor([1, 2, 3, 4, 5, 6, 7, 8]), "slug")
