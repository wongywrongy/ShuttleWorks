"""Keep tests sharing the disposable Postgres schema out of xdist workers."""
import ast
from pathlib import Path


def test_every_postgres_database_consumer_has_the_serial_marker():
    tests = Path(__file__).resolve().parents[1]
    consumers = []
    for path in tests.rglob("test_*.py"):
        if path == Path(__file__):
            continue
        tree = ast.parse(path.read_text())
        if not any(isinstance(node, ast.Constant) and node.value == "TEST_POSTGRES_URL" for node in ast.walk(tree)):
            continue
        consumers.append(path)
        assignments = [node for node in tree.body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and target.id == "pytestmark" for target in node.targets)]
        assert assignments and any(isinstance(node, ast.Attribute) and node.attr == "shared_postgres"
                                   for node in ast.walk(assignments[-1].value)), str(path)
    assert len(consumers) >= 7
