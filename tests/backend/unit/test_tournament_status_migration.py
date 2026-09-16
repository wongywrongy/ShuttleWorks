"""0012 normalizes a status outside the vocabulary instead of refusing to run."""
from __future__ import annotations

import uuid

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

from tests.backend.unit import test_baseline_schema as fixtures

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated


@pytest.mark.parametrize("initial_revision", ["0011"], indirect=True)
def test_an_unknown_status_becomes_draft_and_known_ones_survive(migrated):
    from db.models import Tournament

    stray, known = uuid.uuid4(), uuid.uuid4()
    with migrated.begin() as conn:
        conn.execute(Tournament.__table__.insert().values(
            id=stray, name="Hand-edited", status="cancelled", data={},
        ))
        conn.execute(Tournament.__table__.insert().values(
            id=known, name="Archived", status="archived", data={},
        ))

    cfg = Config()
    cfg.set_main_option("script_location", str(fixtures.SCRIPTS))
    with migrated.connect() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")

    with migrated.connect() as conn:
        rows = dict(conn.execute(
            sa.select(Tournament.__table__.c.id, Tournament.__table__.c.status)
        ).all())
    assert rows == {stray: "draft", known: "archived"}

    with pytest.raises(sa.exc.IntegrityError, match="[Cc][Hh][Ee][Cc][Kk]"), migrated.begin() as conn:
        conn.execute(Tournament.__table__.insert().values(
            id=uuid.uuid4(), name="Refused", status="cancelled", data={},
        ))
