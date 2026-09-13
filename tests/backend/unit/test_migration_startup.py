"""Startup fails closed and retains recoverable SQLite snapshots."""

from __future__ import annotations

import asyncio
import os
import shutil
import sqlite3
import subprocess
import sys
import uuid

import pytest
from alembic.script import ScriptDirectory

from _helpers import isolate_test_database


@pytest.fixture
def startup(tmp_path, monkeypatch):
    path = isolate_test_database(tmp_path, monkeypatch)
    from core import main

    yield main, path
    from _helpers import purge_backend_modules

    purge_backend_modules()


def test_fk_violation_blocks_lifespan_even_at_head(startup):
    main, path = startup
    from db.models import Entry
    from db.session import engine

    with engine.connect() as conn:
        raw = conn.connection.driver_connection
        raw.execute("PRAGMA foreign_keys=OFF")
        conn.execute(
            Entry.__table__.insert().values(tournament_id=uuid.uuid4(), entry_event_id=uuid.uuid4())
        )
        conn.commit()
        raw.execute("PRAGMA foreign_keys=ON")

    async def start():
        async with main.lifespan(main.app):
            pytest.fail("Application served on an inconsistent schema")

    with pytest.raises(RuntimeError, match="Foreign key violations.*entries"):
        asyncio.run(start())
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM entries").fetchone()[0] == 1


def test_broken_revision_exits_nonzero_and_backs_up_committed_wal(startup, tmp_path):
    main, path = startup
    scripts = tmp_path / "alembic"
    shutil.copytree(main.ALEMBIC_SCRIPTS, scripts)
    previous_head = ScriptDirectory(str(scripts)).get_current_head()
    (scripts / "versions/test_broken.py").write_text(f'''revision = "test_broken"
down_revision = "{previous_head}"
branch_labels = depends_on = None
def upgrade():
    raise RuntimeError("deliberately broken revision")
def downgrade():
    raise NotImplementedError("forward-only until GA")
''')
    # Keep the WAL connection open so a plain copy of the .db file would
    # miss the committed marker. The backup must hydrate it independently.
    with sqlite3.connect(path) as writer:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("CREATE TABLE backup_marker (value TEXT)")
        writer.execute("INSERT INTO backup_marker VALUES ('committed WAL data')")
        writer.commit()
        script = """import asyncio, sys
from pathlib import Path
from core import main
main.ALEMBIC_SCRIPTS = Path(sys.argv[1])
async def start():
    async with main.lifespan(main.app):
        raise AssertionError("served after migration failure")
asyncio.run(start())
"""
        env = {**os.environ, "PYTHONPATH": str(main.ALEMBIC_SCRIPTS.parent)}
        result = subprocess.run(
            [sys.executable, "-c", script, str(scripts)],
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
    assert result.returncode != 0
    assert "deliberately broken revision" in result.stderr
    assert "alembic_upgrade_failed" in result.stderr
    backups = list((tmp_path / "backups").glob("pre-migration-test_broken-*.db"))
    assert len(backups) == 1
    with sqlite3.connect(backups[0]) as conn:
        assert conn.execute("SELECT value FROM backup_marker").fetchone()[0] == "committed WAL data"
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == previous_head


def test_retired_database_is_not_stamped_or_purged_and_keeps_five_backups(startup, tmp_path):
    main, path = startup
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE alembic_version SET version_num='retired_revision'")
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()
    unrelated = backup_dir / "tournament-snapshot.json"
    unrelated.write_text("{}")
    for _ in range(7):
        with pytest.raises(Exception, match="retired_revision"):
            main._run_migrations()
    backups = list(backup_dir.glob("pre-migration-*.db"))
    assert len(backups) == 5
    assert unrelated.exists()
    with sqlite3.connect(path) as conn:
        assert (
            conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
            == "retired_revision"
        )


def test_head_startup_does_not_rotate_backups(startup, tmp_path):
    main, _ = startup
    main._run_migrations()
    assert not list(tmp_path.rglob("pre-migration-*.db"))


def test_first_install_does_not_snapshot_a_database_it_just_created(tmp_path, monkeypatch):
    from _helpers import purge_backend_modules
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'first.db'}")
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    purge_backend_modules()
    from core import main
    try:
        main._run_migrations()
        assert not list(tmp_path.rglob("pre-migration-*.db"))
        with sqlite3.connect(tmp_path / "first.db") as conn:
            assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == ScriptDirectory(str(main.ALEMBIC_SCRIPTS)).get_current_head()
    finally:
        purge_backend_modules()
