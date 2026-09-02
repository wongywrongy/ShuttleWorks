"""Portable event-node backup encryption and clean-machine restore."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from recovery.bundles import (
    MAGIC,
    RecoveryBundleError,
    create_bundle,
    inspect_bundle,
    preflight_bundle,
    restore_bundle,
)


PASSPHRASE = b"correct horse battery staple"


def _database(path: Path) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.execute("CREATE TABLE event_operations (tournament_id TEXT, authority_epoch INTEGER, sequence INTEGER)")
        connection.execute("INSERT INTO event_operations VALUES ('event-1', 3, 17)")
        connection.execute("CREATE TABLE alembic_version (version_num TEXT)")
        connection.execute("INSERT INTO alembic_version VALUES ('ac2d7f3e9b10')")
        connection.execute("CREATE TABLE proof (value TEXT)")
        connection.execute("INSERT INTO proof VALUES ('acknowledged')")
        connection.commit()
    finally:
        connection.close()


def test_bundle_is_encrypted_verified_and_restorable(tmp_path: Path) -> None:
    source = tmp_path / "local.db"
    bundle = tmp_path / "portable" / "event.swbackup"
    restored = tmp_path / "replacement-node" / "local.db"
    _database(source)

    manifest = create_bundle(
        source_database=source, output_path=bundle, passphrase=PASSPHRASE
    )
    assert bundle.read_bytes().startswith(MAGIC)
    assert b"acknowledged" not in bundle.read_bytes()
    assert manifest["operationCount"] == 1
    assert inspect_bundle(bundle, PASSPHRASE)["databaseSha256"] == manifest["databaseSha256"]

    restored_manifest = restore_bundle(
        bundle_path=bundle,
        destination_database=restored,
        passphrase=PASSPHRASE,
    )
    assert restored_manifest == manifest
    connection = sqlite3.connect(restored)
    try:
        assert connection.execute("SELECT value FROM proof").fetchone()[0] == "acknowledged"
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        connection.close()


def test_preflight_proves_isolated_clean_machine_restore(tmp_path: Path) -> None:
    source = tmp_path / "local.db"
    bundle = tmp_path / "event.swbackup"
    _database(source)
    manifest = create_bundle(
        source_database=source, output_path=bundle, passphrase=PASSPHRASE
    )

    result = preflight_bundle(bundle, PASSPHRASE)

    assert result["status"] == "ready"
    assert result["manifest"] == manifest
    assert all(value == "passed" for value in result["checks"].values())
    assert result["restoredMetadata"]["operationCount"] == 1
    assert not (tmp_path / "event-node.sqlite3").exists()


def test_wrong_passphrase_and_existing_destination_fail_closed(tmp_path: Path) -> None:
    source = tmp_path / "local.db"
    bundle = tmp_path / "event.swbackup"
    restored = tmp_path / "restored.db"
    _database(source)
    create_bundle(source_database=source, output_path=bundle, passphrase=PASSPHRASE)

    with pytest.raises(RecoveryBundleError, match="wrong passphrase|corrupted"):
        inspect_bundle(bundle, b"this is the wrong passphrase")
    restored.write_text("do not overwrite")
    with pytest.raises(RecoveryBundleError, match="already exists"):
        restore_bundle(
            bundle_path=bundle,
            destination_database=restored,
            passphrase=PASSPHRASE,
        )
    assert restored.read_text() == "do not overwrite"


def test_modified_ciphertext_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "local.db"
    bundle = tmp_path / "event.swbackup"
    _database(source)
    create_bundle(source_database=source, output_path=bundle, passphrase=PASSPHRASE)
    damaged = bytearray(bundle.read_bytes())
    damaged[-1] ^= 1
    bundle.write_bytes(damaged)

    with pytest.raises(RecoveryBundleError, match="wrong passphrase|corrupted"):
        inspect_bundle(bundle, PASSPHRASE)
