"""Dump the FastAPI app's OpenAPI schema to a path.

Used by ``make generate-api`` to feed openapi-typescript without needing
the backend to be running. Imports the production FastAPI app directly
from ``apps/api/src/core/main.py`` and writes the OpenAPI 3.1 document to the
file path passed on argv.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# apps/api/src is the API's sys.path root (SP-REORG-1 R4: src is a ROOT, not
# a package), so `core`, `meet`, `bracket` and friends import by bare name.
_API_SRC = Path(__file__).resolve().parents[1] / "apps" / "api" / "src"
if str(_API_SRC) not in sys.path:
    sys.path.insert(0, str(_API_SRC))

from core.main import app  # noqa: E402  -- after sys.path setup


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
