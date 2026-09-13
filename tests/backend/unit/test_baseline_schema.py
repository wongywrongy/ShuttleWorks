"""Fresh-install schema contract; historical upgrade/rollback trees are retired."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from _helpers import upgrade_test_database

SCRIPTS = Path(__file__).resolve().parents[3] / "apps/api/src/alembic"


@pytest.fixture(params=["sqlite", "postgresql"])
def migrated(request, tmp_path):
    from db.session import normalize_database_url

    if request.param == "postgresql":
        url = os.environ.get("TEST_POSTGRES_URL")
        if not url:
            pytest.skip("TEST_POSTGRES_URL not set")
        engine = sa.create_engine(normalize_database_url(url))
        with engine.begin() as conn:
            conn.exec_driver_sql("DROP SCHEMA public CASCADE")
            conn.exec_driver_sql("CREATE SCHEMA public")
    else:
        engine = sa.create_engine(f"sqlite:///{tmp_path / 'baseline.db'}")
    upgrade_test_database(engine)
    try:
        yield engine
    finally:
        engine.dispose()


def test_baseline_matches_models(migrated):
    from db.models import Base

    cfg = Config()
    cfg.set_main_option("script_location", str(SCRIPTS))
    with migrated.connect() as conn:
        cfg.attributes["connection"] = conn
        command.check(cfg)
        inspector = sa.inspect(conn)
        assert set(inspector.get_table_names()) == set(Base.metadata.tables) | {"alembic_version"}
        assert (
            conn.scalar(sa.text("SELECT version_num FROM alembic_version"))
            == ScriptDirectory.from_config(cfg).get_current_head()
        )
        for name, table in Base.metadata.tables.items():
            columns = {c["name"]: c for c in inspector.get_columns(name)}
            assert set(columns) == set(table.columns.keys()), name
            for column in table.columns:
                assert columns[column.name]["nullable"] == column.nullable, (name, column.name)
            expected_checks = {
                c.name for c in table.constraints if isinstance(c, sa.CheckConstraint)
            }
            assert None not in expected_checks
            assert {c["name"] for c in inspector.get_check_constraints(name)} == expected_checks, (
                name
            )
            expected_fks = {
                (
                    tuple(c.column_keys),
                    tuple(e.target_fullname for e in c.elements),
                    c.ondelete,
                    c.deferrable,
                    c.initially,
                )
                for c in table.foreign_key_constraints
            }
            actual_fks = {
                (
                    tuple(c["constrained_columns"]),
                    tuple(f"{c['referred_table']}.{column}" for column in c["referred_columns"]),
                    c["options"].get("ondelete"),
                    c["options"].get("deferrable"),
                    c["options"].get("initially"),
                )
                for c in inspector.get_foreign_keys(name)
            }
            assert actual_fks == expected_fks, name
        if conn.dialect.name == "sqlite":
            assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def test_indexes_checks_and_triggers_survive_the_squash(migrated):
    inspector = sa.inspect(migrated)
    for table, name, columns in [
        ("solve_jobs", "uq_solve_jobs_active", ["tournament_id", "type"]),
        (
            "tournament_authority_epochs",
            "uq_tournament_authority_one_live_epoch",
            ["tournament_id"],
        ),
        (
            "partner_invitations",
            "uq_partner_invitations_sent",
            ["tournament_id", "inviting_entry_id"],
        ),
        (
            "submissions",
            "uq_submissions_tournament_account_idempotency_key",
            ["tournament_id", "account_id", "idempotency_key"],
        ),
        ("submissions", "uq_submissions_short_reference", ["short_reference"]),
    ]:
        indexes = {i["name"]: i for i in inspector.get_indexes(table)}
        assert indexes[name]["unique"]
        assert indexes[name]["column_names"] == columns
    flag = next(
        i for i in inspector.get_indexes("entries") if i["name"] == "ix_entries_event_player"
    )
    assert not flag["unique"]
    with migrated.connect() as conn:
        assert conn.scalar(sa.text("SELECT count(*) FROM event_format_versions")) == 3
        assert conn.scalar(sa.text("SELECT count(*) FROM scoring_profile_versions")) == 1
        if conn.dialect.name == "sqlite":
            from db.competition_ddl import trigger_specs

            triggers = set(
                conn.exec_driver_sql(
                    "SELECT name FROM sqlite_master WHERE type='trigger'"
                ).scalars()
            )
            assert triggers == {spec[0] for spec in trigger_specs()}
            for index, predicate in [
                ("uq_solve_jobs_active", "status IN ('queued', 'claimed', 'running')"),
                ("uq_tournament_authority_one_live_epoch", "state IN ('preparing', 'active')"),
                ("uq_partner_invitations_sent", "status = 'sent'"),
            ]:
                ddl = conn.execute(
                    sa.text("SELECT sql FROM sqlite_master WHERE name=:name"), {"name": index}
                ).scalar_one()
                assert f"WHERE {predicate}" in ddl
    columns = {c["name"]: c for c in inspector.get_columns("submissions")}
    assert not columns["short_reference"]["nullable"]
    assert not {"paid_at", "payment_note"} & columns.keys()
    assert not {"committed_player_id", "partner_email", "partner_entry_id"} & {
        c["name"] for c in inspector.get_columns("entries")
    }
    assert not {"bracket_event_id", "meet_event_id"} & {
        c["name"] for c in inspector.get_columns("entry_events")
    }
    assert next(c for c in inspector.get_columns("solve_jobs") if c["name"] == "trace_context")[
        "nullable"
    ]


@pytest.mark.parametrize("table", ["users", "entrant_accounts"])
def test_case_insensitive_email_uniqueness(migrated, table):
    from db.models import Base

    metadata_table = Base.metadata.tables[table]
    with migrated.begin() as conn:
        conn.execute(metadata_table.insert().values(email="Person@example.test", password_hash="x"))
    with pytest.raises(sa.exc.IntegrityError), migrated.begin() as conn:
        conn.execute(metadata_table.insert().values(email="person@example.test", password_hash="x"))


def test_orphaned_entry_is_refused_by_the_unit_test_schema(migrated):
    from db.models import Entry

    with pytest.raises(sa.exc.IntegrityError, match="(?i)foreign key"), migrated.begin() as conn:
        conn.execute(
            Entry.__table__.insert().values(tournament_id=uuid.uuid4(), entry_event_id=uuid.uuid4())
        )


@pytest.mark.parametrize(
    "table,column,value",
    [
        ("tournaments", "kind", "invalid"),
        ("matches", "status", "invalid"),
        ("entries", "state", "invalid"),
        ("tournament_members", "role", "invalid"),
    ],
)
def test_enum_checks_reject_unknown_values(migrated, table, column, value):
    from db.models import Base

    values = {column: value}
    if table == "tournaments":
        values["name"] = "Constraint proof"
    else:
        values["tournament_id"] = uuid.uuid4()
    if table == "matches":
        values["id"] = "m1"
    elif table == "entries":
        values["entry_event_id"] = uuid.uuid4()
    elif table == "tournament_members":
        values["user_id"] = uuid.uuid4()
    with (
        pytest.raises(sa.exc.IntegrityError, match="[Cc][Hh][Ee][Cc][Kk]"),
        migrated.begin() as conn,
    ):
        conn.execute(Base.metadata.tables[table].insert().values(**values))


def test_downgrade_refuses_to_modify_schema(migrated):
    cfg = Config()
    cfg.set_main_option("script_location", str(SCRIPTS))
    with migrated.connect() as conn:
        cfg.attributes["connection"] = conn
        before = set(sa.inspect(conn).get_table_names())
        conn.rollback()
        with pytest.raises(NotImplementedError, match="forward-only until GA"):
            command.downgrade(cfg, "base")
        assert set(sa.inspect(conn).get_table_names()) == before


def test_alembic_check_detects_a_model_column_without_a_revision(migrated):
    from db.models import Base

    table = Base.metadata.tables["tournaments"]
    probe = sa.Column("unmigrated_probe", sa.String())
    table.append_column(probe)
    cfg = Config()
    cfg.set_main_option("script_location", str(SCRIPTS))
    try:
        with migrated.connect() as conn:
            cfg.attributes["connection"] = conn
            with pytest.raises(Exception, match="unmigrated_probe"):
                command.check(cfg)
    finally:
        table._columns.remove(probe)
