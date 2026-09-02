"""Create and restore authenticated-encrypted SQLite recovery bundles."""
from __future__ import annotations

import hashlib
import io
import json
import os
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from core.version import APP_VERSION
from core.telemetry.instruments import record_recovery_outcome


MAGIC = b"SWRECOVERY1\x00"
SALT_BYTES = 16
NONCE_BYTES = 12


class RecoveryBundleError(ValueError):
    """The bundle is unsafe, corrupt, incompatible, or cannot be restored."""


def _metric_operation(operation: str):
    """Record bundle outcomes while preserving fail-closed recovery behavior."""
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            try:
                result = function(*args, **kwargs)
            except Exception:
                record_recovery_outcome(operation, "failed")
                raise
            record_recovery_outcome(operation, "succeeded")
            return result
        return wrapped
    return decorate


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _derive_key(passphrase: bytes, salt: bytes) -> bytes:
    if len(passphrase) < 12:
        raise RecoveryBundleError("recovery passphrase must contain at least 12 bytes")
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase)


def _sqlite_snapshot(source_path: Path, destination_path: Path) -> None:
    if not source_path.is_file():
        raise RecoveryBundleError(f"SQLite database not found: {source_path}")
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    destination = sqlite3.connect(destination_path)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()


def _snapshot_metadata(snapshot_path: Path) -> dict[str, Any]:
    connection = sqlite3.connect(f"file:{snapshot_path}?mode=ro", uri=True)
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RecoveryBundleError(f"SQLite integrity check failed: {integrity}")
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        alembic_revision = None
        if "alembic_version" in tables:
            row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            alembic_revision = row[0] if row else None
        operation_count = 0
        last_sequences: list[dict[str, Any]] = []
        if "event_operations" in tables:
            operation_count = connection.execute(
                "SELECT COUNT(*) FROM event_operations"
            ).fetchone()[0]
            for tournament_id, epoch, sequence in connection.execute(
                "SELECT tournament_id, authority_epoch, MAX(sequence) "
                "FROM event_operations GROUP BY tournament_id, authority_epoch"
            ).fetchall():
                last_sequences.append(
                    {
                        "tournamentId": str(tournament_id),
                        "authorityEpoch": epoch,
                        "lastSequence": sequence,
                    }
                )
        return {
            "alembicRevision": alembic_revision,
            "operationCount": operation_count,
            "lastSequences": last_sequences,
        }
    finally:
        connection.close()


@_metric_operation("create")
def create_bundle(
    *, source_database: Path, output_path: Path, passphrase: bytes
) -> dict[str, Any]:
    """Create an encrypted bundle atomically and return its public manifest."""
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="shuttleworks-recovery-") as temp_dir:
        temp = Path(temp_dir)
        snapshot = temp / "event-node.sqlite3"
        archive = temp / "bundle.zip"
        _sqlite_snapshot(source_database.resolve(), snapshot)
        metadata = _snapshot_metadata(snapshot)
        manifest = {
            "format": "shuttleworks-event-node-recovery",
            "formatVersion": 1,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "appVersion": APP_VERSION,
            "databaseFile": snapshot.name,
            "databaseBytes": snapshot.stat().st_size,
            "databaseSha256": _sha256(snapshot),
            **metadata,
        }
        with zipfile.ZipFile(
            archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
        ) as package:
            package.writestr(
                "manifest.json",
                json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8"),
            )
            package.write(snapshot, snapshot.name)

        salt = os.urandom(SALT_BYTES)
        nonce = os.urandom(NONCE_BYTES)
        encrypted = AESGCM(_derive_key(passphrase, salt)).encrypt(
            nonce, archive.read_bytes(), MAGIC
        )
        staged = output_path.with_suffix(output_path.suffix + ".partial")
        try:
            with staged.open("wb") as destination:
                destination.write(MAGIC)
                destination.write(salt)
                destination.write(nonce)
                destination.write(encrypted)
                destination.flush()
                os.fsync(destination.fileno())
            os.replace(staged, output_path)
        finally:
            staged.unlink(missing_ok=True)
    return manifest


def _decrypt_bundle(bundle_path: Path, passphrase: bytes) -> bytes:
    content = bundle_path.read_bytes()
    header_size = len(MAGIC) + SALT_BYTES + NONCE_BYTES
    if len(content) <= header_size or not content.startswith(MAGIC):
        raise RecoveryBundleError("not a ShuttleWorks recovery bundle")
    offset = len(MAGIC)
    salt = content[offset : offset + SALT_BYTES]
    offset += SALT_BYTES
    nonce = content[offset : offset + NONCE_BYTES]
    offset += NONCE_BYTES
    try:
        return AESGCM(_derive_key(passphrase, salt)).decrypt(
            nonce, content[offset:], MAGIC
        )
    except InvalidTag as exc:
        raise RecoveryBundleError("wrong passphrase or corrupted recovery bundle") from exc


@_metric_operation("verify")
def inspect_bundle(bundle_path: Path, passphrase: bytes) -> dict[str, Any]:
    """Authenticate and verify a bundle without restoring it."""
    archive_bytes = _decrypt_bundle(bundle_path.resolve(), passphrase)
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as package:
        names = set(package.namelist())
        if names != {"manifest.json", "event-node.sqlite3"}:
            raise RecoveryBundleError("recovery bundle contains unexpected files")
        manifest = json.loads(package.read("manifest.json"))
        database = package.read("event-node.sqlite3")
        if hashlib.sha256(database).hexdigest() != manifest.get("databaseSha256"):
            raise RecoveryBundleError("recovery database checksum mismatch")
        if len(database) != manifest.get("databaseBytes"):
            raise RecoveryBundleError("recovery database size mismatch")
    return manifest


@_metric_operation("preflight")
def preflight_bundle(bundle_path: Path, passphrase: bytes) -> dict[str, Any]:
    """Prove that a bundle can be restored on an isolated clean path.

    This is intentionally a destructive-free check: the destination is a
    newly-created temporary directory and the source database is never
    opened for writing.  It provides the operator CLI and backup scheduler
    one shared acceptance gate for authentication, checksums, SQLite
    integrity, and operation metadata before a replacement node is needed.
    """
    manifest = inspect_bundle(bundle_path, passphrase)
    with tempfile.TemporaryDirectory(prefix="shuttleworks-preflight-") as temp_dir:
        restored_path = Path(temp_dir) / "event-node.sqlite3"
        restore_bundle(
            bundle_path=bundle_path,
            destination_database=restored_path,
            passphrase=passphrase,
        )
        restored_metadata = _snapshot_metadata(restored_path)
    checks = {
        "authentication": "passed",
        "checksum": "passed",
        "sqliteIntegrity": "passed",
        "operationCount": (
            "passed"
            if restored_metadata["operationCount"] == manifest.get("operationCount")
            else "failed"
        ),
        "schemaRevision": (
            "passed"
            if restored_metadata["alembicRevision"] == manifest.get("alembicRevision")
            else "failed"
        ),
        "destinationIsolation": "passed",
    }
    if any(value == "failed" for value in checks.values()):
        raise RecoveryBundleError("clean-machine restore preflight failed")
    return {
        "status": "ready",
        "manifest": manifest,
        "restoredMetadata": restored_metadata,
        "checks": checks,
    }


@_metric_operation("restore")
def restore_bundle(
    *, bundle_path: Path, destination_database: Path, passphrase: bytes
) -> dict[str, Any]:
    """Restore only to a new path, verify SQLite, then atomically install it."""
    destination_database = destination_database.resolve()
    if destination_database.exists():
        raise RecoveryBundleError("restore destination already exists")
    destination_database.parent.mkdir(parents=True, exist_ok=True)
    archive_bytes = _decrypt_bundle(bundle_path.resolve(), passphrase)
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as package:
        manifest = json.loads(package.read("manifest.json"))
        database = package.read("event-node.sqlite3")
    if hashlib.sha256(database).hexdigest() != manifest.get("databaseSha256"):
        raise RecoveryBundleError("recovery database checksum mismatch")
    staged = destination_database.with_suffix(destination_database.suffix + ".partial")
    try:
        staged.write_bytes(database)
        restored_metadata = _snapshot_metadata(staged)
        if restored_metadata["operationCount"] != manifest.get("operationCount"):
            raise RecoveryBundleError("restored operation count does not match manifest")
        os.replace(staged, destination_database)
    finally:
        staged.unlink(missing_ok=True)
    return manifest
