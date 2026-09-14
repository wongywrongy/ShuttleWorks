import importlib.util
import json
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
import uuid

import pytest
import sqlalchemy as sa


def fixture_module():
    path = Path(__file__).resolve().parents[3] / "tools/fixture-display.py"
    spec = importlib.util.spec_from_file_location("fixture_display", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_frozen_fixture_uses_hashed_real_clock_credentials(tmp_path):
    from db.models import Base, DisplayToken, StateTransition, Tournament

    directory = tmp_path / "shuttleworks-fixture.synthetic"
    directory.mkdir()
    (directory / ".shuttleworks-fixture").touch()
    database = directory / "fixture.db"
    manifest_path = directory / "manifest.json"
    workspace_id = uuid.uuid4()
    engine = sa.create_engine(f"sqlite:///{database}")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(Tournament.__table__.insert().values(id=workspace_id,
            name="Frozen narrative", tournament_date="2000-01-01"))
    manifest_path.write_text(json.dumps({"status": "complete", "tournaments": {
        "T029": {"workspaceId": str(workspace_id), "urls": {}}
    }}))
    before = datetime.now(timezone.utc)
    fixture_module().seed_display_links(database, manifest_path)
    after = datetime.now(timezone.utc)
    issued = json.loads(manifest_path.read_text())["tournaments"]["T029"]
    with engine.connect() as connection:
        row = connection.execute(sa.select(DisplayToken)).mappings().one()
        assert row["token_hash"] == sha256(issued["displayToken"].encode()).hexdigest()
        expiry = row["expires_at"].replace(tzinfo=timezone.utc)
        assert before + timedelta(hours=24) <= expiry <= after + timedelta(hours=24)
        assert connection.scalar(sa.select(StateTransition.actor_id)) == str(uuid.UUID(int=0))
        assert connection.scalar(sa.select(Tournament.tournament_date)) == "2000-01-01"
    assert manifest_path.stat().st_mode & 0o777 == 0o600
    engine.dispose()


def test_display_fixture_refuses_an_unmarked_database(tmp_path):
    database = tmp_path / "shared.db"
    database.write_bytes(b"untouched")
    manifest = tmp_path / "manifest.json"
    manifest.write_text("{}")
    with pytest.raises(ValueError, match="marked disposable"):
        fixture_module().seed_display_links(database, manifest)
    assert database.read_bytes() == b"untouched" and manifest.read_text() == "{}"
