#!/usr/bin/env python3
"""Create an exclusive, private MFA encryption key file without printing secrets."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New file on a private filesystem; never overwritten")
    args = parser.parse_args()
    from core.secret_keys import create_secret_keyring
    try:
        key_id = create_secret_keyring(args.output)
    except (OSError, ValueError):
        print("Refused: output must be a new writable private file", file=sys.stderr)
        return 1
    print(f"Created MFA encryption key {key_id}. Keep this file with your encrypted recovery material.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
