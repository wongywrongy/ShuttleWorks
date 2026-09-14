"""Seed finite display credentials for the disposable, frozen-date browser fixture.

The historical fixture clock cannot authorize production credentials: real API
issuance correctly refuses its already-ended events. This explicit test-data
seam grants 24 hours against the real clock, stores hashes through the repository,
and records the synthetic actor. It never changes production clock/expiry checks.
Only fixture-up's marked temporary database and manifest are accepted.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import secrets
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def seed_display_links(database: Path, manifest_path: Path) -> None:
    if database.is_symlink() or manifest_path.is_symlink():
        raise ValueError("Fixture paths must not be symlinks")
    database, manifest_path = database.resolve(), manifest_path.resolve()
    directory = database.parent
    if (database.name != "fixture.db" or not database.is_file()
            or not directory.name.startswith("shuttleworks-fixture.")
            or not (directory / ".shuttleworks-fixture").is_file()
            or not manifest_path.is_relative_to(directory)):
        raise ValueError("Expected fixture-up's marked disposable SQLite database and manifest")
    import sqlalchemy as sa
    from sqlalchemy.orm import Session
    from repositories.local import LocalRepository

    manifest = json.loads(manifest_path.read_text())
    if manifest.get("status") != "complete":
        raise ValueError("The fixture seed must be complete")
    engine = sa.create_engine(f"sqlite:///{database}")
    expiry = datetime.now(timezone.utc) + timedelta(hours=24)
    try:
        for entry in manifest["tournaments"].values():
            token = secrets.token_urlsafe(24)
            with Session(engine) as session:
                row = LocalRepository(session).rotate_display_token(
                    uuid.UUID(entry["workspaceId"]), token, expiry, str(uuid.UUID(int=0)))
                if row is None:
                    raise ValueError("Fixture workspace is missing")
            entry["displayToken"] = token
            entry["displayExpiresAt"] = expiry.isoformat()
            entry["urls"]["display"] = f"/display?token={token}"
        manifest["displayCredentialScope"] = "synthetic fixture only; 24-hour real-clock expiry"
        manifest_path.chmod(0o600)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    finally:
        engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    seed_display_links(args.database, args.manifest)
