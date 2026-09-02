"""Mechanical transaction-boundary guard for the new offline slice."""
from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HTTP_ADAPTERS = (
    ROOT / "apps/api/src/sync/routes.py",
    ROOT / "apps/api/src/bracket/brackets.py",
)


def test_new_operation_http_adapters_do_not_commit_or_access_raw_session() -> None:
    violations: list[str] = []
    for path in HTTP_ADAPTERS:
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Attribute):
                continue
            if node.attr == "commit":
                violations.append(f"{path.name}:{node.lineno} calls commit")
            if (
                node.attr == "session"
                and isinstance(node.value, ast.Name)
                and node.value.id == "repo"
            ):
                violations.append(f"{path.name}:{node.lineno} accesses repo.session")
    assert violations == [], "transaction boundary violations:\n" + "\n".join(violations)
