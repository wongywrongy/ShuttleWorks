from pathlib import Path

import pytest

from tools.event_node_acceptance import run_acceptance


def test_event_node_acceptance_survives_restart_and_browser_cache_deletion(
    tmp_path: Path,
) -> None:
    report = run_acceptance(tmp_path / "event-node.sqlite3")

    assert report["status"] == "passed"
    assert report["wanBlocked"] is True
    assert report["freshDatabaseConnection"] is True
    assert report["browserStorageDeleted"] is True
    assert report["operationCount"] == 1
    assert report["pendingOutboxCount"] == 1


def test_event_node_acceptance_refuses_to_overwrite_a_database(tmp_path: Path) -> None:
    database = tmp_path / "existing.sqlite3"
    database.write_text("preserve me")

    with pytest.raises(ValueError, match="must not already exist"):
        run_acceptance(database)

    assert database.read_text() == "preserve me"
