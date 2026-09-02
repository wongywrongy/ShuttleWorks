"""Standalone worker composition-root compatibility shim."""

from __future__ import annotations

from typing import Sequence

PROFILE = "cloud-worker"


def main(argv: Sequence[str] | None = None) -> int:
    """Delegate to the legacy worker entry point during migration."""

    from worker import main as legacy_main

    return legacy_main(list(argv) if argv is not None else None)


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["PROFILE", "main"]
