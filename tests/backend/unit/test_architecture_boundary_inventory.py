"""Shrinking baseline for persistence-boundary debt.

The repository still contains legacy leaks. This test makes that debt
explicit, owned, and non-growing: removing a count is always allowed, while a
new leak or a new file with a leak fails CI until the inventory is consciously
updated.
"""
from __future__ import annotations

import ast
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "apps/api/src"
INVENTORY = ROOT / "docs/reference/architecture-boundary-inventory.json"
FIELDS = (
    "repoSession",
    "commitCalls",
    "sqlalchemyImports",
    "tournamentDataReferences",
)


def _tournament_data_references(tree: ast.AST) -> int:
    """Count executable references and SQL strings, excluding prose."""
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        and ast.get_docstring(node, clean=False) is not None
    }
    count = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) not in docstrings:
                count += node.value.count("tournaments.data")
        elif (
            isinstance(node, ast.Attribute)
            and node.attr == "data"
            and isinstance(node.value, ast.Name)
            and node.value.id == "tournaments"
        ):
            count += 1
    return count


def _scan() -> dict[str, dict[str, int]]:
    results: dict[str, dict[str, int]] = {}
    for path in sorted(SRC.rglob("*.py")):
        # Migrations are persistence adapters by definition; their SQLAlchemy
        # imports are not application dependency-direction leaks.
        if "alembic" in path.relative_to(SRC).parts:
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        counts = {field: 0 for field in FIELDS}
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute):
                if node.attr == "session":
                    owner = node.value
                    if (
                        isinstance(owner, ast.Name)
                        and owner.id in {"repo", "_repo"}
                    ) or (
                        isinstance(owner, ast.Attribute)
                        and owner.attr in {"repo", "_repo"}
                    ):
                        counts["repoSession"] += 1
                if node.attr == "commit":
                    counts["commitCalls"] += 1
            if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("sqlalchemy"):
                counts["sqlalchemyImports"] += 1
            if isinstance(node, ast.Import) and any(alias.name.startswith("sqlalchemy") for alias in node.names):
                counts["sqlalchemyImports"] += 1
        counts["tournamentDataReferences"] = _tournament_data_references(tree)
        if any(counts.values()):
            results[str(path.relative_to(SRC))] = counts
    return results


def test_blob_reference_scan_ignores_documentation_but_keeps_code_and_sql():
    source = '''
"""The tournaments.data blob."""
# Read tournaments.data below.
def read():
    """Read tournaments.data."""
    return tournaments.data, "SELECT tournaments.data FROM tournaments"
'''
    assert _tournament_data_references(ast.parse(source)) == 2


def test_boundary_inventory_is_machine_readable_owned_and_non_growing():
    inventory = json.loads(INVENTORY.read_text())
    baseline = {row["path"]: row for row in inventory["files"]}
    actual = _scan()
    violations: list[str] = []
    for path, counts in actual.items():
        row = baseline.get(path)
        if row is None:
            violations.append(f"new unowned boundary debt: {path} {counts}")
            continue
        if not row.get("owner") or not row.get("useCase"):
            violations.append(f"unowned inventory row: {path}")
        for field in FIELDS:
            if counts[field] > int(row.get(field, 0)):
                violations.append(
                    f"{path} {field} grew from {row.get(field, 0)} to {counts[field]}"
                )
    for path, row in baseline.items():
        if path not in actual and any(int(row.get(field, 0)) for field in FIELDS):
            # A deleted/clean file is a valid shrinking result, but a row with
            # zero current debt should not be used to hide stale inventory.
            continue
        if row.get("module") not in inventory["ownerDirectory"]:
            violations.append(f"module has no owner directory entry: {path}")
    assert not violations, "boundary inventory violations:\n" + "\n".join(violations)


def test_inventory_groups_debt_by_module_and_use_case():
    inventory = json.loads(INVENTORY.read_text())
    grouped: defaultdict[str, int] = defaultdict(int)
    for row in inventory["files"]:
        grouped[row["module"]] += sum(int(row[field]) for field in FIELDS)
        assert row["useCase"]
        assert row["owner"]
    assert grouped["entries"] > 0
    assert grouped["identity"] > 0
    assert grouped["repositories"] > 0
