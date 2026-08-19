"""The separation guard: tournament_sim must NEVER import product code.

The simulator talks to the backend exclusively over HTTP. This test
ast-walks every module in the package and fails on any import of the
backend's top-level packages or scheduler_core — including inside
functions and TYPE_CHECKING blocks (a type-only import still couples the
tool to the product's source tree).
"""
from __future__ import annotations

import ast
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[1] / "tournament_sim"

FORBIDDEN = {
    "app", "api", "services", "database", "repositories", "adapters",
    "scheduler_core", "alembic",
}


def _imported_roots(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name.split(".")[0], node.lineno
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:  # absolute imports only
                yield node.module.split(".")[0], node.lineno


def test_no_backend_imports():
    offenders: list[str] = []
    py_files = sorted(PACKAGE_DIR.rglob("*.py"))
    assert py_files, f"no python files found under {PACKAGE_DIR}"
    for path in py_files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for root, lineno in _imported_roots(tree):
            if root in FORBIDDEN:
                offenders.append(f"{path.relative_to(PACKAGE_DIR)}:{lineno} imports {root!r}")
    assert not offenders, (
        "tournament_sim must stay HTTP-only — backend imports found:\n  "
        + "\n  ".join(offenders)
    )
