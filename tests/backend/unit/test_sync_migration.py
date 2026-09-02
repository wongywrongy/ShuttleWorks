"""Alembic/model parity for authority and operation synchronization tables."""
from __future__ import annotations

import sys
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from _helpers import purge_backend_modules


BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"
REVISION = "f1a2b3c4d5e6"
TABLES = {
    "tournament_authority_epochs",
    "event_operations",
    "sync_outbox",
    "sync_inbox",
    "sync_checkpoints",
    "sync_quarantine",
    "cloud_event_projections",
    "tournament_authority_transitions",
    "event_node_devices",
    "offline_operator_sessions",
}


def _config(tmp_path, monkeypatch) -> tuple[Config, str]:
    url = f"sqlite:///{tmp_path / 'sync-migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    source = str(BACKEND / "src")
    if source in sys.path:
        sys.path.remove(source)
    sys.path.insert(0, source)
    purge_backend_modules()
    config = Config()
    config.set_main_option("script_location", str(BACKEND / "src" / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config, url


def test_upgrade_and_downgrade_sync_schema(tmp_path, monkeypatch) -> None:
    config, url = _config(tmp_path, monkeypatch)
    command.upgrade(config, "head")
    engine = sa.create_engine(url)
    inspector = sa.inspect(engine)
    assert TABLES <= set(inspector.get_table_names())
    operation_uniques = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("event_operations")
    }
    assert "uq_event_operations_epoch_sequence" in operation_uniques
    assert {
        "status",
        "resolved_at",
        "resolved_by",
        "resolution_operation_id",
        "resolution_note",
    } <= {
        column["name"]
        for column in inspector.get_columns("sync_quarantine")
    }
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == REVISION
    engine.dispose()

    command.downgrade(config, "ab1c6e2b8d4f")
    engine = sa.create_engine(url)
    assert TABLES.isdisjoint(sa.inspect(engine).get_table_names())
    engine.dispose()
    purge_backend_modules()
