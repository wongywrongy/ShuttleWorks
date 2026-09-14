#!/usr/bin/env python3
"""Inspect authority-key usage or prepare a retirement candidate without deploying it.

Uses the cloud process's existing database/signing/trust configuration. Stop grant
issuance and account for every signer before preparing and publishing a candidate;
this database snapshot cannot fence another running cloud process.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retire-key-id")
    parser.add_argument("--output", type=Path, help="New candidate file; existing files are never replaced")
    args = parser.parse_args()
    if bool(args.retire_key_id) != bool(args.output):
        parser.error("--retire-key-id and --output must be supplied together")

    from sqlalchemy import create_engine
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session

    from sync.errors import ProtocolError

    engine = None
    try:
        from core.config import settings
        from db.session import normalize_database_url
        from repositories.local import LocalRepository
        from sync.key_rotation import retirement_candidate
        from sync.service import _private_signing_key
        from sync.signing_keys import key_id, read_verification_keys

        engine = create_engine(normalize_database_url(settings.database_url))
        with engine.connect() as conn:
            if conn.dialect.name == "sqlite":
                conn.exec_driver_sql("PRAGMA query_only=ON")
            elif conn.dialect.name == "postgresql":
                conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            with Session(bind=conn) as session:
                repo = LocalRepository(session)
                usage = repo.authority_key_usage()
                if args.retire_key_id:
                    if not settings.authority_signing_key_file or not settings.authority_signing_public_key_file:
                        raise ValueError("Explicit signing and public trust files are required")
                    candidate = retirement_candidate(
                        repo, retiring_key_id=args.retire_key_id,
                        active_key_id=key_id(_private_signing_key().public_key()),
                        trusted=read_verification_keys(settings.authority_signing_public_key_file),
                    )
                    with args.output.open("xb") as output:
                        output.write(candidate)
                print(json.dumps({"usage": usage, "candidatePrepared": bool(args.output), "deployed": False}))
        return 0
    except ProtocolError as exc:
        print(f"Refused: {exc.code}", file=sys.stderr)
    except (OSError, ValueError, SQLAlchemyError):
        # Provider exceptions can include connection strings; never print them.
        print("Refused: database, key configuration or candidate output is invalid", file=sys.stderr)
    finally:
        if engine is not None:
            engine.dispose()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
