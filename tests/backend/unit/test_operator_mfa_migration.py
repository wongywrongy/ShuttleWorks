"""Upgrades cap historical credentials without inventing MFA assurance."""
from datetime import datetime, timedelta, timezone
import uuid

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

from core.time_utils import _aware
from db.models import Tournament, TournamentAuthority, User
from tests.backend.unit import test_baseline_schema as fixtures

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated


@pytest.mark.parametrize("initial_revision", ["0005"], indirect=True)
def test_migration_caps_both_session_types_without_asserting_mfa(migrated):
    issued = datetime(2026, 9, 1, 10, tzinfo=timezone.utc)
    def identifier():
        value = uuid.uuid4()
        return value.hex if migrated.dialect.name == "sqlite" else value
    user_id, workspace_id, node_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    tables = sa.MetaData()
    tables.reflect(migrated)
    with migrated.begin() as conn:
        conn.execute(User.__table__.insert().values(
            id=user_id, email="migration@example.test", email_verified=False,
            created_at=issued, updated_at=issued,
        ))
        conn.execute(Tournament.__table__.insert().values(
            id=workspace_id, name="Migration fixture", status="draft", data={},
            created_at=issued, updated_at=issued,
        ))
        conn.execute(TournamentAuthority.__table__.insert().values(
            tournament_id=workspace_id, epoch=1, node_id=node_id, state="active",
            checkpoint_hash="c" * 64, checkpoint_schema_version=1, capability_digest="d" * 64,
            granted_at=issued,
        ))
        for table_name in ("auth_sessions", "offline_operator_sessions"):
            for duration in (2, 72):
                values = dict(id=identifier(), token_hash=f"{table_name}{duration}".ljust(64, "0"),
                              user_id=user_id.hex if migrated.dialect.name == "sqlite" else user_id,
                              created_at=issued, last_seen_at=issued,
                              expires_at=issued + timedelta(hours=duration))
                if table_name == "offline_operator_sessions":
                    values.update(tournament_id=workspace_id.hex if migrated.dialect.name == "sqlite" else workspace_id,
                                  authority_epoch=1, device_id=node_id.hex if migrated.dialect.name == "sqlite" else node_id)
                conn.execute(tables.tables[table_name].insert().values(**values))
    cfg = Config()
    cfg.set_main_option("script_location", str(fixtures.SCRIPTS))
    with migrated.connect() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    latest = sa.MetaData()
    latest.reflect(migrated)
    with migrated.connect() as conn:
        for table_name in ("auth_sessions", "offline_operator_sessions"):
            rows = conn.execute(sa.select(latest.tables[table_name])).all()
            assert sorted((_aware(r.expires_at) - issued).total_seconds() for r in rows) == [7200, 43200]
            assert all(_aware(r.created_at) == issued and _aware(r.last_seen_at) == issued for r in rows)
            assert all(r.authenticated_at is None and r.mfa_generation is None for r in rows)
        assert conn.scalar(sa.select(sa.func.count()).select_from(latest.tables["operator_mfa_factors"])) == 0


@pytest.mark.parametrize("initial_revision", ["0007"], indirect=True)
def test_factor_uniqueness_widens_to_account_and_scope_keeping_existing_rows(migrated):
    """0008: one factor per (account, scope); an existing factor survives untouched."""
    now = datetime(2026, 9, 14, 12, tzinfo=timezone.utc)
    def key(value):
        return value.hex if migrated.dialect.name == "sqlite" else value
    user_id, factor_id = uuid.uuid4(), uuid.uuid4()
    factors = sa.MetaData()
    factors.reflect(migrated)
    table = factors.tables["operator_mfa_factors"]
    row = dict(status="unconfigured", generation=0, revision=0, last_counter=-1, created_at=now, updated_at=now)
    with migrated.begin() as conn:
        conn.execute(User.__table__.insert().values(id=user_id, email="scoped@example.test",
                                                    email_verified=False, created_at=now, updated_at=now))
        conn.execute(table.insert().values(id=key(factor_id), user_id=key(user_id), scope="cloud", **row))
    with pytest.raises(sa.exc.IntegrityError), migrated.begin() as conn:  # the old key: one per account
        conn.execute(table.insert().values(id=key(uuid.uuid4()), user_id=key(user_id), scope="node:a", **row))
    cfg = Config()
    cfg.set_main_option("script_location", str(fixtures.SCRIPTS))
    with migrated.connect() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    with migrated.begin() as conn:
        assert conn.execute(sa.select(table.c.scope)).scalars().all() == ["cloud"]
        conn.execute(table.insert().values(id=key(uuid.uuid4()), user_id=key(user_id), scope="node:a", **row))
    with pytest.raises(sa.exc.IntegrityError), migrated.begin() as conn:  # still one per scope
        conn.execute(table.insert().values(id=key(uuid.uuid4()), user_id=key(user_id), scope="cloud", **row))
