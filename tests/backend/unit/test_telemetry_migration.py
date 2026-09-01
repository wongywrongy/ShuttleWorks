"""The solve-job Trace Context column through the real Alembic graph."""
from __future__ import annotations

import sqlalchemy as sa

from tests.backend.unit.test_entries_migration import alembic_cfg  # noqa: F401

PREVIOUS_REVISION = "a1b2c3d4e5f6"
TELEMETRY_REVISION = "ab1c6e2b8d4f"


def test_trace_context_column_is_nullable_and_downgrades_cleanly(alembic_cfg):  # noqa: F811
    from alembic import command

    cfg, url = alembic_cfg
    command.upgrade(cfg, PREVIOUS_REVISION)
    engine = sa.create_engine(url)
    before = {column["name"] for column in sa.inspect(engine).get_columns("solve_jobs")}
    assert "trace_context" not in before  # negative control: migration adds the column

    command.upgrade(cfg, TELEMETRY_REVISION)
    columns = {
        column["name"]: column for column in sa.inspect(engine).get_columns("solve_jobs")
    }
    assert columns["trace_context"]["nullable"] is True

    command.downgrade(cfg, PREVIOUS_REVISION)
    after = {column["name"] for column in sa.inspect(engine).get_columns("solve_jobs")}
    assert "trace_context" not in after
    engine.dispose()
