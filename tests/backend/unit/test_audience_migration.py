"""Upgrade populated pre-audience pages, not just an ORM-created empty schema."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"


def test_audience_migration_preserves_intent_and_defaults_private(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config

    url = f"sqlite:///{tmp_path / 'audience.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    monkeypatch.syspath_prepend(str(_BACKEND / "src"))
    purge_backend_modules()
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND / "src" / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    try:
        command.upgrade(cfg, "b3c4d5e6f7a8")
        engine = sa.create_engine(url)
        cases = [(True, None, "public"), (False, None, "private")]
        cases += [(enabled, stored, stored if enabled else "private")
                  for enabled in (True, False) for stored in ("private", "unlisted", "public")]
        now = "2026-09-05 00:00:00"
        with engine.begin() as conn:
            for index, (enabled, stored, _) in enumerate(cases):
                tid = uuid.uuid4().hex
                document = {"setup": {"public-info": {"data": {"visibility": stored}}}}
                conn.exec_driver_sql(
                    "INSERT INTO tournaments (id,name,status,schema_version,data,created_at,updated_at) VALUES (?,?,'draft',1,?,?,?)",
                    (tid, f"Tournament {index}", json.dumps(document), now, now),
                )
                conn.exec_driver_sql(
                    "INSERT INTO entry_pages (tournament_id,slug,is_open,waiver_required,regulations_version,entrants_published,draws_published,results_published,collect_phone,created_at,updated_at) VALUES (?,?,?,0,1,1,0,1,0,?,?)",
                    (tid, f"page-{index}", enabled, now, now),
                )
        command.upgrade(cfg, "head")
        command.check(cfg)
        with engine.begin() as conn:
            actual = conn.exec_driver_sql("SELECT slug,audience,entrants_published,results_published FROM entry_pages ORDER BY slug").all()
            assert [(row[0], row[1]) for row in actual] == [(f"page-{i}", expected) for i, (_, _, expected) in enumerate(cases)]
            assert all(row[2:] == (1, 1) for row in actual)
            column = next(c for c in sa.inspect(conn).get_columns("entry_pages") if c["name"] == "audience")
            assert "private" in column["default"]
            with pytest.raises(sa.exc.IntegrityError):
                conn.exec_driver_sql("UPDATE entry_pages SET audience='everyone'")
        command.downgrade(cfg, "b3c4d5e6f7a8")
        assert "audience" not in {c["name"] for c in sa.inspect(engine).get_columns("entry_pages")}
        command.upgrade(cfg, "head")
        engine.dispose()
    finally:
        purge_backend_modules()
