"""Structural checks for the disposable console browser database."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def scalar(connection: sqlite3.Connection, sql: str, parameters: tuple = ()) -> int:
    row = connection.execute(sql, parameters).fetchone()
    if row is None:
        raise AssertionError(f"query returned no row: {sql}")
    return int(row[0])


def assert_fixture(connection: sqlite3.Connection, manifest: dict) -> None:
    entries = manifest.get("tournaments") or {}
    if set(entries) != {"T029", "T030"}:
        raise AssertionError("manifest must contain exactly T029 and T030")
    ids = tuple(entries[key]["workspaceId"].replace("-", "") for key in ("T029", "T030"))

    integrity = connection.execute("PRAGMA integrity_check").fetchone()
    if integrity != ("ok",):
        raise AssertionError(f"SQLite integrity_check failed: {integrity!r}")
    foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_keys:
        raise AssertionError(f"SQLite foreign_key_check failed: {foreign_keys!r}")
    if scalar(connection, "SELECT COUNT(*) FROM tournaments") != 2:
        raise AssertionError("fixture database must contain exactly two tournaments")
    if scalar(
        connection,
        "SELECT COUNT(*) FROM tournaments WHERE id IN (?, ?)",
        ids,
    ) != 2:
        raise AssertionError("fixture database tournament ids differ from the manifest")

    expected = {
        "bracket_events": 10,
        "bracket_matches": 310,
        "bracket_results": 50,
        "entry_pages": 2,
        "display_tokens": 2,
        "tournament_members": 3,
    }
    for table, count in expected.items():
        actual = scalar(connection, f"SELECT COUNT(*) FROM {table}")
        if actual != count:
            raise AssertionError(f"{table}: expected {count}, got {actual}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    with sqlite3.connect(args.database) as connection:
        assert_fixture(connection, manifest)
    print("console fixture database: integrity, foreign keys, ids, and counts verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
