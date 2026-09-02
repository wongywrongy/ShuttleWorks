"""Recovery CLI; passphrases are read from a mounted secret file."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from recovery.bundles import create_bundle, inspect_bundle, preflight_bundle, restore_bundle


def _passphrase(path: Path) -> bytes:
    value = path.read_bytes().rstrip(b"\r\n")
    if not value:
        raise SystemExit("passphrase file is empty")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="ShuttleWorks recovery bundle tool")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--database", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--passphrase-file", type=Path, required=True)
    inspect = commands.add_parser("verify")
    inspect.add_argument("--bundle", type=Path, required=True)
    inspect.add_argument("--passphrase-file", type=Path, required=True)
    preflight = commands.add_parser(
        "preflight", help="verify an isolated clean-machine restore without installing it"
    )
    preflight.add_argument("--bundle", type=Path, required=True)
    preflight.add_argument("--passphrase-file", type=Path, required=True)
    restore = commands.add_parser("restore")
    restore.add_argument("--bundle", type=Path, required=True)
    restore.add_argument("--database", type=Path, required=True)
    restore.add_argument("--passphrase-file", type=Path, required=True)
    args = parser.parse_args()
    secret = _passphrase(args.passphrase_file)
    if args.command == "create":
        result = create_bundle(
            source_database=args.database, output_path=args.output, passphrase=secret
        )
    elif args.command == "verify":
        result = inspect_bundle(args.bundle, secret)
    elif args.command == "preflight":
        result = preflight_bundle(args.bundle, secret)
    else:
        result = restore_bundle(
            bundle_path=args.bundle,
            destination_database=args.database,
            passphrase=secret,
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
