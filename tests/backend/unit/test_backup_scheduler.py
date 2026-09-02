"""Fail-open scheduled backup operations around encrypted bundle primitives."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from recovery.scheduler import BackupScheduler, CallbackOffsiteUploadSink


PASSPHRASE = b"correct horse battery staple"


def _database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE proof (value TEXT)")
    connection.execute("INSERT INTO proof VALUES ('durable')")
    connection.commit()
    connection.close()


def test_scheduler_verifies_retains_and_restore_tests_two_generations(tmp_path: Path):
    source = tmp_path / "event.db"
    _database(source)
    scheduler = BackupScheduler(
        source_database=source,
        backup_directory=tmp_path / "backups",
        passphrase_provider=lambda: PASSPHRASE,
        keep_generations=1,  # the service must still retain two
    )

    assert scheduler.trigger_milestone("checkout") is True
    assert scheduler.trigger_event_close() is True
    assert scheduler.status.restore_test_status == "passed"
    assert scheduler.status.last_success_at is not None
    assert scheduler.status.last_path is not None
    assert scheduler.status.last_path.exists()
    assert scheduler.status.generation_count == 2
    assert scheduler.status.free_bytes is not None
    assert len(list((tmp_path / "backups").glob("event-*.swbackup"))) == 2


def test_offsite_sink_is_opportunistic_and_never_turns_local_backup_red(tmp_path: Path):
    source = tmp_path / "event.db"
    _database(source)
    calls: list[Path] = []

    def broken_sink(path, _manifest):
        calls.append(path)
        raise OSError("WAN unavailable")

    scheduler = BackupScheduler(
        source_database=source,
        backup_directory=tmp_path / "backups",
        passphrase_provider=lambda: PASSPHRASE,
        offsite_sink=CallbackOffsiteUploadSink(broken_sink),
        restore_test=False,
    )
    assert scheduler.run_once(reason="interval") is True
    assert calls and calls[0].exists()
    assert scheduler.status.last_success_at is not None


def test_backup_secret_or_source_failure_is_fail_open_and_visible(tmp_path: Path):
    scheduler = BackupScheduler(
        source_database=tmp_path / "missing.db",
        backup_directory=tmp_path / "backups",
        passphrase_provider=lambda: b"",
    )
    assert scheduler.run_once(reason="manual") is False
    status = scheduler.status_dict()
    assert status["lastSuccessAt"] is None
    assert status["lastError"] in {"ValueError", "RecoveryBundleError"}
    assert status["generationCount"] == 0
