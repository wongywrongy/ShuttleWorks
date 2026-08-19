"""SP-SEC-1 Phase 0.A — input-surface inventory from the live OpenAPI schema.

Walks every request body schema, resolves $refs, and reports:
  - string fields with no maxLength / pattern / enum
  - array fields with no maxItems
  - integer/number fields with no bounds
  - models that permit additional properties
Run from the repo root: .venv/Scripts/python.exe tools/audit_input_surface.py
"""
import os
import sys

BACKEND = os.path.join(os.getcwd(), "apps", "api")
sys.path.insert(0, BACKEND)
os.environ.setdefault("DATABASE_URL", "sqlite:///./_audit_tmp.db")

from app.main import app  # noqa: E402

spec = app.openapi()
components = spec.get("components", {}).get("schemas", {})


def resolve(schema, seen):
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        if name in seen:
            return None, name
        return components.get(name, {}), name
    return schema, None


def walk(schema, path, seen, out):
    schema, refname = resolve(schema, seen)
    if schema is None:
        return
    if refname:
        seen = seen | {refname}
    for key in ("anyOf", "oneOf", "allOf"):
        for sub in schema.get(key, []):
            walk(sub, path, seen, out)
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        addl = schema.get("additionalProperties")
        if addl is True or (isinstance(addl, dict) and not addl):
            out.append((path or "<root>", "object", "additionalProperties permitted"))
        if addl is None and "properties" in schema:
            out.append((path or "<root>", "object", "extra fields IGNORED (no forbid)"))
        for name, sub in (schema.get("properties") or {}).items():
            walk(sub, f"{path}.{name}" if path else name, seen, out)
        return
    if t == "array":
        if "maxItems" not in schema:
            out.append((path, "array", "no maxItems"))
        walk(schema.get("items", {}), f"{path}[]", seen, out)
        return
    if t == "string":
        if not any(k in schema for k in ("maxLength", "pattern", "enum", "format", "const")):
            out.append((path, "string", "UNBOUNDED"))
        return
    if t in ("integer", "number"):
        if "maximum" not in schema and "exclusiveMaximum" not in schema:
            out.append((path, t, "no maximum"))
        return


rows = []
for route, ops in sorted(spec["paths"].items()):
    for method, op in sorted(ops.items()):
        body = op.get("requestBody")
        if not body:
            continue
        content = body.get("content", {}).get("application/json")
        if not content:
            continue
        out = []
        walk(content["schema"], "", frozenset(), out)
        rows.append((method.upper(), route, out))

unbounded_str = 0
noforbid = set()
print("=" * 100)
for method, route, out in rows:
    if not out:
        continue
    print(f"\n{method} {route}")
    for path, kind, note in out:
        if note == "UNBOUNDED":
            unbounded_str += 1
        if "no forbid" in note or "additionalProperties permitted" in note:
            noforbid.add((method, route, path))
            continue
        print(f"    {path:<58} {kind:<8} {note}")

print("\n" + "=" * 100)
print(f"write endpoints with a JSON body : {len(rows)}")
print(f"unbounded string fields          : {unbounded_str}")
print(f"non-strict model positions       : {len(noforbid)}")
