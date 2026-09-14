#!/usr/bin/env python3
"""Restore a recovery bundle in isolation and exercise decryption refusal.

Default: synthetic SQLite fixture with no personal data. To rehearse an event
node, supply --database and --passphrase-file together; the source is opened
read-only and the replacement database exists only in a temporary directory.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))
from recovery.bundles import RecoveryBundleError, create_bundle, restore_bundle  # noqa: E402


def drill(database: Path | None = None, passphrase: bytes | None = None) -> dict:
    started = time.monotonic()
    if (database is None) != (passphrase is None):
        raise ValueError("database and passphrase must be supplied together")
    checks = {}
    with tempfile.TemporaryDirectory(prefix="sw-recovery-drill-") as directory:
        temporary = Path(directory)
        if database is None:
            database = temporary / "source.sqlite3"
            with sqlite3.connect(database) as connection:
                connection.execute("CREATE TABLE proof (value TEXT NOT NULL)")
                connection.execute("INSERT INTO proof VALUES ('restored synthetic event')")
            passphrase = secrets.token_bytes(32)
            scope = "synthetic-sqlite"
        else:
            scope = "supplied-event-node-copy"
        bundle = temporary / "event.swbackup"
        manifest = create_bundle(source_database=database, output_path=bundle, passphrase=passphrase)
        destination = temporary / "replacement" / "event.sqlite3"
        restored = restore_bundle(bundle_path=bundle, destination_database=destination, passphrase=passphrase)
        if restored != manifest or hashlib.sha256(destination.read_bytes()).hexdigest() != manifest["databaseSha256"]:
            raise AssertionError("restored snapshot differs from the verified bundle")
        with sqlite3.connect(f"file:{destination}?mode=ro", uri=True) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise AssertionError("restored database integrity failed")
        checks["isolatedRestore"] = "PASS"
        checks["snapshotDigest"] = "PASS"
        checks["sqliteIntegrity"] = "PASS"
        corrupt = temporary / "corrupt.swbackup"
        damaged = bytearray(bundle.read_bytes())
        damaged[-1] ^= 1
        corrupt.write_bytes(damaged)
        for name, candidate, key in (
            ("wrongPassphrase", bundle, secrets.token_bytes(32)),
            ("modifiedCiphertext", corrupt, passphrase),
        ):
            rejected = temporary / name / "event.sqlite3"
            try:
                restore_bundle(bundle_path=candidate, destination_database=rejected, passphrase=key)
            except RecoveryBundleError:
                if rejected.exists():
                    raise AssertionError("rejected bundle created a database")
            else:
                raise AssertionError(f"{name} was accepted")
            checks[name] = "PASS"
        source_hash = hashlib.sha256((ROOT / "apps/api/src/recovery/bundles.py").read_bytes()).hexdigest()
        result = {
            "runAt": datetime.now(timezone.utc).isoformat(), "scope": scope,
            "result": "PASS", "checks": checks, "bundleImplementationSha256": source_hash,
            "databaseBytes": manifest["databaseBytes"],
        }
    if temporary.exists():
        raise AssertionError("temporary recovery data was not removed")
    result["checks"]["temporaryDataRemoved"] = "PASS"
    result["elapsedSeconds"] = round(time.monotonic() - started, 3)
    result["drillImplementationSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--passphrase-file", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if bool(args.database) != bool(args.passphrase_file):
        parser.error("--database and --passphrase-file are required together")
    try:
        result = drill(args.database, args.passphrase_file.read_bytes().strip() if args.passphrase_file else None)
    except (OSError, ValueError, AssertionError) as error:
        parser.exit(1, f"Recovery drill failed: {type(error).__name__}\n")
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Recovery drill PASS ({result['scope']}): {args.report}")


if __name__ == "__main__":
    main()
