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

    # Exact counts, deliberately: this is the structural gate that says the
    # canonical seed produced the canonical fixture and nothing drifted.
    # ``bracket_results`` follows the per-discipline progress plan in
    # ``simulator/tournament_sim/seed.py::_DEMO_LIVE_PROGRESS`` (Taipei only —
    # Korea is upcoming). The entries tables are the published-entrant layer
    # every public person identity is built from: without rows here the public
    # tier has no linkable names and no profile pages at all.
    expected = {
        "bracket_events": 10,
        "bracket_matches": 310,
        "bracket_results": 103,
        "entry_pages": 2,
        "entry_events": 10,
        "entrant_accounts": 6,
        "display_tokens": 2,
        "tournament_members": 3,
    }
    for table, count in expected.items():
        actual = scalar(connection, f"SELECT COUNT(*) FROM {table}")
        if actual != count:
            raise AssertionError(f"{table}: expected {count}, got {actual}")

    # The published-entrant layer, checked by property rather than by an exact
    # count so that adding or removing a draw participant upstream does not
    # need this file edited — what must hold is that every workspace publishes
    # its entrants, that essentially every entry is confirmed, and that the
    # bracket really is joined to the people spine.
    if scalar(connection, "SELECT COUNT(*) FROM entry_pages WHERE entrants_published = 1") != 2:
        raise AssertionError("both entry pages must publish their entrants")
    confirmed = scalar(
        connection, "SELECT COUNT(*) FROM entries WHERE state = 'confirmed'"
    )
    if confirmed < 400:
        raise AssertionError(f"expected a confirmed entry per draw person, got {confirmed}")
    withdrawn = scalar(
        connection, "SELECT COUNT(*) FROM entries WHERE state = 'withdrawn'"
    )
    if withdrawn != 2:
        raise AssertionError(
            f"expected exactly one withheld person per workspace, got {withdrawn}"
        )
    linked = scalar(
        connection,
        "SELECT COUNT(*) FROM bracket_participants WHERE entry_player_id IS NOT NULL",
    )
    if linked < 100:
        raise AssertionError(f"bracket participants are not joined to entries: {linked}")
    seeded = scalar(
        connection, "SELECT COUNT(*) FROM bracket_participants WHERE seed IS NOT NULL"
    )
    if seeded != 80:
        raise AssertionError(f"expected eight seeds in each of ten draws, got {seeded}")


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
