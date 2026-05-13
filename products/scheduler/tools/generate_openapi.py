"""Dump the FastAPI app's OpenAPI schema to a path.

Used by ``make generate-api`` to feed openapi-typescript without needing
the backend to be running. Imports the production FastAPI app directly
from ``backend/app/main.py`` and writes the OpenAPI 3.1 document to the
file path passed on argv.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app  # noqa: E402  -- after sys.path setup


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: generate_openapi.py <output-path>", file=sys.stderr)
        return 2
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(app.openapi(), indent=2))
    print(f"wrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
