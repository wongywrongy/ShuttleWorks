#!/usr/bin/env python3
"""Create and rotate the private operator MFA encryption key ring without printing secrets.

Subcommands:
  create PATH              new single-key ring (mode 0600, never overwrites)
  add-key PATH             add a new key; it stays inactive until promoted
  promote PATH --key-id ID make ID the key new seeds are written with
  usage [--keyring PATH]   read-only: which keys still wrap an active or pending seed
  rewrap [--keyring PATH]  re-encrypt every seed under the active key
  remove-key PATH --key-id ID
                           drop a retired key; refused while any seed uses it

Restart every API process after add-key and after promote. The database-backed
subcommands use the API's DATABASE_URL (and MFA_KEYRING_FILE when --keyring is
omitted) and run as the `admin` process role. Output never contains key material.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create", "add-key"):
        commands.add_parser(name).add_argument("path", type=Path)
    for name in ("promote", "remove-key"):
        command = commands.add_parser(name)
        command.add_argument("path", type=Path)
        command.add_argument("--key-id", required=True)
    for name in ("usage", "rewrap"):
        commands.add_parser(name).add_argument("--keyring", type=Path)
    return parser


def _key_file_command(args) -> int:
    from core.secret_keys import (SecretKeyringError, add_secret_key, create_secret_keyring,
                                  promote_secret_key)
    try:
        if args.command == "create":
            print(f"Created MFA encryption key {create_secret_keyring(args.path)}. "
                  "Keep this file with your encrypted recovery material.")
        elif args.command == "add-key":
            print(f"Added inactive MFA encryption key {add_secret_key(args.path)}. "
                  "Restart every API process, then promote it.")
        else:
            promote_secret_key(args.path, args.key_id)
            print(f"Promoted MFA encryption key {args.key_id}. Restart every API process, then run rewrap.")
        return 0
    except SecretKeyringError as exc:
        print(f"Refused: {exc}", file=sys.stderr)
    except (OSError, ValueError):
        print("Refused: the key ring path must be a writable private file (create never overwrites)",
              file=sys.stderr)
    return 1


def _database_command(args) -> int:
    # Before core.config: this process serves no requests and must not demand
    # the API's custody material beyond the ring it is explicitly handed.
    os.environ["PROCESS_ROLE"] = "admin"
    from sqlalchemy import create_engine
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session

    engine = None
    try:
        from core.config import settings
        from core.secret_keys import SecretKeyringError, read_secret_keyring, remove_secret_key
        from core.time_utils import _utcnow
        from db.session import normalize_database_url
        from identity.mfa import rewrap_factors
        from repositories.local import LocalRepository

        path = getattr(args, "path", None) or args.keyring or (Path(settings.mfa_keyring_file) if settings.mfa_keyring_file else None)
        if path is None:
            raise ValueError("A key ring path is required")
        ring = read_secret_keyring(path)
        engine = create_engine(normalize_database_url(settings.database_url))
        with Session(engine, autoflush=False, expire_on_commit=False) as session:
            repo = LocalRepository(session)
            if args.command == "rewrap":
                with repo.transaction():
                    counts = rewrap_factors(repo, keys=ring, now=_utcnow())
                print(json.dumps({"activeKeyId": ring.active_id, "rewrapped": counts}))
                return 0
            usage = repo.mfa.key_usage()
            if args.command == "remove-key":
                if any(row["keyId"] == args.key_id for row in usage):
                    print("Refused: seeds still use this key; run rewrap after promoting a replacement",
                          file=sys.stderr)
                    return 1
                remove_secret_key(path, args.key_id)
                print(f"Removed MFA encryption key {args.key_id}. Restart every API process.")
                return 0
            print(json.dumps({"activeKeyId": ring.active_id, "keyIds": list(ring.key_ids), "usage": usage}))
            return 0
    except SecretKeyringError as exc:
        print(f"Refused: {exc}", file=sys.stderr)
    except (OSError, ValueError, SQLAlchemyError):
        # Provider exceptions can include connection strings; never print them.
        print("Refused: database or key ring configuration is invalid", file=sys.stderr)
    finally:
        if engine is not None:
            engine.dispose()
    return 1


def main() -> int:
    args = _parser().parse_args()
    if args.command in {"create", "add-key", "promote"}:
        return _key_file_command(args)
    return _database_command(args)


if __name__ == "__main__":
    raise SystemExit(main())
