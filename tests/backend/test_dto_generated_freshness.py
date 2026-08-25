"""``dto.generated.ts`` is fresh against the live OpenAPI document.

The freshness half of P0's parity oracle (R-DM-9a). The console and entrant
parity tests (``apps/console/src/api/__tests__/dtoParity.test.ts``,
``apps/entrant/tests/dtoParity.test.ts``) compare the hand mirrors against
the COMMITTED generated file; that comparison is only worth anything if the
committed file still describes the app. This test is what makes a field
added to a Pydantic response model red BEFORE anybody edits a mirror:
regenerating (``make generate-api``) is the mechanical fix, and the two
vitest suites then redden until the hand mirrors follow.

Keys only, by ruling (P0 plan, Global Constraints): types and optionality
are not policed here — 71 optionality mismatches exist by construction
(Pydantic defaults render as ``?``) and are R-DM-9(c) territory.
"""
from __future__ import annotations

import re
from pathlib import Path

from core.main import app

GENERATED = (
    Path(__file__).resolve().parents[2]
    / "apps" / "console" / "src" / "api" / "dto.generated.ts"
)

# openapi-typescript emits `components.schemas` with a fixed indentation:
# the schema name at 8 spaces, its properties at 12. Anything deeper is a
# nested inline object and is deliberately invisible to this parser.
# ponytail: indentation regex over a machine-formatted file, not a TS parse.
# If openapi-typescript's formatting ever changes, _parse_generated() finds
# zero schemas and the pinned-floor assertion below fails loudly.
#
# The scan is SCOPED to `export interface components`: the sibling `paths`
# and `operations` interfaces carry their own 8-space `parameters:`/
# `responses:`/`requestBody:` blocks, which an unscoped scan mistakes for
# schemas named after them.
_SCHEMA = re.compile(r"^ {8}([A-Za-z_][A-Za-z0-9_]*): \{$")
_FIELD = re.compile(r"^ {12}([A-Za-z_][A-Za-z0-9_]*)\??:")
_CLOSE = re.compile(r"^ {8}\};$")


def _parse_generated() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    current: str | None = None
    in_components = False
    for line in GENERATED.read_text(encoding="utf-8").splitlines():
        if not in_components:
            in_components = line.startswith("export interface components")
            continue
        if line.startswith("}"):
            break
        m = _SCHEMA.match(line)
        if m:
            current = m.group(1)
            out[current] = set()
            continue
        if current is None:
            continue
        f = _FIELD.match(line)
        if f:
            out[current].add(f.group(1))
        elif _CLOSE.match(line):
            current = None
    return out


def _live_object_schemas() -> dict[str, set[str]]:
    schemas = app.openapi()["components"]["schemas"]
    return {
        name: {k for k in body["properties"] if k.isidentifier()}
        for name, body in schemas.items()
        if "properties" in body and name.isidentifier()
    }


def test_the_generated_file_still_parses():
    """Guards the parser itself: a formatting change must fail loudly here,
    not quietly turn every comparison below into a no-op. FIELD-level drift
    lands here too (the empty-schema assertion), so a change to the property
    indentation is diagnosed as a parser break rather than surfacing in the
    keys test, whose remedy message says "regenerate" - the wrong fix."""
    parsed = _parse_generated()
    assert len(parsed) >= 175, f"parsed only {len(parsed)} schemas"  # 177 today
    # Every object schema has at least one property, so a schema parsed to
    # zero fields means _FIELD's 12-space anchor stopped matching.
    empty = sorted(name for name, keys in parsed.items() if not keys)
    assert not empty, f"schemas parsed with 0 fields (parser drift, not staleness): {empty}"


def test_the_generated_and_live_schema_NAMES_match_both_ways():
    """Both directions on purpose. live-not-generated catches a field/model
    ADD that was never regenerated; generated-not-live catches a DELETE or a
    RENAME that was never regenerated - without which the parity tests would
    keep happily auto-pairing a hand shape against a ghost schema. P1 renames
    standings DTOs, so this direction is not hypothetical."""
    generated, live = set(_parse_generated()), set(_live_object_schemas())
    assert sorted(live - generated) == [], (
        "dto.generated.ts is STALE - these response models are not in it: "
        f"{sorted(live - generated)}. Run `make generate-api` and commit."
    )
    assert sorted(generated - live) == [], (
        "dto.generated.ts is STALE - these schemas no longer exist in the "
        f"app: {sorted(generated - live)}. Run `make generate-api` and commit."
    )


def test_generated_schema_keys_match_the_live_schema_keys():
    generated = _parse_generated()
    drift = {}
    for name, live_keys in _live_object_schemas().items():
        gen_keys = generated.get(name)
        if gen_keys is None:
            continue  # reported by the test above
        if live_keys != gen_keys:
            drift[name] = {
                "live_only": sorted(live_keys - gen_keys),
                "generated_only": sorted(gen_keys - live_keys),
            }
    assert not drift, (
        "dto.generated.ts is STALE against the live schema: "
        f"{drift}. Run `make generate-api` and commit the result."
    )
